import type { AccountSummary } from "../tools/state-reader.js";

export interface InvariantCheckResult {
  invariantId: string;
  violated: boolean;
  detail: string;
}

/**
 * Deterministic invariant checks (spec §61). LLMs generate hypotheses;
 * deterministic software judges objective conditions. This dramatically improves
 * trustworthiness and drives verified/rejected verdicts.
 */

/** FI-002 — exactly-once economic effect. A logical transaction (identified by
 * idempotencyKey) must not produce more than one economic effect. */
export function checkExactlyOnce(after: AccountSummary): InvariantCheckResult {
  const byKey = new Map<string, number>();
  for (const e of after.ledger) {
    if (!e.idempotencyKey) continue;
    byKey.set(e.idempotencyKey, (byKey.get(e.idempotencyKey) ?? 0) + 1);
  }
  // Each logical transfer writes 2 legs (out+in). More than 2 legs per key on a
  // single account side means the retried transaction was applied repeatedly.
  const debitsByKey = new Map<string, number>();
  for (const e of after.ledger) {
    if (!e.idempotencyKey || e.amount >= 0) continue;
    debitsByKey.set(e.idempotencyKey, (debitsByKey.get(e.idempotencyKey) ?? 0) + 1);
  }
  const offending = [...debitsByKey.entries()].filter(([, n]) => n > 1);
  if (offending.length > 0) {
    const [key, n] = offending[0]!;
    return {
      invariantId: "FI-002",
      violated: true,
      detail: `Idempotency key '${key}' produced ${n} economic effects (expected exactly 1).`,
    };
  }
  return { invariantId: "FI-002", violated: false, detail: "Each logical transaction had exactly one effect." };
}

/** FI-001 — conservation of funds. balanceDelta must equal the modeled external
 * delta (deposits/withdrawals/fees/transfers). */
export function checkConservation(
  before: AccountSummary,
  after: AccountSummary,
  modeledExternalDelta: number
): InvariantCheckResult {
  const observed = after.balance - before.balance;
  const violated = Math.abs(observed - modeledExternalDelta) > 1e-9;
  return {
    invariantId: "FI-001",
    violated,
    detail: violated
      ? `Observed delta ${observed} != modeled delta ${modeledExternalDelta} (synthetic money created/destroyed).`
      : `Balance change ${observed} matches modeled delta.`,
  };
}

/** FI-004 — tenant isolation. A read of another tenant's account must not
 * succeed with data. */
export function checkTenantIsolation(
  crossTenantReadStatus: number,
  crossTenantReadHadBalance: boolean
): InvariantCheckResult {
  const violated = crossTenantReadStatus >= 200 && crossTenantReadStatus < 300 && crossTenantReadHadBalance;
  return {
    invariantId: "FI-004",
    violated,
    detail: violated
      ? "A principal read another tenant's balance."
      : `Cross-tenant read correctly denied (status ${crossTenantReadStatus}).`,
  };
}

/** FI-006 — revocation. A revoked principal must not obtain a successful
 * protected response. */
export function checkRevocation(revokedStatus: number): InvariantCheckResult {
  const violated = revokedStatus >= 200 && revokedStatus < 300;
  return {
    invariantId: "FI-006",
    violated,
    detail: violated
      ? "A revoked principal received a successful protected response."
      : `Revoked principal correctly denied (status ${revokedStatus}).`,
  };
}
