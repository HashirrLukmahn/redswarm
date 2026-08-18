import { z } from "zod";

/** Run state machine (spec §37). */
export const RunStatusSchema = z.enum([
  "CREATED",
  "VALIDATING_SCOPE",
  "RESEARCHING",
  "GENERATING_HYPOTHESES",
  "DEDUPLICATING",
  "PLANNING_EXPERIMENTS",
  "EXECUTING",
  "VERIFYING",
  "ROOT_CAUSE_ANALYSIS",
  "REMEDIATING",
  "COMPLETED",
  // exceptional
  "FAILED",
  "CANCELLED",
  "POLICY_BLOCKED",
  "BUDGET_EXHAUSTED",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const SecurityEventTypeSchema = z.enum([
  "RUN_STARTED",
  "RUN_STATE_CHANGED",
  "SCOPE_VERIFIED",
  "SCOPE_REJECTED",
  "AGENT_STARTED",
  "AGENT_COMPLETED",
  "HYPOTHESIS_CREATED",
  "HYPOTHESIS_MERGED",
  "EXPERIMENT_STARTED",
  "TOOL_CALL_STARTED",
  "TOOL_CALL_BLOCKED",
  "EVIDENCE_CAPTURED",
  "CANDIDATE_FINDING",
  "VERIFICATION_STARTED",
  "FINDING_REJECTED",
  "FINDING_VERIFIED",
  "BLOCKED_BY_POLICY",
  "REMEDIATION_CREATED",
  "RUN_CANCEL_REQUESTED",
  "RUN_CANCELLED",
  "BUDGET_EXHAUSTED",
  "RUN_COMPLETED",
  "METRICS_UPDATED",
]);
export type SecurityEventType = z.infer<typeof SecurityEventTypeSchema>;

export const SecurityEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  timestamp: z.number(),
  type: SecurityEventTypeSchema,
  agentId: z.string().optional(),
  hypothesisId: z.string().optional(),
  experimentId: z.string().optional(),
  findingId: z.string().optional(),
  title: z.string(),
  metadata: z.unknown().optional(),
});
export type SecurityEvent = z.infer<typeof SecurityEventSchema>;
