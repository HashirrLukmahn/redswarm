# RedSwarm — Autonomous Adversarial Architecture Testing Platform

RedSwarm deploys a bounded swarm of specialized adversarial AI workers against an
explicitly authorized fintech **staging** environment. The workers attempt to
_falsify_ declared financial and security invariants, execute only
policy-approved experiments, capture reproducible evidence, independently verify
candidate failures, identify systemic architectural root causes, and propose
remediations — while measuring the inference performance required to coordinate
the swarm.

Full design: [`build-spec.md`](build-spec.md). This is the reference MVP
implementation of that spec.

> **Safety:** RedSwarm only operates against staging/sandbox targets it can verify
> it owns. There is no `production` mode — it does not exist in the type system.
> It performs no scanning, credential attacks, shell execution, or exfiltration.
> See [`docs/redswarm/SAFETY_BOUNDARIES.md`](docs/redswarm/SAFETY_BOUNDARIES.md).

## Quick start (offline, no API keys)

```bash
npm install
npm test            # 58 tests: safety boundaries, orchestration, invariants, e2e
npm run demo        # runs the full swarm against the built-in fintech simulator
```

`npm run demo` starts the local fintech simulator, releases a swarm of adversarial
agents (via the offline `MockProvider`), and prints the live event timeline,
verified/rejected findings, and GMI-style performance metrics.

## Live dashboard

```bash
npm run dashboard   # http://localhost:4610  (bundles the simulator)
```

Click **RELEASE THE SWARM**. Watch ~100 workers light up, hypotheses appear,
duplicates collapse, experiments run, candidates get verified or rejected, and
p50/p95 inference metrics update live. **STOP SWARM** is the kill switch.

## Using real providers

Copy `.env.example` to `.env` and set keys. The system runs fully offline by
default; each integration is gated behind its env var:

| Provider | Role | Env |
|---|---|---|
| **GMI Cloud** | primary swarm inference | `GMI_API_KEY`, `REDSWARM_MODEL_PROVIDER=gmi` |
| **Exa** | defensive threat research | `EXA_API_KEY` |
| **Apify** | controlled browser execution | `APIFY_API_TOKEN`, `APIFY_REDSWARM_ACTOR_ID` |
| **Gemini** | Chief Security Architect | `GEMINI_API_KEY` |
| **Convex** | realtime state plane | swap `InMemoryStateStore` for a Convex `StateStore` |

## What makes findings trustworthy

- A **hypothesis** is an idea; a **finding** requires evidence; a **verified
  finding** requires independent reproduction (spec §73). These are distinct
  types and lifecycle states throughout.
- **Deterministic** code — not an LLM — judges whether a financial invariant was
  violated (spec §61). LLMs only generate hypotheses.
- The built-in simulator has **one genuine, honestly-modeled** weakness
  (non-idempotent transfers → FI-002). Tenant isolation and revocation are
  correctly enforced, so hypotheses attacking them are genuinely **rejected** —
  nothing is faked (spec §69).

## Layout

```
security/        core engine (schemas, providers, orchestration, policy, tools, agents, services)
sim/             local fake fintech simulator (the staging target)
server/          SSE live dashboard
cli/             demo + run entrypoints
tests/           safety + orchestration + e2e tests
docs/redswarm/    architecture, threat model, safety, how-to guides
```

See [`docs/redswarm/DEMO.md`](docs/redswarm/DEMO.md) for the hackathon demo script.
