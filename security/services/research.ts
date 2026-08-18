import type { ExaProvider, ThreatResearch } from "../providers/exa.js";
import type { ConcurrencyManager } from "../orchestration/concurrency.js";

/** Small defensive research fanout (spec §33, §44 step 6). */
const RESEARCH_TOPICS = [
  "duplicate financial processing caused by retries, webhook replay, or non-idempotent workflows",
  "tenant isolation and broken object level authorization in multi-tenant fintech APIs",
  "session revocation and stale authorization failures",
];

export async function runThreatResearch(
  exa: ExaProvider,
  concurrency: ConcurrencyManager,
  enabled: boolean
): Promise<ThreatResearch[]> {
  if (!enabled) return [];
  return Promise.all(
    RESEARCH_TOPICS.map((topic) => concurrency.research.run(() => exa.research(topic)))
  );
}
