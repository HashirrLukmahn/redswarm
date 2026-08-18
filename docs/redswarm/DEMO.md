# RedSwarm Demo Script

Reference: [`build-spec.md`](../../build-spec.md) §68.

## Setup

```bash
npm install
npm run dashboard      # http://localhost:4610 (bundles the fintech simulator)
```

## Recommended run

Agents 50–100 · model concurrency 10–20 · risk `SANDBOX_MUTATING`.

## Sequence

1. Show the fintech architecture (`security/fixtures/architecture.ts`) and the
   five+ financial invariants.
2. Click **RELEASE THE SWARM**.
3. ~100 agent dots populate the grid and turn blue (thinking).
4. Hypotheses appear in the timeline; duplicates collapse
   (`HYPOTHESIS_MERGED`).
5. Controlled experiments begin (`EXPERIMENT_STARTED`); dots turn amber.
6. A candidate anomaly is detected (`CANDIDATE_FINDING`).
7. A verifier independently reproduces it (`VERIFICATION_STARTED`).
8. Result: **VERIFIED** (FI-002 duplicate transfer) or **REJECTED** (tenant
   isolation / revocation are correctly enforced — genuine rejections, not faked).
9. Architectural root cause + proposed remediation appear.
10. GMI metrics: model calls, tokens, peak concurrency, TTFT, p50, p95.

Closing line:

> "Instead of asking whether our fintech architecture looks secure, we made 100
> adversaries try to prove that it isn't."

## Headless version

```bash
REDSWARM_AGENT_COUNT=50 npm run demo
```

Prints the full event timeline, findings, and GMI performance summary to stdout.

## Real GMI inference

```bash
export GMI_API_KEY=...     # and GMI_MODEL=...
REDSWARM_MODEL_PROVIDER=gmi REDSWARM_AGENT_COUNT=100 npm run demo
```

Everything else (safety, verification, deterministic checks) is identical — only
the reasoning provider changes.
