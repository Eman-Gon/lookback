# API contract

## Shared response contract

Every service accepts an optional `X-Correlation-ID` request header and returns the validated or
generated ID in both the response header and a top-level `correlation_id` field. Errors use a stable
`error` envelope with `code`, `message`, and `retryable`; service-to-service calls forward the same
correlation ID. SSE streams use the same correlated event envelope.

Grant verification returns one stable code:

| Code | Meaning |
|---|---|
| `VALID` | signature, expiry, bindings, snapshot, plan hash, and current plan are valid |
| `INVALID_TOKEN` | the signature or token encoding is invalid |
| `NON_ALLOW_VERDICT` | the signed payload does not contain `ALLOW` |
| `EXPIRED` | the signed authorization has expired |
| `BINDING_MISMATCH` | the grant belongs to a different run or task |
| `PLAN_HASH_MISMATCH` | the supplied plan differs from the signed plan |
| `STALE_SNAPSHOT` | the active graph snapshot differs from the signed snapshot |
| `CURRENT_PLAN_REJECTED` | deterministic re-evaluation no longer returns `ALLOW` |

Scenario Lab public responses expose grant payload metadata, verification codes, and evidence but
never expose signed grant tokens. Tokens move only between the agent runner, executor, and intent
authority.

## Intent Authority — port 8001

### `POST /demo/reset`

Reloads the `graph-v17` fixture. The memory backend enables demo reset by default in local
development/demo environments.

### `POST /graph/reset`

Aura-compatible alias for the same deterministic seed/reset operation. The selected graph backend
is reset in one store operation. Neo4j startup seeding and this endpoint are disabled by default;
both require an explicit `DRAGBACK_DEMO_RESET_ENABLED=true` and must target a dedicated demo
database because reset deletes all nodes.

### `GET /demo/state`

Returns graph version, artifacts, relationships, and the most recent invalidation report.

### `POST /decisions/ingest`

Accepts a trusted/fixture `DecisionMutation` containing a decision, `supersedes_id`, and
`affected_scopes`. Do not send raw LLM output to this endpoint; optional extraction must first pass
exact-span validation and authenticated `TrustedDecisionContext`.

`TrustedDecisionContext` owns source, approval, authority role, confidence, effective time,
affected scopes, and supersession. Before evaluation, extracted decisions are also normalized to
`VALID` with no pre-existing invalidated scopes.

Expected approved response:

```json
{
  "applied": true,
  "reason": "Approved decision applied and affected work re-evaluated.",
  "graph_version": "graph-v18",
  "verdict": null,
  "report": {
    "affected_scopes": ["export.authorization"],
    "affected_artifact_ids": ["DEC-004", "SPEC-009", "TICKET-100", "TASK-102", "PLAN-027"],
    "upstream_chain_artifact_ids": ["DEC-018", "DEC-004", "SPEC-009", "TICKET-100"],
    "preserved_task_ids": ["TASK-101"],
    "invalidated_task_ids": ["TASK-102"],
    "needs_review_artifact_ids": ["DEC-004", "SPEC-009", "TICKET-100", "PLAN-027"],
    "stopped_work_artifact_ids": ["TASK-102", "PLAN-027"],
    "directly_mentioned_artifact_ids": [],
    "preserved_artifact_ids": ["TASK-101"],
    "evidence_refs": [
      "slack://compliance/decision-018",
      "slack://product/decision-004",
      "notion://specs/export-009",
      "linear://ticket/TICKET-100",
      "linear://ticket/TICKET-100#task-101",
      "linear://ticket/TICKET-100#task-102",
      "agent://run/RUN-27/plan/PLAN-027"
    ]
  },
  "correlation_id": "demo-run-27"
}
```

The typed Task and review fields are additive; legacy artifact lists remain for compatible
consumers. Mutation requirements must cover exactly `affected_scopes`. Any approval, authority,
confidence, shape, or scope failure returns without mutating the graph or advancing its version.

### `POST /authorize`

Accepts `run_id`, `task_id`, and a complete `AgentPlan`.

Returns an `AuthorizationResult` with verdict, reasons, mismatches, current requirements, and optional signed grant.

### `POST /grants/verify`

Accepts token, run ID, task ID, and plan. Rejects bad signatures, non-`ALLOW` payloads, expired
grants, plan-hash mismatches, stale graph versions, and currently invalid plans.

### `GET /events`

Streams an immediate `graph.state.snapshot`, followed by `graph.state.reset`,
`graph.state.changed`, or `graph.decision.reviewed` SSE events. Each event contains a monotonically
increasing ID and correlated envelope.

### Scenario Lab authority contexts

These routes are service-facing. Browser clients use the agent routes documented below.

#### `POST /scenario-lab/authority/contexts`

Creates an isolated, in-memory authority context from a server-known scenario:

```json
{
  "context_id": "ctx-csv-exports-admin-only-abc123",
  "scenario_id": "csv-exports-admin-only"
}
```

Each context owns a separate `MemoryGraphStore`, authority instance, lock, and derived signing key.
Its `graph-v17` seed contains approved role-authoritative baseline decisions for every governed
scope. It remains in memory even when the canonical authority backend is Neo4j.

#### `GET /scenario-lab/authority/contexts/{context_id}`

Returns the context graph, relationships, version, and last invalidation report. It contains no
signed token.

#### `DELETE /scenario-lab/authority/contexts/{context_id}`

Deletes a completed or canceled context. Scenario completion normally performs this cleanup.

#### `POST /scenario-lab/authority/contexts/{context_id}/mutation`

Applies the scenario definition's server-owned approved mutation. The caller cannot substitute an
arbitrary mutation.

#### `POST /scenario-lab/authority/contexts/{context_id}/authorize`

Evaluates an `AuthorizationRequest` against that context.

#### `POST /scenario-lab/authority/contexts/{context_id}/grants/verify`

Verifies a `GrantVerificationRequest` against that context's signing key and graph. Cross-context
tokens return `INVALID_TOKEN`.

## Agent Service — port 8002

### `POST /demo/reset`
Clears local run state.

### `POST /demo/reset-all`

Coordinates the presentation reset: the authority must confirm `graph-v17` before the agent clears
its local run. The frontend uses this single endpoint instead of concurrent independent resets.

### `POST /demo/start`
Loads the initial run and requests a `graph-v17` authorization. The state response retains the
immutable `initial_plan` beside `initial_grant_token`, so stale-grant verification always uses the
same plan that was originally authorized.

### `POST /demo/tests-pass`
Marks the implementation and tests as complete while preserving the active run.

### `POST /demo/recheck`
Requests reauthorization for the current plan.

### `POST /demo/replan`
Applies current requirements to the affected plan action, creates a new plan ID, and requests a new authorization.

### `GET /demo/state`
Returns current run, plan, grant, verdict, and transition history.

### `GET /events`

Streams an immediate `loop.state.snapshot`, followed by `loop.state.reset` or
`loop.state.changed` events.

### Scenario Lab

#### `GET /scenario-lab/scenarios`

Returns the 12 scenario catalog entries plus the most recent token-free result summary for each
scenario. Every catalog entry also includes a compact pre-change specification, ticket, and task
preview plus the executable initial plan. Task previews label the assertion-only expected outcome
as `preserved` or `invalidated`; those labels are presentation/evaluation metadata and never drive
authority, invalidation, or grant decisions. `corrective_actions` are typed fixture previews with
`source: "fixture"`, `representation: "plan-action"`, no graph artifact ID, and lifecycle
`fixture-preview`.

#### `GET /scenario-lab/scenarios/{scenario_id}`

Returns the complete validated definition: metadata, narrative, graph seed, initial run, approved
mutation, fixture-driven corrected plan, authority policy, presentation copy, and assertion-only
expectations.

#### `POST /scenario-lab/runs`

Starts an isolated run:

```json
{
  "scenario_id": "csv-exports-admin-only"
}
```

The response status is `201` and the stage is `authorized`. The agent has already created the
authority context over HTTP and obtained a real baseline grant. The response includes only the
grant payload, not its signed token.

#### `GET /scenario-lab/runs/{run_id}`

Returns the current token-free run view, including graph artifacts and edges, recorded events,
authorization payloads, executor results, server-owned `agent_loop_state` / `agent_history`, and
evaluation when complete. Its additive `outcome_summary` is the browser's authoritative semantic
projection:

```json
{
  "preserved_task_ids": ["TASK-101", "TASK-102", "TASK-103"],
  "invalidated_task_ids": ["TASK-104", "TASK-105"],
  "needs_review_artifact_ids": ["PLAN-027"],
  "original_plan_id": "PLAN-027",
  "original_plan_status": "NEEDS_REVIEW",
  "corrective_actions": [
    {
      "id": "ACTION-6",
      "description": "Show export controls only after an administrator role check.",
      "scopes": ["export.authorization"],
      "source": "fixture",
      "representation": "plan-action",
      "graph_artifact_id": null,
      "persisted_as_graph_artifact": false,
      "lifecycle": "authorized-plan-action"
    },
    {
      "id": "ACTION-7",
      "description": "Enforce administrator access at the export API boundary.",
      "scopes": ["export.authorization"],
      "source": "fixture",
      "representation": "plan-action",
      "graph_artifact_id": null,
      "persisted_as_graph_artifact": false,
      "lifecycle": "authorized-plan-action"
    }
  ],
  "old_grant_verification_code": "STALE_SNAPSHOT",
  "replacement_authorization_verdict": "ALLOW",
  "replacement_grant_verification_code": "VALID",
  "may_continue": true,
  "primary_provenance_path": [
    "DEC-018",
    "DEC-004",
    "SPEC-009",
    "TICKET-100",
    "TASK-104",
    "PLAN-027"
  ],
  "history_scope": "session"
}
```

`needs_review_artifact_ids` here is work-impact focused, while the mutation report retains every
partially affected graph artifact. Corrective actions remain fixture-generated plan actions rather
than persisted graph Tasks; their lifecycle is `fixture-preview` until the corrected plan is
authorized, then `authorized-plan-action`. `may_continue` is computed by the server.

#### `POST /scenario-lab/runs/{run_id}/advance`

Advances one deterministic stage. The browser binds the request to the stage it rendered:

```json
{
  "expected_stage": "authorized"
}
```

If a response is lost after the server commits, retrying the same request returns the already
advanced state instead of advancing twice. `expected_stage` is optional for backwards-compatible
service callers. Starting from the `authorized` response, three successful calls produce:

```text
decision-changed → work-stopped → reauthorized
```

The final response has `status: "passed"` or `status: "failed"` and an expected-versus-actual
evaluation. A stage is committed only after its safety postconditions hold. Otherwise the run keeps
the last truthful presentation stage, moves its loop state to `BLOCKED`, records an inspectable
failed evaluation, clears signed tokens, and removes its authority context.

#### `POST /scenario-lab/scenarios/{scenario_id}/reset`

Removes active in-memory runs and contexts for one scenario. It does not call the canonical graph
reset and never deletes Neo4j data.

#### `GET /scenario-lab/results`

Returns the latest process-local result summary for each completed scenario. Summaries retain
expected and actual preserved/invalidated task IDs, false-positive and missed invalidation IDs,
old-grant and reauthorization outcomes, runtime, failure reasons, and whether a detailed run view
is available through `inspectable`. Additive semantic fields include `plan_status`,
`needs_review_artifact_ids`, the old and replacement verification codes, the replacement verdict,
and `history_scope: "session"`.

#### `POST /scenario-lab/run-all`

Runs every scenario, or an explicit unique subset:

```json
{
  "scenario_ids": [
    "csv-exports-admin-only",
    "api-read-only"
  ]
}
```

Use `{}` to run all 12. Each scenario gets its own authority context and executes through the same
agent → authority → executor path as a guided run. One failed scenario is recorded and does not
stop later scenarios. Failures after a run starts remain inspectable by their real run ID. A failure
before a run/context can be established has `inspectable: false` and retains its details in the
summary rather than advertising a nonexistent run; its `plan_status` is `null`.

Run All is serialized. Results retain the latest summary per scenario, detailed token-free
runtimes are bounded to five per scenario, and completed authority contexts are deleted. This is
session-only process memory, not durable benchmark history; an agent-service restart clears it.

## Executor Service — port 8003

### `POST /execute`

Calls the authority verifier. Returns:

```json
{
  "applied": false,
  "reason": "Grant snapshot graph-v17 is stale; current graph is graph-v18.",
  "verification_code": "STALE_SNAPSHOT"
}
```

Scenario requests also include `context_id`; the executor forwards verification to that isolated
authority context. A successful response uses `verification_code: "VALID"` and may include a
simulated PR URL.

## Browser routes

- `/` — canonical eight-phase guided proof;
- `/scenario-lab` — Scenario Lab catalog and Run All report;
- `/scenario-lab?demo=1` — CSV presenter entry in guided-run view;
- `/scenario-lab?scenario={scenario_id}` — guided-run view for a catalog scenario.

The `scenario` query parameter selects an initial browser view only. Demo mode waits briefly for all
three services, resets the CSV scenario through the agent API, and starts its real baseline
authorization so the presenter lands on stage one. Neither route bypasses the backend catalog or
supplies authority input.

Scenario Lab defaults to the **Story** layer: backend-owned outcome summary, shortest provenance
path, invalidated Tasks, Plan review status, and proposed corrective actions. **Evidence** exposes
the complete typed graph, grant metadata, ordered timeline, evaluation checks, and evidence
references. Both layers display server results; neither calculates an authority verdict.
