import { randomUUID } from "node:crypto";
import type {
  AgentContext,
  Finding,
  ModelInvocationMetric,
  RunConfig,
  RunRecord,
  RunStatus,
  SecurityEvent,
  SecurityEventType,
} from "../schemas/index.js";
import type { StateStore } from "../state/store.js";
import type { ModelProvider } from "../providers/model-provider.js";
import type { ExaProvider } from "../providers/exa.js";
import type { BrowserProvider } from "../providers/apify.js";
import { ConcurrencyManager } from "./concurrency.js";
import { BudgetTracker } from "./budgets.js";
import { assertRunTransition, assertFindingTransition } from "./state-machine.js";
import { buildHypothesisSwarm } from "./swarm.js";
import { executeExperiment } from "./executor.js";
import { ToolGateway } from "../tools/tool-gateway.js";
import { verifyStagingTarget } from "../policy/scope.js";
import { evaluatePolicy } from "../policy/policy-engine.js";
import { runHypothesisAgent } from "../agents/hypothesis.js";
import { runSkeptic } from "../agents/skeptic.js";
import { runArchitectureAssessment } from "../agents/architect.js";
import { deduplicateHypotheses } from "../services/deduplication.js";
import { rankHypotheses, selectForExecution } from "../services/ranking.js";
import { planFromHypothesis } from "../services/experiment-planner.js";
import { verifyCandidate } from "../services/verification.js";
import { runThreatResearch } from "../services/research.js";
import { aggregateMetrics } from "../services/metrics-aggregator.js";
import { SEED_INVARIANTS } from "../fixtures/invariants.js";
import { publicPersonas } from "../fixtures/personas.js";
import { SIM_ARCHITECTURE, SIM_API_SURFACE } from "../fixtures/architecture.js";

export interface RunDeps {
  store: StateStore;
  provider: ModelProvider;
  exa: ExaProvider;
  browser: BrowserProvider;
  fetchImpl?: typeof fetch;
  resetFixtures?: () => Promise<void>;
}

export class RunCancelledError extends Error {
  constructor() {
    super("RUN_CANCELLED");
    this.name = "RunCancelledError";
  }
}

export async function runSecuritySwarm(config: RunConfig, deps: RunDeps): Promise<RunRecord> {
  const { store, provider } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resetFixtures = deps.resetFixtures ?? (async () => {});
  const runId = `run_${randomUUID().slice(0, 12)}`;
  const now = Date.now();

  const concurrency = new ConcurrencyManager({
    model: config.modelConcurrency,
    browser: config.browserConcurrency,
    api: config.apiConcurrency,
    verification: config.verifierConcurrency,
    research: config.researchConcurrency,
  });
  const budget = new BudgetTracker(config.budget);
  const metrics: ModelInvocationMetric[] = [];

  const run: RunRecord = {
    id: runId,
    name: config.name,
    status: "CREATED",
    riskMode: config.riskMode,
    agentCount: config.agentCount,
    cancelRequested: false,
    createdAt: now,
    updatedAt: now,
    targetOrigin: config.scope.targetOrigin,
  };
  store.createRun(run);

  const emit = (type: SecurityEventType, title: string, extra?: Partial<SecurityEvent>) => {
    store.emit({ id: randomUUID(), runId, timestamp: Date.now(), type, title, ...extra });
  };
  const setStatus = (status: RunStatus) => {
    const current = store.getRun(runId)?.status ?? run.status;
    assertRunTransition(current, status);
    store.updateRun(runId, { status });
    emit("RUN_STATE_CHANGED", `run -> ${status}`, { metadata: { status } });
  };
  const cancelled = () => store.isCancelRequested(runId);
  const checkCancel = () => {
    if (cancelled()) throw new RunCancelledError();
  };
  const recordMetric = (m: ModelInvocationMetric) => {
    metrics.push(m);
    store.addModelMetric(m);
  };

  emit("RUN_STARTED", `Run started: ${config.name}`);

  try {
    // ---- 1-2. Validate + verify scope ----
    setStatus("VALIDATING_SCOPE");
    checkCancel();
    const scopeCheck = await verifyStagingTarget(config.scope, fetchImpl);
    if (!scopeCheck.ok) {
      emit("SCOPE_REJECTED", `Scope rejected: ${scopeCheck.reason}`);
      store.updateRun(runId, { status: "POLICY_BLOCKED", error: scopeCheck.reason });
      return store.getRun(runId)!;
    }
    emit("SCOPE_VERIFIED", "Staging target verified");
    await resetFixtures();

    // ---- 3-5. Build context, personas, invariants ----
    const context: AgentContext = {
      architecture: SIM_ARCHITECTURE,
      invariants: SEED_INVARIANTS,
      apiSurface: SIM_API_SURFACE,
      personas: publicPersonas(),
      knownFindings: [],
      runScope: {
        environment: config.scope.environment,
        allowedApiPrefixes: config.scope.allowedApiPrefixes,
        riskMode: config.riskMode,
        allowMutation: config.scope.allowMutation,
        allowConcurrencyExperiments: config.scope.allowConcurrencyExperiments,
      },
      threatFamily: "mixed",
    };

    // ---- 6. Research fanout ----
    setStatus("RESEARCHING");
    const research = await runThreatResearch(deps.exa, concurrency, config.enableResearch);

    // ---- 7-9. Hypothesis swarm ----
    setStatus("GENERATING_HYPOTHESES");
    const tasks = buildHypothesisSwarm(runId, config.agentCount);
    for (const t of tasks) store.upsertAgent(t);

    await Promise.all(
      tasks.map((task) =>
        concurrency.model.run(async () => {
          if (cancelled() || !budget.canSpend("modelCalls")) {
            store.updateAgent(task.id, { status: "blocked" });
            return;
          }
          budget.spendModelCall();
          store.updateAgent(task.id, { status: "thinking" });
          emit("AGENT_STARTED", `Agent ${task.id} (${task.role})`, { agentId: task.id });
          try {
            const { hypothesis, metric } = await runHypothesisAgent(task, context, provider, config.model);
            recordMetric(metric);
            if (metric.totalTokens) budget.spendTokens(metric.totalTokens);
            store.addHypothesis(hypothesis);
            store.updateAgent(task.id, { status: "completed" });
            emit("HYPOTHESIS_CREATED", hypothesis.title, {
              agentId: task.id,
              hypothesisId: hypothesis.id,
            });
            emit("AGENT_COMPLETED", `Agent ${task.id} completed`, { agentId: task.id });
          } catch (err) {
            store.updateAgent(task.id, { status: "failed" });
            recordMetric({
              invocationId: randomUUID(),
              runId,
              agentId: task.id,
              provider: provider.name,
              model: config.model,
              queuedAt: Date.now(),
              startedAt: Date.now(),
              finishedAt: Date.now(),
              queueLatencyMs: 0,
              totalLatencyMs: 0,
              retryCount: 0,
              status: "error",
              errorType: (err as Error).message.slice(0, 120),
            });
          }
        })
      )
    );
    checkCancel();

    // ---- 10-11. Dedup + rank ----
    setStatus("DEDUPLICATING");
    const allHypotheses = store.listHypotheses(runId);
    const { unique, mergedCount } = deduplicateHypotheses(allHypotheses);
    if (mergedCount > 0) emit("HYPOTHESIS_MERGED", `${mergedCount} duplicate hypotheses merged`);
    for (const u of unique) store.updateHypothesis(u.id, { mergedFrom: u.mergedFrom });
    const ranked = rankHypotheses(unique);
    for (const r of ranked) store.updateHypothesis(r.id, { score: r.score });

    // Select 10-25 for execution.
    const selected = selectForExecution(ranked, Math.min(25, Math.max(10, Math.ceil(unique.length * 0.4))));

    // ---- 12. Skeptic pass ----
    const surviving: typeof selected = [];
    for (const h of selected) {
      checkCancel();
      if (!budget.canSpend("modelCalls")) break;
      budget.spendModelCall();
      try {
        const review = await concurrency.model.run(() => runSkeptic(h, provider, config.model));
        if (review.plausible) surviving.push(h);
      } catch {
        surviving.push(h); // if the skeptic errors, keep the hypothesis
      }
    }

    // ---- 13-16. Plan + policy + execute ----
    setStatus("PLANNING_EXPERIMENTS");
    const gateway = new ToolGateway({
      runId,
      scope: config.scope,
      store,
      budget,
      browser: deps.browser,
      fetchImpl,
      isCancelled: cancelled,
    });

    setStatus("EXECUTING");
    const candidates: { plan: ReturnType<typeof planFromHypothesis>; finding: Finding; observation: Awaited<ReturnType<typeof executeExperiment>> }[] = [];

    for (const h of surviving) {
      if (cancelled()) break;
      const plan = planFromHypothesis(h);
      const finding = createFinding(runId, h);
      store.upsertFinding(finding);

      const decision = evaluatePolicy(plan, {
        scope: config.scope,
        riskMode: config.riskMode,
        allowedPersonaIds: config.scope.testPersonaIds,
        remainingRequests: budget.remaining.requests,
        remainingToolCalls: budget.remaining.toolCalls,
      });

      if (!decision.allowed) {
        transitionFinding(store, finding, "BLOCKED", { rejectionReason: decision.reasons.join("; ") });
        emit("BLOCKED_BY_POLICY", `Experiment blocked: ${plan.title}`, {
          hypothesisId: h.id,
          experimentId: plan.id,
          findingId: finding.id,
          metadata: { reasons: decision.reasons },
        });
        continue;
      }

      transitionFinding(store, finding, "EXPERIMENTING", { experimentId: plan.id });
      emit("EXPERIMENT_STARTED", plan.title, { hypothesisId: h.id, experimentId: plan.id, findingId: finding.id });

      await resetFixtures();
      const observation = await concurrency.api.run(() => executeExperiment(plan, gateway, runId));
      transitionFinding(store, finding, "OBSERVED", { evidenceIds: observation.evidenceIds });

      if (observation.candidate) {
        emit("CANDIDATE_FINDING", `Candidate: ${plan.title}`, {
          hypothesisId: h.id,
          experimentId: plan.id,
          findingId: finding.id,
        });
        candidates.push({ plan, finding, observation });
      } else {
        transitionFinding(store, finding, "REJECTED", {
          rejectionReason: "No deterministic invariant violation observed.",
        });
        emit("FINDING_REJECTED", `Rejected (no violation): ${plan.title}`, { findingId: finding.id });
      }
    }

    // ---- 17-19. Independent verification ----
    setStatus("VERIFYING");
    await Promise.all(
      candidates.map(({ plan, finding, observation }) =>
        concurrency.verification.run(async () => {
          if (cancelled()) return;
          transitionFinding(store, finding, "VERIFYING", {});
          emit("VERIFICATION_STARTED", `Verifying: ${plan.title}`, { findingId: finding.id, experimentId: plan.id });
          const outcome = await verifyCandidate(plan, observation, gateway, runId, resetFixtures);
          if (outcome.verified) {
            transitionFinding(store, finding, "VERIFIED", {
              severity: outcome.severity,
              blastRadius: outcome.blastRadius,
              findingConfidence: outcome.findingConfidence,
              reproductionSummary: outcome.reproductionSummary,
              verifierIds: outcome.reports.map((r) => r.verifierId),
              evidenceIds: [...finding.evidenceIds, ...outcome.reports.flatMap((r) => r.evidenceIds)],
              architecturalRootCause: rootCauseFor(plan.invariantId),
            });
            emit("FINDING_VERIFIED", `VERIFIED (${outcome.severity}): ${plan.title}`, { findingId: finding.id });
          } else {
            transitionFinding(store, finding, "REJECTED", {
              rejectionReason: outcome.reproductionSummary,
              verifierIds: outcome.reports.map((r) => r.verifierId),
            });
            emit("FINDING_REJECTED", `Rejected on verification: ${plan.title}`, { findingId: finding.id });
          }
        })
      )
    );

    // ---- 20-22. Root cause + remediation ----
    const verifiedFindings = store.listFindings(runId).filter((f) => f.status === "VERIFIED");
    if (verifiedFindings.length > 0) {
      setStatus("ROOT_CAUSE_ANALYSIS");
      if (config.enableArchitect) {
        const assessment = await runArchitectureAssessment({
          architecture: context.architecture,
          findings: verifiedFindings,
          invariants: context.invariants,
          research,
          provider,
          model: config.model,
          runId,
        });
        setStatus("REMEDIATING");
        for (const rec of assessment.recommendations) {
          emit("REMEDIATION_CREATED", rec.title, { metadata: rec });
          for (const fid of rec.addressesFindingIds) {
            const f = store.listFindings(runId).find((x) => x.id === fid);
            if (f) store.upsertFinding({ ...f, remediationStatus: "PROPOSED", updatedAt: Date.now() });
          }
        }
      }
    }

    // ---- 23-24. Metrics + complete ----
    const finalVerified = store.listFindings(runId).filter((f) => f.status === "VERIFIED").length;
    const summary = aggregateMetrics(metrics, {
      agentCount: config.agentCount,
      verifiedFindings: finalVerified,
      peakActiveModelCalls: concurrency.model.peakCount,
    });
    store.updateRun(runId, { metrics: summary });
    emit("METRICS_UPDATED", "Final metrics computed", { metadata: summary });

    const current = store.getRun(runId)!.status;
    if (current === "VERIFYING" || current === "ROOT_CAUSE_ANALYSIS" || current === "REMEDIATING") {
      // VERIFYING can jump straight to COMPLETED when no verified findings.
      if (current === "VERIFYING") assertRunTransition("VERIFYING", "COMPLETED");
      store.updateRun(runId, { status: "COMPLETED" });
      emit("RUN_STATE_CHANGED", "run -> COMPLETED", { metadata: { status: "COMPLETED" } });
    }
    emit("RUN_COMPLETED", `Run complete. Verified findings: ${finalVerified}`);
    return store.getRun(runId)!;
  } catch (err) {
    if (err instanceof RunCancelledError) {
      store.updateRun(runId, { status: "CANCELLED" });
      emit("RUN_CANCELLED", "Run cancelled");
      return store.getRun(runId)!;
    }
    store.updateRun(runId, { status: "FAILED", error: (err as Error).message });
    emit("RUN_STATE_CHANGED", `run -> FAILED: ${(err as Error).message}`, { metadata: { status: "FAILED" } });
    return store.getRun(runId)!;
  }
}

function createFinding(runId: string, h: { id: string; title: string; invariantId: string; threatFamily: string; affectedComponents: string[] }): Finding {
  const now = Date.now();
  return {
    id: `find_${randomUUID().slice(0, 12)}`,
    runId,
    hypothesisId: h.id,
    title: h.title,
    invariantId: h.invariantId,
    status: "HYPOTHESIS",
    threatFamily: h.threatFamily,
    affectedComponents: h.affectedComponents,
    evidenceIds: [],
    verifierIds: [],
    remediationStatus: "PENDING",
    createdAt: now,
    updatedAt: now,
  };
}

function transitionFinding(store: StateStore, finding: Finding, to: Finding["status"], patch: Partial<Finding>) {
  assertFindingTransition(finding.status, to);
  const updated: Finding = { ...finding, ...patch, status: to, updatedAt: Date.now() };
  Object.assign(finding, updated); // keep local ref in sync for chained transitions
  store.upsertFinding(updated);
}

function rootCauseFor(invariantId: string): string {
  if (["FI-001", "FI-002", "FI-003", "FI-008"].includes(invariantId))
    return "Economic side effects lack a shared durable idempotency boundary.";
  if (["FI-004", "FI-005"].includes(invariantId))
    return "Authorization relies on client-supplied identifiers without server-side ownership enforcement.";
  if (invariantId === "FI-006") return "Revocation state is not consulted on protected actions.";
  return "Architectural trust assumption is violated under the tested sequence.";
}
