# AGENTS.md — Dragback implementation contract

This file is the highest-priority repository instruction for Codex and other coding agents.

## Mission

Build a convincing, deterministic demonstration that an autonomous coding-agent run can lose authorization when an approved upstream company decision changes, even when the ticket is untouched and tests already pass.

The demonstration must prove all of the following:

1. The run is initially valid against `graph-v17`.
2. A new approved decision creates `graph-v18`.
3. The new decision never mentions the downstream ticket directly.
4. A multi-hop provenance path connects the decision to the active plan.
5. Invalidation is selective: one sibling task becomes invalid while another remains valid.
6. An authorization issued against `graph-v17` is rejected by the executor.
7. The agent loop transitions to `REPLAN` and obtains a valid `graph-v18` authorization for the corrected plan.

## Product invariant

> The LLM may propose structure. Deterministic code decides and enforces.

Never allow an LLM response to directly issue an `ALLOW`, `REPLAN`, `BLOCK`, or `HUMAN_REVIEW` verdict.

## Non-negotiable engineering invariants

### 1. Newest is not automatically authoritative

A decision can change the graph only when it satisfies deterministic approval, authority, scope, and confidence rules. A proposal or question must not invalidate active work.

### 2. The graph must drive behavior

Neo4j or the in-memory graph is not decorative. Graph traversal must produce the invalidation path used by the authority decision.

### 3. Invalidation must be scope-sensitive

Do not recursively mark every descendant invalid. Intersect the changed decision's `affected_scopes` with each descendant's scopes. Preserve out-of-scope siblings.

### 4. Agent and authority remain separate

The planner cannot approve itself. Keep separate services/modules for:

- `agent-service`: plans, stores loop state, and requests authorization.
- `intent-authority`: owns graph mutation, invalidation, grants, and verdicts.
- `executor`: independently verifies grants before applying an action.

### 5. Authorizations are snapshot-bound

Every grant must bind at least:

- `run_id`
- `task_id`
- `decision_snapshot`
- `plan_hash`
- `verdict`
- `expires_at`

A graph-version mismatch or plan-hash mismatch must make the grant unusable.

### 6. Explain every verdict

Return the affected scopes, exact provenance path, invalidated artifacts, preserved artifacts, and evidence references. A red badge alone is not sufficient.

### 7. Be explicit about simulation

The following may be fixture-driven for the hackathon:

- Slack, Linear/Jira, and GitHub ingestion
- real repository mutation
- real pull-request creation or merge
- auth and multitenancy
- production-grade key management

The following must be real:

- graph writes and version changes
- authority rules
- multi-hop traversal
- selective invalidation
- plan hashing
- grant rejection
- loop transition and corrected reauthorization

## Current architecture

- Python 3.11+
- FastAPI services
- Pydantic domain models
- deterministic in-memory graph by default
- optional Neo4j graph backend
- optional Anthropic structured extraction
- optional LangGraph state-machine adapter
- React + TypeScript demo interface

## Working commands

```bash
make demo
make test
make check
make authority
make agent
make executor
```

## Definition of done

Do not call the project demo-ready unless these tests pass:

- approved decision applies; proposal does not
- `TASK-101` remains `VALID`
- `TASK-102` becomes `INVALIDATED`
- active plan becomes `NEEDS_REVIEW` / `REPLAN`
- old grant fails after `graph-v18`
- corrected plan receives a valid new grant
- executor accepts the new grant

## Build priorities

When time is constrained, work in this order:

1. selective invalidation tests
2. stale-grant rejection
3. active-loop replan
4. explainable path and evidence
5. thin UI
6. Neo4j parity
7. optional LLM extraction

## Scenario Lab expansion

The canonical CSV proof remains the frozen Guided Proof and must keep satisfying the
definition of done above. A separate **Scenario Lab** may add multiple deterministic
fixtures when it:

- reuses the real authority, graph, grant, agent-loop, and executor paths;
- keeps expected outcomes assertion-only;
- isolates every run with unique context and run identifiers;
- clearly labels fixture-driven corrected-plan wording and simulated integrations; and
- preserves the Guided Proof at its existing entry point.

Correctness, isolation, testing, and visual fidelity take priority over implementation
speed for this expansion.

## Do not spend hackathon time on

- live OAuth integrations
- general company search or chat
- many agent personas
- a broad enterprise dashboard
- production deployment infrastructure
- elaborate cryptography

## Code style

- Prefer small typed functions with explicit inputs and outputs.
- Keep authority logic pure where practical.
- Add or update tests with every behavior change.
- Avoid hidden global mutation outside service runtime modules.
- Use UTC-aware datetimes.
- Keep fixture IDs stable because the demo and tests reference them.
- Do not rename the product away from **Dragback**.

## Safe simplifications

- HMAC signing is sufficient for the demo.
- Seeded typed relationships are acceptable; live extraction is optional.
- The mock executor may return a simulated PR URL after a valid grant.
- Server-Sent Events can be added after the REST flow is stable.
