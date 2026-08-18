import { createServer } from "node:http";
import { FintechSimulator } from "./fintech.js";

/** Standalone HTTP wrapper around the fintech simulator. */
export function startSimServer(port: number, verificationToken?: string): {
  sim: FintechSimulator;
  close: () => Promise<void>;
} {
  const sim = new FintechSimulator(verificationToken);
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      let body: unknown;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = undefined;
        }
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers[k.toLowerCase()] = v;
      }
      const result = sim.handle(req.method ?? "GET", req.url ?? "/", headers, body);
      res.writeHead(result.status, { "content-type": "application/json" });
      res.end(JSON.stringify(result.body));
    });
  });
  server.listen(port);
  return {
    sim,
    close: () =>
      new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// Run directly: `npm run sim`
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.ARCHRED_SIM_PORT ?? 4600);
  const token = process.env.ARCHRED_STAGING_VERIFICATION_TOKEN;
  startSimServer(port, token);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: "SIM_STARTED", port }));
}
