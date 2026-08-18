import type { ModelInvocationMetric, RunMetricsSummary } from "../schemas/index.js";

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

/** Aggregate GMI performance experiment metrics (spec §48). */
export function aggregateMetrics(
  metrics: ModelInvocationMetric[],
  opts: { agentCount: number; verifiedFindings: number; peakActiveModelCalls: number }
): RunMetricsSummary {
  const success = metrics.filter((m) => m.status === "success");
  const queueLatencies = metrics.map((m) => m.queueLatencyMs);
  const totalLatencies = metrics.map((m) => m.totalLatencyMs);
  const ttfts = metrics.map((m) => m.ttftMs).filter((v): v is number => v !== undefined);

  const promptTokens = sum(metrics.map((m) => m.promptTokens ?? 0));
  const completionTokens = sum(metrics.map((m) => m.completionTokens ?? 0));
  const totalTokens = sum(metrics.map((m) => m.totalTokens ?? 0));
  const totalCompletionMs = sum(success.map((m) => m.totalLatencyMs));
  const tokensPerSec = totalCompletionMs > 0 ? (completionTokens / totalCompletionMs) * 1000 : 0;

  const modelCalls = metrics.length || 1;
  return {
    totalModelCalls: metrics.length,
    successfulCalls: success.length,
    failedCalls: metrics.filter((m) => m.status === "error").length,
    rateLimitedCalls: metrics.filter((m) => m.status === "rate_limited").length,
    peakActiveModelCalls: opts.peakActiveModelCalls,
    queueLatencyP50: percentile(queueLatencies, 50),
    queueLatencyP95: percentile(queueLatencies, 95),
    ttftP50: ttfts.length ? percentile(ttfts, 50) : undefined,
    ttftP95: ttfts.length ? percentile(ttfts, 95) : undefined,
    totalLatencyP50: percentile(totalLatencies, 50),
    totalLatencyP95: percentile(totalLatencies, 95),
    promptTokens,
    completionTokens,
    totalTokens,
    approxCompletionTokensPerSec: Math.round(tokensPerSec),
    verifiedFindingsPer100Agents: (opts.verifiedFindings / Math.max(1, opts.agentCount)) * 100,
    verifiedFindingsPer100ModelCalls: (opts.verifiedFindings / modelCalls) * 100,
  };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
