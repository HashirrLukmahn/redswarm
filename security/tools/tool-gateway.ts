import { randomUUID } from "node:crypto";
import type {
  Capability,
  EvidenceRecord,
  ScopeManifest,
  SecurityEventType,
} from "../schemas/index.js";
import type { StateStore } from "../state/store.js";
import type { BudgetTracker } from "../orchestration/budgets.js";
import { redactSensitive } from "../policy/redaction.js";
import { hasCapability } from "../policy/capabilities.js";
import { stagingRequest, type StagingRequest } from "./staging-api.js";
import { TestStateInspector, type AccountSummary } from "./state-reader.js";
import type { BrowserProvider, SafeBrowserStep } from "../providers/apify.js";

export interface AgentIdentity {
  agentId: string;
  role: string;
  capabilities: Capability[];
}

export type ToolCall =
  | { tool: "staging.request"; args: StagingRequest }
  | { tool: "staging.readState"; args: { accountId: string; label: string } }
  | { tool: "browser.runScenario"; args: { personaId: string; steps: SafeBrowserStep[] } }
  | { tool: "experiment.delay"; args: { milliseconds: number } };

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  blocked?: string;
  evidenceId?: string;
}

/** Simple per-run token bucket for maxRequestsPerSecond (spec §17 step 4). */
class RateLimiter {
  private tokens: number;
  private last = Date.now();
  constructor(private readonly ratePerSec: number) {
    this.tokens = ratePerSec;
  }
  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.ratePerSec, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await new Promise((r) => setTimeout(r, Math.ceil(1000 / this.ratePerSec)));
    }
  }
}

export interface ToolGatewayDeps {
  runId: string;
  scope: ScopeManifest;
  store: StateStore;
  budget: BudgetTracker;
  browser: BrowserProvider;
  fetchImpl?: typeof fetch;
  isCancelled: () => boolean;
}

/**
 * ToolGateway (spec §17). All execution flows through here:
 * verify capability → validate scope → validate budget → rate limit →
 * sanitize input → execute → sanitize output → save evidence → emit event →
 * update budget.
 */
export class ToolGateway {
  private readonly inspector: TestStateInspector;
  private readonly limiter: RateLimiter;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly deps: ToolGatewayDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.inspector = new TestStateInspector(deps.scope, this.fetchImpl);
    this.limiter = new RateLimiter(deps.scope.maxRequestsPerSecond);
  }

  private requiredCapability(call: ToolCall): Capability {
    switch (call.tool) {
      case "staging.request":
        return call.args.method === "GET" ? "READ_STAGING" : "MUTATE_SYNTHETIC_DATA";
      case "staging.readState":
        return "READ_TEST_LEDGER";
      case "browser.runScenario":
        return "USE_BROWSER";
      case "experiment.delay":
        return "READ_STAGING";
    }
  }

  private emit(type: SecurityEventType, agent: AgentIdentity, title: string, extra?: Record<string, unknown>) {
    this.deps.store.emit({
      id: randomUUID(),
      runId: this.deps.runId,
      timestamp: Date.now(),
      type,
      agentId: agent.agentId,
      title,
      metadata: extra,
    });
  }

  private saveEvidence(
    agent: AgentIdentity,
    experimentId: string,
    hypothesisId: string,
    partial: Partial<EvidenceRecord> & Pick<EvidenceRecord, "type" | "summary">
  ): string {
    const id = randomUUID();
    const record: EvidenceRecord = {
      id,
      runId: this.deps.runId,
      hypothesisId,
      experimentId,
      timestamp: Date.now(),
      ...partial,
      // Redact BEFORE persistence (spec §59).
      sanitizedRequest: partial.sanitizedRequest ? redactSensitive(partial.sanitizedRequest) : undefined,
      sanitizedResponse: partial.sanitizedResponse ? redactSensitive(partial.sanitizedResponse) : undefined,
      beforeState: partial.beforeState ? redactSensitive(partial.beforeState) : undefined,
      afterState: partial.afterState ? redactSensitive(partial.afterState) : undefined,
    };
    this.deps.store.addEvidence(record);
    this.emit("EVIDENCE_CAPTURED", agent, `evidence: ${record.summary}`, { evidenceId: id });
    return id;
  }

  async execute(
    agent: AgentIdentity,
    call: ToolCall,
    ctx: { experimentId: string; hypothesisId: string }
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    const block = (reason: string): ToolResult => {
      this.emit("TOOL_CALL_BLOCKED", agent, `blocked: ${call.tool}: ${reason}`);
      this.deps.store.addToolMetric({
        id: randomUUID(),
        runId: this.deps.runId,
        agentId: agent.agentId,
        tool: call.tool,
        startedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        status: "blocked",
        reason,
      });
      return { ok: false, blocked: reason };
    };

    // 0. Kill switch (spec §46).
    if (this.deps.isCancelled()) return block("run cancelled");

    // 1. Verify capability (spec §16, §64).
    const required = this.requiredCapability(call);
    if (!hasCapability(agent.capabilities, required)) {
      return block(`capability ${required} not granted to role ${agent.role}`);
    }

    // 3. Validate run budget (spec §47).
    if (!this.deps.budget.canSpend("toolCalls")) return block("BUDGET_EXHAUSTED: toolCalls");

    this.emit("TOOL_CALL_STARTED", agent, `tool: ${call.tool}`);

    try {
      let result: ToolResult;
      switch (call.tool) {
        case "experiment.delay":
          await new Promise((r) => setTimeout(r, Math.min(call.args.milliseconds, 60_000)));
          result = { ok: true, data: { delayed: call.args.milliseconds } };
          break;

        case "staging.readState": {
          await this.limiter.acquire();
          if (!this.deps.budget.canSpend("requests")) return block("BUDGET_EXHAUSTED: requests");
          this.deps.budget.spendRequest();
          const summary = await this.inspector.accountSummary(call.args.accountId);
          const evidenceId = this.saveEvidence(agent, ctx.experimentId, ctx.hypothesisId, {
            type: "state",
            summary: `state:${call.args.label} account ${call.args.accountId}`,
            afterState: summary,
          });
          result = { ok: true, data: summary, evidenceId };
          break;
        }

        case "staging.request": {
          await this.limiter.acquire();
          if (!this.deps.budget.canSpend("requests")) return block("BUDGET_EXHAUSTED: requests");
          this.deps.budget.spendRequest();
          const resp = await stagingRequest(this.deps.scope, call.args, this.fetchImpl);
          if (resp.blocked) return block(resp.blocked);
          const evidenceId = this.saveEvidence(agent, ctx.experimentId, ctx.hypothesisId, {
            type: "http",
            summary: `${call.args.method} ${call.args.path} -> ${resp.status}`,
            sanitizedRequest: { method: call.args.method, path: call.args.path, personaId: call.args.personaId, body: call.args.body },
            sanitizedResponse: { status: resp.status, body: resp.body },
          });
          result = { ok: true, data: resp, evidenceId };
          break;
        }

        case "browser.runScenario": {
          if (!this.deps.budget.canSpend("browserRuns")) return block("BUDGET_EXHAUSTED: browserRuns");
          this.deps.budget.spendBrowserRun();
          const obs = await this.deps.browser.runScenario(
            {
              allowedOrigin: this.deps.scope.targetOrigin,
              personaId: call.args.personaId,
              steps: call.args.steps,
              runId: this.deps.runId,
              experimentId: ctx.experimentId,
            },
            this.deps.scope.allowedHosts
          );
          if (obs.blocked) return block(obs.blocked);
          const evidenceId = this.saveEvidence(agent, ctx.experimentId, ctx.hypothesisId, {
            type: "browser",
            summary: `browser scenario (${call.args.steps.length} steps)`,
            sanitizedResponse: obs,
            screenshotRef: obs.screenshots[0]?.ref,
          });
          result = { ok: true, data: obs, evidenceId };
          break;
        }
      }

      // 10. Update budget + metrics.
      this.deps.budget.spendToolCall();
      this.deps.store.addToolMetric({
        id: randomUUID(),
        runId: this.deps.runId,
        agentId: agent.agentId,
        tool: call.tool,
        startedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        status: "success",
      });
      return result;
    } catch (err) {
      this.deps.store.addToolMetric({
        id: randomUUID(),
        runId: this.deps.runId,
        agentId: agent.agentId,
        tool: call.tool,
        startedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        status: "error",
        reason: (err as Error).message,
      });
      return { ok: false, blocked: `error: ${(err as Error).message}` };
    }
  }
}
