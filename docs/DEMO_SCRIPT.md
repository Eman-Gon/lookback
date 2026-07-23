# Demo script — 3 to 5 minutes

## 0:00–0:25 — problem

“Coding agents can write correct code from obsolete decisions. Tests tell an agent whether the code works. Dragback tells it whether the work is still wanted.”

## 0:25–1:00 — initially valid run

Show:

- ticket: “Add CSV export for all users”;
- two tasks: CSV generation and all-user exposure;
- `graph-v17`;
- `ALLOW` grant;
- implementation complete and tests passing.

Say: “At this point the agent is doing exactly what it was asked to do.”

## 1:00–2:15 — upstream decision changes

Ingest the approved compliance decision:

> Exports must be admin-only.

Emphasize:

- it does not mention the ticket;
- it is approved and authoritative for `export.authorization`;
- the graph traces a multi-hop path to the active plan.

Show the path lighting up.

## 2:15–2:50 — selective invalidation

Show side by side:

```text
TASK-101 Generate CSV files        VALID
TASK-102 Expose to all users       INVALIDATED
```

Say: “If both tasks turned red, this would be blanket recursion. One survives because the new decision only changed authorization.”

## 2:50–3:25 — executor rejects stale work

Attempt execution with the original grant. Show:

```text
REJECTED
Grant snapshot: graph-v17
Current snapshot: graph-v18
```

The executor, not the agent or UI, performs this check.

## 3:25–4:00 — replan

Show the loop move to `REPLAN`. The corrected plan preserves CSV generation and changes the audience to `admin_only`. It receives a new `graph-v18` grant and the executor accepts it.

## Code peek — optional 30 seconds

Show only:

1. the downstream traversal;
2. the scope-intersection rule;
3. the snapshot and plan-hash checks.

## Close

“Most agent controls ask whether the agent may act. Dragback verifies whether the objective driving that action still follows from current approved company intent.”

> Tests prove the code works. Dragback proves the work is still wanted.
