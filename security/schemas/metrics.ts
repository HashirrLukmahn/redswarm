import { z } from "zod";

/** Per-inference metric (spec §8). */
export const ModelInvocationMetricSchema = z.object({
  invocationId: z.string(),
  runId: z.string(),
  agentId: z.string(),
  provider: z.string(),
  model: z.string(),
  queuedAt: z.number(),
  startedAt: z.number(),
  firstTokenAt: z.number().optional(),
  finishedAt: z.number(),
  queueLatencyMs: z.number(),
  ttftMs: z.number().optional(),
  totalLatencyMs: z.number(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  retryCount: z.number(),
  status: z.enum(["success", "error", "rate_limited"]),
  errorType: z.string().optional(),
});
export type ModelInvocationMetric = z.infer<typeof ModelInvocationMetricSchema>;

export const ToolMetricSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  tool: z.string(),
  startedAt: z.number(),
  finishedAt: z.number(),
  durationMs: z.number(),
  status: z.enum(["success", "blocked", "error"]),
  reason: z.string().optional(),
});
export type ToolMetric = z.infer<typeof ToolMetricSchema>;

/** Aggregated GMI performance experiment output (spec §48). */
export const RunMetricsSummarySchema = z.object({
  totalModelCalls: z.number(),
  successfulCalls: z.number(),
  failedCalls: z.number(),
  rateLimitedCalls: z.number(),
  peakActiveModelCalls: z.number(),
  queueLatencyP50: z.number(),
  queueLatencyP95: z.number(),
  ttftP50: z.number().optional(),
  ttftP95: z.number().optional(),
  totalLatencyP50: z.number(),
  totalLatencyP95: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  approxCompletionTokensPerSec: z.number(),
  verifiedFindingsPer100Agents: z.number(),
  verifiedFindingsPer100ModelCalls: z.number(),
});
export type RunMetricsSummary = z.infer<typeof RunMetricsSummarySchema>;
