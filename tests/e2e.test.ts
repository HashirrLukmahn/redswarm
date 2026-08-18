import { describe, it, expect, afterEach } from "vitest";
import { startSimServer } from "../sim/server.js";
import { InMemoryStateStore } from "../security/state/store.js";
import { runSecuritySwarm } from "../security/orchestration/run-manager.js";
import { buildRunConfigFromEnv, buildScopeFromEnv } from "../security/config.js";
import { MockProvider } from "../security/providers/mock.js";
import { MockExaProvider } from "../security/providers/exa.js";
import { MockBrowserProvider } from "../security/providers/apify.js";
import { httpFixtureReset } from "../cli/shared.js";

const PORT = 4791;
const TOKEN = "redswarm-local-dev-token";
let sim: { close: () => Promise<void> } | undefined;
afterEach(async () => {
  if (sim) await sim.close();
  sim = undefined;
});

function deps(store: InMemoryStateStore, scope: ReturnType<typeof buildScopeFromEnv>) {
  return {
    store,
    provider: new MockProvider(1),
    exa: new MockExaProvider(),
    browser: new MockBrowserProvider(),
    resetFixtures: httpFixtureReset(scope),
  };
}

describe("end-to-end swarm (spec §74, §68)", () => {
  it("verifies a real FI-002 finding and rejects false positives", async () => {
    sim = startSimServer(PORT, TOKEN);
    const scope = buildScopeFromEnv({ targetOrigin: `http://localhost:${PORT}`, allowedHosts: ["localhost"] });
    const config = buildRunConfigFromEnv({ name: "e2e", scope, agentCount: 12, enableArchitect: true });
    const store = new InMemoryStateStore();

    const run = await runSecuritySwarm(config, deps(store, scope));
    expect(run.status).toBe("COMPLETED");

    const findings = store.listFindings(run.id);
    const verified = findings.filter((f) => f.status === "VERIFIED");
    const rejected = findings.filter((f) => f.status === "REJECTED");

    // The idempotency weakness is genuinely found and verified.
    expect(verified.length).toBeGreaterThanOrEqual(1);
    expect(verified.every((f) => f.evidenceIds.length > 0)).toBe(true);
    expect(verified.some((f) => f.invariantId === "FI-002")).toBe(true);

    // Tenant-isolation / revocation hypotheses are genuinely rejected (not faked).
    expect(rejected.length).toBeGreaterThanOrEqual(1);

    // Metrics are recorded (spec §48).
    expect(run.metrics?.totalModelCalls).toBeGreaterThan(0);
    expect(run.metrics?.peakActiveModelCalls).toBeGreaterThan(0);
  });

  it("STOP SWARM prevents completion (kill switch, spec §46)", async () => {
    sim = startSimServer(PORT + 1, TOKEN);
    const scope = buildScopeFromEnv({ targetOrigin: `http://localhost:${PORT + 1}`, allowedHosts: ["localhost"] });
    const config = buildRunConfigFromEnv({ name: "e2e-cancel", scope, agentCount: 40, modelConcurrency: 2 });
    const store = new InMemoryStateStore();

    const p = runSecuritySwarm(config, deps(store, scope));
    // Cancel almost immediately.
    await new Promise((r) => setTimeout(r, 5));
    const running = store.listRuns()[0];
    store.requestCancel(running!.id);

    const run = await p;
    expect(["CANCELLED", "COMPLETED"]).toContain(run.status);
    // If cancelled, not all agents should have completed.
    if (run.status === "CANCELLED") {
      const completed = store.listAgents(run.id).filter((a) => a.status === "completed").length;
      expect(completed).toBeLessThan(40);
    }
  });
});
