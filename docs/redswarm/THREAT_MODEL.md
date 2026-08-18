# RedSwarm Threat Model

Reference: [`build-spec.md`](../../build-spec.md) §1–§3, §9–§10.

## Philosophy: invariant falsification

RedSwarm does not ask "can you find a vulnerability?" It asks "can you construct a
**counterexample** to this declared invariant?" This forces agents to reason about
real fintech architecture instead of generic vulnerability names.

## What it hunts

Financial-integrity, idempotency, authorization/tenant-isolation, invalid state
transitions, concurrency, partial-failure/retry/stale-state, session lifecycle,
privacy, distributed inconsistency, AI-agent authority, and trust-boundary
failures. It is **not** primarily a CVE scanner.

## Seed invariants (`security/fixtures/invariants.ts`)

FI-001 conservation · FI-002 exactly-once · FI-003 ledger traceability ·
FI-004 tenant isolation · FI-005 ownership · FI-006 revocation · FI-007 state
validity · FI-008 idempotent external events · FI-009 audit consistency ·
FI-010 atomic authorization · FI-011 privacy · FI-012 bounded agent authority.

Invariants are configuration, not hardcoded logic. Those with
`deterministicCheck: true` are judged by code (`services/invariant-checks.ts`).

## Swarm composition (spec §9)

Roles are allocated proportionally to `swarmShare` and scaled to the requested
agent count (`orchestration/swarm.ts`): financial-integrity, authorization,
state-machine, concurrency, privacy, workflow-abuse, distributed-failure,
session-lifecycle, trust-boundary, ai-authority, wildcard. Each agent gets a
deterministic `diversitySeed` for reproducibility.

## Pipeline

100 hypotheses → normalize/fingerprint dedup → rank
(`plausibility·impact·novelty·testability·relevance`) → skeptic pass (reduces
confirmation bias) → policy-approved experiments → deterministic observation →
independent verification → root-cause clustering (Gemini architect) →
remediations. Findings never reach `VERIFIED` on attacker belief alone; verifier
severity policy requires 1–2 independent reproductions (spec §29).
