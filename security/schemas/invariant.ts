import { z } from "zod";

/** Security / financial invariant registry entry (spec §3). */
export const SecurityInvariantSchema = z.object({
  id: z.string(), // e.g. "FI-001"
  title: z.string(),
  description: z.string(),
  family: z.string(), // e.g. "financial-integrity", "authorization"
  /** Whether a deterministic code-based check exists for this invariant (spec §61). */
  deterministicCheck: z.boolean().default(false),
});

export type SecurityInvariant = z.infer<typeof SecurityInvariantSchema>;
