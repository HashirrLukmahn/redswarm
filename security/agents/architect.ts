import type {
  ArchitectureAssessment,
  ArchitectureSnapshot,
  Finding,
  SecurityInvariant,
} from "../schemas/index.js";
import { ArchitectureAssessmentSchema } from "../schemas/index.js";
import type { ModelProvider } from "../providers/model-provider.js";
import { ARCHITECT_SYSTEM } from "../prompts/base.js";
import type { ThreatResearch } from "../providers/exa.js";

/**
 * Chief Security Architect (spec §39). Runs ONLY after verified findings exist.
 * Clusters findings into systemic root causes and proposes remediations.
 * Recommendations require human review; nothing is auto-applied.
 */
export async function runArchitectureAssessment(input: {
  architecture: ArchitectureSnapshot;
  findings: Finding[];
  invariants: SecurityInvariant[];
  research: ThreatResearch[];
  provider: ModelProvider;
  model: string;
  runId: string;
}): Promise<ArchitectureAssessment> {
  const prompt = [
    "VERIFIED FINDINGS:",
    JSON.stringify(
      input.findings.map((f) => ({
        id: f.id,
        title: f.title,
        invariantId: f.invariantId,
        severity: f.severity,
        affectedComponents: f.affectedComponents,
      })),
      null,
      2
    ),
    "",
    "ARCHITECTURE:",
    JSON.stringify(input.architecture, null, 2),
    "",
    "DEFENSIVE RESEARCH:",
    JSON.stringify(input.research, null, 2),
    "",
    "Cluster the findings into systemic architectural root causes and propose",
    "remediations as JSON (ArchitectureAssessment).",
  ].join("\n");

  const result = await input.provider.generateStructured({
    model: input.model,
    system: ARCHITECT_SYSTEM,
    prompt,
    schema: ArchitectureAssessmentSchema,
    temperature: 0.3,
    metadata: { runId: input.runId, agentId: "architect", role: "architect" },
  });

  // Wire the actual verified finding ids into root causes/recommendations.
  const findingIds = input.findings.map((f) => f.id);
  const assessment = result.data;
  assessment.systemicRootCauses = assessment.systemicRootCauses.map((rc) => ({
    ...rc,
    addressesFindingIds: rc.addressesFindingIds.length ? rc.addressesFindingIds : findingIds,
  }));
  assessment.recommendations = assessment.recommendations.map((rec) => ({
    ...rec,
    addressesFindingIds: rec.addressesFindingIds.length ? rec.addressesFindingIds : findingIds,
  }));
  return assessment;
}
