# Dragback task queue

## P0 — preserve the core proof

- [x] Seed `graph-v17` with a decision, spec, ticket, two sibling tasks, and an active plan.
- [x] Authorize the initial plan and issue a snapshot-bound grant.
- [x] Ingest an approved `graph-v18` decision scoped to `export.authorization`.
- [x] Traverse the multi-hop lineage.
- [x] Invalidate `TASK-102` while preserving `TASK-101`.
- [x] Reject the `graph-v17` grant.
- [x] Replan to `admin_only` and authorize the corrected plan.
- [x] Cover the flow with deterministic tests.

## P1 — service integration

- [x] Expose the authority API.
- [x] Expose the agent-loop API.
- [x] Expose the independent executor API.
- [x] Add robust service-to-service timeout and error handling.
- [x] Add a shared correlation ID to every response and event.
- [ ] Add SSE streams for graph and loop-state updates.

## P2 — frontend

- [x] Create a thin React/Vite shell and API client.
- [x] Add buttons for each demo phase.
- [x] Show loop state, graph nodes, grants, and real-vs-simulated scope.
- [x] Animate only the active invalidation path.
- [x] Highlight the surviving sibling separately from the invalidated sibling.
- [x] Add a single-click deterministic demo runner with timed pauses.

## P3 — Neo4j

- [x] Provide a Neo4j store implementation and Docker Compose service.
- [ ] Add Neo4j integration tests behind an opt-in marker.
- [ ] Confirm the Cypher traversal returns the same report as the memory store.
- [ ] Add a seed/reset endpoint for AuraDB.

## P4 — optional LLM extraction

- [x] Define an extraction interface and fixture implementation.
- [x] Add an Anthropic adapter skeleton with structured JSON output.
- [ ] Add evidence-span validation before accepting a proposed edge.
- [ ] Add a review state when extraction confidence is below threshold.
- [ ] Ensure LLM extraction is never required for the deterministic demo.

## P5 — presentation hardening

- [ ] Rehearse the 3–5 minute flow from `docs/DEMO_SCRIPT.md`.
- [ ] Record a backup screen capture.
- [ ] Keep competitor comparisons in Q&A, not the opening.
- [x] Add a visible “real vs simulated” panel.
- [ ] Freeze fixture IDs and demo data before presentation day.
