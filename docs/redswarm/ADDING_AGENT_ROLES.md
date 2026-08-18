# Adding an Agent Role

Reference: [`build-spec.md`](../../build-spec.md) §5, §9, §10, §16.

1. **Add the role id** to `AgentRoleSchema` in `security/schemas/agent.ts`.

2. **Grant capabilities** in `security/policy/capabilities.ts` (`ROLE_CAPABILITIES`).
   Grant only what the role needs — hypothesis roles usually get just
   `READ_ARCHITECTURE`.

3. **Define the role** in `security/prompts/roles/index.ts`:

   ```ts
   "refund-abuse": {
     id: "refund-abuse",
     name: "Refund Abuse Agent",
     mission: "Find sequences where refunds create net-positive economic effects.",
     reasoningLens: ["double refund", "refund after chargeback"],
     forbiddenActions: FORBIDDEN_COMMON,
     preferredInvariants: ["FI-001", "FI-002"],
     swarmShare: 6,          // relative allocation in a ~100-agent run
     specialistPrompt: "Focus on refund/reversal flows and their economic effects.",
   }
   ```

4. The swarm builder (`security/orchestration/swarm.ts`) automatically allocates
   agents proportionally to `swarmShare` and assigns diversity seeds. Nothing else
   is required — scaling the swarm is a config change, not a rewrite (spec §79).

5. **(Optional)** add a mock hypothesis template in `security/providers/mock.ts`
   so the offline demo exercises the new role.
