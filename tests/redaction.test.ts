import { describe, it, expect } from "vitest";
import { redactSensitive, redactHeaders } from "../security/policy/redaction.js";

describe("redaction layer (spec §59)", () => {
  it("redacts sensitive keys recursively", () => {
    const out = redactSensitive({
      authorization: "Bearer abc",
      nested: { password: "hunter2", ok: "keep", accountNumber: "12345678" },
      list: [{ token: "x" }, { fine: "y" }],
    });
    expect(out.authorization).toBe("[REDACTED]");
    expect(out.nested.password).toBe("[REDACTED]");
    expect(out.nested.accountNumber).toBe("[REDACTED]");
    expect(out.nested.ok).toBe("keep");
    expect(out.list[0]!.token).toBe("[REDACTED]");
    expect(out.list[1]!.fine).toBe("y");
  });

  it("redacts token-like values even under benign keys", () => {
    const out = redactSensitive({ note: "use Bearer sk-abcdef1234567890abcdef and ssn 123-45-6789" });
    expect(out.note).toContain("[REDACTED]");
    expect(out.note).not.toContain("123-45-6789");
  });

  it("drops sensitive headers", () => {
    const h = redactHeaders({ authorization: "Bearer z", "content-type": "application/json" });
    expect(h.authorization).toBe("[REDACTED]");
    expect(h["content-type"]).toBe("application/json");
  });

  it("handles cycles without throwing", () => {
    const a: any = { name: "a" };
    a.self = a;
    expect(() => redactSensitive(a)).not.toThrow();
  });
});
