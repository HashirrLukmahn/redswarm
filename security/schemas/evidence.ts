import { z } from "zod";

/** Evidence record (spec §28). All values are redacted before persistence. */
export const EvidenceRecordSchema = z.object({
  id: z.string(),
  runId: z.string(),
  hypothesisId: z.string(),
  experimentId: z.string(),
  timestamp: z.number(),
  type: z.enum(["http", "browser", "state", "metric", "event"]),
  summary: z.string(),
  sanitizedRequest: z.unknown().optional(),
  sanitizedResponse: z.unknown().optional(),
  beforeState: z.unknown().optional(),
  afterState: z.unknown().optional(),
  screenshotRef: z.string().optional(),
  hash: z.string().optional(),
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

/** Raw observation produced by the executor before any verdict is reached (spec §27). */
export const ObservationSchema = z.object({
  experimentId: z.string(),
  hypothesisId: z.string(),
  runId: z.string(),
  evidenceIds: z.array(z.string()),
  /** Deterministic invariant-check verdicts collected during execution. */
  invariantChecks: z.array(
    z.object({
      invariantId: z.string(),
      violated: z.boolean(),
      detail: z.string(),
    })
  ),
  /** Whether the executor observed the violation signal; NOT a verified finding. */
  candidate: z.boolean(),
  notes: z.string(),
});
export type Observation = z.infer<typeof ObservationSchema>;
