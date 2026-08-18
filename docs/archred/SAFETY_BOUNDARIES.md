# ArchRed Safety Boundaries

Reference: [`build-spec.md`](../../build-spec.md) §0, §13–§19, §46, §59.
ArchRed is security infrastructure and is tested as such (`tests/`).

## Hard boundaries (enforced in code + tests)

1. **No production.** `EnvironmentSchema = local | staging`. There is no
   `production` enum value. `tests/scope.test.ts` asserts it is rejected.
2. **Scope manifest required.** No run starts without a `ScopeManifest`. Staging
   ownership is verified via `GET /.well-known/archred-target` before the run and
   host/transport/redirect checks run on **every** request (`policy/scope.ts`,
   `tools/staging-api.ts`).
3. **Exact-host allowlist.** No wildcard/suffix matching. Off-host redirects →
   `TOOL_BLOCKED_OUT_OF_SCOPE` (`tests/scope.test.ts`).
4. **Capability-based tools.** Roles receive only necessary capabilities
   (`policy/capabilities.ts`). A research agent cannot run a browser
   (`tests/tool-gateway.test.ts`).
5. **Single ToolGateway.** Agents never call `fetch`/Apify/externals directly.
   The gateway verifies capability → scope → budget → rate-limit → sanitizes →
   executes → sanitizes → saves evidence → emits event → updates budget.
6. **Credentials hidden from the model.** Personas are ids only; the gateway
   injects auth server-side. Model-supplied `Authorization`/`Host`/`Cookie` are
   stripped (`tests/tool-gateway.test.ts`).
7. **Redaction before everything.** `redactSensitive` runs before persistence,
   logging, model context, and UI (`policy/redaction.ts`, `tests/redaction.test.ts`).
8. **Budgets + kill switch.** `BudgetTracker` stops scheduling on exhaustion;
   `cancelRequested` halts new model/tool work (`tests/budgets.test.ts`,
   `tests/e2e.test.ts`).
9. **Synthetic data only.** `syntheticDataOnly: true` is a literal; the policy
   engine rejects bodies that look like real customer identifiers.

## Explicitly NOT implemented (spec §0)

Arbitrary internet scanning, port scanning, credential stuffing/spraying, malware
execution, arbitrary shell/code execution, unrestricted browser JS eval, arbitrary
SSRF, exploit-kit payloads, persistence, exfiltration, destructive prod testing.

## The initial toolset (spec §18)

`security.searchResearch`, `staging.request`, `staging.readState`,
`browser.runScenario`, `experiment.delay`, `experiment.parallel`,
`evidence.record`. No `shell` / `executeCode` / `rawBrowserEval` / `scanNetwork`.
