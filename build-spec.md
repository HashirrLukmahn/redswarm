# RedSwarm — Autonomous Adversarial Architecture Testing Platform

## 0. Instructions to the Coding Agent

You are implementing a security-testing subsystem called **RedSwarm** inside or alongside an existing fintech application.

Do not rewrite the existing application architecture unnecessarily.

First inspect the repository and determine:

* framework
* frontend framework
* backend framework
* package manager
* database
* authentication system
* API organization
* existing tests
* deployment structure
* whether the backend is long-lived or serverless
* whether Convex is already installed

Preserve existing conventions wherever reasonable.

Before modifying code:

1. Read this entire specification.
2. Inspect the repository.
3. Produce a short implementation plan mapping this specification onto the existing codebase.
4. Identify assumptions.
5. Begin implementation without waiting for approval unless something would risk deleting existing data.
6. Implement incrementally and keep the application runnable throughout.
7. Run type checking, linting, unit tests, and relevant integration tests after each major phase.
8. Never put API keys into source control.

The security-testing system MUST only operate against explicitly configured staging/sandbox targets owned by the application operator.

Do not implement:

* arbitrary internet target scanning
* port scanning
* credential stuffing
* password spraying
* malware execution
* arbitrary shell execution
* unrestricted browser JavaScript execution
* arbitrary SSRF
* exploit-kit payload libraries
* automatic persistence mechanisms
* data exfiltration
* destructive production testing

This system is designed for **controlled adversarial testing of the owner's own fintech application**.

---

# 1. Product Goal

Build an autonomous adversarial architecture-testing system that can launch up to approximately 100 independently prompted AI security workers against a controlled fintech staging environment.

The system should answer:

> "What sequences of valid or near-valid actions can cause this financial application to violate one of the invariants its architecture depends on?"

The system is NOT primarily a traditional CVE scanner.

Its primary targets are:

* financial integrity failures
* idempotency failures
* authorization boundary failures
* tenant isolation failures
* workflow/business-logic abuse
* invalid state transitions
* concurrency problems
* partial-failure problems
* retry problems
* stale state
* session lifecycle weaknesses
* privacy boundary violations
* inconsistent distributed state
* AI-agent authority problems
* architectural trust-boundary problems

The product should:

1. Understand the application's declared architecture.
2. Understand financial/security invariants.
3. Generate diverse attack hypotheses.
4. Safely design experiments against staging.
5. Execute permitted experiments.
6. Capture evidence.
7. Independently verify candidate findings.
8. Reject false positives.
9. Deduplicate related findings.
10. Identify shared architectural root causes.
11. Propose architectural remediation.
12. Visualize the entire swarm in realtime.
13. Measure inference performance under agent concurrency.

---

# 2. Product Philosophy

RedSwarm is built around:

## Invariant falsification

Do not ask:

> "Can you find a vulnerability?"

Ask:

> "Can you construct a counterexample to this invariant?"

Example:

```text
Invariant:
Every externally executed transfer corresponds to exactly
one durable internal ledger transaction.

Agent goal:
Find a permitted sequence of operations where the invariant
does not hold.
```

This makes agents reason about actual fintech architecture rather than generic security buzzwords.

---

# 3. Core Financial Invariants

Create an invariant registry.

Seed the system with generic invariants but allow application-specific invariants to be added.

Initial examples:

### FI-001 — Conservation of funds

A test workflow must never create or destroy synthetic money unless an explicitly modeled deposit, withdrawal, fee, adjustment, or external transfer accounts for the difference.

### FI-002 — Exactly-once economic effect

A logical financial transaction must never cause more than one economic effect even if requests are retried.

### FI-003 — Ledger traceability

Every balance-changing action must have a durable, auditable ledger representation.

### FI-004 — Tenant isolation

A principal belonging to tenant A cannot observe or mutate tenant B's financial resources.

### FI-005 — Ownership authorization

User A cannot view or mutate resources belonging solely to User B.

### FI-006 — Revocation

Once a session, credential, membership, or authorization grant is revoked, it cannot authorize new protected actions.

### FI-007 — State validity

A financial entity may transition only through explicitly valid state transitions.

### FI-008 — Idempotent external events

Replayed webhooks, callbacks, queue messages, or retryable requests must not generate duplicate economic outcomes.

### FI-009 — Audit consistency

A successful sensitive operation must generate the required audit event.

### FI-010 — Atomic authorization

Authorization decisions must remain valid through the corresponding state mutation or be safely revalidated.

### FI-011 — Privacy

Financial information visible to one identity must not reveal protected information belonging to another identity without authorization.

### FI-012 — Bounded agent authority

An AI component cannot cause effects outside the capabilities delegated to the user or workflow that invoked it.

Represent invariants in configuration rather than hard coding them.

---

# 4. High-Level Architecture

Implement five planes.

```text
                 ┌──────────────────────────┐
                 │        CONTROL UI        │
                 │     /security-lab        │
                 └────────────┬─────────────┘
                              │
                              ▼
                 ┌──────────────────────────┐
                 │      CONTROL PLANE       │
                 │                          │
                 │ Run Manager              │
                 │ Policy Engine            │
                 │ Scheduler                │
                 │ Budget Manager           │
                 │ Kill Switch              │
                 └────────────┬─────────────┘
                              │
               ┌──────────────┴───────────────┐
               │                              │
               ▼                              ▼
     ┌──────────────────┐           ┌──────────────────┐
     │ REASONING PLANE  │           │ EXECUTION PLANE  │
     │                  │           │                  │
     │ GMI Cloud        │           │ Staging API      │
     │ Gemini           │           │ Apify Browser    │
     │ Exa intelligence │           │ State Inspector  │
     └────────┬─────────┘           └────────┬─────────┘
              │                              │
              └──────────────┬───────────────┘
                             ▼
                  ┌────────────────────┐
                  │ EVIDENCE / STATE   │
                  │                    │
                  │ Convex             │
                  │ findings           │
                  │ events             │
                  │ metrics            │
                  │ agent state        │
                  └─────────┬──────────┘
                            │
                            ▼
                  ┌────────────────────┐
                  │ ANALYSIS PLANE     │
                  │                    │
                  │ Verifiers          │
                  │ Skeptics           │
                  │ Root-cause agents  │
                  │ Architect agent    │
                  └────────────────────┘
```

---

# 5. Important Architectural Rule: Agents Are Tasks

Do NOT implement 100 persistent autonomous processes.

An agent is:

```ts
interface AgentTask {
  id: string;
  runId: string;
  role: AgentRole;
  objective: string;
  context: AgentContext;
  allowedCapabilities: Capability[];
  status: AgentTaskStatus;
}
```

The scheduler may create 100 AgentTasks, but execution happens through bounded worker pools.

Example:

```text
Logical agents:          100
GMI concurrency:          25
API experiment concurrency: 10
Apify browser concurrency:  3
Verifier concurrency:       8
```

All values must be configurable.

---

# 6. Concurrency Architecture

Use independent semaphores.

Recommended abstraction:

```ts
class ConcurrencyManager {
  model;
  browser;
  api;
  verification;
  research;
}
```

Each should expose:

```ts
run<T>(fn: () => Promise<T>): Promise<T>
```

Suitable implementation:

* `p-limit`
* a small custom semaphore
* existing job system if repository already has one

Environment defaults:

```env
REDSWARM_AGENT_COUNT=100

REDSWARM_MODEL_CONCURRENCY=20
REDSWARM_API_CONCURRENCY=8
REDSWARM_BROWSER_CONCURRENCY=3
REDSWARM_RESEARCH_CONCURRENCY=4
REDSWARM_VERIFIER_CONCURRENCY=6

REDSWARM_MAX_MODEL_CALLS_PER_RUN=750
REDSWARM_MAX_TOOL_CALLS_PER_RUN=1000
REDSWARM_MAX_RUN_MINUTES=15
```

Do not assume these are safe maximums.

They are configurable initial limits.

GMI currently documents organization-level TPM limits rather than promising unlimited concurrent requests, so the scheduler must handle rate limits and backpressure.

---

# 7. Provider Abstraction

Create a model-provider interface.

```ts
export interface ModelProvider {
  generateStructured<T>(params: {
    model: string;
    system: string;
    prompt: string;
    schema: ZodSchema<T>;
    temperature?: number;
    metadata?: InvocationMetadata;
  }): Promise<ModelResult<T>>;

  streamStructured?<T>(...): Promise<ModelResult<T>>;
}
```

Implement:

```text
GMIProvider
GeminiProvider
MockProvider
```

Do NOT reference GMI directly inside agent logic.

Agent logic should depend on `ModelProvider`.

---

# 8. GMI Cloud Adapter

GMI is the primary swarm inference provider.

Use an OpenAI-compatible client or direct HTTP client against the GMI inference endpoint.

The current GMI documentation exposes:

```text
POST /v1/chat/completions
```

and documents:

* `tools`
* `response_format`
* `stream`
* token `usage`

Use JSON mode when applicable:

```json
{
  "response_format": {
    "type": "json_object"
  }
}
```

Validate every response again locally with Zod.

Never trust model JSON merely because JSON mode was requested.

### Capture these metrics for every inference

```ts
interface ModelInvocationMetric {
  invocationId: string;
  runId: string;
  agentId: string;

  provider: string;
  model: string;

  queuedAt: number;
  startedAt: number;
  firstTokenAt?: number;
  finishedAt: number;

  queueLatencyMs: number;
  ttftMs?: number;
  totalLatencyMs: number;

  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;

  retryCount: number;
  status: "success" | "error" | "rate_limited";
  errorType?: string;
}
```

If streaming is enabled, capture time-to-first-token from the first response chunk.

GMI documents streaming support and usage statistics in the completion response/final stream chunk.

### Backoff

Handle HTTP 429 using exponential backoff plus jitter.

Do NOT immediately retry all 100 workers simultaneously.

---

# 9. Threat Swarm Composition

For a 100-worker run, create approximately:

```text
12 Financial Integrity Agents
12 Authorization / Tenant Boundary Agents
12 State-Machine Agents
12 Concurrency / Idempotency Agents
10 Privacy Agents
10 Workflow Abuse Agents
8 Distributed-Failure Agents
6 Session / Identity Lifecycle Agents
6 Architecture Trust-Boundary Agents
6 AI Authority Agents
6 Wildcard Adversarial Thinkers
--------------------------------
100 hypothesis workers
```

These are hypothesis generators.

Verification tasks are spawned separately.

The agent count therefore refers to the initial attack swarm, not necessarily total LLM calls.

---

# 10. Agent Role Definitions

Create role templates under:

```text
security/prompts/roles/
```

Each role should contain:

```ts
interface AgentRoleDefinition {
  id: AgentRole;
  name: string;
  mission: string;
  reasoningLens: string[];
  forbiddenActions: string[];
  preferredInvariants: string[];
}
```

## Financial Integrity Agent

Mission:

Find sequences of legitimate application operations that could create:

* duplicated economic effect
* missing economic effect
* inconsistent balance
* inconsistent ledger
* orphaned transaction
* mismatched internal/external state

Focus especially on:

* retries
* duplicate submission
* asynchronous completion
* cancellation
* reversal
* refund
* partial failure

Do not generate arbitrary exploit payloads.

---

## Authorization Agent

Mission:

Find inconsistencies between identity, role, tenant, ownership, and permitted resources.

Reason about personas such as:

* User A
* User B
* tenant admin
* ordinary tenant user
* deactivated user
* recently downgraded user
* invited but not fully activated user

---

## State-Machine Agent

Mission:

Infer important entity state machines and attempt to identify sequences that could reach logically invalid states.

Examples of entities:

* payment
* transfer
* withdrawal
* deposit
* loan
* application
* account
* approval
* settlement

The output should describe state transitions, not exploit code.

---

## Concurrency Agent

Mission:

Identify operations whose correctness may depend on ordering, locking, atomicity, or stale reads.

Generate controlled concurrent experiment hypotheses.

---

## Workflow Abuse Agent

Mission:

Assume every individual endpoint works exactly as designed.

Find ways that multiple legitimate capabilities can be combined into an unintended economic or authorization outcome.

This is one of the most important roles.

---

## Distributed Failure Agent

Mission:

Assume network operations can:

* timeout
* be delayed
* return after caller timeout
* be retried
* arrive out of order
* partially succeed

Look for architectural assumptions that become unsafe.

---

## Wildcard Agent

Mission:

Find a failure mode the other specialist categories are unlikely to consider.

It must still operate within declared invariants and permitted tool capabilities.

---

# 11. Agent Context Pack

Every hypothesis agent receives a sanitized context object:

```ts
interface AgentContext {
  architecture: ArchitectureSnapshot;
  invariants: SecurityInvariant[];
  apiSurface: ApiSurfaceSummary;
  personas: TestPersona[];
  knownFindings: FindingSummary[];
  runScope: PublicRunScope;
  threatFamily: string;
}
```

Do NOT provide secrets.

Do NOT provide real customer information.

Do NOT give agents raw infrastructure credentials.

---

# 12. Architecture Snapshot

Create a machine-readable architecture model:

```ts
interface ArchitectureSnapshot {
  applicationName: string;

  components: ArchitectureComponent[];
  edges: ArchitectureEdge[];

  dataStores: DataStore[];
  externalProviders: ExternalProvider[];

  trustBoundaries: TrustBoundary[];

  authentication?: AuthenticationDescription;
  authorization?: AuthorizationDescription;

  financialEntities: FinancialEntity[];
}
```

Example component:

```ts
{
  id: "payments-service",
  type: "service",
  description: "Executes external payments",
  dataClassification: ["financial"],
  trustZone: "backend"
}
```

Example edge:

```ts
{
  from: "api",
  to: "payments-service",
  protocol: "HTTP",
  asynchronous: false
}
```

Allow the architecture snapshot to be populated manually first.

Automatic architecture extraction can come later.

---

# 13. Scope Manifest — Mandatory Safety Boundary

No run can start without a ScopeManifest.

```ts
interface ScopeManifest {
  environment: "local" | "staging";

  targetOrigin: string;

  allowedHosts: string[];

  allowedApiPrefixes: string[];

  deniedApiPrefixes: string[];

  testPersonaIds: string[];

  syntheticDataOnly: true;

  maxRequestsPerSecond: number;

  maxRequestsPerRun: number;

  maxBrowserSessions: number;

  allowMutation: boolean;

  allowConcurrencyExperiments: boolean;

  allowExternalProviderCalls: boolean;

  ownershipVerificationToken?: string;
}
```

Production must be impossible to select in the initial implementation.

There should literally be no `"production"` enum value.

---

# 14. Ownership / Staging Verification

Strongly prefer adding a staging-only endpoint such as:

```text
GET /.well-known/redswarm-target
```

It should return:

```json
{
  "environment": "staging",
  "testingEnabled": true,
  "targetId": "..."
}
```

Require a shared test token or other staging-only verification mechanism.

Before a run:

1. Parse target URL.
2. Require HTTPS except localhost.
3. Compare hostname to exact allowlist.
4. Resolve redirects safely.
5. Verify staging marker.
6. Verify target identity.
7. Refuse to start if verification fails.

The HTTP execution layer must also enforce these checks on EVERY request.

Never rely solely on the initial check.

---

# 15. Redirect Policy

All HTTP and browser redirects must remain within allowed hosts.

If:

```text
allowed:
staging.example.com
```

and response redirects to:

```text
other-site.example
```

terminate that step and create:

```text
TOOL_BLOCKED_OUT_OF_SCOPE
```

Do not follow it.

---

# 16. Capability-Based Agent Permissions

Agents must never receive unrestricted tools.

Implement capabilities:

```ts
type Capability =
  | "READ_ARCHITECTURE"
  | "SEARCH_SECURITY_RESEARCH"
  | "READ_STAGING"
  | "MUTATE_SYNTHETIC_DATA"
  | "RUN_CONCURRENT_SCENARIO"
  | "USE_BROWSER"
  | "READ_TEST_LEDGER"
  | "VERIFY_FINDING";
```

A role gets only necessary capabilities.

Example:

```text
Threat Researcher:
SEARCH_SECURITY_RESEARCH
READ_ARCHITECTURE

Hypothesis Agent:
READ_ARCHITECTURE

Experiment Executor:
READ_STAGING
MUTATE_SYNTHETIC_DATA

Verifier:
READ_STAGING
VERIFY_FINDING
```

---

# 17. Tool Gateway

All execution must flow through one ToolGateway.

```ts
interface ToolGateway {
  execute(
    agent: AgentIdentity,
    call: ToolCall
  ): Promise<ToolResult>;
}
```

ToolGateway responsibilities:

1. verify capability
2. validate scope
3. validate run budget
4. validate rate limit
5. sanitize input
6. execute
7. sanitize output
8. save evidence
9. emit event
10. update budget

Agents never directly call `fetch`.

Agents never directly call Apify.

Agents never directly call external services.

---

# 18. Initial Tool Set

Implement only:

```text
security.searchResearch
staging.request
staging.readState
browser.runScenario
experiment.delay
experiment.parallel
evidence.record
```

Avoid generic names like:

```text
shell
terminal
executeCode
rawBrowserEval
scanNetwork
```

They are unnecessary.

---

# 19. Safe Staging API Tool

Create:

```ts
interface StagingRequest {
  personaId: string;

  method:
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE";

  path: string;

  body?: unknown;

  headers?: Record<string, string>;
}
```

Before execution:

* path must match allowed prefix
* hostname is injected server-side, never model controlled
* auth is injected server-side from persona vault
* model cannot provide Authorization header
* model cannot provide Host header
* model cannot override test headers
* external redirects blocked

Credentials should be addressed by persona ID:

```text
persona_customer_a
persona_customer_b
persona_org_admin
persona_revoked_user
```

not exposed to the model.

---

# 20. Experiment DSL

The LLM must not directly execute tools while generating hypotheses.

First generate an `ExperimentPlan`.

```ts
interface ExperimentPlan {
  id: string;

  hypothesisId: string;

  title: string;

  invariantId: string;

  risk:
    | "READ_ONLY"
    | "SYNTHETIC_MUTATION"
    | "CONTROLLED_CONCURRENCY";

  preconditions: string[];

  actors: string[];

  steps: ExperimentStep[];

  expectedSafeOutcome: string;

  violationSignal: string;

  cleanupStrategy?: string;

  rationale: string;
}
```

Steps:

```ts
type ExperimentStep =
  | ApiStep
  | BrowserStep
  | DelayStep
  | ParallelStep
  | StateInspectionStep;
```

A policy engine must approve the plan before execution.

---

# 21. Policy Engine

Implement:

```ts
interface PolicyDecision {
  allowed: boolean;
  reasons: string[];
  blockedStepIndexes?: number[];
}
```

Policy checks:

* target scope
* allowed capability
* allowed persona
* permitted route
* permitted risk level
* request budget
* concurrency budget
* mutation setting
* no real customer identifiers
* no secret-bearing headers
* no arbitrary URL
* no arbitrary shell/code execution

A denied experiment remains visible in the UI as:

```text
BLOCKED_BY_POLICY
```

This is actually useful for the demo because it shows the agents are constrained.

---

# 22. Hypothesis Schema

Every attacker returns:

```ts
interface AttackHypothesis {
  id: string;

  agentId: string;

  title: string;

  threatFamily: string;

  invariantId: string;

  architecturalAssumption: string;

  proposedFailureMode: string;

  prerequisites: string[];

  affectedComponents: string[];

  confidence: number;

  noveltyReason: string;

  proposedExperiment: ExperimentPlanDraft;
}
```

Require structured output.

Reject malformed model responses.

---

# 23. Hypothesis Generation Prompt Contract

System prompt concept:

```text
You are one member of a controlled adversarial architecture
testing swarm.

Your job is not to compromise arbitrary systems.

You are testing an explicitly authorized staging environment.

Your objective is to identify a plausible counterexample to one
or more declared security/financial invariants.

Think primarily about architectural and workflow failures.

Prefer hypotheses involving interactions between components or
operations over generic vulnerability names.

Do not invent evidence.

Do not claim a weakness exists until an experiment verifies it.

Do not generate malware, persistence, credential theft, scanning,
or actions outside the supplied scope.

Return only the required structured output.
```

Each role gets an additional specialist prompt.

---

# 24. Diversity Mechanism

100 nearly identical prompts are wasteful.

Each agent receives a `diversitySeed`.

Examples:

```text
Focus on temporal ordering.
Focus on user lifecycle changes.
Focus on asynchronous boundaries.
Focus on operations succeeding after caller timeout.
Focus on stale authorization.
Focus on multiple legitimate features composed together.
Focus on accounting reconciliation.
Focus on retry behavior.
Focus on state transitions.
Focus on unusual but realistic user behavior.
```

Generate seeds deterministically so runs are reproducible.

---

# 25. Deduplication Pipeline

Do not execute every generated hypothesis.

Pipeline:

```text
100 hypotheses
      ↓
normalization
      ↓
cheap semantic grouping
      ↓
skeptic/dedup agents
      ↓
unique executable hypotheses
```

Create fingerprint:

```ts
fingerprint = hash(
  invariantId +
  sorted(affectedComponents) +
  normalizedFailureMode
)
```

Then optionally use an LLM judge to merge semantically equivalent hypotheses.

Target:

```text
100 generated
30-60 unique
10-25 selected for execution
```

Selection criteria:

```text
score =
  plausibility
  * impact
  * novelty
  * testability
  * architectural relevance
```

---

# 26. Skeptic Agents

Before spending browser/API resources, send promising hypotheses to skeptic agents.

Skeptic output:

```ts
interface SkepticReview {
  hypothesisId: string;

  plausible: boolean;

  likelyExistingControl?: string;

  missingAssumptions: string[];

  recommendedExperimentChanges: string[];

  confidence: number;
}
```

A skeptic must try to explain why the architecture may already be safe.

This reduces confirmation bias.

---

# 27. Experiment Executor

Executor flow:

```text
ExperimentPlan
      ↓
Policy Engine
      ↓
Approved
      ↓
Acquire tool semaphore
      ↓
Create baseline snapshot
      ↓
Execute steps
      ↓
Create post-state snapshot
      ↓
Evaluate violation signal
      ↓
Persist evidence
```

Executor itself should NOT decide whether the vulnerability is verified.

It only records observations.

---

# 28. Evidence Model

```ts
interface EvidenceRecord {
  id: string;

  runId: string;
  hypothesisId: string;
  experimentId: string;

  timestamp: number;

  type:
    | "http"
    | "browser"
    | "state"
    | "metric"
    | "event";

  summary: string;

  sanitizedRequest?: unknown;
  sanitizedResponse?: unknown;

  beforeState?: unknown;
  afterState?: unknown;

  screenshotRef?: string;

  hash?: string;
}
```

Always redact:

* access tokens
* session cookies
* passwords
* API keys
* real account numbers
* customer PII

---

# 29. Verification Pipeline

Candidate failure:

```text
observation
    ↓
Verifier A
    ↓
independent reproduction
    ↓
Verifier B if severe
    ↓
finding
```

Severity policy:

```text
LOW:
1 independent verifier

MEDIUM:
1 independent verifier

HIGH:
2 reproductions preferred

CRITICAL:
2 independent verifier paths required
```

A finding cannot reach `VERIFIED` merely because the attacker believes it succeeded.

---

# 30. Finding Lifecycle

```ts
type FindingStatus =
  | "HYPOTHESIS"
  | "EXPERIMENTING"
  | "OBSERVED"
  | "VERIFYING"
  | "VERIFIED"
  | "REJECTED"
  | "DUPLICATE"
  | "BLOCKED";
```

State transitions must be enforced in code.

---

# 31. Verified Finding Schema

```ts
interface VerifiedFinding {
  id: string;

  runId: string;

  title: string;

  invariantId: string;

  status: "VERIFIED";

  severity:
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "CRITICAL";

  threatFamily: string;

  affectedComponents: string[];

  architecturalRootCause?: string;

  reproductionSummary: string;

  evidenceIds: string[];

  verifierIds: string[];

  blastRadius: BlastRadius;

  remediationStatus:
    | "PENDING"
    | "PROPOSED"
    | "REVIEWED";
}
```

---

# 32. Blast Radius

Do not rely solely on CVSS.

Add:

```ts
interface BlastRadius {
  fundsIntegrity: number;
  confidentiality: number;
  authorization: number;
  availability: number;
  auditability: number;
  regulatoryExposure: number;
  exploitComplexity: number;
}
```

Values:

```text
0-10
```

Show this graphically.

---

# 33. Exa Threat Intelligence Layer

Use Exa only for research agents.

Exa currently exposes search and content-retrieval APIs intended for retrieving web information for model workflows.

Threat research queries should seek:

* architectural failure patterns
* fintech incident postmortems
* defensive guidance
* security research
* relevant OWASP categories
* vendor security advisories
* distributed-systems failure patterns

Avoid searching for:

* exploit kits
* stolen credentials
* target-specific compromise instructions

Example:

```text
Find defensive security research and public postmortems
about duplicate financial processing caused by retries,
webhook replay, message redelivery, or non-idempotent
distributed workflows.
```

Research output:

```ts
interface ThreatResearch {
  topic: string;

  patterns: {
    name: string;
    summary: string;
    sourceUrls: string[];
    architecturalLesson: string;
  }[];
}
```

Threat research becomes INPUT to hypothesis agents.

It is never treated as proof that the application is vulnerable.

---

# 34. Apify Browser Execution

Use Apify as the browser execution layer.

Apify Actors are serverless jobs receiving structured JSON input, and Apify documents browser automation using Playwright as well as Actor-run APIs.

Create an RedSwarm browser Actor or equivalent integration.

Input:

```ts
interface BrowserScenarioInput {
  allowedOrigin: string;
  personaId: string;
  steps: SafeBrowserStep[];
  runId: string;
  experimentId: string;
}
```

Safe steps:

```ts
type SafeBrowserStep =
  | {
      action: "navigate";
      path: string;
    }
  | {
      action: "click";
      locator: string;
    }
  | {
      action: "fill";
      locator: string;
      valueRef: string;
    }
  | {
      action: "wait";
      milliseconds: number;
    }
  | {
      action: "read";
      locator: string;
    }
  | {
      action: "screenshot";
      label: string;
    };
```

Do NOT provide:

```text
evalJavascript
executeShell
navigateArbitraryUrl
downloadAndExecute
```

The Actor should:

1. authenticate using server-provided test persona credentials
2. enforce allowed origin
3. perform steps
4. capture screenshots when requested
5. return sanitized observations

Keep browser concurrency very low compared with inference concurrency.

---

# 35. Convex Role

Convex is the realtime coordination/state plane.

Use it for:

* runs
* agent tasks
* events
* hypotheses
* experiments
* evidence metadata
* findings
* model metrics
* tool metrics
* remediation objects

Convex's realtime query model is appropriate for updating the dashboard as run state changes. Convex also currently provides Workflow/Workpool primitives for durable long-running flows, retries, and parallelism control if the host environment requires them.

Do NOT migrate the existing fintech database to Convex.

RedSwarm state is separate from the application's transactional financial state.

---

# 36. Convex Schema

Implement equivalent tables:

```text
securityRuns
securityAgents
securityEvents
securityHypotheses
securityExperiments
securityEvidence
securityFindings
securityModelMetrics
securityToolMetrics
securityRemediations
```

Index heavily by:

```text
runId
agentId
hypothesisId
findingId
status
createdAt
```

---

# 37. Run State Machine

```text
CREATED
   ↓
VALIDATING_SCOPE
   ↓
RESEARCHING
   ↓
GENERATING_HYPOTHESES
   ↓
DEDUPLICATING
   ↓
PLANNING_EXPERIMENTS
   ↓
EXECUTING
   ↓
VERIFYING
   ↓
ROOT_CAUSE_ANALYSIS
   ↓
REMEDIATING
   ↓
COMPLETED
```

Exceptional:

```text
FAILED
CANCELLED
POLICY_BLOCKED
BUDGET_EXHAUSTED
```

Persist transitions.

---

# 38. Event System

Everything emits a SecurityEvent.

```ts
interface SecurityEvent {
  id: string;
  runId: string;
  timestamp: number;

  type: SecurityEventType;

  agentId?: string;
  hypothesisId?: string;
  experimentId?: string;
  findingId?: string;

  title: string;
  metadata?: unknown;
}
```

Example events:

```text
RUN_STARTED
SCOPE_VERIFIED
AGENT_STARTED
AGENT_COMPLETED
HYPOTHESIS_CREATED
HYPOTHESIS_MERGED
EXPERIMENT_STARTED
TOOL_CALL_STARTED
TOOL_CALL_BLOCKED
EVIDENCE_CAPTURED
CANDIDATE_FINDING
VERIFICATION_STARTED
FINDING_REJECTED
FINDING_VERIFIED
REMEDIATION_CREATED
RUN_COMPLETED
```

The UI subscribes to these.

---

# 39. Gemini Chief Security Architect

Use Gemini only after verified findings exist.

Do NOT spend Gemini calls on the entire attacker swarm.

Current Gemini APIs support structured outputs and function calling; use structured output for the architecture-analysis result.

Input:

```text
ArchitectureSnapshot
VerifiedFinding[]
SecurityInvariant[]
ThreatResearch[]
```

Output:

```ts
interface ArchitectureAssessment {
  systemicRootCauses: SystemicRootCause[];

  recommendations: ArchitectureRecommendation[];

  prioritizedRoadmap: RemediationPriority[];

  executiveSummary: string;

  architectureMermaid?: string;
}
```

A systemic root cause should be able to connect multiple findings:

```text
Finding 12: duplicate payment
Finding 18: webhook replay
Finding 27: retry inconsistency

        ↓

Root cause:

Economic side effects lack a shared durable
idempotency boundary.
```

This is the defining architectural-remediation feature.

---

# 40. Architecture Recommendation Schema

```ts
interface ArchitectureRecommendation {
  id: string;

  title: string;

  addressesFindingIds: string[];

  rootCause: string;

  currentRisk: string;

  proposedChange: string;

  affectedComponents: string[];

  implementationComplexity:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  expectedRiskReduction:
    | "LOW"
    | "MEDIUM"
    | "HIGH";

  migrationNotes: string[];

  validationPlan: string[];

  mermaidDiagram?: string;
}
```

Never automatically modify the production architecture.

Recommendations require human review.

---

# 41. Optional WorkOS Testing

WorkOS is NOT required for the first MVP.

If WorkOS is already present or added later, create synthetic organizations and membership states to test:

* tenant boundaries
* role changes
* inactive memberships
* revoked sessions
* organization switching
* permissions

WorkOS currently models organization memberships, roles/permissions, and session lifecycle, making these useful controlled identity states.

Keep this behind an optional adapter:

```text
IdentityTestProvider
    ├── ExistingAppIdentityProvider
    └── WorkOSIdentityProvider
```

Do not couple RedSwarm to WorkOS.

---

# 42. Test Personas

Create a persona vault.

Example personas:

```text
customer_a
customer_b
customer_c

org_a_admin
org_a_member

org_b_admin
org_b_member

revoked_user
downgraded_user
pending_user
```

Agent context receives:

```json
{
  "id": "customer_a",
  "description": "ordinary customer"
}
```

It does NOT receive credentials.

ToolGateway resolves persona IDs to staging credentials.

---

# 43. Financial Test Data

All tests must use synthetic accounts.

Create labels like:

```text
REDSWARM_TEST_ACCOUNT_A
REDSWARM_TEST_ACCOUNT_B
REDSWARM_TEST_ORG_A
```

Never discover random customer IDs.

Prefer resetting the synthetic fixture set before every full run.

Implement:

```ts
resetRedSwarmFixtures()
```

if feasible.

---

# 44. Swarm Orchestration Algorithm

Primary algorithm:

```text
START RUN

1. Validate ScopeManifest
2. Verify staging target
3. Load ArchitectureSnapshot
4. Load invariants
5. Load test personas
6. Run small Exa research fanout
7. Create 100 hypothesis tasks
8. Execute hypothesis tasks through GMI semaphore
9. Persist all hypotheses
10. Deduplicate
11. Rank
12. Send top hypotheses through skeptic pass
13. Convert surviving hypotheses into ExperimentPlans
14. Run policy evaluation
15. Execute approved plans
16. Record observations
17. Create candidate findings
18. Independently verify candidates
19. Mark verified/rejected
20. Cluster verified findings
21. Invoke Chief Architect
22. Produce remediations
23. Calculate inference statistics
24. Mark run complete
```

---

# 45. Pseudocode

```ts
async function runSecuritySwarm(config: RunConfig) {
  const run = await createRun(config);

  try {
    await validateAndVerifyScope(run);

    const context = await buildSecurityContext(run);

    const research = await runThreatResearch(context);

    const agentTasks = buildHypothesisSwarm({
      count: config.agentCount,
      context,
      research,
    });

    const hypotheses = await Promise.all(
      agentTasks.map(task =>
        concurrency.model.run(() =>
          runHypothesisAgent(task)
        )
      )
    );

    const unique = await deduplicateHypotheses(hypotheses);

    const ranked = rankHypotheses(unique);

    const reviewed = await runSkepticPass(ranked);

    const executable =
      await generateApprovedExperimentPlans(reviewed);

    const observations = [];

    for (const plan of executable) {
      const policy = await policyEngine.evaluate(plan);

      if (!policy.allowed) {
        await markBlocked(plan, policy);
        continue;
      }

      observations.push(
        await executeExperiment(plan)
      );
    }

    const candidates =
      await evaluateObservations(observations);

    const findings =
      await independentlyVerify(candidates);

    const verified =
      findings.filter(f => f.status === "VERIFIED");

    const assessment =
      await runArchitectureAssessment({
        architecture: context.architecture,
        findings: verified,
        invariants: context.invariants,
      });

    await completeRun(run, {
      findings,
      assessment,
    });
  } catch (error) {
    await failRun(run, error);
    throw error;
  }
}
```

Improve execution fanout later, but prioritize correctness first.

---

# 46. Kill Switch

Every run UI must have:

```text
STOP SWARM
```

Implement a cancellation flag:

```ts
securityRuns.cancelRequested
```

Every scheduling boundary checks it.

When set:

* do not schedule new model calls
* do not schedule new tool calls
* cancel queued work
* abort supported HTTP calls
* request cancellation of outstanding browser jobs where feasible

Persist:

```text
RUN_CANCEL_REQUESTED
RUN_CANCELLED
```

---

# 47. Budgets

Each run has:

```ts
interface RunBudget {
  maxModelCalls: number;
  maxToolCalls: number;
  maxBrowserRuns: number;
  maxTokens?: number;
  maxDurationMs: number;
  maxRequests: number;
}
```

Every relevant operation decrements the corresponding budget.

Once exhausted:

```text
BUDGET_EXHAUSTED
```

Stop scheduling additional tasks.

---

# 48. GMI Performance Experiment

The security product doubles as an agent-inference benchmark.

Calculate:

```text
total model calls
successful calls
failed calls
rate-limited calls

peak active model calls

p50 queue latency
p95 queue latency

p50 TTFT
p95 TTFT

p50 total latency
p95 total latency

prompt tokens
completion tokens
total tokens

approximate completion tokens/sec

verified findings / 100 agents
verified findings / 100 model calls
```

Add selectable swarm profiles:

```text
10 agents
25 agents
50 agents
100 agents
```

Optional:

```text
CHAOS MODE
```

should mean:

> ramp logical inference concurrency aggressively within configured safety limits

It must NOT mean unrestricted application traffic.

---

# 49. Concurrency Ramp

Optional benchmark mode:

```text
Wave 1: 10 workers
Wave 2: 25 workers
Wave 3: 50 workers
Wave 4: 100 logical workers
```

Record infrastructure metrics per wave.

This allows a graph:

```text
p95 inference latency
        vs
active logical swarm size
```

---

# 50. Dashboard

Create:

```text
/security-lab
/security-lab/runs/[runId]
```

## Start-run page

Fields:

```text
Run name
Target
Agent count
Model
Model concurrency
Browser concurrency
Risk mode
Threat families
Max duration
```

Risk modes:

```text
OBSERVE_ONLY

SANDBOX_MUTATING

CONTROLLED_CONCURRENCY
```

Default:

```text
OBSERVE_ONLY
```

---

# 51. Live Swarm UI

Show 100 dots/cards.

Example:

```text
● ● ● ● ● ● ● ● ● ●
● ● ● ● ● ● ● ● ● ●
● ● ● ● ● ● ● ● ● ●
...
```

States:

```text
queued
thinking
researching
testing
verifying
completed
blocked
failed
```

Do not animate excessively.

Click agent:

```text
Agent #41

Role:
Concurrency / Idempotency

Objective:
Attempt to falsify FI-002.

Status:
Completed

Hypotheses:
2

Model latency:
1.21s
```

---

# 52. Live Metrics Panel

Show:

```text
Agents started
Agents completed

Active inference calls
Peak inference concurrency

Model calls
Tokens

p50 latency
p95 latency
TTFT

Hypotheses
Unique hypotheses

Experiments executed

Candidate findings
Verified findings
Rejected findings
Blocked experiments
```

---

# 53. Finding UI

Each verified finding should contain:

```text
TITLE

Severity
Invariant violated

Affected architecture components

What happened

Why it matters

Reproduction summary

Evidence

Architectural root cause

Recommended architecture change

Validation strategy
```

Avoid dumping raw model chain-of-thought.

Show concise rationale/evidence only.

---

# 54. Architecture View

Create a simple Mermaid or React Flow view.

Nodes:

```text
frontend
API
auth
ledger
payments
database
queue
AI service
external providers
```

Highlight components referenced by verified findings.

Example:

```text
Green:
no finding

Amber:
candidate

Red:
verified architectural weakness
```

---

# 55. Security Event Timeline

Realtime stream:

```text
18:04:01  Run started
18:04:02  Target verified
18:04:04  100 agents queued
18:04:05  Agent #31 started
18:04:07  Agent #31 proposed hypothesis
18:04:11  41 duplicate hypotheses merged
18:04:18  Experiment #8 started
18:04:21  Candidate anomaly detected
18:04:28  Verification started
18:04:40  Finding #3 VERIFIED
```

This is important for the hackathon demo.

---

# 56. Suggested Repository Structure

Adapt to the existing repository rather than forcing this exact tree.

Preferred shape:

```text
security/
  agents/
    hypothesis.ts
    skeptic.ts
    verifier.ts
    architect.ts

  orchestration/
    run-manager.ts
    scheduler.ts
    concurrency.ts
    state-machine.ts
    budgets.ts

  policy/
    scope.ts
    capabilities.ts
    policy-engine.ts
    redaction.ts

  providers/
    model-provider.ts
    gmi.ts
    gemini.ts
    mock.ts
    exa.ts
    apify.ts

  tools/
    tool-gateway.ts
    staging-api.ts
    browser.ts
    state-reader.ts

  prompts/
    base.ts
    roles/
    architect.ts
    verifier.ts

  schemas/
    architecture.ts
    scope.ts
    invariant.ts
    agent.ts
    experiment.ts
    evidence.ts
    finding.ts
    metrics.ts

  services/
    deduplication.ts
    ranking.ts
    verification.ts
    remediation.ts

  fixtures/
    invariants.ts
    personas.ts

  evals/

  tests/
```

Frontend:

```text
app/security-lab/
```

or equivalent route for the existing framework.

---

# 57. Environment Variables

Create `.env.example`.

```env
# RedSwarm
REDSWARM_ENABLED=false

REDSWARM_AGENT_COUNT=25
REDSWARM_MODEL_CONCURRENCY=10
REDSWARM_API_CONCURRENCY=5
REDSWARM_BROWSER_CONCURRENCY=2
REDSWARM_VERIFIER_CONCURRENCY=4

REDSWARM_MAX_MODEL_CALLS=500
REDSWARM_MAX_TOOL_CALLS=500
REDSWARM_MAX_RUN_MINUTES=15

REDSWARM_TARGET_ORIGIN=
REDSWARM_ALLOWED_HOSTS=
REDSWARM_STAGING_VERIFICATION_TOKEN=

# GMI
GMI_API_KEY=
GMI_BASE_URL=https://api.gmi-serving.com/v1
GMI_MODEL=

# Exa
EXA_API_KEY=

# Apify
APIFY_API_TOKEN=
APIFY_REDSWARM_ACTOR_ID=

# Gemini
GEMINI_API_KEY=
GEMINI_ARCHITECT_MODEL=

# Convex
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
```

No secrets may use `NEXT_PUBLIC_*` except values explicitly intended to be public.

---

# 58. Logging

Use structured logging:

```json
{
  "runId": "...",
  "agentId": "...",
  "event": "MODEL_CALL_COMPLETED",
  "provider": "gmi",
  "durationMs": 1242
}
```

Never log:

* Authorization headers
* cookies
* bearer tokens
* API keys
* passwords
* raw sensitive staging data

---

# 59. Redaction Layer

Implement recursively:

```ts
redactSensitive(value)
```

Patterns/keys:

```text
authorization
cookie
set-cookie
password
secret
token
apiKey
accessToken
refreshToken
accountNumber
routingNumber
ssn
```

Use redaction BEFORE:

* persistence
* logging
* model context
* UI rendering

---

# 60. Fintech State Inspection

If the existing app has a test-only backend state endpoint, use it.

Otherwise build a restricted staging-only adapter capable of reading synthetic:

* account balance
* ledger totals
* transaction status
* transaction counts
* audit-event counts

This enables automated invariant checking.

Do not give the model unrestricted database access.

Preferred:

```ts
interface TestStateInspector {
  accountSummary(testAccountId): Promise<AccountSummary>;

  ledgerSummary(testAccountId): Promise<LedgerSummary>;

  transactionSummary(transactionId):
    Promise<TransactionSummary>;
}
```

---

# 61. Deterministic Invariant Checks

Where possible, do NOT use an LLM to determine whether a financial invariant failed.

Example:

```ts
function checkConservation(
  before: FinancialSnapshot,
  after: FinancialSnapshot,
  modeledExternalDelta: Decimal
): InvariantCheckResult
```

Use regular code.

LLMs generate hypotheses.

Deterministic software judges objective conditions.

This dramatically improves trustworthiness.

---

# 62. Finding Confidence

Calculate:

```text
findingConfidence =
  evidenceQuality
  + independentReproduction
  + deterministicInvariantViolation
  + architecturalConsistency
```

Never make LLM confidence the only signal.

---

# 63. Testing Requirements

## Unit tests

Must cover:

```text
scope validation
host allowlisting
redirect blocking
capability checks
budget exhaustion
semaphore limits
run state transitions
finding state transitions
redaction
dedup fingerprinting
structured model parsing
invariant calculations
```

## Integration tests

Mock:

```text
GMI
Exa
Apify
Gemini
```

Verify orchestration without real API spend.

---

# 64. Security Tests for RedSwarm Itself

RedSwarm is security infrastructure and must be tested itself.

At minimum:

### External host rejection

Given:

```text
allowedHost = staging.example.com
```

attempt:

```text
example.org
```

Expected:

```text
blocked
```

### Redirect escape rejection

Staging URL responds with redirect to another host.

Expected:

```text
blocked
```

### Credential override rejection

Model provides Authorization header.

Expected:

```text
removed/rejected
```

### Capability violation

Research agent requests browser execution.

Expected:

```text
blocked
```

### Kill switch

Start queued swarm.

Cancel.

Expected:

```text
no new tool/model jobs scheduled
```

### Concurrency correctness

Create 100 fake model calls with model concurrency = 7.

Observed simultaneous executions must never exceed 7.

---

# 65. Local Development Simulator

Create a tiny fake fintech simulator for automated tests.

It should model:

```text
users
accounts
synthetic balances
transactions
roles
```

It exists solely to test RedSwarm orchestration.

Do NOT intentionally weaken the real fintech application to make the demo work.

---

# 66. MVP Implementation Order

Do this in order.

## Phase 1 — Core schemas

Implement:

```text
ScopeManifest
Invariant
AgentTask
Hypothesis
ExperimentPlan
Evidence
Finding
Metric
```

Use Zod.

---

## Phase 2 — GMI adapter

Implement:

```text
single structured call
JSON parsing
metrics
rate-limit handling
mock provider
```

Do not proceed until one structured agent response works reliably.

---

## Phase 3 — Scheduler

Implement:

```text
100 logical tasks
bounded concurrency
cancellation
budgets
metrics
```

Test using MockProvider first.

---

## Phase 4 — Hypothesis swarm

Implement approximately five roles first:

```text
money integrity
authorization
state machine
concurrency
workflow abuse
```

Generate 10-25 workers first.

Then scale to 100.

---

## Phase 5 — Dedup + ranking

Prevent unnecessary experiment execution.

---

## Phase 6 — ToolGateway

Implement:

```text
capabilities
scope validation
redaction
staging API execution
```

---

## Phase 7 — Verification

Candidate findings require independent reproduction.

---

## Phase 8 — Convex dashboard

Persist:

```text
runs
agents
events
hypotheses
findings
metrics
```

Build realtime UI.

---

## Phase 9 — Exa

Add defensive external threat research.

---

## Phase 10 — Apify

Add controlled browser execution.

Do not make this a blocker for the initial end-to-end demo.

---

## Phase 11 — Gemini architect

Cluster verified findings and propose architecture changes.

---

# 67. Hackathon Cut Line

If time becomes constrained, the demo MUST preserve:

```text
GMI swarm
     +
100 logical agents
     +
financial invariants
     +
hypothesis generation
     +
controlled staging tests
     +
independent verification
     +
live dashboard
     +
GMI performance metrics
```

Optional:

```text
Apify browser execution
Exa threat intelligence
Gemini architecture analysis
WorkOS identity lab
voice features
```

Do not sacrifice the core swarm to integrate every sponsor.

---

# 68. Recommended Hackathon Demo Run

Use:

```text
50-100 logical attacker agents
10-20 max concurrent GMI generations
5 API experiment workers
2 browser workers
4 verifier workers
```

Demo sequence:

```text
1. Show fintech architecture.

2. Show five financial invariants.

3. Click:

   RELEASE THE SWARM

4. 100 agents populate the screen.

5. Show hypotheses appearing.

6. Show duplicates collapsing.

7. Show controlled experiments begin.

8. Show one candidate finding.

9. Show verifier challenge it.

10. Show either:

    VERIFIED

    or

    REJECTED

11. Show architecture root cause.

12. Show proposed remediation.

13. Show GMI metrics:

    model calls
    tokens
    peak concurrency
    TTFT
    p50
    p95

14. End with:

    "Instead of asking whether our fintech
     architecture looks secure, we made
     100 adversaries try to prove that it isn't."
```

---

# 69. Demo Data Must Be Real

Do not hardcode fake security findings.

If zero vulnerabilities are discovered, show:

```text
0 verified findings
N rejected hypotheses
N experiments executed
```

That is still a valid result.

You may seed the local simulator with known test conditions for development, but do not fake findings against the real staging product.

---

# 70. Definition of Done — MVP

The MVP is complete when:

* [ ] A ScopeManifest is required.
* [ ] Production is not a valid target mode.
* [ ] Staging ownership is verified.
* [ ] Exact-host allowlisting works.
* [ ] Redirect escape is blocked.
* [ ] A GMI model adapter works.
* [ ] Structured model outputs are Zod validated.
* [ ] 100 logical agent tasks can be scheduled.
* [ ] Model concurrency is bounded.
* [ ] Rate limiting/backoff works.
* [ ] Cancellation works.
* [ ] Budgets work.
* [ ] At least five threat roles exist.
* [ ] Financial invariants exist.
* [ ] Hypotheses are persisted.
* [ ] Duplicate hypotheses are merged.
* [ ] Experiments require policy approval.
* [ ] Tools cannot bypass ToolGateway.
* [ ] Test personas hide credentials from LLMs.
* [ ] Evidence is redacted.
* [ ] Candidate findings require verification.
* [ ] Verified findings reference concrete evidence.
* [ ] Architecture remediation uses only verified findings.
* [ ] GMI latency/token metrics are recorded.
* [ ] Dashboard updates live.
* [ ] STOP SWARM cancels queued work.
* [ ] Unit tests cover scope and capability enforcement.

---

# 71. Definition of Done — Strong Hackathon Version

Additionally:

* [ ] Exa research agents are enabled.
* [ ] Apify can execute at least one controlled browser scenario.
* [ ] Gemini groups findings into architectural root causes.
* [ ] Architecture diagram highlights affected components.
* [ ] Swarm visualization displays approximately 100 workers.
* [ ] p50/p95 GMI metrics appear on dashboard.
* [ ] Agent-count presets 10/25/50/100 work.
* [ ] A complete run can execute without manual intervention.
* [ ] Every action has an audit event.

---

# 72. Engineering Principles

Prioritize, in order:

```text
1. Safety boundary correctness
2. Evidence correctness
3. Orchestration reliability
4. Financial invariant quality
5. False-positive reduction
6. Observability
7. UI polish
8. Number of integrations
```

If forced to choose between:

```text
100 flashy agents with weak evidence
```

and:

```text
30 agents with trustworthy verification
```

build the second system first.

Then scale it to 100.

---

# 73. Naming Conventions

Use:

```text
Run
AgentTask
Hypothesis
Experiment
Observation
Evidence
CandidateFinding
VerifiedFinding
ArchitectureAssessment
Recommendation
```

Do not blur:

```text
hypothesis
```

with:

```text
finding
```

A hypothesis is an idea.

A finding requires evidence.

A verified finding requires independent reproduction.

This distinction must exist throughout the codebase and UI.

---

# 74. First Coding Milestone

The first meaningful vertical slice should do exactly this:

```text
User clicks Start Run
        ↓
Scope validated
        ↓
10 GMI agents launch
        ↓
Each receives one invariant + architecture
        ↓
They return structured hypotheses
        ↓
Hypotheses persist
        ↓
UI updates live
        ↓
GMI inference metrics appear
```

Do NOT begin with Apify.

Do NOT begin with WorkOS.

Do NOT begin with elaborate architecture diagrams.

Get this vertical slice working first.

---

# 75. Second Coding Milestone

Add:

```text
hypothesis
    ↓
skeptic
    ↓
experiment planner
    ↓
policy engine
    ↓
safe staging API request
    ↓
evidence
    ↓
verifier
```

At this point RedSwarm becomes a security-testing system rather than a brainstorming swarm.

---

# 76. Third Coding Milestone

Scale:

```text
10
↓
25
↓
50
↓
100 logical agents
```

Measure:

```text
latency
TTFT
tokens
rate limiting
queue delay
peak concurrency
```

This is the primary GMI Cloud demonstration.

---

# 77. Fourth Coding Milestone

Add:

```text
Exa research
Apify browser execution
Gemini Chief Architect
```

in that order unless demo needs dictate otherwise.

---

# 78. Documentation to Generate

Once implementation works, create:

```text
docs/redswarm/ARCHITECTURE.md
docs/redswarm/THREAT_MODEL.md
docs/redswarm/ADDING_AGENT_ROLES.md
docs/redswarm/ADDING_INVARIANTS.md
docs/redswarm/SAFETY_BOUNDARIES.md
docs/redswarm/DEMO.md
```

Also create concise project instructions for whichever coding-agent environment is present.

For Claude Code, durable repository guidance belongs in `CLAUDE.md`; Claude's current documentation describes it as repository-level project context. For Codex, use the repository's existing agent-instruction mechanism rather than duplicating this entire specification into every prompt.

Keep those files concise and point them to this specification rather than duplicating thousands of lines.

---

# 79. Final Instruction

Build the system incrementally.

The first priority is NOT:

> "Make 100 agents look cool."

The first priority is:

> "Build one trustworthy adversarial reasoning → experiment → evidence → verification loop."

Once that loop is reliable, fan it out across 100 diverse hypotheses.

The architecture should make scaling the number of logical agents a configuration change rather than a rewrite.

The completed system should make this statement true:

> RedSwarm deploys a bounded swarm of specialized adversarial AI workers against an explicitly authorized fintech staging environment. The workers attempt to falsify declared financial and security invariants, execute only policy-approved experiments, capture reproducible evidence, independently verify candidate failures, identify systemic architectural root causes, and propose remediations while measuring the inference performance required to coordinate the swarm.
