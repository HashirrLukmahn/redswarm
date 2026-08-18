import type { ScopeManifest } from "../schemas/index.js";
import { isHostAllowed, isPathAllowed, isRedirectAllowed, isTransportAllowed } from "../policy/scope.js";
import { resolvePersona } from "../fixtures/personas.js";

export interface StagingRequest {
  personaId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface StagingResponse {
  status: number;
  body: unknown;
  blocked?: string;
}

/** Headers the model is never allowed to control (spec §19). */
const FORBIDDEN_HEADERS = new Set(["authorization", "host", "cookie", "x-archred-token"]);

/**
 * Safe staging API tool (spec §19). The hostname and auth are injected
 * server-side from the persona vault; the model cannot set Authorization/Host,
 * cannot target an arbitrary URL, and external redirects are blocked.
 */
export async function stagingRequest(
  scope: ScopeManifest,
  req: StagingRequest,
  fetchImpl: typeof fetch = fetch
): Promise<StagingResponse> {
  if (!req.path.startsWith("/")) {
    return { status: 0, body: null, blocked: "path must be relative (no arbitrary URL)" };
  }

  const pathCheck = isPathAllowed(req.path, scope.allowedApiPrefixes, scope.deniedApiPrefixes);
  if (!pathCheck.ok) return { status: 0, body: null, blocked: pathCheck.reason };

  const url = new URL(req.path, scope.targetOrigin).toString();

  const transport = isTransportAllowed(url, { environment: scope.environment });
  if (!transport.ok) return { status: 0, body: null, blocked: transport.reason };
  if (!isHostAllowed(url, scope.allowedHosts)) {
    return { status: 0, body: null, blocked: "TOOL_BLOCKED_OUT_OF_SCOPE: host not allowed" };
  }

  const persona = resolvePersona(req.personaId);
  if (!persona) return { status: 0, body: null, blocked: `unknown persona: ${req.personaId}` };

  // Strip any model-provided sensitive headers.
  const headers: Record<string, string> = { "content-type": "application/json" };
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    if (FORBIDDEN_HEADERS.has(k.toLowerCase())) continue; // silently dropped
    headers[k] = v;
  }
  // Inject auth server-side. The model never sees or supplies this.
  headers["authorization"] = `Bearer ${persona.token}`;
  if (req.idempotencyKey) headers["idempotency-key"] = req.idempotencyKey;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: req.method,
      headers,
      body: req.method === "GET" ? undefined : JSON.stringify(req.body ?? {}),
      redirect: "manual",
    });
  } catch (err) {
    return { status: 0, body: null, blocked: `request failed: ${(err as Error).message}` };
  }

  // Enforce redirect policy on EVERY request (spec §14, §15).
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location") ?? "";
    const redirect = isRedirectAllowed(loc, url, scope.allowedHosts);
    if (!redirect.ok) return { status: res.status, body: null, blocked: redirect.reason };
  }

  let respBody: unknown = null;
  try {
    respBody = await res.json();
  } catch {
    respBody = null;
  }
  return { status: res.status, body: respBody };
}
