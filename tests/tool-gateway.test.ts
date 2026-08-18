import { describe, it, expect, beforeEach } from "vitest";
import { FintechSimulator } from "../sim/fintech.js";
import { InMemoryStateStore } from "../security/state/store.js";
import { BudgetTracker } from "../security/orchestration/budgets.js";
import { ToolGateway, type AgentIdentity } from "../security/tools/tool-gateway.js";
import { MockBrowserProvider } from "../security/providers/apify.js";
import { ROLE_CAPABILITIES, EXECUTOR_CAPABILITIES } from "../security/policy/capabilities.js";
import { ScopeManifestSchema } from "../security/schemas/index.js";

const TOKEN = "redswarm-local-dev-token";

function simFetch(sim: FintechSimulator): typeof fetch {
  return (async (input: any, init: any = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    const body = init.body ? JSON.parse(init.body) : undefined;
    const r = sim.handle(init.method ?? "GET", url.pathname + url.search, headers, body);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const scope = ScopeManifestSchema.parse({
  environment: "staging",
  targetOrigin: "http://localhost:4600",
  allowedHosts: ["localhost"],
  allowedApiPrefixes: ["/api/"],
  deniedApiPrefixes: ["/admin"],
  testPersonaIds: ["customer_a", "customer_b"],
  syntheticDataOnly: true,
  maxRequestsPerSecond: 50,
  maxRequestsPerRun: 100,
  maxBrowserSessions: 1,
  allowMutation: true,
  allowConcurrencyExperiments: true,
  allowExternalProviderCalls: false,
  ownershipVerificationToken: TOKEN,
});

let sim: FintechSimulator;
let store: InMemoryStateStore;
function makeGateway(cancelled = false) {
  return new ToolGateway({
    runId: "run_test",
    scope,
    store,
    budget: new BudgetTracker({ maxModelCalls: 100, maxToolCalls: 100, maxBrowserRuns: 10, maxDurationMs: 60_000, maxRequests: 100 }),
    browser: new MockBrowserProvider(),
    fetchImpl: simFetch(sim),
    isCancelled: () => cancelled,
  });
}

const executor: AgentIdentity = { agentId: "exec", role: "executor", capabilities: EXECUTOR_CAPABILITIES };
const ctx = { experimentId: "exp", hypothesisId: "hyp" };

beforeEach(() => {
  sim = new FintechSimulator(TOKEN);
  store = new InMemoryStateStore();
});

describe("ToolGateway safety (spec §17, §64)", () => {
  it("rejects a capability violation (researcher requests browser)", async () => {
    const gw = makeGateway();
    const researcher: AgentIdentity = { agentId: "res", role: "researcher", capabilities: ROLE_CAPABILITIES.researcher };
    const r = await gw.execute(researcher, { tool: "browser.runScenario", args: { personaId: "customer_a", steps: [] } }, ctx);
    expect(r.ok).toBe(false);
    expect(r.blocked).toMatch(/capability USE_BROWSER/);
  });

  it("honors the kill switch — schedules no tool work when cancelled", async () => {
    const gw = makeGateway(true);
    const r = await gw.execute(executor, { tool: "staging.readState", args: { accountId: "REDSWARM_TEST_ACCOUNT_A", label: "x" } }, ctx);
    expect(r.ok).toBe(false);
    expect(r.blocked).toMatch(/cancelled/);
  });

  it("ignores a model-supplied Authorization header (credential override rejection)", async () => {
    const gw = makeGateway();
    // customer_a supplies customer_b's token in a header; it must be ignored and
    // the request must act as customer_a (who cannot read account B).
    const r = await gw.execute(
      executor,
      { tool: "staging.request", args: { personaId: "customer_a", method: "GET", path: "/api/accounts/REDSWARM_TEST_ACCOUNT_B", headers: { Authorization: "Bearer tok_customer_b" } } },
      ctx
    );
    expect(r.ok).toBe(true);
    expect((r.data as any).status).toBe(403); // acted as customer_a, forbidden on B
  });

  it("blocks an arbitrary (non-relative) URL", async () => {
    const gw = makeGateway();
    const r = await gw.execute(executor, { tool: "staging.request", args: { personaId: "customer_a", method: "GET", path: "http://evil.example/x" } }, ctx);
    expect(r.ok).toBe(false);
    expect(r.blocked).toMatch(/relative|arbitrary/i);
  });

  it("redacts sensitive fields in persisted evidence", async () => {
    const gw = makeGateway();
    await gw.execute(
      executor,
      { tool: "staging.request", args: { personaId: "customer_a", method: "POST", path: "/api/transfers", body: { from: "REDSWARM_TEST_ACCOUNT_A", to: "REDSWARM_TEST_ACCOUNT_B", amount: 5, token: "sk-supersecret1234567890" } } },
      ctx
    );
    const evidence = store.listEvidence("run_test");
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("sk-supersecret1234567890");
    expect(serialized).toContain("[REDACTED]");
  });
});
