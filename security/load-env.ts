import { existsSync, readFileSync } from "node:fs";

/**
 * Minimal, dependency-free .env loader. Imported first by the CLI/server
 * entrypoints so `npm run dashboard|demo|run` pick up .env cross-platform
 * (Node/tsx do not auto-load it). Existing process.env values win, and inline
 * ` # comments` on unquoted values are stripped.
 */
const path = process.env.REDSWARM_ENV_FILE ?? ".env";
if (existsSync(path)) {
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.search(/\s#/);
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
