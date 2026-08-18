import { z } from "zod";

/** Machine-readable architecture model (spec §12). */
export const ArchitectureComponentSchema = z.object({
  id: z.string(),
  type: z.enum(["frontend", "service", "datastore", "queue", "external", "ai", "gateway"]),
  description: z.string(),
  dataClassification: z.array(z.string()).default([]),
  trustZone: z.string(),
});
export type ArchitectureComponent = z.infer<typeof ArchitectureComponentSchema>;

export const ArchitectureEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  protocol: z.string(),
  asynchronous: z.boolean().default(false),
});
export type ArchitectureEdge = z.infer<typeof ArchitectureEdgeSchema>;

export const DataStoreSchema = z.object({
  id: z.string(),
  kind: z.string(),
  description: z.string(),
});

export const ExternalProviderSchema = z.object({
  id: z.string(),
  description: z.string(),
});

export const TrustBoundarySchema = z.object({
  id: z.string(),
  description: z.string(),
  separates: z.array(z.string()),
});

export const FinancialEntitySchema = z.object({
  id: z.string(),
  description: z.string(),
  states: z.array(z.string()).default([]),
});

export const ArchitectureSnapshotSchema = z.object({
  applicationName: z.string(),
  components: z.array(ArchitectureComponentSchema),
  edges: z.array(ArchitectureEdgeSchema),
  dataStores: z.array(DataStoreSchema).default([]),
  externalProviders: z.array(ExternalProviderSchema).default([]),
  trustBoundaries: z.array(TrustBoundarySchema).default([]),
  authentication: z.string().optional(),
  authorization: z.string().optional(),
  financialEntities: z.array(FinancialEntitySchema).default([]),
});
export type ArchitectureSnapshot = z.infer<typeof ArchitectureSnapshotSchema>;

/** Compact API surface summary handed to hypothesis agents (spec §11). */
export const ApiSurfaceEntrySchema = z.object({
  method: z.string(),
  path: z.string(),
  description: z.string(),
  mutates: z.boolean().default(false),
});
export const ApiSurfaceSummarySchema = z.object({
  entries: z.array(ApiSurfaceEntrySchema),
});
export type ApiSurfaceSummary = z.infer<typeof ApiSurfaceSummarySchema>;
