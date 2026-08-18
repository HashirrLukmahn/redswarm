import type { HypothesisRecord } from "../schemas/index.js";
import { getInvariant } from "../fixtures/invariants.js";

/**
 * Rank hypotheses (spec §25):
 * score = plausibility * impact * novelty * testability * architectural relevance
 */
export function scoreHypothesis(h: HypothesisRecord): number {
  const plausibility = h.confidence; // 0..1
  const impact = /FI-00[1-6]/.test(h.invariantId) ? 1 : 0.7; // funds/authz weigh higher
  const novelty = Math.min(1, 0.4 + h.noveltyReason.length / 200);
  const experiment = h.proposedExperiment;
  const testability = experiment.steps.length > 0 && experiment.steps.length <= 8 ? 1 : 0.5;
  const relevance = h.affectedComponents.length > 0 ? Math.min(1, 0.5 + h.affectedComponents.length * 0.15) : 0.4;
  const deterministic = getInvariant(h.invariantId)?.deterministicCheck ? 1.1 : 0.9;
  return plausibility * impact * novelty * testability * relevance * deterministic;
}

export function rankHypotheses(hypotheses: HypothesisRecord[]): HypothesisRecord[] {
  return hypotheses
    .map((h) => ({ ...h, score: scoreHypothesis(h) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** Select the top N executable hypotheses (spec §25 target: 10-25). */
export function selectForExecution(ranked: HypothesisRecord[], max: number): HypothesisRecord[] {
  return ranked.slice(0, max);
}
