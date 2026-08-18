import type { AgentRole } from "../../schemas/index.js";

/** Agent role definition (spec §10). */
export interface AgentRoleDefinition {
  id: AgentRole;
  name: string;
  mission: string;
  reasoningLens: string[];
  forbiddenActions: string[];
  preferredInvariants: string[];
  /** How many of these to spawn in a ~100-worker run (spec §9). */
  swarmShare: number;
  specialistPrompt: string;
}

const FORBIDDEN_COMMON = [
  "arbitrary exploit payloads",
  "credential theft",
  "network/port scanning",
  "persistence mechanisms",
  "data exfiltration",
];

export const ROLE_DEFINITIONS: Partial<Record<AgentRole, AgentRoleDefinition>> = {
  "financial-integrity": {
    id: "financial-integrity",
    name: "Financial Integrity Agent",
    mission:
      "Find sequences of legitimate operations that create duplicated, missing, or inconsistent economic effects.",
    reasoningLens: ["retries", "duplicate submission", "async completion", "cancellation", "refund", "partial failure"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-001", "FI-002", "FI-003", "FI-008"],
    swarmShare: 12,
    specialistPrompt:
      "Focus on money conservation, exactly-once effects, and ledger traceability. Look at retries, duplicate submission, async completion, cancellation, reversal, refund, and partial failure.",
  },
  authorization: {
    id: "authorization",
    name: "Authorization / Tenant Boundary Agent",
    mission: "Find inconsistencies between identity, role, tenant, ownership, and permitted resources.",
    reasoningLens: ["User A vs User B", "tenant admin vs member", "deactivated", "downgraded", "pending"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-004", "FI-005", "FI-010"],
    swarmShare: 12,
    specialistPrompt:
      "Reason about personas: User A, User B, tenant admin, ordinary user, deactivated, downgraded, and pending users. Look for ownership and tenant isolation gaps.",
  },
  "state-machine": {
    id: "state-machine",
    name: "State-Machine Agent",
    mission: "Infer entity state machines and find sequences reaching logically invalid states.",
    reasoningLens: ["payment", "transfer", "withdrawal", "approval", "settlement"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-007"],
    swarmShare: 12,
    specialistPrompt:
      "Describe the state machine of a financial entity, then find a sequence that reaches an invalid state. Output transitions, not exploit code.",
  },
  concurrency: {
    id: "concurrency",
    name: "Concurrency / Idempotency Agent",
    mission: "Identify operations whose correctness depends on ordering, locking, atomicity, or stale reads.",
    reasoningLens: ["race", "double-submit", "stale read", "lost update"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-002", "FI-008"],
    swarmShare: 12,
    specialistPrompt:
      "Generate controlled concurrent experiment hypotheses. Consider double submission, races, and stale reads that break idempotency.",
  },
  privacy: {
    id: "privacy",
    name: "Privacy Agent",
    mission: "Find where one identity's data reveals protected information about another.",
    reasoningLens: ["enumeration", "error oracles", "aggregate leakage"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-011"],
    swarmShare: 10,
    specialistPrompt: "Look for privacy boundary violations where responses reveal another identity's protected data.",
  },
  "workflow-abuse": {
    id: "workflow-abuse",
    name: "Workflow Abuse Agent",
    mission:
      "Assume every endpoint works as designed; combine legitimate capabilities into an unintended outcome.",
    reasoningLens: ["capability composition", "feature interaction"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-001", "FI-002", "FI-005"],
    swarmShare: 10,
    specialistPrompt:
      "Assume each endpoint is individually correct. Compose multiple legitimate features into an unintended economic or authorization outcome.",
  },
  "distributed-failure": {
    id: "distributed-failure",
    name: "Distributed Failure Agent",
    mission: "Assume network operations can time out, delay, retry, reorder, or partially succeed.",
    reasoningLens: ["timeout", "reorder", "partial success", "late completion"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-002", "FI-008"],
    swarmShare: 8,
    specialistPrompt:
      "Assume operations can time out, be delayed, return after caller timeout, be retried, arrive out of order, or partially succeed. Find unsafe architectural assumptions.",
  },
  "session-lifecycle": {
    id: "session-lifecycle",
    name: "Session / Identity Lifecycle Agent",
    mission: "Find weaknesses in session, credential, and membership lifecycle.",
    reasoningLens: ["revocation", "downgrade", "re-activation"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-006", "FI-010"],
    swarmShare: 6,
    specialistPrompt: "Focus on revoked sessions, downgraded roles, and pending activations still authorizing actions.",
  },
  "trust-boundary": {
    id: "trust-boundary",
    name: "Architecture Trust-Boundary Agent",
    mission: "Find architectural trust-boundary assumptions that can be violated.",
    reasoningLens: ["client trust", "internal service trust", "webhook trust"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-008", "FI-010"],
    swarmShare: 6,
    specialistPrompt: "Identify trust boundaries and where the architecture over-trusts inputs crossing them.",
  },
  "ai-authority": {
    id: "ai-authority",
    name: "AI Authority Agent",
    mission: "Find where an AI component could act beyond delegated capabilities.",
    reasoningLens: ["over-broad delegation", "tool authority"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-012"],
    swarmShare: 6,
    specialistPrompt: "Look for AI components that could cause effects beyond the invoking user's or workflow's authority.",
  },
  wildcard: {
    id: "wildcard",
    name: "Wildcard Adversarial Thinker",
    mission: "Find a failure mode the other specialists are unlikely to consider.",
    reasoningLens: ["lateral thinking", "unusual but realistic behavior"],
    forbiddenActions: FORBIDDEN_COMMON,
    preferredInvariants: ["FI-001", "FI-005", "FI-011"],
    swarmShare: 6,
    specialistPrompt:
      "Find a failure mode the specialist categories are unlikely to consider, while staying within declared invariants and permitted capabilities.",
  },
};

export const HYPOTHESIS_ROLES = Object.keys(ROLE_DEFINITIONS) as AgentRole[];
