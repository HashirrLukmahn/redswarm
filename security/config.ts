import type { RunConfig, ScopeManifest } from "./schemas/index.js";
import { ScopeManifestSchema } from "./schemas/index.js";
import { publicPersonas } from "./fixtures/personas.js";
import type { ModelProvider } from "./providers/model-provider.js";
import { MockProvider } from "./providers/mock.js";
import { GMIProvider } from "./providers/gmi.js";
import { MockExaProvider, ExaHttpProvider, type ExaProvider } from "./providers/exa.js";
import { MockBrowserProvider, ApifyBrowserProvider, type BrowserProvider } from "./providers/apify.js";

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function buildScopeFromEnv(overrides: Partial<ScopeManifest> = {}): ScopeManifest {
  const origin = process.env.ARCHRED_TARGET_ORIGIN ?? "http://localhost:4600";
  const hosts = (process.env.ARCHRED_ALLOWED_HOSTS ?? "localhost")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const environment = process.env.ARCHRED_ENVIRONMENT === "local" ? "local" : "staging";
  return ScopeManifestSchema.parse({
    environment,
    targetOrigin: origin,
    allowedHosts: hosts,
    allowedApiPrefixes: ["/api/"],
    deniedApiPrefixes: ["/admin", "/internal"],
    testPersonaIds: publicPersonas().map((p) => p.id),
    syntheticDataOnly: true,
    maxRequestsPerSecond: 25,
    maxRequestsPerRun: num("ARCHRED_MAX_TOOL_CALLS", 500),
    maxBrowserSessions: num("ARCHRED_BROWSER_CONCURRENCY", 2),
    allowMutation: true,
    allowConcurrencyExperiments: true,
    allowExternalProviderCalls: false,
    ownershipVerificationToken:
      process.env.ARCHRED_STAGING_VERIFICATION_TOKEN ?? "archred-local-dev-token",
    ...overrides,
  });
}

export function buildRunConfigFromEnv(overrides: Partial<RunConfig> = {}): RunConfig {
  const agentCount = overrides.agentCount ?? num("ARCHRED_AGENT_COUNT", 25);
  const scope = overrides.scope ?? buildScopeFromEnv();
  const providerName = (process.env.ARCHRED_MODEL_PROVIDER ?? "mock") as "mock" | "gmi";
  return {
    name: overrides.name ?? `ArchRed run ${new Date().toISOString()}`,
    scope,
    riskMode: overrides.riskMode ?? "SANDBOX_MUTATING",
    agentCount,
    modelConcurrency: overrides.modelConcurrency ?? num("ARCHRED_MODEL_CONCURRENCY", 10),
    browserConcurrency: overrides.browserConcurrency ?? num("ARCHRED_BROWSER_CONCURRENCY", 2),
    apiConcurrency: overrides.apiConcurrency ?? num("ARCHRED_API_CONCURRENCY", 5),
    verifierConcurrency: overrides.verifierConcurrency ?? num("ARCHRED_VERIFIER_CONCURRENCY", 4),
    researchConcurrency: overrides.researchConcurrency ?? num("ARCHRED_RESEARCH_CONCURRENCY", 4),
    threatFamilies: overrides.threatFamilies ?? [],
    budget: overrides.budget ?? {
      maxModelCalls: num("ARCHRED_MAX_MODEL_CALLS", 500),
      maxToolCalls: num("ARCHRED_MAX_TOOL_CALLS", 500),
      maxBrowserRuns: 20,
      maxTokens: 5_000_000,
      maxDurationMs: num("ARCHRED_MAX_RUN_MINUTES", 15) * 60_000,
      maxRequests: num("ARCHRED_MAX_TOOL_CALLS", 500),
    },
    provider: overrides.provider ?? providerName,
    model: overrides.model ?? process.env.GMI_MODEL ?? "mock-model",
    enableResearch: overrides.enableResearch ?? false,
    enableArchitect: overrides.enableArchitect ?? true,
  };
}

export function makeModelProvider(name: "mock" | "gmi"): ModelProvider {
  if (name === "gmi") {
    const apiKey = process.env.GMI_API_KEY;
    if (!apiKey) throw new Error("GMI_API_KEY is required for the gmi provider");
    return new GMIProvider({
      apiKey,
      baseUrl: process.env.GMI_BASE_URL ?? "https://api.gmi-serving.com/v1",
    });
  }
  return new MockProvider();
}

export function makeExaProvider(): ExaProvider {
  const key = process.env.EXA_API_KEY;
  return key ? new ExaHttpProvider(key) : new MockExaProvider();
}

export function makeBrowserProvider(): BrowserProvider {
  const token = process.env.APIFY_API_TOKEN;
  const actor = process.env.APIFY_ARCHRED_ACTOR_ID;
  return token && actor ? new ApifyBrowserProvider(token, actor) : new MockBrowserProvider();
}
