import "../security/load-env.js";
import { makeStateStore } from "../security/state/convex-store.js";
import { runSecuritySwarm } from "../security/orchestration/run-manager.js";
import {
  buildRunConfigFromEnv,
  makeBrowserProvider,
  makeExaProvider,
  makeModelProvider,
} from "../security/config.js";
import { httpFixtureReset, printFindings } from "./shared.js";

/**
 * Run a swarm against an already-running staging target defined by
 * ARCHRED_TARGET_ORIGIN / ARCHRED_ALLOWED_HOSTS. Start the simulator first with
 * `npm run sim`, or point at your own verified staging environment.
 */
async function main() {
  const config = buildRunConfigFromEnv({
    provider: (process.env.ARCHRED_MODEL_PROVIDER as "mock" | "gmi") ?? "mock",
    enableResearch: process.env.EXA_API_KEY ? true : false,
    enableArchitect: true,
  });

  const store = makeStateStore();
  store.subscribe((e) => {
    const t = new Date(e.timestamp).toISOString().slice(11, 19);
    // eslint-disable-next-line no-console
    console.log(`${t}  ${e.type.padEnd(20)} ${e.title}`);
  });

  const run = await runSecuritySwarm(config, {
    store,
    provider: makeModelProvider(config.provider),
    exa: makeExaProvider(),
    browser: makeBrowserProvider(),
    resetFixtures: httpFixtureReset(config.scope),
  });

  printFindings(store.listFindings(run.id));
  // eslint-disable-next-line no-console
  console.log(`\nStatus: ${store.getRun(run.id)?.status}  Metrics:`, store.getRun(run.id)?.metrics);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
