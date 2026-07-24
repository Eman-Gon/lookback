# Test plan

## Unit tests

### Authority

- approved compliance decision for `export.authorization` applies;
- proposal does not mutate graph;
- unauthorized role does not mutate graph;
- low-confidence extraction routes to review.
- mutation requirement scopes must equal `affected_scopes`, with rejection occurring before any
  graph write or version change.

### Optional extraction

- exact source spans are persisted with the trusted source reference;
- model-proposed approval, role, confidence, scopes, and supersession are replaced by trusted
  ingestion context;
- invented or mismatched evidence routes to `HUMAN_REVIEW` without a graph write;
- out-of-bounds evidence routes to `HUMAN_REVIEW` without a graph write;
- fixture extraction implements the same candidate contract without an LLM dependency.

### Selective invalidation

- `TASK-101` remains valid;
- `TASK-102` becomes invalidated;
- `SPEC-009`, `TICKET-100`, and `PLAN-027` become partial / needs review;
- report contains a path from `DEC-018` to `TASK-102`;
- preserved list contains `TASK-101`;
- additive typed fields distinguish preserved Tasks, invalidated Tasks, and every artifact needing
  review while legacy lists remain compatible;
- traversal and primary-path selection remain deterministic under equal-depth alternatives.

### Grants

- valid signature succeeds on the same graph snapshot and plan hash;
- modified plan fails;
- expired grant fails;
- `graph-v17` grant fails after graph becomes `graph-v18`.

### Replanning

- unchanged CSV-generation action remains;
- all-user action becomes admin-only;
- corrected plan matches current requirements;
- corrected plan receives `ALLOW` and a new grant.

### Scenario Lab catalog

- all 12 required scenario IDs are present and unique;
- catalog loaders return deep copies so a caller cannot mutate the source definition;
- every definition classifies all seeded Task artifacts in assertion-only expectations;
- artifact and action IDs are unique and every edge endpoint exists;
- initial and corrected plans remain bound to the seeded ticket;
- approved role-authoritative baseline decisions cover every seeded scope, with changed and
  unaffected scopes owned independently;
- affected Tasks have a scope-continuous path from the superseded decision;
- the new decision does not directly name downstream ticket or task IDs;
- the decision role is authoritative for every changed scope;
- the initial plan meets baseline requirements and the corrected plan meets current requirements;
- every definition receives an initial `ALLOW`, produces selective invalidation, rejects the old
  grant, receives `REPLAN` for the old plan, and authorizes and executes the corrected plan through
  the real authority engine.

### Scenario Lab evaluation

- actual preserved and invalidated sets contain Task artifacts only;
- partial plan impact is counted as `NEEDS_REVIEW`;
- newly required actions are derived from corrected-plan differences;
- false-positive and missed invalidations are reported;
- expectations are compared after execution and never drive graph traversal or authority verdicts;
- a requirements-compliant action still receives `REPLAN` if it references a graph-invalidated
  Task;
- scenario validation rejects weakened safety expectations that would label unsafe behavior as a
  pass;
- Run All aggregates measured counts, verification results, runtime, and failure reasons;
- `outcome_summary` separates invalidated Tasks from Plan review, exposes the verification codes
  and primary path, and keeps `may_continue` server-owned;
- corrective actions remain fixture-generated `plan-action` values with no graph artifact ID.

## Service tests

- authority reset is deterministic;
- agent can start only after authority is reachable;
- executor calls authority rather than trusting request claims;
- one three-service flow rejects the old executor request and accepts the corrected one;
- coordinated reset does not clear agent state when authority reset fails;
- graph and loop event routes use a correlated SSE envelope;
- service errors are returned with actionable messages.

### Scenario Lab service boundaries

- each run receives an isolated `MemoryGraphStore` authority context;
- mutating one context does not affect another context or the canonical authority graph;
- the Scenario Lab remains in memory when the canonical backend is Neo4j;
- context-derived signing keys reject cross-context grants with `INVALID_TOKEN`;
- old grants fail with the structured `STALE_SNAPSHOT` code;
- successful replacement grants return `VALID`;
- agent → authority → executor → authority calls cross the real HTTP adapters;
- public agent run responses contain no signed token value;
- completed authority contexts are deleted and every retained nested signed token is cleared while
  token-free summaries remain available;
- failed service calls do not advance the public stage or claim a safety postcondition succeeded;
- failed runs preserve the last truthful presentation stage and move the loop to `BLOCKED`;
- the retained `AgentRun` transitions from `ACT` to `REPLAN` and then `COMPLETE`;
- retries bound to an earlier `expected_stage` reconcile to current state rather than advancing
  twice;
- a guided CSV run passes all four stages;
- Run All returns 12 independently verified results;
- an injected scenario failure is recorded while later Run All scenarios continue;
- Run All is serialized, keeps the latest summary per scenario, bounds detailed history to five
  token-free runs per scenario, and reports `history_scope: "session"`;
- pre-start failures are non-inspectable and have no Plan status.

Run the focused deterministic coverage with:

```bash
python -m pytest \
  backend/tests/test_scenario_catalog.py \
  backend/tests/test_scenario_authority_contexts.py \
  backend/tests/test_scenario_runner.py \
  backend/tests/test_scenario_service_flow.py
```

## Optional Neo4j parity tests

Run the same fixture and expected invalidation report against memory and Neo4j stores. Compare artifact validity, affected scopes, paths, graph version, and verdict.

These tests are marked `neo4j`, require an explicit `DRAGBACK_RUN_NEO4J_TESTS=1`, and read
connection details from `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, and `NEO4J_DATABASE`.
They reset the target database, so use a disposable instance:

```bash
DRAGBACK_RUN_NEO4J_TESTS=1 python -m pytest -m neo4j
```

## Presentation test

A person unfamiliar with the code should be able to answer:

1. What changed?
2. Why did only one task become invalid?
3. Why was the old grant rejected?
4. What did the agent preserve during replanning?

For Scenario Lab, also verify:

1. `/scenario-lab?demo=1` opens the CSV guided-run view.
2. Three **Next demo step** actions move from `authorized` through `reauthorized`.
3. The old execution displays `STALE_SNAPSHOT`.
4. Story mode separates **Invalidated tasks** from **Plan needs review** and labels proposed
   corrective actions as fixture-generated.
5. Evidence mode exposes the full graph, typed relationships, grant metadata, timeline, evaluation,
   and evidence references without exposing signed tokens.
6. The final evaluation separates expected from actual results.
7. Run All reports 12 completed scenarios using the columns Scenario, Result, Preserved tasks,
   Invalidated tasks, Plan status, Old grant, Replacement grant, Runtime, and Inspect.
8. Run All identifies its history as session-only.
