import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * RedSwarm Convex schema (spec §35–§36). The realtime coordination/state plane.
 * Each table keeps a few indexed columns plus a `data` blob holding the full
 * structured record (the source of truth stays the typed Zod record; this
 * mirrors it for realtime/durability). Indexed heavily by runId per the spec.
 *
 * agentReports / consolidatedReports hold the rendered markdown ("each agent's
 * md file" + the orchestrator's consolidated report).
 */
export default defineSchema({
  securityRuns: defineTable({
    runId: v.string(),
    status: v.string(),
    name: v.string(),
    createdAt: v.number(),
    data: v.any(),
  }).index("by_runId", ["runId"]),

  securityAgents: defineTable({
    runId: v.string(),
    agentId: v.string(),
    role: v.string(),
    status: v.string(),
    data: v.any(),
  })
    .index("by_run", ["runId"])
    .index("by_agent", ["runId", "agentId"]),

  securityHypotheses: defineTable({
    runId: v.string(),
    hypothesisId: v.string(),
    invariantId: v.string(),
    data: v.any(),
  }).index("by_run", ["runId"]),

  securityFindings: defineTable({
    runId: v.string(),
    findingId: v.string(),
    status: v.string(),
    invariantId: v.string(),
    data: v.any(),
  }).index("by_run", ["runId"]),

  securityEvents: defineTable({
    runId: v.string(),
    type: v.string(),
    createdAt: v.number(),
    data: v.any(),
  }).index("by_run", ["runId"]),

  securityModelMetrics: defineTable({
    runId: v.string(),
    agentId: v.string(),
    status: v.string(),
    data: v.any(),
  }).index("by_run", ["runId"]),

  securityAssessments: defineTable({
    runId: v.string(),
    data: v.any(),
  }).index("by_run", ["runId"]),

  agentReports: defineTable({
    runId: v.string(),
    agentId: v.string(),
    role: v.string(),
    markdown: v.string(),
  })
    .index("by_run", ["runId"])
    .index("by_agent", ["runId", "agentId"]),

  consolidatedReports: defineTable({
    runId: v.string(),
    markdown: v.string(),
  }).index("by_run", ["runId"]),
});
