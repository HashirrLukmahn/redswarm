import { randomUUID } from "node:crypto";
import type { ExperimentPlan, HypothesisRecord } from "../schemas/index.js";
import { ExperimentPlanSchema } from "../schemas/index.js";

/**
 * Convert a hypothesis's experiment draft into a full, validated ExperimentPlan
 * (spec §20). The plan is what the policy engine approves and the executor runs.
 */
export function planFromHypothesis(h: HypothesisRecord): ExperimentPlan {
  const draft = h.proposedExperiment;
  const plan: ExperimentPlan = {
    id: `exp_${randomUUID().slice(0, 12)}`,
    hypothesisId: h.id,
    title: draft.title,
    invariantId: h.invariantId,
    risk: draft.risk,
    preconditions: draft.preconditions,
    actors: draft.actors,
    steps: draft.steps,
    expectedSafeOutcome: draft.expectedSafeOutcome,
    violationSignal: draft.violationSignal,
    cleanupStrategy: "Reset synthetic fixtures via resetRedSwarmFixtures().",
    rationale: draft.rationale,
  };
  // Re-validate — never trust upstream shape.
  return ExperimentPlanSchema.parse(plan);
}
