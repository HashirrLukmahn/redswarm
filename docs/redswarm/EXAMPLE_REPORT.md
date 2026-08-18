# RedSwarm Report — RedSwarm demo swarm

> _Example artifact: real output of the report renderer from `npm run demo` (50 agents, offline mock provider) — not hand-written. Served live at `GET /api/runs/<runId>/report` and written to `reports/<runId>/report.md`._

Run `run_064fd10a-4e6` · status **COMPLETED** · target http://localhost:4640

## Status at a glance

| Verified | Rejected | Blocked by policy | Agents | Hypotheses |
|---|---|---|---|---|
| **1** | 3 | 0 | 50 | 50 |

## What to fix (systemic root causes)

### Economic side effects lack a shared durable idempotency boundary
Multiple findings share a root cause: mutation endpoints do not deduplicate logical operations.
_Addresses findings:_ find_69f4ffc0-dd0

## Recommended architecture changes

### [P1] Introduce durable idempotency keys at the ledger boundary
- **Root cause:** No shared idempotency boundary for economic effects.
- **Current risk:** Retries and replays can double economic effects.
- **Proposed change:** Require an idempotency key per logical transaction, persisted atomically with the ledger write.
- **Complexity:** MEDIUM · **Risk reduction:** HIGH
- **Validation:** Re-run RedSwarm concurrency + idempotency swarm

> The dominant architectural weakness is the absence of a shared idempotency boundary for economic effects.

_Recommendations require human review; RedSwarm never auto-applies architecture changes._

## Verified findings

### ✅ VERIFIED (CRITICAL) — Duplicate transfer via rapid resubmission without idempotency key
- **Invariant violated:** FI-002
- **Affected components:** api, payments-service, ledger
- **Finding confidence:** 1 (evidence + independent reproduction + deterministic breach)
- **Reproduction:** Reproduced 2/2 times. Deterministic violation observed: Idempotency key 'retry-1' produced 2 economic effects (expected exactly 1).
- **Architectural root cause:** Economic side effects lack a shared durable idempotency boundary.
- **Evidence records:** 12 · **Verifiers:** verifier_1_exp_fb, verifier_2_exp_fb
- **Blast radius (0-10):** funds 9 · confidentiality 0 · authz 0 · auditability 6 · regulatory 7 · exploit-complexity 2

## Rejected hypotheses (controls held / not reproduced)
- **Cross-tenant balance read via account id enumeration** (FI-004) — No deterministic invariant violation observed.
- **Revoked session still authorizes protected transfer** (FI-006) — No deterministic invariant violation observed.
- **Invalid transfer state transition from completed to reversed twice** (FI-007) — No deterministic invariant violation observed.

## GMI inference performance
- model calls **50** (success 50, error 0, rate-limited 0) · peak concurrency **10**
- tokens 107907 (prompt 90764 / completion 17143) · ~685720 completion tok/s
- latency p50 0ms / p95 1ms · queue p95 53ms · TTFT p95 13ms
- verified/100 agents 2.00 · verified/100 model-calls 2.00

---
_Generated 2026-08-18T03:03:04.702Z by RedSwarm. Hypothesis → CandidateFinding → VerifiedFinding; verdicts are deterministic, not model belief._