# CLAUDE.md — ArchRed

Repository-level context for coding agents. The authoritative design is
[`build-spec.md`](build-spec.md); do not duplicate it here.

## What this is

ArchRed: an autonomous adversarial architecture-testing platform for fintech
**staging** environments. TypeScript, ESM, Node ≥20. Run TS directly with `tsx`;
tests via `vitest`. No build step.

## Commands

- `npm test` — full suite (safety, orchestration, invariants, e2e).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run demo` — end-to-end swarm against the built-in simulator (offline).
- `npm run dashboard` — SSE live dashboard on :4610 (bundles the simulator).
- `npm run sim` — run just the fintech simulator.

## Non-negotiable safety rules (see spec §13–§19, §46, §59)

- **No `production` target mode.** `EnvironmentSchema` = `local | staging` only.
  Never add production.
- Every run needs a verified `ScopeManifest`. Staging ownership is checked via
  `/.well-known/archred-target` before AND on every request.
- All execution flows through `ToolGateway` (`security/tools/tool-gateway.ts`).
  Agents never call `fetch`, Apify, or external services directly.
- The model never receives credentials. Personas are referenced by id; the
  gateway injects auth server-side from the persona vault. Model-supplied
  `Authorization`/`Host`/`Cookie` headers are stripped.
- Redact with `redactSensitive` BEFORE persistence, logging, model context, UI.
- Deterministic code judges invariant violations (`services/invariant-checks.ts`),
  never an LLM (spec §61).
- Do not fake findings (spec §69). The simulator's one real weakness is
  non-idempotent transfers; other controls are correctly enforced.

## Vocabulary (spec §73 — keep distinct)

`Hypothesis` (idea) → `CandidateFinding` (observed) → `VerifiedFinding`
(independently reproduced). Finding lifecycle transitions are enforced in
`orchestration/state-machine.ts`.

## Where things live

- Schemas (Zod): `security/schemas/`
- Providers (GMI/Gemini/Exa/Apify/Mock): `security/providers/`
- Orchestration (concurrency, budgets, scheduler, executor, run-manager, state
  machine): `security/orchestration/`
- Policy (scope, capabilities, policy-engine, redaction): `security/policy/`
- Agents (hypothesis, skeptic, verifier via services, architect): `security/agents/`
- State plane: `security/state/store.ts` (`StateStore` interface; swap in Convex).

## Extending

- New invariant → `docs/archred/ADDING_INVARIANTS.md`.
- New agent role → `docs/archred/ADDING_AGENT_ROLES.md`.

## Conventions

- ESM imports use explicit `.js` extensions (TS `Bundler` resolution).
- Prefer adding real provider adapters behind env gates; keep everything runnable
  offline via `MockProvider`.
