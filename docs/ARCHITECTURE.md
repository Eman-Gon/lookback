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

## Optional integrations

### Neo4j

Set `DRAGBACK_GRAPH_BACKEND=neo4j`. The `Neo4jGraphStore` persists typed artifacts, dynamic relationship types, graph metadata, scopes, validity, and evidence references.

### Anthropic

Set `ANTHROPIC_API_KEY`. The LLM adapter can propose typed decisions and relationships, but the authority engine still validates approval, role, confidence, scope, and traversal deterministically.

### LangGraph

The repository includes an optional LangGraph workflow builder. The deterministic controller remains available as a fallback and as the unit-test target.
