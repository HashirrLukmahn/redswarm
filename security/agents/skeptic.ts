import type { HypothesisRecord, SkepticReview } from "../schemas/index.js";
import { SkepticReviewSchema } from "../schemas/index.js";
import type { ModelProvider } from "../providers/model-provider.js";
import { SKEPTIC_SYSTEM } from "../prompts/base.js";

/**
 * Skeptic pass (spec §26). Before spending browser/API resources, a skeptic
 * argues why the architecture may already be safe — reducing confirmation bias.
 */
export async function runSkeptic(
  hypothesis: HypothesisRecord,
  provider: ModelProvider,
  model: string
): Promise<SkepticReview> {
  const prompt = [
    `HYPOTHESIS_ID: ${hypothesis.id}`,
    `INVARIANT_TARGET: ${hypothesis.invariantId}`,
    "HYPOTHESIS:",
    JSON.stringify(
      {
        title: hypothesis.title,
        architecturalAssumption: hypothesis.architecturalAssumption,
        proposedFailureMode: hypothesis.proposedFailureMode,
        affectedComponents: hypothesis.affectedComponents,
      },
      null,
      2
    ),
    "",
    "Explain why the architecture may already be safe. Return a SkepticReview as JSON.",
  ].join("\n");

  const result = await provider.generateStructured({
    model,
    system: SKEPTIC_SYSTEM,
    prompt,
    schema: SkepticReviewSchema,
    temperature: 0.4,
    metadata: { runId: hypothesis.runId, agentId: `skeptic_${hypothesis.id}`, role: "skeptic" },
  });
  return result.data;
}
