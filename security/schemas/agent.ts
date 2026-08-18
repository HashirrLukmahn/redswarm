import { z } from "zod";
import { ArchitectureSnapshotSchema, ApiSurfaceSummarySchema } from "./architecture.js";
import { SecurityInvariantSchema } from "./invariant.js";
import { PublicRunScopeSchema } from "./scope.js";

/** Capability-based agent permissions (spec §16). */
export const CapabilitySchema = z.enum([
  "READ_ARCHITECTURE",
  "SEARCH_SECURITY_RESEARCH",
  "READ_STAGING",
  "MUTATE_SYNTHETIC_DATA",
  "RUN_CONCURRENT_SCENARIO",
  "USE_BROWSER",
  "READ_TEST_LEDGER",
  "VERIFY_FINDING",
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export const AgentRoleSchema = z.enum([
  "financial-integrity",
  "authorization",
  "state-machine",
  "concurrency",
  "privacy",
  "workflow-abuse",
  "distributed-failure",
  "session-lifecycle",
  "trust-boundary",
  "ai-authority",
  "wildcard",
  // support roles
  "skeptic",
  "verifier",
  "architect",
  "researcher",
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const AgentTaskStatusSchema = z.enum([
  "queued",
  "thinking",
  "researching",
  "testing",
  "verifying",
  "completed",
  "blocked",
  "failed",
]);
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;

/** Sanitized persona reference exposed to the model — never includes credentials (spec §42). */
export const TestPersonaPublicSchema = z.object({
  id: z.string(),
  description: z.string(),
});
export type TestPersonaPublic = z.infer<typeof TestPersonaPublicSchema>;

export const FindingSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  invariantId: z.string(),
  status: z.string(),
});
export type FindingSummary = z.infer<typeof FindingSummarySchema>;

/** The sanitized context object every hypothesis agent receives (spec §11). */
export const AgentContextSchema = z.object({
  architecture: ArchitectureSnapshotSchema,
  invariants: z.array(SecurityInvariantSchema),
  apiSurface: ApiSurfaceSummarySchema,
  personas: z.array(TestPersonaPublicSchema),
  knownFindings: z.array(FindingSummarySchema),
  runScope: PublicRunScopeSchema,
  threatFamily: z.string(),
});
export type AgentContext = z.infer<typeof AgentContextSchema>;

export const AgentTaskSchema = z.object({
  id: z.string(),
  runId: z.string(),
  role: AgentRoleSchema,
  objective: z.string(),
  diversitySeed: z.string(),
  allowedCapabilities: z.array(CapabilitySchema),
  status: AgentTaskStatusSchema,
  createdAt: z.number(),
});
export type AgentTask = z.infer<typeof AgentTaskSchema>;
