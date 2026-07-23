# API contract

## Shared response contract

Every service accepts an optional `X-Correlation-ID` request header and returns the validated or
generated ID in both the response header and a top-level `correlation_id` field. Errors use a stable
`error` envelope with `code`, `message`, and `retryable`; service-to-service calls forward the same
correlation ID. Future event streams must use the shared correlated event envelope.

## Intent Authority — port 8001

### `POST /demo/reset`

Reloads the `graph-v17` fixture.

### `GET /demo/state`

Returns graph version, artifacts, relationships, and the most recent invalidation report.

### `POST /decisions/ingest`

Accepts a `DecisionMutation` containing a decision, `supersedes_id`, and `affected_scopes`.

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
    "preserved_artifact_ids": ["TASK-101"],
    "evidence_refs": [
      "slack://compliance/decision-018",
      "slack://product/decision-004",
      "notion://specs/export-009",
      "linear://ticket/TICKET-100",
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

Accepts token, run ID, task ID, and plan. Rejects bad signatures, expired grants, plan-hash mismatches, stale graph versions, and currently invalid plans.

## Agent Service — port 8002

### `POST /demo/reset`
Clears local run state.

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
