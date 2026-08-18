import type { FindingStatus, RunStatus } from "../schemas/index.js";

/** Run state machine transitions (spec §37). */
const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  CREATED: ["VALIDATING_SCOPE", "CANCELLED", "FAILED"],
  VALIDATING_SCOPE: ["RESEARCHING", "GENERATING_HYPOTHESES", "POLICY_BLOCKED", "FAILED", "CANCELLED"],
  RESEARCHING: ["GENERATING_HYPOTHESES", "FAILED", "CANCELLED", "BUDGET_EXHAUSTED"],
  GENERATING_HYPOTHESES: ["DEDUPLICATING", "FAILED", "CANCELLED", "BUDGET_EXHAUSTED"],
  DEDUPLICATING: ["PLANNING_EXPERIMENTS", "FAILED", "CANCELLED", "BUDGET_EXHAUSTED"],
  PLANNING_EXPERIMENTS: ["EXECUTING", "FAILED", "CANCELLED", "BUDGET_EXHAUSTED", "POLICY_BLOCKED"],
  EXECUTING: ["VERIFYING", "FAILED", "CANCELLED", "BUDGET_EXHAUSTED"],
  VERIFYING: ["ROOT_CAUSE_ANALYSIS", "COMPLETED", "FAILED", "CANCELLED", "BUDGET_EXHAUSTED"],
  ROOT_CAUSE_ANALYSIS: ["REMEDIATING", "COMPLETED", "FAILED", "CANCELLED"],
  REMEDIATING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  POLICY_BLOCKED: [],
  BUDGET_EXHAUSTED: [],
};

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidRunTransitionError extends Error {
  constructor(from: RunStatus, to: RunStatus) {
    super(`Invalid run transition: ${from} -> ${to}`);
    this.name = "InvalidRunTransitionError";
  }
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransitionRun(from, to)) throw new InvalidRunTransitionError(from, to);
}

/** Finding lifecycle transitions (spec §30). */
const FINDING_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  HYPOTHESIS: ["EXPERIMENTING", "DUPLICATE", "BLOCKED", "REJECTED"],
  EXPERIMENTING: ["OBSERVED", "BLOCKED", "REJECTED"],
  OBSERVED: ["VERIFYING", "REJECTED"],
  VERIFYING: ["VERIFIED", "REJECTED"],
  VERIFIED: [],
  REJECTED: [],
  DUPLICATE: [],
  BLOCKED: [],
};

export function canTransitionFinding(from: FindingStatus, to: FindingStatus): boolean {
  return FINDING_TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidFindingTransitionError extends Error {
  constructor(from: FindingStatus, to: FindingStatus) {
    super(`Invalid finding transition: ${from} -> ${to}`);
    this.name = "InvalidFindingTransitionError";
  }
}

export function assertFindingTransition(from: FindingStatus, to: FindingStatus): void {
  if (!canTransitionFinding(from, to)) throw new InvalidFindingTransitionError(from, to);
}
