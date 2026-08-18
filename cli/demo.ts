import "../security/load-env.js";
import { startSimServer } from "../sim/server.js";
import { makeStateStore } from "../security/state/convex-store.js";
import { runSecuritySwarm } from "../security/orchestration/run-manager.js";
import {
  buildRunConfigFromEnv,
  buildScopeFromEnv,
  makeBrowserProvider,
  makeExaProvider,
  makeModelProvider,
} from "../security/config.js";
import { httpFixtureReset, printFindings } from "./shared.js";
import { writeRunReports } from "../security/services/report.js";

/** End-to-end offline demo (spec §68). Starts the simulator, releases the swarm. */
async function main() {
  const port = Number(process.env.REDSWARM_SIM_PORT ?? 4600);
  const token = process.env.REDSWARM_STAGING_VERIFICATION_TOKEN ?? "redswarm-local-dev-token";
  const sim = startSimServer(port, token);

  const scope = buildScopeFromEnv({ targetOrigin: `http://localhost:${port}`, allowedHosts: ["localhost"] });
  const config = buildRunConfigFromEnv({
    name: "RedSwarm demo swarm",
    scope,
    agentCount: Number(process.env.REDSWARM_AGENT_COUNT ?? 25),
    provider: (process.env.REDSWARM_MODEL_PROVIDER as "mock" | "gmi") ?? "mock",
    enableResearch: true,
    enableArchitect: true,
  });

  const store = makeStateStore();
  const unsub = store.subscribe((e) => {
    const t = new Date(e.timestamp).toISOString().slice(11, 19);
    // eslint-disable-next-line no-console
    console.log(`${t}  ${e.type.padEnd(20)} ${e.title}`);
  });

  const run = await runSecuritySwarm(config, {
    store,
    provider: makeModelProvider(config.provider),
    exa: makeExaProvider(),
    browser: makeBrowserProvider(),
    resetFixtures: httpFixtureReset(scope),
  });

  unsub();
  printFindings(store.listFindings(run.id));

  const m = store.getRun(run.id)?.metrics;
  if (m) {
    // eslint-disable-next-line no-console
    console.log(`\n=== GMI PERFORMANCE ===`);
    console.log(`model calls=${m.totalModelCalls} success=${m.successfulCalls} peakConcurrency=${m.peakActiveModelCalls}`);
    console.log(`tokens=${m.totalTokens} (~${m.approxCompletionTokensPerSec} completion tok/s)`);
    console.log(`latency p50=${m.totalLatencyP50}ms p95=${m.totalLatencyP95}ms | queue p95=${m.queueLatencyP95}ms`);
    console.log(`verified/100 agents=${m.verifiedFindingsPer100Agents.toFixed(2)}`);
  }
  console.log(`\nFinal run status: ${store.getRun(run.id)?.status}`);

  const reports = writeRunReports(store, run.id);
  // eslint-disable-next-line no-console
  console.log(`\nReports written: ${reports.consolidated} (+ ${reports.agentFiles.length} per-agent files)`);

  await sim.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
