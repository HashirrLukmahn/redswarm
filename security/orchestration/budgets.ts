import type { RunBudget } from "../schemas/index.js";

export class BudgetExhaustedError extends Error {
  constructor(public readonly resource: string) {
    super(`BUDGET_EXHAUSTED: ${resource}`);
    this.name = "BudgetExhaustedError";
  }
}

/**
 * Tracks and decrements per-run budgets (spec §47). Every relevant operation
 * consumes from the corresponding budget; once exhausted, scheduling stops.
 */
export class BudgetTracker {
  private modelCalls: number;
  private toolCalls: number;
  private browserRuns: number;
  private requests: number;
  private tokens: number;
  private readonly startedAt = Date.now();

  constructor(private readonly budget: RunBudget) {
    this.modelCalls = budget.maxModelCalls;
    this.toolCalls = budget.maxToolCalls;
    this.browserRuns = budget.maxBrowserRuns;
    this.requests = budget.maxRequests;
    this.tokens = budget.maxTokens ?? Number.POSITIVE_INFINITY;
  }

  get remaining() {
    return {
      modelCalls: this.modelCalls,
      toolCalls: this.toolCalls,
      browserRuns: this.browserRuns,
      requests: this.requests,
      tokens: this.tokens,
    };
  }

  isExpired(): boolean {
    return Date.now() - this.startedAt >= this.budget.maxDurationMs;
  }

  /** Non-throwing check used at scheduling boundaries. */
  canSpend(resource: keyof BudgetTracker["remaining"], amount = 1): boolean {
    if (this.isExpired()) return false;
    return this.remaining[resource] >= amount;
  }

  private spend(resource: "modelCalls" | "toolCalls" | "browserRuns" | "requests", amount = 1) {
    if (this.isExpired()) throw new BudgetExhaustedError("duration");
    const current = this[resource];
    if (current < amount) throw new BudgetExhaustedError(resource);
    this[resource] = current - amount;
  }

  spendModelCall() {
    this.spend("modelCalls");
  }
  spendToolCall() {
    this.spend("toolCalls");
  }
  spendBrowserRun() {
    this.spend("browserRuns");
  }
  spendRequest() {
    this.spend("requests");
  }
  spendTokens(n: number) {
    this.tokens -= n;
  }
}
