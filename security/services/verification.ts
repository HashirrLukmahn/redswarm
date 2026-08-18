import type {
  BlastRadius,
  ExperimentPlan,
  Observation,
  Severity,
  VerifierReport,
} from "../schemas/index.js";
import type { ToolGateway, AgentIdentity } from "../tools/tool-gateway.js";
import { EXECUTOR_CAPABILITIES } from "../policy/capabilities.js";
import { executeExperiment } from "../orchestration/executor.js";

/** Number of independent reproductions required per severity (spec §29). */
export function requiredReproductions(severity: Severity): number {
  switch (severity) {
    case "CRITICAL":
      return 2;
    case "HIGH":
      return 2;
    default:
      return 1;
  }
}

/** Estimate severity from the invariant + deterministic breach (spec §32 inputs). */
export function estimateSeverity(invariantId: string, violated: boolean): Severity {
  if (!violated) return "LOW";
  if (["FI-001", "FI-002", "FI-003"].includes(invariantId)) return "CRITICAL";
  if (["FI-004", "FI-005", "FI-006"].includes(invariantId)) return "HIGH";
  return "MEDIUM";
}

export function blastRadiusFor(invariantId: string): BlastRadius {
  const base: BlastRadius = {
    fundsIntegrity: 0,
    confidentiality: 0,
    authorization: 0,
    availability: 0,
    auditability: 0,
    regulatoryExposure: 0,
    exploitComplexity: 3,
  };
  if (["FI-001", "FI-002", "FI-003", "FI-008"].includes(invariantId)) {
    return { ...base, fundsIntegrity: 9, auditability: 6, regulatoryExposure: 7, exploitComplexity: 2 };
  }
  if (["FI-004", "FI-005"].includes(invariantId)) {
    return { ...base, authorization: 8, confidentiality: 7, regulatoryExposure: 6, exploitComplexity: 2 };
  }
  if (invariantId === "FI-006") return { ...base, authorization: 8, exploitComplexity: 3 };
  if (invariantId === "FI-011") return { ...base, confidentiality: 8, regulatoryExposure: 6 };
  return base;
}

/**
 * Composite finding confidence (spec §62). Never LLM confidence alone.
 * evidenceQuality + independentReproduction + deterministicInvariantViolation +
 * architecturalConsistency — normalized to 0..1.
 */
export function computeFindingConfidence(inputs: {
  evidenceCount: number;
  independentReproductions: number;
  deterministicViolation: boolean;
  architecturalConsistency: boolean;
}): number {
  const evidenceQuality = Math.min(1, inputs.evidenceCount / 4);
  const reproduction = Math.min(1, inputs.independentReproductions / 2);
  const deterministic = inputs.deterministicViolation ? 1 : 0;
  const consistency = inputs.architecturalConsistency ? 1 : 0.3;
  return Number(((evidenceQuality + reproduction + deterministic + consistency) / 4).toFixed(3));
}

export interface VerificationOutcome {
  verified: boolean;
  severity: Severity;
  reports: VerifierReport[];
  blastRadius: BlastRadius;
  findingConfidence: number;
  reproductionSummary: string;
}

/**
 * Independently verify a candidate (spec §29). Reproduces the experiment through
 * fresh verifier identities and requires deterministic reproduction. A candidate
 * cannot become VERIFIED merely because the attacker believed it succeeded.
 */
export async function verifyCandidate(
  plan: ExperimentPlan,
  candidate: Observation,
  gateway: ToolGateway,
  runId: string,
  resetFixtures: () => Promise<void>
): Promise<VerificationOutcome> {
  const initialViolated = candidate.candidate;
  const severity = estimateSeverity(plan.invariantId, initialViolated);
  const needed = requiredReproductions(severity);

  const reports: VerifierReport[] = [];
  let reproductions = 0;

  for (let i = 0; i < needed; i++) {
    await resetFixtures(); // clean slate per independent reproduction
    const verifierId = `verifier_${i + 1}_${plan.id.slice(0, 6)}`;
    const identity: AgentIdentity = {
      agentId: verifierId,
      role: "verifier",
      capabilities: EXECUTOR_CAPABILITIES,
    };
    const repro = await executeExperiment(plan, gateway, runId, identity);
    const reproduced = repro.candidate;
    if (reproduced) reproductions++;
    reports.push({
      verifierId,
      hypothesisId: plan.hypothesisId,
      reproduced,
      deterministicViolation: reproduced,
      rationale: reproduced
        ? `Independent reproduction #${i + 1} observed the deterministic violation.`
        : `Independent reproduction #${i + 1} did not reproduce the violation.`,
      evidenceIds: repro.evidenceIds,
    });
  }

  const verified = reproductions >= needed && initialViolated;
  const findingConfidence = computeFindingConfidence({
    evidenceCount: candidate.evidenceIds.length + reports.reduce((n, r) => n + r.evidenceIds.length, 0),
    independentReproductions: reproductions,
    deterministicViolation: verified,
    architecturalConsistency: true,
  });

  return {
    verified,
    severity,
    reports,
    blastRadius: blastRadiusFor(plan.invariantId),
    findingConfidence,
    reproductionSummary: verified
      ? `Reproduced ${reproductions}/${needed} times. ${candidate.notes}`
      : `Only ${reproductions}/${needed} reproductions; not verified.`,
  };
}
