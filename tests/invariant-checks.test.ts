import { describe, it, expect } from "vitest";
import {
  checkConservation,
  checkExactlyOnce,
  checkTenantIsolation,
  checkRevocation,
} from "../security/services/invariant-checks.js";
import type { AccountSummary } from "../security/tools/state-reader.js";

const summary = (balance: number, ledger: AccountSummary["ledger"]): AccountSummary => ({
  accountId: "A",
  balance,
  transactionCount: ledger.length,
  ledger,
});

describe("deterministic invariant checks (spec §61)", () => {
  it("FI-002 flags two economic effects for one idempotency key", () => {
    const after = summary(950, [
      { amount: -25, type: "transfer_out", idempotencyKey: "k", transactionId: "t1" },
      { amount: -25, type: "transfer_out", idempotencyKey: "k", transactionId: "t2" },
    ]);
    expect(checkExactlyOnce(after).violated).toBe(true);
  });

  it("FI-002 passes when a key produced exactly one effect", () => {
    const after = summary(975, [{ amount: -25, type: "transfer_out", idempotencyKey: "k", transactionId: "t1" }]);
    expect(checkExactlyOnce(after).violated).toBe(false);
  });

  it("FI-001 flags synthetic money creation/destruction", () => {
    const before = summary(1000, []);
    const after = summary(950, []);
    expect(checkConservation(before, after, -50).violated).toBe(false);
    expect(checkConservation(before, after, -25).violated).toBe(true);
  });

  it("FI-004 flags a successful cross-tenant read", () => {
    expect(checkTenantIsolation(200, true).violated).toBe(true);
    expect(checkTenantIsolation(403, false).violated).toBe(false);
  });

  it("FI-006 flags a revoked principal getting a 2xx", () => {
    expect(checkRevocation(200).violated).toBe(true);
    expect(checkRevocation(401).violated).toBe(false);
  });
});
