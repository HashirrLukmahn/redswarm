import type { TestPersonaPublic } from "../schemas/index.js";

/**
 * Persona vault (spec §42). The public description is exposed to the model; the
 * credential is resolved ONLY inside the ToolGateway and never leaves the server.
 */
export interface PersonaSecret {
  id: string;
  description: string;
  /** Synthetic bearer token injected server-side. Never sent to the model. */
  token: string;
  /** Synthetic account this persona owns, for ownership checks. */
  ownsAccount?: string;
  revoked?: boolean;
}

export const PERSONA_VAULT: PersonaSecret[] = [
  { id: "customer_a", description: "ordinary customer", token: "tok_customer_a", ownsAccount: "REDSWARM_TEST_ACCOUNT_A" },
  { id: "customer_b", description: "ordinary customer (different tenant)", token: "tok_customer_b", ownsAccount: "REDSWARM_TEST_ACCOUNT_B" },
  { id: "customer_c", description: "ordinary customer", token: "tok_customer_c", ownsAccount: "REDSWARM_TEST_ACCOUNT_C" },
  { id: "org_a_admin", description: "administrator of organization A", token: "tok_org_a_admin", ownsAccount: "REDSWARM_TEST_ACCOUNT_A" },
  { id: "org_a_member", description: "member of organization A", token: "tok_org_a_member", ownsAccount: "REDSWARM_TEST_ACCOUNT_A" },
  { id: "org_b_admin", description: "administrator of organization B", token: "tok_org_b_admin", ownsAccount: "REDSWARM_TEST_ACCOUNT_B" },
  { id: "org_b_member", description: "member of organization B", token: "tok_org_b_member", ownsAccount: "REDSWARM_TEST_ACCOUNT_B" },
  { id: "revoked_user", description: "user whose session was revoked", token: "tok_revoked", ownsAccount: "REDSWARM_TEST_ACCOUNT_A", revoked: true },
  { id: "downgraded_user", description: "recently downgraded user", token: "tok_downgraded", ownsAccount: "REDSWARM_TEST_ACCOUNT_A" },
  { id: "pending_user", description: "invited but not fully activated user", token: "tok_pending" },
];

/** Public projection handed to agents — NO credentials (spec §42). */
export function publicPersonas(): TestPersonaPublic[] {
  return PERSONA_VAULT.map((p) => ({ id: p.id, description: p.description }));
}

export function resolvePersona(id: string): PersonaSecret | undefined {
  return PERSONA_VAULT.find((p) => p.id === id);
}
