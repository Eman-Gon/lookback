# Test plan

## Unit tests

### Authority

- approved compliance decision for `export.authorization` applies;
- proposal does not mutate graph;
- unauthorized role does not mutate graph;
- low-confidence extraction routes to review.

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
- service errors are returned with actionable messages.

## Optional Neo4j parity tests

Run the same fixture and expected invalidation report against memory and Neo4j stores. Compare artifact validity, affected scopes, paths, graph version, and verdict.

## Presentation test

A person unfamiliar with the code should be able to answer:

1. What changed?
2. Why did only one task become invalid?
3. Why was the old grant rejected?
4. What did the agent preserve during replanning?
