import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type {
  AgentTask,
  ArchitectureAssessment,
  EvidenceRecord,
  Finding,
  HypothesisRecord,
  ModelInvocationMetric,
  RunRecord,
  SecurityEvent,
  ToolMetric,
} from "../schemas/index.js";
import type { StateStore } from "./store.js";
import { InMemoryStateStore } from "./store.js";
import { renderAgentReport, renderConsolidatedReport } from "../services/report.js";
import { ROLE_DEFINITIONS } from "../prompts/roles/index.js";

const ref = (name: string) => makeFunctionReference<"mutation">(`redswarm:${name}`);
const M = {
  pushRun: ref("pushRun"),
  pushAgent: ref("pushAgent"),
  pushHypothesis: ref("pushHypothesis"),
  pushFinding: ref("pushFinding"),
  pushEvent: ref("pushEvent"),
  pushModelMetric: ref("pushModelMetric"),
  pushAssessment: ref("pushAssessment"),
  pushAgentReport: ref("pushAgentReport"),
  pushConsolidatedReport: ref("pushConsolidatedReport"),
};

/**
 * ConvexMirror decorates a primary (in-memory) StateStore and best-effort mirrors
 * every write into Convex (spec §35). The local store always drives the live SSE
 * dashboard, so the run never depends on Convex being deployed/reachable — if a
 * mutation fails (e.g. functions not yet deployed via `npx convex dev`) it logs
 * once and continues. On RUN_COMPLETED it also pushes each agent's rendered md
 * report + the consolidated orchestrator report.
 */
export class ConvexMirror implements StateStore {
  private readonly inner = new InMemoryStateStore();
  private readonly client: ConvexHttpClient;
  private warned = false;

  constructor(url: string) {
    this.client = new ConvexHttpClient(url);
  }

  private send(fnRef: unknown, args: Record<string, unknown>): void {
    this.client.mutation(fnRef as any, args).catch((err: unknown) => {
      if (!this.warned) {
        this.warned = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[convex] mirror write failed (${(err as Error).message}). ` +
            `Run \`npx convex dev\` to deploy redswarm functions. Continuing with local store only.`
        );
      }
    });
  }

  // --- writes: delegate + mirror ---
  createRun(run: RunRecord): void {
    this.inner.createRun(run);
    this.send(M.pushRun, { runId: run.id, status: run.status, name: run.name, createdAt: run.createdAt, data: run });
  }
  updateRun(id: string, patch: Partial<RunRecord>): RunRecord | undefined {
    const next = this.inner.updateRun(id, patch);
    if (next) this.send(M.pushRun, { runId: next.id, status: next.status, name: next.name, createdAt: next.createdAt, data: next });
    return next;
  }
  upsertAgent(agent: AgentTask): void {
    this.inner.upsertAgent(agent);
    this.send(M.pushAgent, { runId: agent.runId, agentId: agent.id, role: agent.role, status: agent.status, data: agent });
  }
  updateAgent(id: string, patch: Partial<AgentTask>): void {
    this.inner.updateAgent(id, patch);
    const a = this.inner.listAgents(patch.runId ?? "").find((x) => x.id === id) ??
      this.listAllAgents().find((x) => x.id === id);
    if (a) this.send(M.pushAgent, { runId: a.runId, agentId: a.id, role: a.role, status: a.status, data: a });
  }
  addHypothesis(h: HypothesisRecord): void {
    this.inner.addHypothesis(h);
    this.send(M.pushHypothesis, { runId: h.runId, hypothesisId: h.id, invariantId: h.invariantId, data: h });
  }
  updateHypothesis(id: string, patch: Partial<HypothesisRecord>): void {
    this.inner.updateHypothesis(id, patch);
  }
  upsertFinding(f: Finding): void {
    this.inner.upsertFinding(f);
    this.send(M.pushFinding, { runId: f.runId, findingId: f.id, status: f.status, invariantId: f.invariantId, data: f });
  }
  addModelMetric(m: ModelInvocationMetric): void {
    this.inner.addModelMetric(m);
    this.send(M.pushModelMetric, { runId: m.runId, agentId: m.agentId, status: m.status, data: m });
  }
  setAssessment(runId: string, assessment: ArchitectureAssessment): void {
    this.inner.setAssessment(runId, assessment);
    this.send(M.pushAssessment, { runId, data: assessment });
  }
  emit(event: SecurityEvent): void {
    this.inner.emit(event);
    this.send(M.pushEvent, { runId: event.runId, type: event.type, createdAt: event.timestamp, data: event });
    if (event.type === "RUN_COMPLETED" || event.type === "RUN_CANCELLED") this.flushReports(event.runId);
  }

  /** Render and mirror each agent's md + the consolidated report (spec: md per agent). */
  flushReports(runId: string): void {
    for (const agent of this.inner.listAgents(runId)) {
      const role = ROLE_DEFINITIONS[agent.role]?.name ?? agent.role;
      this.send(M.pushAgentReport, { runId, agentId: agent.id, role, markdown: renderAgentReport(this, runId, agent.id) });
    }
    this.send(M.pushConsolidatedReport, { runId, markdown: renderConsolidatedReport(this, runId) });
  }

  private listAllAgents(): AgentTask[] {
    return this.inner.listRuns().flatMap((r) => this.inner.listAgents(r.id));
  }

  // --- reads + passthrough: delegate to inner ---
  getRun(id: string) { return this.inner.getRun(id); }
  listRuns() { return this.inner.listRuns(); }
  requestCancel(id: string) { this.inner.requestCancel(id); }
  isCancelRequested(id: string) { return this.inner.isCancelRequested(id); }
  listAgents(runId: string) { return this.inner.listAgents(runId); }
  listHypotheses(runId: string) { return this.inner.listHypotheses(runId); }
  addEvidence(e: EvidenceRecord) { this.inner.addEvidence(e); }
  listEvidence(runId: string) { return this.inner.listEvidence(runId); }
  listFindings(runId: string) { return this.inner.listFindings(runId); }
  listModelMetrics(runId: string) { return this.inner.listModelMetrics(runId); }
  addToolMetric(m: ToolMetric) { this.inner.addToolMetric(m); }
  listToolMetrics(runId: string) { return this.inner.listToolMetrics(runId); }
  getAssessment(runId: string) { return this.inner.getAssessment(runId); }
  listEvents(runId: string) { return this.inner.listEvents(runId); }
  subscribe(listener: (event: SecurityEvent) => void) { return this.inner.subscribe(listener); }
}

/** Factory: Convex mirror when configured, otherwise plain in-memory (spec §35). */
export function makeStateStore(): StateStore {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (process.env.REDSWARM_PERSIST === "convex" && url) {
    // eslint-disable-next-line no-console
    console.log(`[convex] mirroring run state to ${url}`);
    return new ConvexMirror(url);
  }
  return new InMemoryStateStore();
}
