import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "../security/policy/policy-engine.js";
import { ROLE_CAPABILITIES } from "../security/policy/capabilities.js";
import { ScopeManifestSchema, type ExperimentPlan } from "../security/schemas/index.js";

const scope = ScopeManifestSchema.parse({
  environment: "staging",
  targetOrigin: "http://localhost:4600",
  allowedHosts: ["localhost"],
  allowedApiPrefixes: ["/api/"],
  deniedApiPrefixes: ["/admin"],
  testPersonaIds: ["customer_a"],
  syntheticDataOnly: true,
  maxRequestsPerSecond: 10,
  maxRequestsPerRun: 100,
  maxBrowserSessions: 1,
  allowMutation: true,
  allowConcurrencyExperiments: false,
  allowExternalProviderCalls: false,
  ownershipVerificationToken: "t",
});

const plan = (over: Partial<ExperimentPlan>): ExperimentPlan => ({
  id: "exp1",
  hypothesisId: "h1",
  title: "t",
  invariantId: "FI-002",
  risk: "SYNTHETIC_MUTATION",
  preconditions: [],
  actors: [],
  steps: [{ kind: "api", personaId: "customer_a", method: "POST", path: "/api/transfers", body: { amount: 1 } }],
  expectedSafeOutcome: "s",
  violationSignal: "v",
  rationale: "r",
  ...over,
});

const ctx = { scope, riskMode: "SANDBOX_MUTATING" as const, allowedPersonaIds: ["customer_a"], remainingRequests: 100, remainingToolCalls: 100 };

describe("policy engine (spec §21)", () => {
  it("approves a compliant synthetic-mutation plan", () => {
    expect(evaluatePolicy(plan({}), ctx).allowed).toBe(true);
  });

  it("blocks a secret-bearing Authorization header", () => {
    const d = evaluatePolicy(plan({ steps: [{ kind: "api", personaId: "customer_a", method: "GET", path: "/api/x", headers: { Authorization: "Bearer x" } }] }), ctx);
    expect(d.allowed).toBe(false);
    expect(d.reasons.join(" ")).toMatch(/secret-bearing header/);
  });

  it("blocks an unknown persona", () => {
    expect(evaluatePolicy(plan({ steps: [{ kind: "api", personaId: "attacker", method: "GET", path: "/api/x" }] }), ctx).allowed).toBe(false);
  });

  it("blocks a denied route", () => {
    expect(evaluatePolicy(plan({ steps: [{ kind: "api", personaId: "customer_a", method: "GET", path: "/admin/x" }] }), ctx).allowed).toBe(false);
  });

  it("blocks a risk level above the run mode", () => {
    const d = evaluatePolicy(plan({ risk: "CONTROLLED_CONCURRENCY" }), ctx);
    expect(d.allowed).toBe(false);
  });

  it("blocks concurrency experiments when scope forbids them", () => {
    const d = evaluatePolicy(
      plan({ risk: "CONTROLLED_CONCURRENCY", steps: [{ kind: "parallel", branches: [[{ kind: "api", personaId: "customer_a", method: "GET", path: "/api/x" }]] }] }),
      { ...ctx, riskMode: "CONTROLLED_CONCURRENCY" }
    );
    expect(d.allowed).toBe(false);
  });
});

describe("role capabilities (spec §16)", () => {
  it("hypothesis roles only get READ_ARCHITECTURE", () => {
    expect(ROLE_CAPABILITIES["financial-integrity"]).toEqual(["READ_ARCHITECTURE"]);
  });
  it("verifier gets VERIFY_FINDING and staging read", () => {
    expect(ROLE_CAPABILITIES["verifier"]).toContain("VERIFY_FINDING");
    expect(ROLE_CAPABILITIES["verifier"]).toContain("READ_STAGING");
  });
});
