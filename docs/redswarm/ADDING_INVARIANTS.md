# Adding an Invariant

Reference: [`build-spec.md`](../../build-spec.md) §3, §61.

1. **Register it** in `security/fixtures/invariants.ts`:

   ```ts
   {
     id: "FI-013",
     title: "No negative balances",
     description: "A synthetic account balance must never go below zero.",
     family: "financial-integrity",
     deterministicCheck: true,
   }
   ```

2. **Add a deterministic check** (strongly preferred over LLM judgment) in
   `security/services/invariant-checks.ts`:

   ```ts
   export function checkNonNegative(after: AccountSummary): InvariantCheckResult {
     return {
       invariantId: "FI-013",
       violated: after.balance < 0,
       detail: after.balance < 0 ? `Balance is ${after.balance}` : "Balance non-negative.",
     };
   }
   ```

3. **Wire it into the executor** (`security/orchestration/executor.ts`) inside the
   deterministic-evaluation block, keyed on `plan.invariantId`.

4. **(Optional) Give a role a bespoke mock template** so the offline demo reliably
   surfaces a counterexample — see `security/providers/mock.ts` (`byInvariant`).

5. **Add a unit test** in `tests/invariant-checks.test.ts`.

Deterministic checks are what make findings trustworthy — prefer them to letting a
model decide whether an invariant failed.
