import { describe, it, expect } from "vitest";
import {
  isHostAllowed,
  isTransportAllowed,
  isRedirectAllowed,
  isPathAllowed,
  verifyStagingTarget,
} from "../security/policy/scope.js";
import { ScopeManifestSchema } from "../security/schemas/index.js";

const baseScope = ScopeManifestSchema.parse({
  environment: "staging",
  targetOrigin: "https://staging.example.com",
  allowedHosts: ["staging.example.com"],
  allowedApiPrefixes: ["/api/"],
  deniedApiPrefixes: ["/admin"],
  testPersonaIds: ["customer_a"],
  syntheticDataOnly: true,
  maxRequestsPerSecond: 10,
  maxRequestsPerRun: 100,
  maxBrowserSessions: 1,
  allowMutation: true,
  allowConcurrencyExperiments: true,
  allowExternalProviderCalls: false,
  ownershipVerificationToken: "t",
});

describe("host allowlisting (spec §64)", () => {
  it("rejects a non-allowed external host", () => {
    expect(isHostAllowed("https://example.org/x", ["staging.example.com"])).toBe(false);
  });
  it("accepts the exact allowed host", () => {
    expect(isHostAllowed("https://staging.example.com/api", ["staging.example.com"])).toBe(true);
  });
  it("does not allow suffix matches", () => {
    expect(isHostAllowed("https://evilstaging.example.com", ["staging.example.com"])).toBe(false);
  });
});

describe("transport policy", () => {
  it("requires https except localhost", () => {
    expect(isTransportAllowed("http://staging.example.com").ok).toBe(false);
    expect(isTransportAllowed("http://localhost:4600").ok).toBe(true);
    expect(isTransportAllowed("https://staging.example.com").ok).toBe(true);
  });
});

describe("redirect escape rejection (spec §64)", () => {
  it("blocks a redirect to another host", () => {
    const r = isRedirectAllowed("https://other-site.example/x", "https://staging.example.com", ["staging.example.com"]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("TOOL_BLOCKED_OUT_OF_SCOPE");
  });
  it("allows same-host redirects", () => {
    expect(isRedirectAllowed("/next", "https://staging.example.com", ["staging.example.com"]).ok).toBe(true);
  });
});

describe("path allow/deny prefixes", () => {
  it("blocks denied prefixes", () => {
    expect(isPathAllowed("/admin/x", ["/api/"], ["/admin"]).ok).toBe(false);
  });
  it("allows permitted prefixes", () => {
    expect(isPathAllowed("/api/accounts/1", ["/api/"], ["/admin"]).ok).toBe(true);
  });
});

describe("staging verification", () => {
  it("rejects when the marker says testing disabled", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ environment: "staging", testingEnabled: false }), { status: 200 })) as unknown as typeof fetch;
    const r = await verifyStagingTarget(baseScope, fakeFetch);
    expect(r.ok).toBe(false);
  });
  it("accepts a valid staging marker", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ environment: "staging", testingEnabled: true, targetId: "x" }), { status: 200 })) as unknown as typeof fetch;
    const r = await verifyStagingTarget(baseScope, fakeFetch);
    expect(r.ok).toBe(true);
  });
  it("blocks a marker that redirects off-host", async () => {
    const fakeFetch = (async () =>
      new Response(null, { status: 302, headers: { location: "https://evil.example/x" } })) as unknown as typeof fetch;
    const r = await verifyStagingTarget(baseScope, fakeFetch);
    expect(r.ok).toBe(false);
  });
});

describe("scope schema forbids production", () => {
  it("has no production environment value", () => {
    const parsed = ScopeManifestSchema.safeParse({ ...baseScope, environment: "production" });
    expect(parsed.success).toBe(false);
  });
});
