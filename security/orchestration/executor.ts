import type { ExperimentPlan, ExperimentStep, Observation } from "../schemas/index.js";
import type { ToolGateway, AgentIdentity, ToolCall } from "../tools/tool-gateway.js";
import type { AccountSummary } from "../tools/state-reader.js";
import { EXECUTOR_CAPABILITIES } from "../policy/capabilities.js";
import {
  checkConservation,
  checkExactlyOnce,
  checkRevocation,
  checkTenantIsolation,
  type InvariantCheckResult,
} from "../services/invariant-checks.js";

/**
 * Experiment executor (spec §27). Executes an approved plan step-by-step through
 * the ToolGateway, captures baseline/post snapshots, evaluates the violation
 * signal via DETERMINISTIC checks, and persists observations. It records
 * observations only — it does NOT decide whether a finding is verified.
 */
export async function executeExperiment(
  plan: ExperimentPlan,
  gateway: ToolGateway,
  runId: string,
  identity?: AgentIdentity
): Promise<Observation> {
  const agent: AgentIdentity = identity ?? {
    agentId: `executor_${plan.id}`,
    role: "executor",
    capabilities: EXECUTOR_CAPABILITIES,
  };
  const ctx = { experimentId: plan.id, hypothesisId: plan.hypothesisId };
  const evidenceIds: string[] = [];
  const states = new Map<string, AccountSummary>(); // label -> snapshot
  const httpResults: { status: number; body: unknown; path: string }[] = [];

  const runStep = async (step: ExperimentStep): Promise<void> => {
    let call: ToolCall | undefined;
    switch (step.kind) {
      case "state":
        call = { tool: "staging.readState", args: { accountId: step.targetId, label: step.label } };
        break;
      case "api":
        call = {
          tool: "staging.request",
          args: {
            personaId: step.personaId,
            method: step.method,
            path: step.path,
            body: step.body,
            headers: step.headers,
            idempotencyKey: step.idempotencyKey,
          },
        };
        break;
      case "delay":
        call = { tool: "experiment.delay", args: { milliseconds: step.milliseconds } };
        break;
      case "browser":
        call = { tool: "browser.runScenario", args: { personaId: step.personaId, steps: step.steps as any } };
        break;
      case "parallel": {
        // Controlled concurrency: run branches simultaneously (spec §27, §6).
        await Promise.all(step.branches.map((branch) => runBranch(branch)));
        return;
      }
    }
    if (!call) return;
    const result = await gateway.execute(agent, call, ctx);
    if (result.evidenceId) evidenceIds.push(result.evidenceId);
    if (step.kind === "state" && result.ok) states.set(step.label, result.data as AccountSummary);
    if (step.kind === "api" && result.ok) {
      const resp = result.data as { status: number; body: unknown };
      httpResults.push({ status: resp.status, body: resp.body, path: step.path });
    }
  };

  const runBranch = async (branch: ExperimentStep[]): Promise<void> => {
    for (const s of branch) await runStep(s);
  };

  for (const step of plan.steps) await runStep(step);

  // Deterministic invariant evaluation (spec §61).
  const invariantChecks: InvariantCheckResult[] = [];
  const before = states.get("before");
  const after = states.get("after");

  if (plan.invariantId === "FI-002" && after) invariantChecks.push(checkExactlyOnce(after));
  if (plan.invariantId === "FI-001" && before && after) {
    // modeled delta = sum of intended single transfers from this account
    const intended = httpResults
      .filter((r) => r.path === "/api/transfers")
      .slice(0, 1)
      .reduce((acc, r) => acc - Number((r.body as any)?.amount ?? 0), 0);
    invariantChecks.push(checkConservation(before, after, intended));
    invariantChecks.push(checkExactlyOnce(after));
  }
  if (plan.invariantId === "FI-004" || plan.invariantId === "FI-005") {
    const read = httpResults.find((r) => r.path.startsWith("/api/accounts/"));
    if (read)
      invariantChecks.push(
        checkTenantIsolation(read.status, typeof (read.body as any)?.balance === "number")
      );
  }
  if (plan.invariantId === "FI-006") {
    const protectedResp = httpResults[0];
    if (protectedResp) invariantChecks.push(checkRevocation(protectedResp.status));
  }

  const candidate = invariantChecks.some((c) => c.violated);

  return {
    experimentId: plan.id,
    hypothesisId: plan.hypothesisId,
    runId,
    evidenceIds,
    invariantChecks: invariantChecks.map((c) => ({ invariantId: c.invariantId, violated: c.violated, detail: c.detail })),
    candidate,
    notes: candidate
      ? `Deterministic violation observed: ${invariantChecks.filter((c) => c.violated).map((c) => c.detail).join("; ")}`
      : "No deterministic invariant violation observed.",
  };
}
