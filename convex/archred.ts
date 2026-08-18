import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * ArchRed Convex functions (spec §35). Mutations upsert by natural key so the
 * mirror is idempotent; queries power a realtime dashboard / external consumers.
 */

async function upsert(
  ctx: any,
  table: string,
  match: Record<string, unknown>,
  doc: Record<string, unknown>
) {
  const [field, value] = Object.entries(match)[0] as [string, unknown];
  const existing = await ctx.db
    .query(table)
    .filter((q: any) => q.eq(q.field(field), value))
    .first();
  if (existing) await ctx.db.patch(existing._id, doc);
  else await ctx.db.insert(table, doc);
}

export const pushRun = mutation({
  args: { runId: v.string(), status: v.string(), name: v.string(), createdAt: v.number(), data: v.any() },
  handler: (ctx, a) => upsert(ctx, "securityRuns", { runId: a.runId }, a),
});

export const pushAgent = mutation({
  args: { runId: v.string(), agentId: v.string(), role: v.string(), status: v.string(), data: v.any() },
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query("securityAgents")
      .withIndex("by_agent", (q: any) => q.eq("runId", a.runId).eq("agentId", a.agentId))
      .first();
    if (existing) await ctx.db.patch(existing._id, a);
    else await ctx.db.insert("securityAgents", a);
  },
});

export const pushHypothesis = mutation({
  args: { runId: v.string(), hypothesisId: v.string(), invariantId: v.string(), data: v.any() },
  handler: (ctx, a) => upsert(ctx, "securityHypotheses", { hypothesisId: a.hypothesisId }, a),
});

export const pushFinding = mutation({
  args: { runId: v.string(), findingId: v.string(), status: v.string(), invariantId: v.string(), data: v.any() },
  handler: (ctx, a) => upsert(ctx, "securityFindings", { findingId: a.findingId }, a),
});

export const pushEvent = mutation({
  args: { runId: v.string(), type: v.string(), createdAt: v.number(), data: v.any() },
  handler: (ctx, a) => ctx.db.insert("securityEvents", a),
});

export const pushModelMetric = mutation({
  args: { runId: v.string(), agentId: v.string(), status: v.string(), data: v.any() },
  handler: (ctx, a) => ctx.db.insert("securityModelMetrics", a),
});

export const pushAssessment = mutation({
  args: { runId: v.string(), data: v.any() },
  handler: (ctx, a) => upsert(ctx, "securityAssessments", { runId: a.runId }, a),
});

export const pushAgentReport = mutation({
  args: { runId: v.string(), agentId: v.string(), role: v.string(), markdown: v.string() },
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query("agentReports")
      .withIndex("by_agent", (q: any) => q.eq("runId", a.runId).eq("agentId", a.agentId))
      .first();
    if (existing) await ctx.db.patch(existing._id, a);
    else await ctx.db.insert("agentReports", a);
  },
});

export const pushConsolidatedReport = mutation({
  args: { runId: v.string(), markdown: v.string() },
  handler: (ctx, a) => upsert(ctx, "consolidatedReports", { runId: a.runId }, a),
});

// --- Queries (realtime consumers) ---
export const getRun = query({
  args: { runId: v.string() },
  handler: (ctx, a) =>
    ctx.db.query("securityRuns").withIndex("by_runId", (q: any) => q.eq("runId", a.runId)).first(),
});

export const listFindings = query({
  args: { runId: v.string() },
  handler: (ctx, a) =>
    ctx.db.query("securityFindings").withIndex("by_run", (q: any) => q.eq("runId", a.runId)).collect(),
});

export const listAgentReports = query({
  args: { runId: v.string() },
  handler: (ctx, a) =>
    ctx.db.query("agentReports").withIndex("by_run", (q: any) => q.eq("runId", a.runId)).collect(),
});

export const getConsolidatedReport = query({
  args: { runId: v.string() },
  handler: (ctx, a) =>
    ctx.db.query("consolidatedReports").withIndex("by_run", (q: any) => q.eq("runId", a.runId)).first(),
});
