import type {
  ExperimentPlan,
  ExperimentStep,
  PolicyDecision,
  RiskMode,
  ScopeManifest,
} from "../schemas/index.js";
import { isPathAllowed } from "./scope.js";

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "host",
  "cookie",
  "set-cookie",
  "x-archred-token",
]);

// Real-customer-identifier heuristic: only synthetic ARCHRED_* ids are permitted.
const REAL_ID_HINT = /\b(cust|acct|user)_(?!.*ARCHRED)[a-z0-9]{6,}\b/i;

export interface PolicyContext {
  scope: ScopeManifest;
  riskMode: RiskMode;
  allowedPersonaIds: string[];
  /** Remaining budgets at evaluation time. */
  remainingRequests: number;
  remainingToolCalls: number;
}

function riskAllowedByMode(risk: ExperimentPlan["risk"], mode: RiskMode): boolean {
  if (risk === "READ_ONLY") return true;
  if (risk === "SYNTHETIC_MUTATION")
    return mode === "SANDBOX_MUTATING" || mode === "CONTROLLED_CONCURRENCY";
  if (risk === "CONTROLLED_CONCURRENCY") return mode === "CONTROLLED_CONCURRENCY";
  return false;
}

function collectStepIssues(
  step: ExperimentStep,
  ctx: PolicyContext,
  index: number,
  reasons: string[],
  blocked: Set<number>
): void {
  const fail = (msg: string) => {
    reasons.push(`step ${index}: ${msg}`);
    blocked.add(index);
  };

  switch (step.kind) {
    case "api": {
      const pathCheck = isPathAllowed(
        step.path,
        ctx.scope.allowedApiPrefixes,
        ctx.scope.deniedApiPrefixes
      );
      if (!pathCheck.ok) fail(pathCheck.reason ?? "path not permitted");

      if (!/^\//.test(step.path)) fail("path must be relative to the target origin (no arbitrary URL)");

      if (!ctx.allowedPersonaIds.includes(step.personaId))
        fail(`persona '${step.personaId}' not permitted`);

      if (step.headers) {
        for (const key of Object.keys(step.headers)) {
          if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase()))
            fail(`secret-bearing header not allowed: ${key}`);
        }
      }

      const isMutation = step.method !== "GET";
      if (isMutation && !ctx.scope.allowMutation)
        fail("mutation not permitted by scope manifest");

      const bodyStr = step.body === undefined ? "" : JSON.stringify(step.body);
      if (REAL_ID_HINT.test(bodyStr)) fail("body appears to reference a real (non-synthetic) identifier");
      break;
    }
    case "parallel": {
      if (!ctx.scope.allowConcurrencyExperiments)
        fail("concurrency experiments not permitted by scope manifest");
      step.branches.forEach((branch) =>
        branch.forEach((s) => collectStepIssues(s, ctx, index, reasons, blocked))
      );
      break;
    }
    case "browser": {
      if (ctx.scope.maxBrowserSessions <= 0) fail("browser sessions not permitted by scope manifest");
      if (!ctx.allowedPersonaIds.includes(step.personaId))
        fail(`persona '${step.personaId}' not permitted`);
      break;
    }
    case "delay":
    case "state":
      break;
  }
}

/**
 * Policy engine (spec §21). Evaluates an ExperimentPlan against scope, risk mode,
 * personas, routes, budgets, mutation settings, and safety heuristics.
 */
export function evaluatePolicy(plan: ExperimentPlan, ctx: PolicyContext): PolicyDecision {
  const reasons: string[] = [];
  const blocked = new Set<number>();

  if (!riskAllowedByMode(plan.risk, ctx.riskMode))
    reasons.push(`risk level ${plan.risk} not permitted in mode ${ctx.riskMode}`);

  if (ctx.remainingRequests <= 0) reasons.push("request budget exhausted");
  if (ctx.remainingToolCalls <= 0) reasons.push("tool-call budget exhausted");

  plan.steps.forEach((step, i) => collectStepIssues(step, ctx, i, reasons, blocked));

  const allowed = reasons.length === 0 && blocked.size === 0;
  return {
    allowed,
    reasons: allowed ? ["ok"] : reasons,
    blockedStepIndexes: blocked.size ? [...blocked].sort((a, b) => a - b) : undefined,
  };
}
