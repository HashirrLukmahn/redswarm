import type { AgentContext } from "../schemas/index.js";

/** Base hypothesis system prompt (spec §23). */
export const BASE_HYPOTHESIS_SYSTEM = `[[ARCHRED_TASK:hypothesis]]
You are one member of a controlled adversarial architecture testing swarm.
Your job is not to compromise arbitrary systems.
You are testing an explicitly authorized staging environment.
Your objective is to identify a plausible counterexample to one or more declared
security/financial invariants.
Think primarily about architectural and workflow failures.
Prefer hypotheses involving interactions between components or operations over
generic vulnerability names.
Do not invent evidence.
Do not claim a weakness exists until an experiment verifies it.
Do not generate malware, persistence, credential theft, scanning, or actions
outside the supplied scope.
Return only the required structured JSON output.`;

export function buildHypothesisPrompt(
  context: AgentContext,
  opts: { invariantId: string; threatFamily: string; diversitySeed: string; roleSpecialistPrompt: string }
): string {
  return [
    opts.roleSpecialistPrompt,
    "",
    `INVARIANT_TARGET: ${opts.invariantId}`,
    `THREAT_FAMILY: ${opts.threatFamily}`,
    `DIVERSITY_SEED: ${opts.diversitySeed}`,
    "",
    "APPLICATION ARCHITECTURE (sanitized):",
    JSON.stringify(context.architecture, null, 2),
    "",
    "DECLARED INVARIANTS:",
    JSON.stringify(context.invariants.map((i) => ({ id: i.id, title: i.title })), null, 2),
    "",
    "API SURFACE:",
    JSON.stringify(context.apiSurface.entries, null, 2),
    "",
    "AVAILABLE TEST PERSONAS (ids only; credentials are withheld):",
    JSON.stringify(context.personas, null, 2),
    "",
    "RUN SCOPE:",
    JSON.stringify(context.runScope, null, 2),
    "",
    "Produce ONE AttackHypothesis as a single JSON object with EXACTLY these keys",
    "(all required):",
    JSON.stringify(
      {
        title: "string",
        threatFamily: "string",
        invariantId: "e.g. FI-002",
        architecturalAssumption: "string",
        proposedFailureMode: "string",
        prerequisites: ["string"],
        affectedComponents: ["string"],
        confidence: "number 0..1",
        noveltyReason: "string",
        proposedExperiment: {
          title: "string",
          risk: "READ_ONLY | SYNTHETIC_MUTATION | CONTROLLED_CONCURRENCY",
          preconditions: ["string"],
          actors: ["personaId"],
          steps: [
            { kind: "state", inspect: "account", targetId: "ARCHRED_TEST_ACCOUNT_A", label: "before" },
            { kind: "api", personaId: "customer_a", method: "POST", path: "/api/transfers", body: {}, idempotencyKey: "optional" },
          ],
          expectedSafeOutcome: "string",
          violationSignal: "string",
          rationale: "string",
        },
      },
      null,
      1
    ),
    "Step kinds: 'api' (personaId, method, path, body?, idempotencyKey?), 'state'",
    "(inspect: account|ledger|transaction, targetId, label), 'delay' (milliseconds).",
    "Reference personas and synthetic accounts (ARCHRED_TEST_*) by id only. Never",
    "include credentials, Authorization headers, hosts, or arbitrary URLs.",
  ].join("\n");
}

export const SKEPTIC_SYSTEM = `[[ARCHRED_TASK:skeptic]]
You are a skeptical security reviewer. For the given hypothesis, try hard to
explain why the architecture may ALREADY be safe. Identify likely existing
controls and missing assumptions. This reduces confirmation bias. Return only
the required structured JSON output.`;

export const VERIFIER_SYSTEM = `[[ARCHRED_TASK:verifier]]
You are an independent verifier. You did not generate this hypothesis. Review the
deterministic invariant-check results and the captured evidence, and decide only
whether the violation was independently reproduced. Defer to deterministic
checks over intuition. Return only the required structured JSON output.`;

export const ARCHITECT_SYSTEM = `[[ARCHRED_TASK:architect]]
You are the Chief Security Architect. You are given ONLY verified findings, the
architecture snapshot, invariants, and defensive research. Cluster findings into
systemic architectural root causes and propose remediations. Never fabricate
findings. Recommendations require human review. Return only the required
structured JSON output.`;
