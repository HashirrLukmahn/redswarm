import { z } from "zod";

export const RiskLevelSchema = z.enum([
  "READ_ONLY",
  "SYNTHETIC_MUTATION",
  "CONTROLLED_CONCURRENCY",
]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/**
 * Experiment steps (spec §20). Note: steps reference personas and values by ID
 * only. The model never supplies credentials, hosts, or Authorization headers.
 */
export const ApiStepSchema = z.object({
  kind: z.literal("api"),
  personaId: z.string(),
  method: HttpMethodSchema,
  path: z.string(),
  body: z.unknown().optional(),
  /** Non-sensitive headers only; Authorization/Host/cookie are rejected by the gateway. */
  headers: z.record(z.string()).optional(),
  /** Optional idempotency key reuse hint for retry experiments. */
  idempotencyKey: z.string().optional(),
});

export const DelayStepSchema = z.object({
  kind: z.literal("delay"),
  milliseconds: z.number().int().nonnegative().max(60_000),
});

export const StateInspectionStepSchema = z.object({
  kind: z.literal("state"),
  inspect: z.enum(["account", "ledger", "transaction"]),
  targetId: z.string(),
  label: z.string(),
});

export const BrowserStepSchema = z.object({
  kind: z.literal("browser"),
  personaId: z.string(),
  steps: z.array(z.record(z.unknown())),
});

// ParallelStep references sub-steps by structural recursion; declared lazily.
export type ExperimentStep =
  | z.infer<typeof ApiStepSchema>
  | z.infer<typeof DelayStepSchema>
  | z.infer<typeof StateInspectionStepSchema>
  | z.infer<typeof BrowserStepSchema>
  | { kind: "parallel"; branches: ExperimentStep[][] };

export const ExperimentStepSchema: z.ZodType<ExperimentStep> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    ApiStepSchema,
    DelayStepSchema,
    StateInspectionStepSchema,
    BrowserStepSchema,
    z.object({
      kind: z.literal("parallel"),
      branches: z.array(z.array(ExperimentStepSchema)),
    }),
  ]) as unknown as z.ZodType<ExperimentStep>
);

export const ExperimentPlanSchema = z.object({
  id: z.string(),
  hypothesisId: z.string(),
  title: z.string(),
  invariantId: z.string(),
  risk: RiskLevelSchema,
  preconditions: z.array(z.string()).default([]),
  actors: z.array(z.string()).default([]),
  steps: z.array(ExperimentStepSchema).min(1),
  expectedSafeOutcome: z.string(),
  violationSignal: z.string(),
  cleanupStrategy: z.string().optional(),
  rationale: z.string(),
});
export type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>;

/** The draft the hypothesis model returns (looser; refined into a full plan later). */
export const ExperimentPlanDraftSchema = z.object({
  title: z.string(),
  risk: RiskLevelSchema,
  preconditions: z.array(z.string()).default([]),
  actors: z.array(z.string()).default([]),
  steps: z.array(ExperimentStepSchema).min(1),
  expectedSafeOutcome: z.string(),
  violationSignal: z.string(),
  rationale: z.string(),
});
export type ExperimentPlanDraft = z.infer<typeof ExperimentPlanDraftSchema>;

/** Policy engine decision (spec §21). */
export const PolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  reasons: z.array(z.string()),
  blockedStepIndexes: z.array(z.number()).optional(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
