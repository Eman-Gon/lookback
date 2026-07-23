# Architecture decisions

## ADR-001 — deterministic authority

LLMs may extract candidates but may not issue execution verdicts. Reason: authorization must be auditable and reproducible.

## ADR-002 — memory graph default

The demo defaults to an in-memory store. Reason: zero-setup reliability. Neo4j is an adapter, not a runtime prerequisite.

## ADR-003 — scope-aware propagation

Every artifact carries scopes. Invalidation propagates only through intersecting scopes. Reason: blanket descendant invalidation is not credible.

## ADR-004 — independent executor verification

The executor calls the authority service to verify a grant. Reason: a warning banner is not enforcement.

## ADR-005 — snapshot and plan binding

Grants bind to graph version and stable plan hash. Reason: a valid grant must not authorize a changed plan or changed company intent.

## ADR-006 — fixture-first extraction

Seeded decisions and edges are the default. Anthropic extraction is optional. Reason: the live proof should not depend on nondeterministic parsing.

## ADR-007 — competitor names remain in Q&A

The default pitch uses category-level differentiation. Reason: named comparisons are useful only after judges understand Dragback's mechanism.
