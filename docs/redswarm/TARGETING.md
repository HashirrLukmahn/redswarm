# Targeting a Containerized Replica (instead of prod)

Reference: [`build-spec.md`](../../build-spec.md) §13, §14, §36, §60.

RedSwarm never touches production. It operates only on the origin in the verified
`ScopeManifest`. The safe pattern is: stand up an **ephemeral container that clones
prod's configuration but isolates its data and side effects**, then point RedSwarm
at it. Prod is not selectable — there is no `production` environment value.

## Quick start (built-in stand-in)

```bash
docker compose up --build      # target = built-in simulator, redswarm = tester
# open http://localhost:4610 and RELEASE THE SWARM
```

`target` is the product under test; `redswarm` is the tester and only ever calls
`http://target:4600` via the gateway.

## Swapping in a real cloud.az2.ai replica

Replace the `target` service in `docker-compose.yml`:

```yaml
  target:
    image: registry.az2.ai/cloud:<same-tag-as-prod>   # prod's exact image
    env_file: ./config/staging.env                     # prod's config topology…
    environment:
      DATABASE_URL: postgres://…@db:5432/synthetic     # …but a seeded synthetic DB
      PAYMENTS_MODE: sandbox                            # …and SANDBOX providers only
```

### Parity vs. isolation — the rule that keeps findings honest

| Mirror prod (parity) | Never mirror prod (isolation) |
|---|---|
| Same image / commit | Real customer data → seeded **synthetic** fixtures |
| Config, feature flags, auth rules, routing | Prod DB → **cloned-schema** DB |
| Runtime/framework versions | Prod secrets → **sandbox** credentials |
| Service graph (ledger, payments, queue) | Real external providers → **sandbox/mock** (no real money, emails, webhooks) |

RedSwarm executes *real* mutating experiments and measures *real* economic effects.
Against a sandboxed replica, a verified FI-002 means a synthetic double-spend.
Against prod's payment rail it would mean actually moving money twice — which the
spec forbids (no real economic side effects, no exfiltration, no destructive prod
testing).

## The three test-only hooks the target must expose

Guard all three with `REDSWARM_STAGING_VERIFICATION_TOKEN` (`x-redswarm-token`):

1. `GET /.well-known/redswarm-target` → `{"environment":"staging","testingEnabled":true,"targetId":"…"}`
2. Read-only state inspector → balances / ledger / tx counts (drives deterministic
   invariant checks). Example: `GET /test/state/account/:id`.
3. `POST /test/reset` → restore synthetic fixtures between reproductions.

### If you can't modify the app

Run a small **sidecar** beside the replica that serves these three endpoints by
querying the synthetic DB directly (marker is static; state inspector = read-only
SQL; reset = re-run the seed script). The app image stays byte-identical to prod;
only the sidecar is test-aware. RedSwarm points at the sidecar's origin.

## Persona vault

Map synthetic accounts to **sandbox** tokens in `security/fixtures/personas.ts`
(or a Convex-backed vault). RedSwarm injects these server-side; the model only ever
sees persona ids, never credentials.

## Lifecycle

`docker compose up` (or a CI job) provisions the replica → RedSwarm verifies the
staging marker → runs the swarm → captures evidence → `docker compose down`
disposes the container. Nothing persists into prod; the replica is disposable.
