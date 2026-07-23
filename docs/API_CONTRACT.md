# API contract

## Shared response contract

Every service accepts an optional `X-Correlation-ID` request header and returns the validated or
generated ID in both the response header and a top-level `correlation_id` field. Errors use a stable
`error` envelope with `code`, `message`, and `retryable`; service-to-service calls forward the same
correlation ID. SSE streams use the same correlated event envelope.

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

## Executor Service — port 8003

### `POST /execute`

Calls the authority verifier. Returns:

```json
{
  "applied": false,
  "reason": "Grant snapshot graph-v17 is stale; current graph is graph-v18."
}
```

or a simulated PR URL after a valid grant.
