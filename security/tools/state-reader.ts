import type { ScopeManifest } from "../schemas/index.js";

export interface AccountSummary {
  accountId: string;
  balance: number;
  transactionCount: number;
  ledger: { amount: number; type: string; idempotencyKey?: string; transactionId: string }[];
}

/**
 * Restricted, staging-only state inspector (spec §60). Reads synthetic balances,
 * ledger totals, and transaction counts through a test-only endpoint guarded by
 * the verification token. The model never gets unrestricted database access.
 */
export class TestStateInspector {
  constructor(
    private readonly scope: ScopeManifest,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async get(path: string): Promise<unknown> {
    const url = new URL(path, this.scope.targetOrigin).toString();
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: this.scope.ownershipVerificationToken
        ? { "x-archred-token": this.scope.ownershipVerificationToken }
        : {},
      redirect: "manual",
    });
    if (!res.ok) throw new Error(`state inspector HTTP ${res.status}`);
    return res.json();
  }

  async accountSummary(testAccountId: string): Promise<AccountSummary> {
    return (await this.get(`/test/state/account/${testAccountId}`)) as AccountSummary;
  }

  async ledgerSummary(testAccountId: string): Promise<unknown> {
    return this.get(`/test/state/ledger/${testAccountId}`);
  }
}
