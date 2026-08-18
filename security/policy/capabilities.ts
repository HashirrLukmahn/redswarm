import type { AgentRole, Capability } from "../schemas/index.js";

/**
 * Capability-based agent permissions (spec §16).
 * A role receives only the capabilities it needs — never unrestricted tools.
 */
export const ROLE_CAPABILITIES: Record<AgentRole, Capability[]> = {
  // Hypothesis roles reason over architecture only — no execution rights.
  "financial-integrity": ["READ_ARCHITECTURE"],
  authorization: ["READ_ARCHITECTURE"],
  "state-machine": ["READ_ARCHITECTURE"],
  concurrency: ["READ_ARCHITECTURE"],
  privacy: ["READ_ARCHITECTURE"],
  "workflow-abuse": ["READ_ARCHITECTURE"],
  "distributed-failure": ["READ_ARCHITECTURE"],
  "session-lifecycle": ["READ_ARCHITECTURE"],
  "trust-boundary": ["READ_ARCHITECTURE"],
  "ai-authority": ["READ_ARCHITECTURE"],
  wildcard: ["READ_ARCHITECTURE"],
  // Support roles.
  researcher: ["READ_ARCHITECTURE", "SEARCH_SECURITY_RESEARCH"],
  skeptic: ["READ_ARCHITECTURE"],
  verifier: ["READ_ARCHITECTURE", "READ_STAGING", "READ_TEST_LEDGER", "VERIFY_FINDING"],
  architect: ["READ_ARCHITECTURE"],
};

/** Capabilities an experiment executor identity holds (spec §16). */
export const EXECUTOR_CAPABILITIES: Capability[] = [
  "READ_STAGING",
  "MUTATE_SYNTHETIC_DATA",
  "RUN_CONCURRENT_SCENARIO",
  "USE_BROWSER",
  "READ_TEST_LEDGER",
];

/** Map a tool name to the capability it requires (spec §17 step 1). */
export const TOOL_REQUIRED_CAPABILITY: Record<string, Capability> = {
  "security.searchResearch": "SEARCH_SECURITY_RESEARCH",
  "staging.request": "READ_STAGING", // upgraded to MUTATE for non-GET (see gateway)
  "staging.readState": "READ_TEST_LEDGER",
  "browser.runScenario": "USE_BROWSER",
  "experiment.delay": "READ_STAGING",
  "experiment.parallel": "RUN_CONCURRENT_SCENARIO",
  "evidence.record": "READ_STAGING",
};

export function hasCapability(held: Capability[], required: Capability): boolean {
  return held.includes(required);
}
