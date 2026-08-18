import type { ScopeManifest } from "../security/schemas/index.js";

/** Build a resetFixtures() that hits the simulator's guarded reset endpoint. */
export function httpFixtureReset(scope: ScopeManifest, fetchImpl: typeof fetch = fetch) {
  return async () => {
    const url = new URL("/test/reset", scope.targetOrigin).toString();
    try {
      await fetchImpl(url, {
        method: "POST",
        headers: scope.ownershipVerificationToken
          ? { "x-redswarm-token": scope.ownershipVerificationToken }
          : {},
      });
    } catch {
      // best-effort; a failed reset just means less-clean reproductions
    }
  };
}

export function printFindings(findings: { title: string; status: string; severity?: string; invariantId: string; findingConfidence?: number; reproductionSummary?: string }[]) {
  const verified = findings.filter((f) => f.status === "VERIFIED");
  const rejected = findings.filter((f) => f.status === "REJECTED");
  const blocked = findings.filter((f) => f.status === "BLOCKED");
  // eslint-disable-next-line no-console
  console.log(`\n=== RESULTS ===`);
  console.log(`Verified: ${verified.length} | Rejected: ${rejected.length} | Blocked-by-policy: ${blocked.length}\n`);
  for (const f of verified) {
    console.log(`  [VERIFIED ${f.severity}] ${f.title}`);
    console.log(`     invariant=${f.invariantId} confidence=${f.findingConfidence}`);
    if (f.reproductionSummary) console.log(`     ${f.reproductionSummary}`);
  }
  for (const f of rejected) console.log(`  [REJECTED] ${f.title} (${f.invariantId})`);
  for (const f of blocked) console.log(`  [BLOCKED_BY_POLICY] ${f.title}`);
}
