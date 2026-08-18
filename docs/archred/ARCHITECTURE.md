# ArchRed Architecture

Reference: [`build-spec.md`](../../build-spec.md) §4. This document maps the five
planes onto the code.

## Five planes

| Plane | Responsibility | Code |
|---|---|---|
| **Control UI** | `/security-lab` dashboard, start/stop runs | `server/` |
| **Control plane** | run manager, policy engine, scheduler, budgets, kill switch | `security/orchestration/`, `security/policy/` |
| **Reasoning plane** | GMI / Gemini / Exa via `ModelProvider` | `security/providers/`, `security/agents/` |
| **Execution plane** | staging API, browser (Apify), state inspector — all via ToolGateway | `security/tools/` |
| **Evidence/state** | runs, agents, events, hypotheses, experiments, evidence, findings, metrics | `security/state/store.ts` |
| **Analysis plane** | verifiers, skeptics, root-cause + architect | `security/services/`, `security/agents/architect.ts` |

## Run lifecycle (spec §37, §44, §45)

`runSecuritySwarm` (`security/orchestration/run-manager.ts`) drives:

```
CREATED → VALIDATING_SCOPE → RESEARCHING → GENERATING_HYPOTHESES →
DEDUPLICATING → PLANNING_EXPERIMENTS → EXECUTING → VERIFYING →
ROOT_CAUSE_ANALYSIS → REMEDIATING → COMPLETED
```

Exceptional: `FAILED | CANCELLED | POLICY_BLOCKED | BUDGET_EXHAUSTED`.
Transitions are enforced by `orchestration/state-machine.ts`.

## Concurrency (spec §5, §6)

Agents are **tasks**, not persistent processes. `ConcurrencyManager` holds
independent semaphores (`model`, `api`, `browser`, `verification`, `research`).
100 logical agents run through a bounded model semaphore. `BudgetTracker`
enforces per-run caps; the kill switch (`securityRuns.cancelRequested`) is checked
at every scheduling boundary.

## Trust flow for an experiment

```
Hypothesis (LLM) → ExperimentPlan (validated) → PolicyEngine.evaluate →
ToolGateway (capability + scope + budget + rate-limit + redaction) →
staging simulator → deterministic invariant check → Observation →
independent Verifier reproduction → VerifiedFinding
```

## State plane / Convex

`StateStore` (`security/state/store.ts`) is the coordination plane interface. The
default `InMemoryStateStore` powers the SSE dashboard. A Convex-backed store
implementing the same interface drops in without touching orchestration (spec
§35–§36); ArchRed state stays separate from the app's financial DB.
