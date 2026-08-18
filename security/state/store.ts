import { EventEmitter } from "node:events";
import type {
  AgentTask,
  EvidenceRecord,
  Finding,
  HypothesisRecord,
  ModelInvocationMetric,
  RunRecord,
  SecurityEvent,
  ToolMetric,
} from "../schemas/index.js";

/**
 * StateStore is the realtime coordination/state plane (spec §35).
 * The default implementation is in-memory; a Convex-backed implementation can
 * satisfy the same interface without changing orchestration code.
 */
export interface StateStore {
  createRun(run: RunRecord): void;
  updateRun(id: string, patch: Partial<RunRecord>): RunRecord | undefined;
  getRun(id: string): RunRecord | undefined;
  listRuns(): RunRecord[];
  requestCancel(id: string): void;
  isCancelRequested(id: string): boolean;

  upsertAgent(agent: AgentTask): void;
  updateAgent(id: string, patch: Partial<AgentTask>): void;
  listAgents(runId: string): AgentTask[];

  addHypothesis(h: HypothesisRecord): void;
  updateHypothesis(id: string, patch: Partial<HypothesisRecord>): void;
  listHypotheses(runId: string): HypothesisRecord[];

  addEvidence(e: EvidenceRecord): void;
  listEvidence(runId: string): EvidenceRecord[];

  upsertFinding(f: Finding): void;
  listFindings(runId: string): Finding[];

  addModelMetric(m: ModelInvocationMetric): void;
  listModelMetrics(runId: string): ModelInvocationMetric[];
  addToolMetric(m: ToolMetric): void;
  listToolMetrics(runId: string): ToolMetric[];

  emit(event: SecurityEvent): void;
  listEvents(runId: string): SecurityEvent[];

  /** Subscribe to the realtime event stream (used by the SSE dashboard). */
  subscribe(listener: (event: SecurityEvent) => void): () => void;
}

export class InMemoryStateStore implements StateStore {
  private runs = new Map<string, RunRecord>();
  private agents = new Map<string, AgentTask>();
  private hypotheses = new Map<string, HypothesisRecord>();
  private evidence: EvidenceRecord[] = [];
  private findings = new Map<string, Finding>();
  private modelMetrics: ModelInvocationMetric[] = [];
  private toolMetrics: ToolMetric[] = [];
  private events: SecurityEvent[] = [];
  private bus = new EventEmitter();

  constructor() {
    this.bus.setMaxListeners(1000);
  }

  createRun(run: RunRecord): void {
    this.runs.set(run.id, run);
  }
  updateRun(id: string, patch: Partial<RunRecord>): RunRecord | undefined {
    const existing = this.runs.get(id);
    if (!existing) return undefined;
    const next = { ...existing, ...patch, updatedAt: Date.now() };
    this.runs.set(id, next);
    return next;
  }
  getRun(id: string): RunRecord | undefined {
    return this.runs.get(id);
  }
  listRuns(): RunRecord[] {
    return [...this.runs.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  requestCancel(id: string): void {
    const r = this.runs.get(id);
    if (r) this.runs.set(id, { ...r, cancelRequested: true, updatedAt: Date.now() });
  }
  isCancelRequested(id: string): boolean {
    return this.runs.get(id)?.cancelRequested ?? false;
  }

  upsertAgent(agent: AgentTask): void {
    this.agents.set(agent.id, agent);
  }
  updateAgent(id: string, patch: Partial<AgentTask>): void {
    const existing = this.agents.get(id);
    if (existing) this.agents.set(id, { ...existing, ...patch });
  }
  listAgents(runId: string): AgentTask[] {
    return [...this.agents.values()].filter((a) => a.runId === runId);
  }

  addHypothesis(h: HypothesisRecord): void {
    this.hypotheses.set(h.id, h);
  }
  updateHypothesis(id: string, patch: Partial<HypothesisRecord>): void {
    const existing = this.hypotheses.get(id);
    if (existing) this.hypotheses.set(id, { ...existing, ...patch });
  }
  listHypotheses(runId: string): HypothesisRecord[] {
    return [...this.hypotheses.values()].filter((h) => h.runId === runId);
  }

  addEvidence(e: EvidenceRecord): void {
    this.evidence.push(e);
  }
  listEvidence(runId: string): EvidenceRecord[] {
    return this.evidence.filter((e) => e.runId === runId);
  }

  upsertFinding(f: Finding): void {
    this.findings.set(f.id, f);
  }
  listFindings(runId: string): Finding[] {
    return [...this.findings.values()].filter((f) => f.runId === runId);
  }

  addModelMetric(m: ModelInvocationMetric): void {
    this.modelMetrics.push(m);
  }
  listModelMetrics(runId: string): ModelInvocationMetric[] {
    return this.modelMetrics.filter((m) => m.runId === runId);
  }
  addToolMetric(m: ToolMetric): void {
    this.toolMetrics.push(m);
  }
  listToolMetrics(runId: string): ToolMetric[] {
    return this.toolMetrics.filter((m) => m.runId === runId);
  }

  emit(event: SecurityEvent): void {
    this.events.push(event);
    this.bus.emit("event", event);
  }
  listEvents(runId: string): SecurityEvent[] {
    return this.events.filter((e) => e.runId === runId);
  }

  subscribe(listener: (event: SecurityEvent) => void): () => void {
    this.bus.on("event", listener);
    return () => this.bus.off("event", listener);
  }
}
