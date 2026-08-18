import "../security/load-env.js";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
import { httpFixtureReset } from "../cli/shared.js";
import { renderConsolidatedReport, renderAgentReport } from "../security/services/report.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const store = makeStateStore();
const dashPort = Number(process.env.ARCHRED_DASHBOARD_PORT ?? 4610);
const simPort = Number(process.env.ARCHRED_SIM_PORT ?? 4600);
const token = process.env.ARCHRED_STAGING_VERIFICATION_TOKEN ?? "archred-local-dev-token";

// Targeting model:
//  - Local dev: bundle the simulator and target it (default).
//  - Container/replica: set ARCHRED_BUNDLE_SIM=false and ARCHRED_TARGET_ORIGIN
//    to the staging replica (e.g. http://target:4600). ArchRed then operates on
//    that container instead of starting its own simulator.
const bundleSim = process.env.ARCHRED_BUNDLE_SIM !== "false";
const targetOrigin = process.env.ARCHRED_TARGET_ORIGIN ?? `http://localhost:${simPort}`;
const allowedHosts = (process.env.ARCHRED_ALLOWED_HOSTS ?? new URL(targetOrigin).hostname)
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

if (bundleSim) startSimServer(simPort, token);

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

function snapshot(runId: string) {
  return {
    run: store.getRun(runId),
    agents: store.listAgents(runId),
    hypotheses: store.listHypotheses(runId).map((h) => ({ id: h.id, title: h.title, invariantId: h.invariantId, score: h.score, mergedFrom: h.mergedFrom })),
    findings: store.listFindings(runId),
    events: store.listEvents(runId).slice(-200),
  };
}

async function startRun(body: any) {
  const agentCount = Number(body?.agentCount ?? 25);
  const scope = buildScopeFromEnv({ targetOrigin, allowedHosts });
  const config = buildRunConfigFromEnv({
    name: body?.name ?? "Dashboard run",
    scope,
    agentCount,
    riskMode: body?.riskMode ?? "SANDBOX_MUTATING",
    provider: (body?.provider as "mock" | "gmi") ?? (process.env.ARCHRED_MODEL_PROVIDER as any) ?? "mock",
    modelConcurrency: Number(body?.modelConcurrency ?? 10),
    enableResearch: true,
    enableArchitect: true,
  });
  // Fire and forget; the UI streams progress over SSE.
  const promise = runSecuritySwarm(config, {
    store,
    provider: makeModelProvider(config.provider),
    exa: makeExaProvider(),
    browser: makeBrowserProvider(),
    resetFixtures: httpFixtureReset(scope),
  });
  // We need the runId immediately; poll the store for the newest run.
  await new Promise((r) => setTimeout(r, 30));
  const latest = store.listRuns()[0];
  promise.catch((e) => console.error("run error", e));
  return latest?.id;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${dashPort}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = readFileSync(join(__dirname, "public", "index.html"), "utf8");
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
    return;
  }

  if (url.pathname === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    res.write(`event: hello\ndata: {}\n\n`);
    const unsub = store.subscribe((e) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    });
    const keepAlive = setInterval(() => res.write(`: ping\n\n`), 15000);
    req.on("close", () => {
      clearInterval(keepAlive);
      unsub();
    });
    return;
  }

  if (url.pathname === "/api/runs" && req.method === "GET") {
    return json(res, 200, store.listRuns());
  }

  const snapMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (snapMatch && req.method === "GET") {
    return json(res, 200, snapshot(snapMatch[1]!));
  }

  const reportMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/report$/);
  if (reportMatch && req.method === "GET") {
    const md = renderConsolidatedReport(store, reportMatch[1]!);
    res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "access-control-allow-origin": "*" });
    res.end(md);
    return;
  }

  const agentReportMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/agents\/([^/]+)\/report$/);
  if (agentReportMatch && req.method === "GET") {
    const md = renderAgentReport(store, agentReportMatch[1]!, agentReportMatch[2]!);
    res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "access-control-allow-origin": "*" });
    res.end(md);
    return;
  }

  const cancelMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === "POST") {
    store.requestCancel(cancelMatch[1]!);
    store.emit({ id: `${Date.now()}`, runId: cancelMatch[1]!, timestamp: Date.now(), type: "RUN_CANCEL_REQUESTED", title: "STOP SWARM requested" });
    return json(res, 200, { ok: true });
  }

  if (url.pathname === "/api/start" && req.method === "POST") {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", async () => {
      let body: any = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {}
      const runId = await startRun(body);
      json(res, 200, { runId });
    });
    return;
  }

  json(res, 404, { error: "not found" });
});

server.listen(dashPort, () => {
  // eslint-disable-next-line no-console
  console.log(
    `ArchRed dashboard: http://localhost:${dashPort}  target=${targetOrigin}` +
      (bundleSim ? ` (bundled simulator on :${simPort})` : " (external replica)")
  );
});
