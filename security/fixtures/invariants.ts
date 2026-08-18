import type { SecurityInvariant } from "../schemas/index.js";

/**
 * Seed invariant registry (spec §3). Represented in configuration, not hardcoded
 * into logic. Application-specific invariants can be appended.
 */
export const SEED_INVARIANTS: SecurityInvariant[] = [
  {
    id: "FI-001",
    title: "Conservation of funds",
    description:
      "A test workflow must never create or destroy synthetic money unless an explicitly modeled deposit, withdrawal, fee, adjustment, or external transfer accounts for the difference.",
    family: "financial-integrity",
    deterministicCheck: true,
  },
  {
    id: "FI-002",
    title: "Exactly-once economic effect",
    description:
      "A logical financial transaction must never cause more than one economic effect even if requests are retried.",
    family: "financial-integrity",
    deterministicCheck: true,
  },
  {
    id: "FI-003",
    title: "Ledger traceability",
    description: "Every balance-changing action must have a durable, auditable ledger representation.",
    family: "financial-integrity",
    deterministicCheck: true,
  },
  {
    id: "FI-004",
    title: "Tenant isolation",
    description: "A principal belonging to tenant A cannot observe or mutate tenant B's financial resources.",
    family: "authorization",
    deterministicCheck: true,
  },
  {
    id: "FI-005",
    title: "Ownership authorization",
    description: "User A cannot view or mutate resources belonging solely to User B.",
    family: "authorization",
    deterministicCheck: true,
  },
  {
    id: "FI-006",
    title: "Revocation",
    description:
      "Once a session, credential, membership, or authorization grant is revoked, it cannot authorize new protected actions.",
    family: "session-lifecycle",
    deterministicCheck: true,
  },
  {
    id: "FI-007",
    title: "State validity",
    description: "A financial entity may transition only through explicitly valid state transitions.",
    family: "state-machine",
    deterministicCheck: false,
  },
  {
    id: "FI-008",
    title: "Idempotent external events",
    description:
      "Replayed webhooks, callbacks, queue messages, or retryable requests must not generate duplicate economic outcomes.",
    family: "concurrency",
    deterministicCheck: true,
  },
  {
    id: "FI-009",
    title: "Audit consistency",
    description: "A successful sensitive operation must generate the required audit event.",
    family: "financial-integrity",
    deterministicCheck: true,
  },
  {
    id: "FI-010",
    title: "Atomic authorization",
    description:
      "Authorization decisions must remain valid through the corresponding state mutation or be safely revalidated.",
    family: "authorization",
    deterministicCheck: false,
  },
  {
    id: "FI-011",
    title: "Privacy",
    description:
      "Financial information visible to one identity must not reveal protected information belonging to another identity without authorization.",
    family: "privacy",
    deterministicCheck: false,
  },
  {
    id: "FI-012",
    title: "Bounded agent authority",
    description:
      "An AI component cannot cause effects outside the capabilities delegated to the user or workflow that invoked it.",
    family: "ai-authority",
    deterministicCheck: false,
  },
];

export function getInvariant(id: string): SecurityInvariant | undefined {
  return SEED_INVARIANTS.find((i) => i.id === id);
}
