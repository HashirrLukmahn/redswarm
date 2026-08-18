import { createHash } from "node:crypto";
import type { AttackHypothesisModelOutput, HypothesisRecord } from "../schemas/index.js";

/** Normalize a failure-mode description for fingerprinting (spec §25). */
function normalizeFailureMode(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|of|to|and|or|is|are|for|with|via|by)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 12)
    .sort()
    .join(" ");
}

/** fingerprint = hash(invariantId + sorted(components) + normalizedFailureMode). */
export function fingerprintHypothesis(h: AttackHypothesisModelOutput): string {
  const components = [...h.affectedComponents].sort().join(",");
  const basis = `${h.invariantId}|${components}|${normalizeFailureMode(h.proposedFailureMode)}`;
  return createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

export interface DedupResult {
  unique: HypothesisRecord[];
  mergedCount: number;
}

/**
 * Deduplicate hypotheses (spec §25). Cheap deterministic grouping by fingerprint;
 * the surviving representative records which hypotheses were merged into it.
 * (An optional LLM judge can further merge semantically-equivalent groups.)
 */
export function deduplicateHypotheses(hypotheses: HypothesisRecord[]): DedupResult {
  const groups = new Map<string, HypothesisRecord[]>();
  for (const h of hypotheses) {
    const arr = groups.get(h.fingerprint) ?? [];
    arr.push(h);
    groups.set(h.fingerprint, arr);
  }

  const unique: HypothesisRecord[] = [];
  let mergedCount = 0;
  for (const group of groups.values()) {
    // Representative = highest confidence in the group.
    group.sort((a, b) => b.confidence - a.confidence);
    const rep = group[0]!;
    const mergedFrom = group.slice(1).map((h) => h.id);
    mergedCount += mergedFrom.length;
    unique.push({ ...rep, mergedFrom });
  }
  return { unique, mergedCount };
}
