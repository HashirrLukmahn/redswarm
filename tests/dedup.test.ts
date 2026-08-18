import { describe, it, expect } from "vitest";
import { fingerprintHypothesis, deduplicateHypotheses } from "../security/services/deduplication.js";
import type { HypothesisRecord } from "../security/schemas/index.js";

function hyp(over: Partial<HypothesisRecord>): HypothesisRecord {
  const base = {
    id: Math.random().toString(36).slice(2),
    runId: "r",
    agentId: "a",
    createdAt: Date.now(),
    fingerprint: "",
    mergedFrom: [],
    title: "t",
    threatFamily: "concurrency",
    invariantId: "FI-002",
    architecturalAssumption: "x",
    proposedFailureMode: "duplicate transfer via retry without idempotency key",
    prerequisites: [],
    affectedComponents: ["api", "ledger"],
    confidence: 0.5,
    noveltyReason: "n",
    proposedExperiment: {
      title: "t",
      risk: "SYNTHETIC_MUTATION" as const,
      preconditions: [],
      actors: [],
      steps: [{ kind: "delay" as const, milliseconds: 1 }],
      expectedSafeOutcome: "s",
      violationSignal: "v",
      rationale: "r",
    },
    ...over,
  };
  base.fingerprint = fingerprintHypothesis(base);
  return base;
}

describe("dedup fingerprinting (spec §25)", () => {
  it("gives equal fingerprints regardless of word order / component order", () => {
    const a = hyp({
      proposedFailureMode: "Duplicate transfer via retry without idempotency key",
      affectedComponents: ["api", "ledger"],
    });
    const b = hyp({
      proposedFailureMode: "without idempotency key, duplicate transfer via retry",
      affectedComponents: ["ledger", "api"],
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("merges duplicates and keeps the highest-confidence representative", () => {
    const a = hyp({ confidence: 0.4 });
    const b = hyp({ confidence: 0.9 });
    const c = hyp({ invariantId: "FI-004", affectedComponents: ["api", "auth"], proposedFailureMode: "cross tenant read" });
    const { unique, mergedCount } = deduplicateHypotheses([a, b, c]);
    expect(unique.length).toBe(2);
    expect(mergedCount).toBe(1);
    const rep = unique.find((u) => u.invariantId === "FI-002")!;
    expect(rep.confidence).toBe(0.9);
    expect(rep.mergedFrom.length).toBe(1);
  });
});
