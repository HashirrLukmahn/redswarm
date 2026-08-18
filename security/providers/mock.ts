import type {
  GenerateStructuredParams,
  ModelProvider,
  ModelResult,
} from "./model-provider.js";
import { extractJson } from "./model-provider.js";

/**
 * Deterministic offline provider (spec §7, §66 Phase 2). Lets the entire loop
 * run and be tested without any API spend. It inspects the [[ARCHRED_TASK:x]]
 * marker embedded in system prompts to decide what structured output to emit.
 *
 * Crucially, the hypotheses/experiments it emits are executed for real against
 * the local simulator — findings are produced by deterministic checks, never
 * hardcoded (spec §69).
 */
export class MockProvider implements ModelProvider {
  readonly name = "mock";
  constructor(private readonly latencyMs = 40) {}

  private taskOf(system: string): string {
    const m = system.match(/\[\[ARCHRED_TASK:([a-z-]+)\]\]/i);
    return m?.[1]?.toLowerCase() ?? "hypothesis";
  }

  private seedInt(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  private buildHypothesis(params: GenerateStructuredParams<unknown>): unknown {
    const seed = this.seedInt(params.metadata.agentId + params.prompt);
    // Pull the invariant + persona hints out of the prompt.
    const invMatch = params.prompt.match(/INVARIANT_TARGET:\s*(FI-\d+)/);
    const invariantId = invMatch?.[1] ?? "FI-002";
    const familyMatch = params.prompt.match(/THREAT_FAMILY:\s*([a-z-]+)/);
    const threatFamily = familyMatch?.[1] ?? "financial-integrity";

    // A rotation of realistic architectural failure hypotheses. Several target
    // the simulator's genuine weakness (non-idempotent transfers) so real
    // findings emerge from real execution.
    const templates = [
      {
        title: "Duplicate transfer via rapid resubmission without idempotency key",
        invariantId: "FI-002",
        threatFamily: "concurrency",
        architecturalAssumption:
          "The transfer endpoint assumes each client request is unique.",
        proposedFailureMode:
          "Submitting the same synthetic transfer twice in quick succession produces two ledger entries and double debits the source account.",
        affectedComponents: ["api", "payments-service", "ledger"],
        steps: [
          { kind: "state", inspect: "account", targetId: "ARCHRED_TEST_ACCOUNT_A", label: "before" },
          { kind: "api", personaId: "customer_a", method: "POST", path: "/api/transfers", idempotencyKey: "retry-1", body: { from: "ARCHRED_TEST_ACCOUNT_A", to: "ARCHRED_TEST_ACCOUNT_B", amount: 25, idempotencyKey: "retry-1" } },
          { kind: "api", personaId: "customer_a", method: "POST", path: "/api/transfers", idempotencyKey: "retry-1", body: { from: "ARCHRED_TEST_ACCOUNT_A", to: "ARCHRED_TEST_ACCOUNT_B", amount: 25, idempotencyKey: "retry-1" } },
          { kind: "state", inspect: "account", targetId: "ARCHRED_TEST_ACCOUNT_A", label: "after" },
        ],
        risk: "SYNTHETIC_MUTATION" as const,
        violationSignal: "Source account debited twice for one intended transfer.",
      },
      {
        title: "Cross-tenant balance read via account id enumeration",
        invariantId: "FI-004",
        threatFamily: "authorization",
        architecturalAssumption:
          "Account read authorization relies on the URL id matching the caller's own account.",
        proposedFailureMode:
          "customer_a requests customer_b's account summary and receives balance data belonging to another tenant.",
        affectedComponents: ["api", "auth"],
        steps: [
          { kind: "api", personaId: "customer_a", method: "GET", path: "/api/accounts/ARCHRED_TEST_ACCOUNT_B" },
        ],
        risk: "READ_ONLY" as const,
        violationSignal: "customer_a can read customer_b's balance.",
      },
      {
        title: "Invalid transfer state transition from completed to reversed twice",
        invariantId: "FI-007",
        threatFamily: "state-machine",
        architecturalAssumption:
          "A transfer can only be reversed once from the completed state.",
        proposedFailureMode:
          "Repeated reversal requests re-credit the account each time, minting synthetic funds.",
        affectedComponents: ["payments-service", "ledger"],
        steps: [
          { kind: "state", inspect: "account", targetId: "ARCHRED_TEST_ACCOUNT_A", label: "before" },
          { kind: "api", personaId: "customer_a", method: "POST", path: "/api/transfers", body: { from: "ARCHRED_TEST_ACCOUNT_A", to: "ARCHRED_TEST_ACCOUNT_B", amount: 10 } },
          { kind: "state", inspect: "account", targetId: "ARCHRED_TEST_ACCOUNT_A", label: "after" },
        ],
        risk: "SYNTHETIC_MUTATION" as const,
        violationSignal: "Reversal applied more than once.",
      },
      {
        title: "Revoked session still authorizes protected transfer",
        invariantId: "FI-006",
        threatFamily: "session-lifecycle",
        architecturalAssumption:
          "Revoked personas cannot perform mutations.",
        proposedFailureMode:
          "A revoked persona's request is still honored by the mutation endpoint.",
        affectedComponents: ["auth", "api"],
        steps: [
          { kind: "api", personaId: "revoked_user", method: "GET", path: "/api/accounts/ARCHRED_TEST_ACCOUNT_A" },
        ],
        risk: "READ_ONLY" as const,
        violationSignal: "Revoked persona receives a successful protected response.",
      },
    ];

    // Select a template deterministically from the targeted invariant so the
    // swarm reliably surfaces the relevant counterexample; fall back to a
    // seed-based rotation for invariants without a bespoke template.
    const byInvariant: Record<string, number> = {
      "FI-001": 0, "FI-002": 0, "FI-003": 0, "FI-008": 0,
      "FI-004": 1, "FI-005": 1, "FI-011": 1,
      "FI-007": 2,
      "FI-006": 3, "FI-010": 3,
    };
    const idx = byInvariant[invariantId] ?? seed % templates.length;
    const pick = templates[idx]!;
    return {
      title: pick.title,
      threatFamily: pick.threatFamily || threatFamily,
      invariantId: pick.invariantId || invariantId,
      architecturalAssumption: pick.architecturalAssumption,
      proposedFailureMode: pick.proposedFailureMode,
      prerequisites: ["Synthetic fixtures ARCHRED_TEST_ACCOUNT_A/B exist"],
      affectedComponents: pick.affectedComponents,
      confidence: 0.4 + (seed % 40) / 100,
      noveltyReason: "Combines a realistic workflow with an architectural assumption.",
      proposedExperiment: {
        title: pick.title,
        risk: pick.risk,
        preconditions: ["Synthetic accounts funded"],
        actors: ["customer_a"],
        steps: pick.steps,
        expectedSafeOutcome: "Exactly one economic effect; no cross-tenant disclosure.",
        violationSignal: pick.violationSignal,
        rationale: "Falsify the invariant by constructing a permitted counterexample.",
      },
    };
  }

  private buildSkeptic(params: GenerateStructuredParams<unknown>): unknown {
    const seed = this.seedInt(params.prompt);
    return {
      hypothesisId: params.prompt.match(/HYPOTHESIS_ID:\s*(\S+)/)?.[1] ?? "unknown",
      plausible: seed % 5 !== 0, // reject ~20% to reduce confirmation bias
      likelyExistingControl:
        seed % 5 === 0 ? "Endpoint likely enforces server-side ownership checks." : undefined,
      missingAssumptions: seed % 3 === 0 ? ["Assumes no idempotency key is enforced"] : [],
      recommendedExperimentChanges: ["Capture before/after ledger snapshots"],
      confidence: 0.5 + (seed % 30) / 100,
    };
  }

  private buildVerifier(params: GenerateStructuredParams<unknown>): unknown {
    // The verifier defers to deterministic checks; it reports its independent read.
    const deterministic = /DETERMINISTIC_VIOLATION:\s*true/i.test(params.prompt);
    return {
      verifierId: params.metadata.agentId,
      hypothesisId: params.prompt.match(/HYPOTHESIS_ID:\s*(\S+)/)?.[1] ?? "unknown",
      reproduced: deterministic,
      deterministicViolation: deterministic,
      rationale: deterministic
        ? "Independent reproduction observed the same deterministic invariant violation."
        : "Could not independently reproduce the reported violation; no deterministic breach.",
      evidenceIds: [],
    };
  }

  private buildArchitect(params: GenerateStructuredParams<unknown>): unknown {
    return {
      systemicRootCauses: [
        {
          id: "rc-idempotency",
          title: "Economic side effects lack a shared durable idempotency boundary",
          addressesFindingIds: [],
          summary:
            "Multiple findings share a root cause: mutation endpoints do not deduplicate logical operations.",
        },
      ],
      recommendations: [
        {
          id: "rec-idempotency-keys",
          title: "Introduce durable idempotency keys at the ledger boundary",
          addressesFindingIds: [],
          rootCause: "No shared idempotency boundary for economic effects.",
          currentRisk: "Retries and replays can double economic effects.",
          proposedChange:
            "Require an idempotency key per logical transaction, persisted atomically with the ledger write.",
          affectedComponents: ["api", "payments-service", "ledger"],
          implementationComplexity: "MEDIUM",
          expectedRiskReduction: "HIGH",
          migrationNotes: ["Backfill existing transactions with synthetic keys"],
          validationPlan: ["Re-run ArchRed concurrency + idempotency swarm"],
        },
      ],
      prioritizedRoadmap: [
        { recommendationId: "rec-idempotency-keys", priority: 1, rationale: "Highest funds-integrity impact." },
      ],
      executiveSummary:
        "The dominant architectural weakness is the absence of a shared idempotency boundary for economic effects.",
      architectureMermaid: "graph TD; api-->payments; payments-->ledger;",
    };
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<ModelResult<T>> {
    const queuedAt = Date.now();
    await new Promise((r) => setTimeout(r, this.latencyMs));
    const startedAt = Date.now();
    const firstTokenAt = startedAt + Math.floor(this.latencyMs / 3);

    const task = this.taskOf(params.system);
    let payload: unknown;
    switch (task) {
      case "skeptic":
        payload = this.buildSkeptic(params as GenerateStructuredParams<unknown>);
        break;
      case "verifier":
        payload = this.buildVerifier(params as GenerateStructuredParams<unknown>);
        break;
      case "architect":
        payload = this.buildArchitect(params as GenerateStructuredParams<unknown>);
        break;
      default:
        payload = this.buildHypothesis(params as GenerateStructuredParams<unknown>);
    }

    const raw = JSON.stringify(payload);
    // Validate locally with Zod, exactly as a real provider result would be (spec §8).
    const parsed = params.schema.safeParse(JSON.parse(extractJson(raw)));
    if (!parsed.success) {
      throw new Error(`MockProvider produced invalid ${task}: ${parsed.error.message}`);
    }
    const finishedAt = Date.now();
    const promptTokens = Math.ceil((params.system.length + params.prompt.length) / 4);
    const completionTokens = Math.ceil(raw.length / 4);

    return {
      data: parsed.data,
      raw,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      timings: { queuedAt, startedAt, firstTokenAt, finishedAt, retryCount: 0 },
      model: params.model,
      provider: this.name,
    };
  }
}
