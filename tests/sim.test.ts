import { describe, it, expect, beforeEach } from "vitest";
import { FintechSimulator } from "../sim/fintech.js";

const TOKEN = "t";
let sim: FintechSimulator;
beforeEach(() => {
  sim = new FintechSimulator(TOKEN);
});

const auth = (tok: string) => ({ authorization: `Bearer ${tok}` });

describe("fintech simulator (spec §65)", () => {
  it("exposes the staging ownership marker", () => {
    const r = sim.handle("GET", "/.well-known/redswarm-target", {}, undefined);
    expect(r.status).toBe(200);
    expect((r.body as any).environment).toBe("staging");
    expect((r.body as any).testingEnabled).toBe(true);
  });

  it("has a GENUINE non-idempotent transfer weakness (FI-002)", () => {
    sim.handle("POST", "/api/transfers", auth("tok_customer_a"), { from: "REDSWARM_TEST_ACCOUNT_A", to: "REDSWARM_TEST_ACCOUNT_B", amount: 25, idempotencyKey: "k" });
    sim.handle("POST", "/api/transfers", auth("tok_customer_a"), { from: "REDSWARM_TEST_ACCOUNT_A", to: "REDSWARM_TEST_ACCOUNT_B", amount: 25, idempotencyKey: "k" });
    const state = sim.handle("GET", "/test/state/account/REDSWARM_TEST_ACCOUNT_A", { "x-redswarm-token": TOKEN }, undefined);
    expect((state.body as any).balance).toBe(950); // debited twice — the honest bug
  });

  it("CORRECTLY enforces tenant isolation (FI-004 hypotheses should be rejected)", () => {
    const r = sim.handle("GET", "/api/accounts/REDSWARM_TEST_ACCOUNT_B", auth("tok_customer_a"), undefined);
    expect(r.status).toBe(403);
  });

  it("CORRECTLY denies a revoked principal (FI-006)", () => {
    const r = sim.handle("GET", "/api/accounts/REDSWARM_TEST_ACCOUNT_A", auth("tok_revoked"), undefined);
    expect(r.status).toBe(401);
  });

  it("guards the state endpoint with the verification token", () => {
    const r = sim.handle("GET", "/test/state/account/REDSWARM_TEST_ACCOUNT_A", {}, undefined);
    expect(r.status).toBe(403);
  });

  it("resets fixtures on demand", () => {
    sim.handle("POST", "/api/transfers", auth("tok_customer_a"), { from: "REDSWARM_TEST_ACCOUNT_A", to: "REDSWARM_TEST_ACCOUNT_B", amount: 100 });
    sim.handle("POST", "/test/reset", { "x-redswarm-token": TOKEN }, undefined);
    const state = sim.handle("GET", "/test/state/account/REDSWARM_TEST_ACCOUNT_A", { "x-redswarm-token": TOKEN }, undefined);
    expect((state.body as any).balance).toBe(1000);
  });
});
