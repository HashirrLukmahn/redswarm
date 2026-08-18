import { describe, it, expect } from "vitest";
import {
  canTransitionRun,
  canTransitionFinding,
  assertFindingTransition,
  InvalidFindingTransitionError,
} from "../security/orchestration/state-machine.js";

describe("run state transitions (spec §37)", () => {
  it("allows the primary happy path", () => {
    expect(canTransitionRun("CREATED", "VALIDATING_SCOPE")).toBe(true);
    expect(canTransitionRun("EXECUTING", "VERIFYING")).toBe(true);
    expect(canTransitionRun("VERIFYING", "COMPLETED")).toBe(true);
  });
  it("rejects illegal jumps", () => {
    expect(canTransitionRun("CREATED", "COMPLETED")).toBe(false);
    expect(canTransitionRun("COMPLETED", "EXECUTING")).toBe(false);
  });
});

describe("finding lifecycle (spec §30)", () => {
  it("allows HYPOTHESIS -> EXPERIMENTING -> OBSERVED -> VERIFYING -> VERIFIED", () => {
    expect(canTransitionFinding("HYPOTHESIS", "EXPERIMENTING")).toBe(true);
    expect(canTransitionFinding("EXPERIMENTING", "OBSERVED")).toBe(true);
    expect(canTransitionFinding("OBSERVED", "VERIFYING")).toBe(true);
    expect(canTransitionFinding("VERIFYING", "VERIFIED")).toBe(true);
  });
  it("cannot skip verification to reach VERIFIED", () => {
    expect(canTransitionFinding("OBSERVED", "VERIFIED")).toBe(false);
    expect(() => assertFindingTransition("HYPOTHESIS", "VERIFIED")).toThrow(InvalidFindingTransitionError);
  });
  it("VERIFIED is terminal", () => {
    expect(canTransitionFinding("VERIFIED", "REJECTED")).toBe(false);
  });
});
