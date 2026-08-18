import { z } from "zod";

/** Chief Security Architect output (spec §39, §40). */
export const SystemicRootCauseSchema = z.object({
  id: z.string(),
  title: z.string(),
  addressesFindingIds: z.array(z.string()).default([]),
  summary: z.string(),
});

export const ArchitectureRecommendationSchema = z.object({
  id: z.string(),
  title: z.string(),
  addressesFindingIds: z.array(z.string()).default([]),
  rootCause: z.string(),
  currentRisk: z.string(),
  proposedChange: z.string(),
  affectedComponents: z.array(z.string()).default([]),
  implementationComplexity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  expectedRiskReduction: z.enum(["LOW", "MEDIUM", "HIGH"]),
  migrationNotes: z.array(z.string()).default([]),
  validationPlan: z.array(z.string()).default([]),
  mermaidDiagram: z.string().optional(),
});
export type ArchitectureRecommendation = z.infer<typeof ArchitectureRecommendationSchema>;

export const RemediationPrioritySchema = z.object({
  recommendationId: z.string(),
  priority: z.number(),
  rationale: z.string(),
});

export const ArchitectureAssessmentSchema = z.object({
  systemicRootCauses: z.array(SystemicRootCauseSchema),
  recommendations: z.array(ArchitectureRecommendationSchema),
  prioritizedRoadmap: z.array(RemediationPrioritySchema),
  executiveSummary: z.string(),
  architectureMermaid: z.string().optional(),
});
export type ArchitectureAssessment = z.infer<typeof ArchitectureAssessmentSchema>;
