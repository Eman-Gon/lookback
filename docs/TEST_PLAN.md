# Test plan

## Unit tests

### Authority

- approved compliance decision for `export.authorization` applies;
- proposal does not mutate graph;
- unauthorized role does not mutate graph;
- low-confidence extraction routes to review.

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
- preserved list contains `TASK-101`.

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

## Service tests

- authority reset is deterministic;
- agent can start only after authority is reachable;
- executor calls authority rather than trusting request claims;
- one three-service flow rejects the old executor request and accepts the corrected one;
- coordinated reset does not clear agent state when authority reset fails;
- graph and loop event routes use a correlated SSE envelope;
- service errors are returned with actionable messages.

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
