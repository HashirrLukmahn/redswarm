import type { ApiSurfaceSummary, ArchitectureSnapshot } from "../schemas/index.js";

/** Manually-populated architecture snapshot for the local simulator (spec §12). */
export const SIM_ARCHITECTURE: ArchitectureSnapshot = {
  applicationName: "RedSwarm Local Fintech Simulator",
  components: [
    { id: "frontend", type: "frontend", description: "Customer web UI", dataClassification: ["pii"], trustZone: "edge" },
    { id: "api", type: "gateway", description: "Public API gateway", dataClassification: ["financial"], trustZone: "backend" },
    { id: "auth", type: "service", description: "Bearer-token authentication + ownership checks", dataClassification: ["credentials"], trustZone: "backend" },
    { id: "payments-service", type: "service", description: "Executes synthetic transfers", dataClassification: ["financial"], trustZone: "backend" },
    { id: "ledger", type: "datastore", description: "Append-only synthetic ledger", dataClassification: ["financial"], trustZone: "backend" },
    { id: "database", type: "datastore", description: "Accounts and balances", dataClassification: ["financial"], trustZone: "backend" },
  ],
  edges: [
    { from: "frontend", to: "api", protocol: "HTTP", asynchronous: false },
    { from: "api", to: "auth", protocol: "HTTP", asynchronous: false },
    { from: "api", to: "payments-service", protocol: "HTTP", asynchronous: false },
    { from: "payments-service", to: "ledger", protocol: "internal", asynchronous: false },
    { from: "payments-service", to: "database", protocol: "internal", asynchronous: false },
  ],
  dataStores: [
    { id: "ledger", kind: "append-only", description: "Synthetic ledger entries" },
    { id: "database", kind: "kv", description: "Synthetic accounts" },
  ],
  externalProviders: [],
  trustBoundaries: [
    { id: "edge-backend", description: "Client to backend boundary", separates: ["frontend", "api"] },
  ],
  authentication: "Static synthetic bearer tokens mapped to personas.",
  authorization: "Per-account ownership checks on read and transfer source.",
  financialEntities: [
    { id: "account", description: "Synthetic account with balance", states: ["active"] },
    { id: "transfer", description: "Movement of synthetic funds", states: ["requested", "completed"] },
  ],
};

export const SIM_API_SURFACE: ApiSurfaceSummary = {
  entries: [
    { method: "GET", path: "/api/accounts/{id}", description: "Read a synthetic account summary", mutates: false },
    { method: "POST", path: "/api/transfers", description: "Transfer synthetic funds between accounts", mutates: true },
  ],
};
