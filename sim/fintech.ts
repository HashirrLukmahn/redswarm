/**
 * Local fake fintech simulator (spec §65). It exists ONLY to exercise ArchRed
 * orchestration. It models users, accounts, synthetic balances, transactions,
 * roles, and a test-only state endpoint.
 *
 * It contains ONE genuine, honestly-modeled architectural weakness — transfers
 * are not idempotent, so a retried logical transfer applies twice. Tenant
 * isolation and revocation ARE correctly enforced, so hypotheses attacking those
 * are genuinely rejected. Nothing here fakes a finding (spec §69).
 */

export interface LedgerEntry {
  id: string;
  accountId: string;
  amount: number; // signed: negative = debit
  type: string;
  idempotencyKey?: string;
  transactionId: string;
  at: number;
}

export interface Account {
  id: string;
  owner: string; // persona id
  tenant: string;
  balance: number;
}

interface SimToken {
  token: string;
  persona: string;
  account?: string;
  revoked?: boolean;
}

export class FintechSimulator {
  private accounts = new Map<string, Account>();
  private ledger: LedgerEntry[] = [];
  private tokens = new Map<string, SimToken>();
  private auditEvents: { action: string; account: string; at: number }[] = [];
  private txCounter = 0;

  constructor(private readonly verificationToken = "archred-local-dev-token") {
    this.reset();
  }

  /** resetArchRedFixtures() (spec §43): restore synthetic fixtures. */
  reset(): void {
    this.accounts.clear();
    this.ledger = [];
    this.tokens.clear();
    this.auditEvents = [];
    this.txCounter = 0;

    const seed: Array<[string, string, string, number]> = [
      ["ARCHRED_TEST_ACCOUNT_A", "customer_a", "ARCHRED_TEST_ORG_A", 1000],
      ["ARCHRED_TEST_ACCOUNT_B", "customer_b", "ARCHRED_TEST_ORG_B", 1000],
      ["ARCHRED_TEST_ACCOUNT_C", "customer_c", "ARCHRED_TEST_ORG_A", 1000],
    ];
    for (const [id, owner, tenant, balance] of seed) {
      this.accounts.set(id, { id, owner, tenant, balance });
    }

    const tokenSeed: SimToken[] = [
      { token: "tok_customer_a", persona: "customer_a", account: "ARCHRED_TEST_ACCOUNT_A" },
      { token: "tok_customer_b", persona: "customer_b", account: "ARCHRED_TEST_ACCOUNT_B" },
      { token: "tok_customer_c", persona: "customer_c", account: "ARCHRED_TEST_ACCOUNT_C" },
      { token: "tok_org_a_admin", persona: "org_a_admin", account: "ARCHRED_TEST_ACCOUNT_A" },
      { token: "tok_org_a_member", persona: "org_a_member", account: "ARCHRED_TEST_ACCOUNT_A" },
      { token: "tok_org_b_admin", persona: "org_b_admin", account: "ARCHRED_TEST_ACCOUNT_B" },
      { token: "tok_org_b_member", persona: "org_b_member", account: "ARCHRED_TEST_ACCOUNT_B" },
      { token: "tok_revoked", persona: "revoked_user", account: "ARCHRED_TEST_ACCOUNT_A", revoked: true },
      { token: "tok_downgraded", persona: "downgraded_user", account: "ARCHRED_TEST_ACCOUNT_A" },
      { token: "tok_pending", persona: "pending_user" },
    ];
    for (const t of tokenSeed) this.tokens.set(t.token, t);
  }

  private authFromHeader(auth?: string): SimToken | undefined {
    if (!auth) return undefined;
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    return this.tokens.get(token);
  }

  /** Handle one request. Returns status + JSON body. Auth is a bearer token. */
  handle(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: unknown
  ): { status: number; body: unknown } {
    const cleanPath = path.split("?")[0] ?? path;

    // Staging ownership marker (spec §14).
    if (method === "GET" && cleanPath === "/.well-known/archred-target") {
      return {
        status: 200,
        body: { environment: "staging", testingEnabled: true, targetId: "archred-local-sim" },
      };
    }

    // Test-only fixture reset, guarded by the verification token (spec §43).
    if (method === "POST" && cleanPath === "/test/reset") {
      if (headers["x-archred-token"] !== this.verificationToken) {
        return { status: 403, body: { error: "reset requires verification token" } };
      }
      this.reset();
      return { status: 200, body: { reset: true } };
    }

    // Test-only state inspection, guarded by the verification token (spec §60).
    if (cleanPath.startsWith("/test/state/")) {
      if (headers["x-archred-token"] !== this.verificationToken) {
        return { status: 403, body: { error: "state inspection requires verification token" } };
      }
      return this.handleStateInspection(cleanPath);
    }

    const session = this.authFromHeader(headers["authorization"]);

    if (cleanPath.startsWith("/api/accounts/") && method === "GET") {
      if (!session || session.revoked) return { status: 401, body: { error: "unauthorized" } };
      const id = cleanPath.slice("/api/accounts/".length);
      const account = this.accounts.get(id);
      if (!account) return { status: 404, body: { error: "not found" } };
      // Correct ownership/tenant isolation enforcement (spec FI-004/FI-005).
      if (account.owner !== session.persona && account.id !== session.account) {
        return { status: 403, body: { error: "forbidden: not your account" } };
      }
      return { status: 200, body: { id: account.id, balance: account.balance, tenant: account.tenant } };
    }

    if (cleanPath === "/api/transfers" && method === "POST") {
      if (!session || session.revoked) return { status: 401, body: { error: "unauthorized" } };
      return this.handleTransfer(session, body);
    }

    return { status: 404, body: { error: "no route" } };
  }

  private handleTransfer(session: SimToken, body: unknown): { status: number; body: unknown } {
    const b = (body ?? {}) as { from?: string; to?: string; amount?: number; idempotencyKey?: string };
    const from = this.accounts.get(b.from ?? "");
    const to = this.accounts.get(b.to ?? "");
    const amount = Number(b.amount);

    if (!from || !to || !Number.isFinite(amount) || amount <= 0) {
      return { status: 400, body: { error: "invalid transfer" } };
    }
    // Ownership check on the source account is enforced correctly.
    if (from.owner !== session.persona && from.id !== session.account) {
      return { status: 403, body: { error: "forbidden: not your source account" } };
    }
    if (from.balance < amount) return { status: 409, body: { error: "insufficient funds" } };

    // *** Genuine weakness: no idempotency dedup. A retried logical transfer
    // *** (same idempotencyKey) is applied every time. This is the honest bug
    // *** ArchRed is meant to discover — it is NOT a faked finding.
    const transactionId = `tx_${++this.txCounter}`;
    from.balance -= amount;
    to.balance += amount;
    this.ledger.push({ id: `le_${this.ledger.length + 1}`, accountId: from.id, amount: -amount, type: "transfer_out", idempotencyKey: b.idempotencyKey, transactionId, at: Date.now() });
    this.ledger.push({ id: `le_${this.ledger.length + 1}`, accountId: to.id, amount, type: "transfer_in", idempotencyKey: b.idempotencyKey, transactionId, at: Date.now() });
    this.auditEvents.push({ action: "transfer", account: from.id, at: Date.now() });

    return { status: 200, body: { transactionId, from: from.id, to: to.id, amount, balance: from.balance } };
  }

  private handleStateInspection(path: string): { status: number; body: unknown } {
    // /test/state/account/:id  |  /test/state/ledger/:id
    const parts = path.split("/").filter(Boolean); // ["test","state","account","id"]
    const kind = parts[2];
    const id = parts[3] ?? "";

    if (kind === "account") {
      const account = this.accounts.get(id);
      if (!account) return { status: 404, body: { error: "not found" } };
      const entries = this.ledger.filter((l) => l.accountId === id);
      return {
        status: 200,
        body: {
          accountId: id,
          balance: account.balance,
          transactionCount: entries.length,
          ledger: entries.map((e) => ({ amount: e.amount, type: e.type, idempotencyKey: e.idempotencyKey, transactionId: e.transactionId })),
        },
      };
    }
    if (kind === "ledger") {
      const entries = this.ledger.filter((l) => l.accountId === id);
      return { status: 200, body: { accountId: id, entries } };
    }
    if (kind === "audit") {
      return { status: 200, body: { events: this.auditEvents.filter((e) => e.account === id) } };
    }
    return { status: 404, body: { error: "unknown inspection" } };
  }
}
