import { z } from "zod";

/** Finding lifecycle (spec §30). Transitions are enforced in code. */
export const FindingStatusSchema = z.enum([
  "HYPOTHESIS",
  "EXPERIMENTING",
  "OBSERVED",
  "VERIFYING",
  "VERIFIED",
  "REJECTED",
  "DUPLICATE",
  "BLOCKED",
]);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

export const SeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type Severity = z.infer<typeof SeveritySchema>;

/** Blast radius, 0-10 per axis (spec §32). */
export const BlastRadiusSchema = z.object({
  fundsIntegrity: z.number().min(0).max(10),
  confidentiality: z.number().min(0).max(10),
  authorization: z.number().min(0).max(10),
  availability: z.number().min(0).max(10),
  auditability: z.number().min(0).max(10),
  regulatoryExposure: z.number().min(0).max(10),
  exploitComplexity: z.number().min(0).max(10),
});
export type BlastRadius = z.infer<typeof BlastRadiusSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  runId: z.string(),
  hypothesisId: z.string(),
  experimentId: z.string().optional(),
  title: z.string(),
  invariantId: z.string(),
  status: FindingStatusSchema,
  severity: SeveritySchema.optional(),
  threatFamily: z.string(),
  affectedComponents: z.array(z.string()).default([]),
  architecturalRootCause: z.string().optional(),
  reproductionSummary: z.string().optional(),
  evidenceIds: z.array(z.string()).default([]),
  verifierIds: z.array(z.string()).default([]),
  blastRadius: BlastRadiusSchema.optional(),
  /** Composite confidence (spec §62); never LLM confidence alone. */
  findingConfidence: z.number().optional(),
  rejectionReason: z.string().optional(),
  remediationStatus: z.enum(["PENDING", "PROPOSED", "REVIEWED"]).default("PENDING"),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Finding = z.infer<typeof FindingSchema>;

/** Verifier output for one reproduction attempt (spec §29). */
export const VerifierReportSchema = z.object({
  verifierId: z.string(),
  hypothesisId: z.string(),
  reproduced: z.boolean(),
  deterministicViolation: z.boolean(),
  rationale: z.string(),
  evidenceIds: z.array(z.string()).default([]),
});
export type VerifierReport = z.infer<typeof VerifierReportSchema>;
