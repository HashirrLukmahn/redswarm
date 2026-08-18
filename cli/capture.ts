import "../security/load-env.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startSimServer } from "../sim/server.js";
import { InMemoryStateStore } from "../security/state/store.js";
import { runSecuritySwarm } from "../security/orchestration/run-manager.js";
import { buildRunConfigFromEnv, buildScopeFromEnv } from "../security/config.js";
import { MockProvider } from "../security/providers/mock.js";
import { MockExaProvider } from "../security/providers/exa.js";
import { MockBrowserProvider } from "../security/providers/apify.js";
import { httpFixtureReset } from "./shared.js";
import { renderConsolidatedReport } from "../security/services/report.js";

/**
 * Capture a real (mock-provider) run into a static bundle for the GitHub Pages
 * replay. Emits site/run.js as `window.REDSWARM_RUN = {...}` so the static player
 * needs no fetch, no server, and no secrets. Nothing here is fabricated — it is
 * a real recorded run (deterministic offline provider + the local simulator).
 */
async function main() {
  const port = Number(process.env.REDSWARM_SIM_PORT ?? 4650);
  const token = "redswarm-local-dev-token";
  const sim = startSimServer(port, token);

  const scope = buildScopeFromEnv({ targetOrigin: `http://localhost:${port}`, allowedHosts: ["localhost"] });
  const config = buildRunConfigFromEnv({
    name: "RedSwarm public demo swarm",
    scope,
    agentCount: Number(process.env.REDSWARM_AGENT_COUNT ?? 50),
    provider: "mock",
    enableResearch: true,
    enableArchitect: true,
  });

  const store = new InMemoryStateStore();
  const run = await runSecuritySwarm(config, {
    store,
    provider: new MockProvider(1),
    exa: new MockExaProvider(),
    browser: new MockBrowserProvider(),
    resetFixtures: httpFixtureReset(scope),
  });
  await sim.close();

  const bundle = {
    capturedAt: new Date().toISOString(),
    run: store.getRun(run.id),
    agents: store.listAgents(run.id).map((a) => ({ id: a.id, role: a.role, objective: a.objective, diversitySeed: a.diversitySeed, status: a.status })),
    hypotheses: store.listHypotheses(run.id).map((h) => ({ id: h.id, title: h.title, invariantId: h.invariantId, agentId: h.agentId, score: h.score, mergedFrom: h.mergedFrom })),
    findings: store.listFindings(run.id),
    assessment: store.getAssessment(run.id),
    metrics: store.getRun(run.id)?.metrics,
    events: store.listEvents(run.id),
    reportMarkdown: renderConsolidatedReport(store, run.id),
  };

  const outDir = join("site");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "run.js"), `window.REDSWARM_RUN = ${JSON.stringify(bundle)};\n`, "utf8");

  const verified = bundle.findings.filter((f) => f.status === "VERIFIED").length;
  // eslint-disable-next-line no-console
  console.log(`Captured run ${run.id}: ${bundle.agents.length} agents, ${bundle.events.length} events, ${verified} verified. -> site/run.js`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
