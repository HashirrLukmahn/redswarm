import { z } from "zod";
import { ExperimentPlanDraftSchema } from "./experiment.js";

/** Structured output every attacker agent must return (spec §22). */
export const AttackHypothesisSchema = z.object({
  title: z.string().min(4),
  threatFamily: z.string(),
  invariantId: z.string(),
  architecturalAssumption: z.string(),
  proposedFailureMode: z.string(),
  prerequisites: z.array(z.string()).default([]),
  affectedComponents: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  noveltyReason: z.string(),
  proposedExperiment: ExperimentPlanDraftSchema,
});
export type AttackHypothesisModelOutput = z.infer<typeof AttackHypothesisSchema>;

/** Persisted hypothesis (model output + system-assigned identity/lineage). */
export const HypothesisRecordSchema = AttackHypothesisSchema.extend({
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  createdAt: z.number(),
  fingerprint: z.string(),
  /** Ids of hypotheses merged into this one during dedup. */
  mergedFrom: z.array(z.string()).default([]),
  score: z.number().optional(),
});
export type HypothesisRecord = z.infer<typeof HypothesisRecordSchema>;

/** Skeptic review output (spec §26). */
export const SkepticReviewSchema = z.object({
  hypothesisId: z.string(),
  plausible: z.boolean(),
  likelyExistingControl: z.string().optional(),
  missingAssumptions: z.array(z.string()).default([]),
  recommendedExperimentChanges: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type SkepticReview = z.infer<typeof SkepticReviewSchema>;
