import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StateStore } from "../state/store.js";
import type { Finding, HypothesisRecord } from "../schemas/index.js";
import { ROLE_DEFINITIONS } from "../prompts/roles/index.js";

/**
 * Report renderer (per-agent md + a consolidated "what to fix / status" report).
 *
 * Markdown is a DERIVED artifact — the structured records in the StateStore
 * remain the source of truth (dedup fingerprints, ranking, typed lifecycle, and
 * deterministic verdicts). This layer just makes the results human-readable.
 */

function findingForHypothesis(findings: Finding[], hypId: string): Finding | undefined {
  return findings.find((f) => f.hypothesisId === hypId);
}

/** One markdown file per agent (spec §51 detail view, in document form). */
export function renderAgentReport(store: StateStore, runId: string, agentId: string): string {
  const agent = store.listAgents(runId).find((a) => a.id === agentId);
  const findings = store.listFindings(runId);
  const hyps = store.listHypotheses(runId).filter((h) => h.agentId === agentId);
  const def = agent ? ROLE_DEFINITIONS[agent.role] : undefined;

  const lines: string[] = [];
  lines.push(`# Agent ${agentId}`);
  lines.push("");
  if (agent) {
    lines.push(`- **Role:** ${def?.name ?? agent.role}`);
    lines.push(`- **Objective:** ${agent.objective}`);
    lines.push(`- **Diversity seed:** ${agent.diversitySeed}`);
    lines.push(`- **Status:** ${agent.status}`);
    lines.push(`- **Capabilities:** ${agent.allowedCapabilities.join(", ")}`);
  }
  lines.push("");
  if (hyps.length === 0) {
    lines.push("_No hypotheses produced._");
    return lines.join("\n");
  }
  lines.push(`## Hypotheses (${hyps.length})`);
  for (const h of hyps) {
    const f = findingForHypothesis(findings, h.id);
    lines.push("");
    lines.push(`### ${h.title}`);
    lines.push(`- **Invariant:** ${h.invariantId} · **Threat family:** ${h.threatFamily}`);
    lines.push(`- **Model confidence:** ${h.confidence.toFixed(2)}${h.score != null ? ` · **Rank score:** ${h.score.toFixed(3)}` : ""}`);
    lines.push(`- **Outcome:** ${f ? statusBadge(f) : "not selected for execution"}`);
    lines.push(`- **Architectural assumption:** ${h.architecturalAssumption}`);
    lines.push(`- **Proposed failure mode:** ${h.proposedFailureMode}`);
    lines.push(`- **Affected components:** ${h.affectedComponents.join(", ") || "—"}`);
    if (f?.status === "VERIFIED") {
      lines.push(`- **Reproduction:** ${f.reproductionSummary ?? ""}`);
      lines.push(`- **Root cause:** ${f.architecturalRootCause ?? ""}`);
    }
    if (f?.status === "REJECTED") lines.push(`- **Rejected because:** ${f.rejectionReason ?? ""}`);
  }
  return lines.join("\n");
}

function statusBadge(f: Finding): string {
  if (f.status === "VERIFIED") return `✅ VERIFIED (${f.severity})`;
  if (f.status === "REJECTED") return "❌ REJECTED";
  if (f.status === "BLOCKED") return "⛔ BLOCKED_BY_POLICY";
  return f.status;
}

/**
 * Consolidated orchestrator report (spec §53, §39–§40): what to fix, grouped by
 * architectural root cause, plus current status. Consolidates VERIFIED findings
 * only — deterministic checks + verifiers decide verdicts, not this layer.
 */
export function renderConsolidatedReport(store: StateStore, runId: string): string {
  const run = store.getRun(runId);
  const findings = store.listFindings(runId);
  const verified = findings.filter((f) => f.status === "VERIFIED");
  const rejected = findings.filter((f) => f.status === "REJECTED");
  const blocked = findings.filter((f) => f.status === "BLOCKED");
  const assessment = store.getAssessment(runId);
  const m = run?.metrics;

  const L: string[] = [];
  L.push(`# RedSwarm Report — ${run?.name ?? runId}`);
  L.push("");
  L.push(`Run \`${runId}\` · status **${run?.status}** · target ${run?.targetOrigin}`);
  L.push("");
  L.push("## Status at a glance");
  L.push("");
  L.push("| Verified | Rejected | Blocked by policy | Agents | Hypotheses |");
  L.push("|---|---|---|---|---|");
  L.push(
    `| **${verified.length}** | ${rejected.length} | ${blocked.length} | ${store.listAgents(runId).length} | ${store.listHypotheses(runId).length} |`
  );
  L.push("");

  if (assessment) {
    L.push("## What to fix (systemic root causes)");
    for (const rc of assessment.systemicRootCauses) {
      L.push("");
      L.push(`### ${rc.title}`);
      L.push(rc.summary);
      L.push(`_Addresses findings:_ ${rc.addressesFindingIds.join(", ") || "—"}`);
    }
    L.push("");
    L.push("## Recommended architecture changes");
    const roadmap = new Map(assessment.prioritizedRoadmap.map((r) => [r.recommendationId, r.priority]));
    const recs = [...assessment.recommendations].sort(
      (a, b) => (roadmap.get(a.id) ?? 99) - (roadmap.get(b.id) ?? 99)
    );
    for (const rec of recs) {
      L.push("");
      L.push(`### [P${roadmap.get(rec.id) ?? "-"}] ${rec.title}`);
      L.push(`- **Root cause:** ${rec.rootCause}`);
      L.push(`- **Current risk:** ${rec.currentRisk}`);
      L.push(`- **Proposed change:** ${rec.proposedChange}`);
      L.push(`- **Complexity:** ${rec.implementationComplexity} · **Risk reduction:** ${rec.expectedRiskReduction}`);
      if (rec.validationPlan.length) L.push(`- **Validation:** ${rec.validationPlan.join("; ")}`);
    }
    L.push("");
    L.push(`> ${assessment.executiveSummary}`);
    L.push("");
    L.push("_Recommendations require human review; RedSwarm never auto-applies architecture changes._");
  }

  L.push("");
  L.push("## Verified findings");
  if (!verified.length) {
    L.push("");
    L.push("_0 verified findings — a valid result. See rejected hypotheses below._");
  }
  for (const f of verified) {
    L.push("");
    L.push(`### ${statusBadge(f)} — ${f.title}`);
    L.push(`- **Invariant violated:** ${f.invariantId}`);
    L.push(`- **Affected components:** ${f.affectedComponents.join(", ") || "—"}`);
    L.push(`- **Finding confidence:** ${f.findingConfidence ?? "—"} (evidence + independent reproduction + deterministic breach)`);
    L.push(`- **Reproduction:** ${f.reproductionSummary ?? ""}`);
    L.push(`- **Architectural root cause:** ${f.architecturalRootCause ?? ""}`);
    L.push(`- **Evidence records:** ${f.evidenceIds.length} · **Verifiers:** ${f.verifierIds.join(", ") || "—"}`);
    if (f.blastRadius) {
      const b = f.blastRadius;
      L.push(
        `- **Blast radius (0-10):** funds ${b.fundsIntegrity} · confidentiality ${b.confidentiality} · authz ${b.authorization} · auditability ${b.auditability} · regulatory ${b.regulatoryExposure} · exploit-complexity ${b.exploitComplexity}`
      );
    }
  }

  if (rejected.length) {
    L.push("");
    L.push("## Rejected hypotheses (controls held / not reproduced)");
    for (const f of rejected) L.push(`- **${f.title}** (${f.invariantId}) — ${f.rejectionReason ?? ""}`);
  }
  if (blocked.length) {
    L.push("");
    L.push("## Blocked by policy (agents constrained as designed)");
    for (const f of blocked) L.push(`- **${f.title}** (${f.invariantId}) — ${f.rejectionReason ?? ""}`);
  }

  if (m) {
    L.push("");
    L.push("## GMI inference performance");
    L.push(
      `- model calls **${m.totalModelCalls}** (success ${m.successfulCalls}, error ${m.failedCalls}, rate-limited ${m.rateLimitedCalls}) · peak concurrency **${m.peakActiveModelCalls}**`
    );
    L.push(`- tokens ${m.totalTokens} (prompt ${m.promptTokens} / completion ${m.completionTokens}) · ~${m.approxCompletionTokensPerSec} completion tok/s`);
    L.push(`- latency p50 ${m.totalLatencyP50}ms / p95 ${m.totalLatencyP95}ms · queue p95 ${m.queueLatencyP95}ms${m.ttftP95 ? ` · TTFT p95 ${m.ttftP95}ms` : ""}`);
    L.push(`- verified/100 agents ${m.verifiedFindingsPer100Agents.toFixed(2)} · verified/100 model-calls ${m.verifiedFindingsPer100ModelCalls.toFixed(2)}`);
  }

  L.push("");
  L.push("---");
  L.push(`_Generated ${new Date().toISOString()} by RedSwarm. Hypothesis → CandidateFinding → VerifiedFinding; verdicts are deterministic, not model belief._`);
  return L.join("\n");
}

export interface WrittenReports {
  dir: string;
  consolidated: string;
  agentFiles: string[];
}

/** Write per-agent md + consolidated report.md to disk. Returns the paths. */
export function writeRunReports(store: StateStore, runId: string, baseDir = "reports"): WrittenReports {
  const dir = join(baseDir, runId);
  const agentsDir = join(dir, "agents");
  mkdirSync(agentsDir, { recursive: true });

  const agentFiles: string[] = [];
  for (const agent of store.listAgents(runId)) {
    const file = join(agentsDir, `${agent.id}.md`);
    writeFileSync(file, renderAgentReport(store, runId, agent.id), "utf8");
    agentFiles.push(file);
  }
  const consolidated = join(dir, "report.md");
  writeFileSync(consolidated, renderConsolidatedReport(store, runId), "utf8");
  return { dir, consolidated, agentFiles };
}
