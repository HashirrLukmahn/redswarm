import { describe, it, expect } from "vitest";
import { MockProvider } from "../security/providers/mock.js";
import { extractJson } from "../security/providers/model-provider.js";
import { AttackHypothesisSchema, SkepticReviewSchema } from "../security/schemas/index.js";
import { BASE_HYPOTHESIS_SYSTEM, SKEPTIC_SYSTEM } from "../security/prompts/base.js";

describe("structured model parsing (spec §8, §22)", () => {
  const provider = new MockProvider(1);

  it("produces a schema-valid hypothesis", async () => {
    const res = await provider.generateStructured({
      model: "mock",
      system: BASE_HYPOTHESIS_SYSTEM,
      prompt: "INVARIANT_TARGET: FI-002\nTHREAT_FAMILY: concurrency",
      schema: AttackHypothesisSchema,
      metadata: { runId: "r", agentId: "a1" },
    });
    expect(res.data.invariantId).toMatch(/FI-\d+/);
    expect(res.data.proposedExperiment.steps.length).toBeGreaterThan(0);
    expect(res.usage.totalTokens).toBeGreaterThan(0);
  });

  it("routes to the skeptic task via the system marker", async () => {
    const res = await provider.generateStructured({
      model: "mock",
      system: SKEPTIC_SYSTEM,
      prompt: "HYPOTHESIS_ID: hyp_x\nINVARIANT_TARGET: FI-002",
      schema: SkepticReviewSchema,
      metadata: { runId: "r", agentId: "s1" },
    });
    expect(typeof res.data.plausible).toBe("boolean");
    expect(res.data.hypothesisId).toBe("hyp_x");
  });
});

describe("extractJson", () => {
  it("extracts a fenced JSON object", () => {
    expect(JSON.parse(extractJson("```json\n{\"a\":1}\n```")).a).toBe(1);
  });
  it("extracts a bare balanced object with trailing text", () => {
    expect(JSON.parse(extractJson('here: {"a":{"b":2}} done')).a.b).toBe(2);
  });
});
