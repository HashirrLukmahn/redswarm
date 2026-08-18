import { z } from "zod";

/**
 * ScopeManifest — the mandatory safety boundary (spec §13).
 *
 * There is deliberately NO "production" enum value. Production must be
 * impossible to select in this implementation.
 */
export const EnvironmentSchema = z.enum(["local", "staging"]);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const RiskModeSchema = z.enum([
  "OBSERVE_ONLY",
  "SANDBOX_MUTATING",
  "CONTROLLED_CONCURRENCY",
]);
export type RiskMode = z.infer<typeof RiskModeSchema>;

export const ScopeManifestSchema = z
  .object({
    environment: EnvironmentSchema,
    targetOrigin: z.string().url(),
    allowedHosts: z.array(z.string().min(1)).min(1),
    allowedApiPrefixes: z.array(z.string()).default([]),
    deniedApiPrefixes: z.array(z.string()).default([]),
    testPersonaIds: z.array(z.string()).default([]),
    syntheticDataOnly: z.literal(true),
    maxRequestsPerSecond: z.number().positive(),
    maxRequestsPerRun: z.number().int().positive(),
    maxBrowserSessions: z.number().int().nonnegative(),
    allowMutation: z.boolean(),
    allowConcurrencyExperiments: z.boolean(),
    allowExternalProviderCalls: z.boolean(),
    ownershipVerificationToken: z.string().optional(),
  })
  .strict();

export type ScopeManifest = z.infer<typeof ScopeManifestSchema>;

/** The subset of scope that is safe to expose to model context (spec §11). */
export const PublicRunScopeSchema = z.object({
  environment: EnvironmentSchema,
  allowedApiPrefixes: z.array(z.string()),
  riskMode: RiskModeSchema,
  allowMutation: z.boolean(),
  allowConcurrencyExperiments: z.boolean(),
});
export type PublicRunScope = z.infer<typeof PublicRunScopeSchema>;
