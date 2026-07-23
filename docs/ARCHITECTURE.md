# Architecture

## Service boundary

```text
Company artifacts / fixtures
          |
          v
Ingestion or structured fixture adapter
          |
          v
Provenance graph (memory by default, Neo4j optional)
          |
          v
Intent Authority Service
  - approval and authority rules
  - scope-aware transitive invalidation
  - graph versioning
  - grant issuance and verification
          ^
          | authorization request
          |
Agent Service
  - plan
  - request verification
  - act / replan / stop
          |
          v
Executor Service
  - independently verifies grant
  - applies or rejects mock PR action
          |
          v
React operator interface
```

The authority and agent expose server-sent event streams. Mutations publish state through a
thread-safe in-process broker, so the React interface receives graph and loop changes without
polling. The UI still performs explicit reads after a user-triggered phase as a deterministic
postcondition check.

## Trust boundary

The agent never mutates authority state or signs its own grants. The executor does not trust a UI verdict; it sends the grant back to the authority service for verification.

## Default runtime

The default demo uses an in-memory graph so it works immediately. The graph interface is implemented separately so Neo4j can replace it without changing authority semantics.

## Data flow

### Initial authorization

1. Agent loads `RUN-27` and `PLAN-027`.
2. Authority checks current requirements in `graph-v17`.
3. Plan matches `audience=all_users`.
4. Authority returns `ALLOW` and a signed `graph-v17` grant.

### Decision mutation

1. `DEC-018` is submitted.
2. Authority verifies `approved`, role `compliance`, confidence threshold, and affected scope.
3. Graph adds `DEC-018 -[:SUPERSEDES {scope: export.authorization}]-> DEC-004`.
4. Graph version increments to `graph-v18`.
5. Authority traverses downstream edges and records exact paths.
6. `TASK-102` is invalidated; `TASK-101` remains valid; `PLAN-027` needs replanning.

### Reauthorization

1. Executor verifies the old grant and rejects the snapshot mismatch.
2. Agent requests a current verdict for the original plan.
3. Authority returns `REPLAN` with the admin-only requirement.
4. Agent produces `PLAN-028` preserving CSV generation and changing authorization.
5. Authority issues a new `graph-v18` grant.
6. Executor accepts it.

### Coordinated demo reset

The frontend calls one agent-owned reset endpoint. The agent first asks the authority to seed
`graph-v17`, validates the returned snapshot, and only then clears its local run. This removes the
former `Promise.all` partial-reset race while keeping the services separately owned. It is
cross-service coordination, not a distributed transaction. Destructive reset is environment-gated
and intended only for a dedicated local/demo database.

## Optional integrations

### Neo4j

Set `DRAGBACK_GRAPH_BACKEND=neo4j`. The `Neo4jGraphStore` persists typed artifacts, dynamic relationship types, graph metadata, scopes, validity, and evidence references.
Its downstream traversal reads only matching outgoing relationships with Cypher. Seed/reset runs
in one write transaction, and the opt-in `neo4j` test suite compares the resulting graph and exact
invalidation report with the in-memory backend. The suite must target a disposable database because
reset deletes all data in the configured Neo4j database.

### Anthropic

The optional Anthropic adapter is not wired into the deterministic live demo. An integration may
instantiate it after installing `.[llm]` and setting `ANTHROPIC_API_KEY` plus `ANTHROPIC_MODEL`.
Its output is untrusted structure: a decision mutation plus exact, zero-based source-text spans.
Before a candidate can reach graph mutation, deterministic code verifies every span
against the supplied source. A separate `TrustedDecisionContext` replaces all model-proposed
governance metadata: source reference, approval status, authority role, confidence, affected
scopes, and supersession target. Missing, out-of-bounds, or non-matching evidence returns
`HUMAN_REVIEW` without changing the graph.

Candidates with valid evidence still pass through the authority engine, which
deterministically validates approval, role, extraction confidence, scope, and graph
relationships. Low-confidence candidates also return `HUMAN_REVIEW` without a graph
write. The default fixture extractor implements the same candidate interface without
importing or requiring Anthropic.

### LangGraph

The repository includes an optional LangGraph workflow builder. The deterministic controller remains available as a fallback and as the unit-test target.
