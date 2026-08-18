import { describe, it, expect } from "vitest";
import { BudgetTracker, BudgetExhaustedError } from "../security/orchestration/budgets.js";

const budget = () =>
  new BudgetTracker({
    maxModelCalls: 3,
    maxToolCalls: 2,
    maxBrowserRuns: 1,
    maxTokens: 100,
    maxDurationMs: 60_000,
    maxRequests: 2,
  });

describe("budget exhaustion (spec §47)", () => {
  it("throws once model calls are exhausted", () => {
    const b = budget();
    b.spendModelCall();
    b.spendModelCall();
    b.spendModelCall();
    expect(() => b.spendModelCall()).toThrow(BudgetExhaustedError);
  });

  it("canSpend reflects remaining budget", () => {
    const b = budget();
    b.spendToolCall();
    b.spendToolCall();
    expect(b.canSpend("toolCalls")).toBe(false);
  });

  it("treats an expired duration as exhausted", () => {
    const b = new BudgetTracker({
      maxModelCalls: 10,
      maxToolCalls: 10,
      maxBrowserRuns: 10,
      maxDurationMs: -1,
      maxRequests: 10,
    });
    expect(b.canSpend("modelCalls")).toBe(false);
    expect(() => b.spendModelCall()).toThrow(BudgetExhaustedError);
  });
});
