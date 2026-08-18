import type { ScopeManifest } from "../schemas/index.js";

export interface ScopeCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * Exact-host allowlisting (spec §14 step 3, §64). Compares the hostname of a URL
 * against the manifest allowlist. No wildcard/suffix matching — exact only.
 */
export function isHostAllowed(urlOrHost: string, allowedHosts: string[]): boolean {
  let host = urlOrHost;
  try {
    host = new URL(urlOrHost).hostname;
  } catch {
    // Treat the input as a bare hostname if it isn't a URL.
  }
  return allowedHosts.some((h) => h.toLowerCase() === host.toLowerCase());
}

/**
 * HTTPS required except for localhost (spec §14 step 2). In a `local`
 * environment (dev, or a container on a private compose/k8s network) http is
 * also permitted, since the target is not internet-facing. Internet-facing
 * `staging` still requires https.
 */
export function isTransportAllowed(
  url: string,
  opts: { environment?: "local" | "staging" } = {}
): ScopeCheckResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "Malformed URL" };
  }
  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "https:") return { ok: true };
  if (parsed.protocol === "http:" && (isLoopback || opts.environment === "local")) {
    return { ok: true };
  }
  return { ok: false, reason: `Insecure transport not allowed: ${parsed.protocol}` };
}

/**
 * Redirect policy (spec §15). A redirect target must remain within the allowed
 * hosts, otherwise the step is terminated with TOOL_BLOCKED_OUT_OF_SCOPE.
 */
export function isRedirectAllowed(
  location: string,
  base: string,
  allowedHosts: string[]
): ScopeCheckResult {
  let resolved: string;
  try {
    resolved = new URL(location, base).toString();
  } catch {
    return { ok: false, reason: "Malformed redirect location" };
  }
  if (!isHostAllowed(resolved, allowedHosts)) {
    return { ok: false, reason: `TOOL_BLOCKED_OUT_OF_SCOPE: ${resolved}` };
  }
  return { ok: true };
}

/** Validate a path against allow/deny prefixes (spec §19, §21). */
export function isPathAllowed(
  path: string,
  allowedPrefixes: string[],
  deniedPrefixes: string[]
): ScopeCheckResult {
  const normalized = path.split("?")[0] ?? path;
  for (const denied of deniedPrefixes) {
    if (normalized.startsWith(denied)) {
      return { ok: false, reason: `Path matches denied prefix: ${denied}` };
    }
  }
  if (allowedPrefixes.length === 0) return { ok: true };
  const allowed = allowedPrefixes.some((p) => normalized.startsWith(p));
  return allowed
    ? { ok: true }
    : { ok: false, reason: `Path not in allowed prefixes: ${normalized}` };
}

export interface StagingTargetMarker {
  environment: string;
  testingEnabled: boolean;
  targetId?: string;
}

/**
 * Verify a staging target owns the ArchRed marker (spec §14).
 * Fetches GET /.well-known/archred-target and validates the response.
 * Rejects anything that is not explicitly staging + testing-enabled.
 */
export async function verifyStagingTarget(
  scope: ScopeManifest,
  fetchImpl: typeof fetch = fetch
): Promise<ScopeCheckResult> {
  // 1. Transport + host checks on the declared origin.
  const transport = isTransportAllowed(scope.targetOrigin, { environment: scope.environment });
  if (!transport.ok) return transport;
  if (!isHostAllowed(scope.targetOrigin, scope.allowedHosts)) {
    return { ok: false, reason: "Target origin host not in allowlist" };
  }

  // 2. Fetch the staging marker.
  const markerUrl = new URL("/.well-known/archred-target", scope.targetOrigin).toString();
  let res: Response;
  try {
    res = await fetchImpl(markerUrl, {
      method: "GET",
      redirect: "manual",
      headers: scope.ownershipVerificationToken
        ? { "x-archred-token": scope.ownershipVerificationToken }
        : undefined,
    });
  } catch (err) {
    return { ok: false, reason: `Could not reach staging marker: ${(err as Error).message}` };
  }

  // 3. Reject redirects that escape scope.
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location") ?? "";
    const redirect = isRedirectAllowed(loc, markerUrl, scope.allowedHosts);
    if (!redirect.ok) return redirect;
    return { ok: false, reason: "Staging marker must not redirect" };
  }

  if (!res.ok) {
    return { ok: false, reason: `Staging marker returned HTTP ${res.status}` };
  }

  let marker: StagingTargetMarker;
  try {
    marker = (await res.json()) as StagingTargetMarker;
  } catch {
    return { ok: false, reason: "Staging marker was not valid JSON" };
  }

  if (marker.environment !== "staging" && marker.environment !== "local") {
    return { ok: false, reason: `Refusing non-staging environment: ${marker.environment}` };
  }
  if (!marker.testingEnabled) {
    return { ok: false, reason: "Target has testingEnabled=false" };
  }

  return { ok: true };
}
