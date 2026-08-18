import { z } from "zod";
import { ScopeManifestSchema, RiskModeSchema } from "./scope.js";
import { RunStatusSchema } from "./events.js";
import { RunMetricsSummarySchema } from "./metrics.js";

/** Per-run budget (spec §47). */
export const RunBudgetSchema = z.object({
  maxModelCalls: z.number().int().positive(),
  maxToolCalls: z.number().int().positive(),
  maxBrowserRuns: z.number().int().nonnegative(),
  maxTokens: z.number().int().positive().optional(),
  maxDurationMs: z.number().int().positive(),
  maxRequests: z.number().int().positive(),
});
export type RunBudget = z.infer<typeof RunBudgetSchema>;

export const RunConfigSchema = z.object({
  name: z.string(),
  scope: ScopeManifestSchema,
  riskMode: RiskModeSchema.default("OBSERVE_ONLY"),
  agentCount: z.number().int().positive().max(200),
  modelConcurrency: z.number().int().positive(),
  browserConcurrency: z.number().int().nonnegative(),
  apiConcurrency: z.number().int().positive(),
  verifierConcurrency: z.number().int().positive(),
  researchConcurrency: z.number().int().positive(),
  threatFamilies: z.array(z.string()).default([]),
  budget: RunBudgetSchema,
  provider: z.enum(["mock", "gmi"]).default("mock"),
  model: z.string().default("mock-model"),
  enableResearch: z.boolean().default(false),
  enableArchitect: z.boolean().default(false),
});
export type RunConfig = z.infer<typeof RunConfigSchema>;

export const RunRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: RunStatusSchema,
  riskMode: RiskModeSchema,
  agentCount: z.number(),
  cancelRequested: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
  targetOrigin: z.string(),
  metrics: RunMetricsSummarySchema.optional(),
  error: z.string().optional(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;
