import { randomUUID } from "node:crypto";
import type { AgentRole, AgentTask } from "../schemas/index.js";
import { ROLE_CAPABILITIES } from "../policy/capabilities.js";
import { ROLE_DEFINITIONS, HYPOTHESIS_ROLES } from "../prompts/roles/index.js";

/** Deterministic diversity seeds (spec §24). */
export const DIVERSITY_SEEDS = [
  "Focus on temporal ordering.",
  "Focus on user lifecycle changes.",
  "Focus on asynchronous boundaries.",
  "Focus on operations succeeding after caller timeout.",
  "Focus on stale authorization.",
  "Focus on multiple legitimate features composed together.",
  "Focus on accounting reconciliation.",
  "Focus on retry behavior.",
  "Focus on state transitions.",
  "Focus on unusual but realistic user behavior.",
];

/**
 * Build the hypothesis swarm (spec §9). Roles are allocated proportionally to
 * their swarmShare and scaled to the requested agent count. Diversity seeds are
 * assigned deterministically so runs are reproducible.
 */
export function buildHypothesisSwarm(runId: string, count: number): AgentTask[] {
  const roles = HYPOTHESIS_ROLES;
  const totalShare = roles.reduce((sum, r) => sum + (ROLE_DEFINITIONS[r]?.swarmShare ?? 1), 0);

  // Allocate integer counts per role proportional to share, then fix rounding.
  const allocation = new Map<AgentRole, number>();
  let assigned = 0;
  for (const role of roles) {
    const share = ROLE_DEFINITIONS[role]?.swarmShare ?? 1;
    const n = Math.max(1, Math.round((share / totalShare) * count));
    allocation.set(role, n);
    assigned += n;
  }
  // Trim/pad to exactly `count` using round-robin over roles.
  let i = 0;
  while (assigned > count) {
    const role = roles[i % roles.length]!;
    if ((allocation.get(role) ?? 0) > 1) {
      allocation.set(role, allocation.get(role)! - 1);
      assigned--;
    }
    i++;
    if (i > count * roles.length) break;
  }
  i = 0;
  while (assigned < count) {
    const role = roles[i % roles.length]!;
    allocation.set(role, (allocation.get(role) ?? 0) + 1);
    assigned++;
    i++;
  }

  const tasks: AgentTask[] = [];
  let index = 0;
  for (const role of roles) {
    const def = ROLE_DEFINITIONS[role]!;
    const n = allocation.get(role) ?? 0;
    for (let k = 0; k < n; k++) {
      const invariantId = def.preferredInvariants[k % def.preferredInvariants.length] ?? "FI-001";
      const seed = DIVERSITY_SEEDS[index % DIVERSITY_SEEDS.length]!;
      tasks.push({
        id: `agent_${String(index + 1).padStart(3, "0")}_${randomUUID().slice(0, 8)}`,
        runId,
        role,
        objective: `Attempt to falsify ${invariantId}: ${def.mission}`,
        diversitySeed: seed,
        allowedCapabilities: ROLE_CAPABILITIES[role],
        status: "queued",
        createdAt: Date.now(),
      });
      index++;
    }
  }
  return tasks.slice(0, count);
}
