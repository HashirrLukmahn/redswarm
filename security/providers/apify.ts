import type { ScopeCheckResult } from "../policy/scope.js";
import { isHostAllowed } from "../policy/scope.js";

/**
 * Apify browser execution adapter (spec §34). Runs an RedSwarm browser Actor with
 * a strictly bounded, safe step vocabulary. No evalJavascript / executeShell /
 * arbitrary navigation. Origin is enforced; credentials resolved server-side.
 */
export type SafeBrowserStep =
  | { action: "navigate"; path: string }
  | { action: "click"; locator: string }
  | { action: "fill"; locator: string; valueRef: string }
  | { action: "wait"; milliseconds: number }
  | { action: "read"; locator: string }
  | { action: "screenshot"; label: string };

export interface BrowserScenarioInput {
  allowedOrigin: string;
  personaId: string;
  steps: SafeBrowserStep[];
  runId: string;
  experimentId: string;
}

export interface BrowserObservation {
  screenshots: { label: string; ref: string }[];
  reads: { locator: string; text: string }[];
  blocked?: string;
}

export interface BrowserProvider {
  runScenario(input: BrowserScenarioInput, allowedHosts: string[]): Promise<BrowserObservation>;
}

const FORBIDDEN_BROWSER_KEYS = /(eval|javascript|shell|download|execute)/i;

export function validateBrowserSteps(steps: SafeBrowserStep[]): ScopeCheckResult {
  for (const step of steps) {
    if (FORBIDDEN_BROWSER_KEYS.test(step.action)) {
      return { ok: false, reason: `Forbidden browser action: ${step.action}` };
    }
    if (step.action === "navigate" && !step.path.startsWith("/")) {
      return { ok: false, reason: "Browser navigation must be a relative path (no arbitrary URL)" };
    }
  }
  return { ok: true };
}

/** Offline default so the pipeline runs without Apify configured. */
export class MockBrowserProvider implements BrowserProvider {
  async runScenario(
    input: BrowserScenarioInput,
    allowedHosts: string[]
  ): Promise<BrowserObservation> {
    if (!isHostAllowed(input.allowedOrigin, allowedHosts)) {
      return { screenshots: [], reads: [], blocked: "origin not in allowlist" };
    }
    const stepCheck = validateBrowserSteps(input.steps);
    if (!stepCheck.ok) return { screenshots: [], reads: [], blocked: stepCheck.reason };

    return {
      screenshots: input.steps
        .filter((s): s is Extract<SafeBrowserStep, { action: "screenshot" }> => s.action === "screenshot")
        .map((s) => ({ label: s.label, ref: `mock://screenshot/${input.experimentId}/${s.label}` })),
      reads: input.steps
        .filter((s): s is Extract<SafeBrowserStep, { action: "read" }> => s.action === "read")
        .map((s) => ({ locator: s.locator, text: "[mock read]" })),
    };
  }
}

export class ApifyBrowserProvider implements BrowserProvider {
  constructor(
    private readonly token: string,
    private readonly actorId: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async runScenario(
    input: BrowserScenarioInput,
    allowedHosts: string[]
  ): Promise<BrowserObservation> {
    if (!isHostAllowed(input.allowedOrigin, allowedHosts)) {
      return { screenshots: [], reads: [], blocked: "origin not in allowlist" };
    }
    const stepCheck = validateBrowserSteps(input.steps);
    if (!stepCheck.ok) return { screenshots: [], reads: [], blocked: stepCheck.reason };

    const url = `https://api.apify.com/v2/acts/${this.actorId}/run-sync-get-dataset-items?token=${this.token}`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Apify HTTP ${res.status}`);
    const items = (await res.json()) as BrowserObservation[];
    return items[0] ?? { screenshots: [], reads: [] };
  }
}
