# Dragback

**Continuous decision-provenance control for autonomous coding agents.**

> Tests prove the code works. Dragback proves the work is still wanted.

Dragback detects when an approved upstream company decision changes while a coding-agent run is active. It traces the change through a typed provenance graph, selectively invalidates only affected downstream work, rejects authorizations bound to stale graph snapshots, and moves the agent loop to `REPLAN`, `BLOCK`, or `HUMAN_REVIEW`.

This repository is a Codex-ready hackathon starter. The deterministic demo works without external API keys. Neo4j and Anthropic integrations are included as optional extension points.

## Read first

Codex and human contributors should read these files in order:

1. [`AGENTS.md`](AGENTS.md) — implementation rules and non-negotiable invariants.
2. [`dragback.md`](dragback.md) — complete product brief.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — service and data flow.
4. [`docs/GRAPH_SCHEMA.md`](docs/GRAPH_SCHEMA.md) — nodes, edges, scopes, and traversal semantics.
5. [`TASKS.md`](TASKS.md) — prioritized work queue.
6. [`docs/CODEX_START_PROMPT.md`](docs/CODEX_START_PROMPT.md) — a ready-to-paste Codex prompt.

## What already works

The starter contains a deterministic in-memory implementation of the core proof:

1. `graph-v17` authorizes a plan to create CSV exports for all users.
2. The agent completes the plan and tests pass.
3. An approved compliance decision creates `graph-v18` and changes only `export.authorization`.
4. A multi-hop traversal reaches the active plan without the new decision mentioning the ticket.
5. `TASK-102` is invalidated while sibling `TASK-101` remains valid.
6. The executor rejects the old snapshot-bound grant.
7. The loop returns `REPLAN`, preserves CSV generation, adds the admin constraint, and receives a new valid grant.

## Fastest start

Requires Python 3.11+.

```bash
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -e ".[dev]"
make demo
make check
```

No Anthropic key or Neo4j database is required for those commands.

## Run the full stack

Start all three APIs and the frontend, with readiness checks and coordinated cleanup. This command
pins the local stack to `127.0.0.1` on ports `8001`–`8003` and `5173`, overriding conflicting
service URL values from the root `.env` for the processes it launches. It explicitly enables the
demo reset flow, which deletes and reseeds the selected graph backend; configure only a dedicated
local/demo database before running it:

```bash
make stack
```

Open `http://127.0.0.1:5173`.

## Run services separately

Open three terminals after installing dependencies:

```bash
make authority   # http://localhost:8001
make agent       # http://localhost:8002
make executor    # http://localhost:8003
```

Then run the frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite UI runs at `http://localhost:5173` by default.

## Optional external services

Copy the environment template:

```bash
cp .env.example .env
```

- Set `DRAGBACK_GRAPH_BACKEND=neo4j` and provide Neo4j credentials to use a real graph database.
- The optional Anthropic adapter is an explicit extension point, not part of the live demo path.
  Install `.[llm]`, set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`, then wire the adapter through
  `TrustedDecisionContext` supplied by authenticated ingestion. Exact source spans are checked
  deterministically; model-proposed approval, role, confidence, effective time, scope,
  supersession, and pre-existing invalidation state are ignored and never control mutation.
- Keep the deterministic authority engine as the final source of `ALLOW`, `REPLAN`, `BLOCK`, and `HUMAN_REVIEW` verdicts.

The local memory backend keeps zero-config fixture seeding in development/demo environments.
Neo4j never enables destructive startup seeding or `/graph/reset` by default: set
`DRAGBACK_DEMO_RESET_ENABLED=true` explicitly and use only a dedicated Dragback demo database.

### Neo4j parity tests

The Neo4j suite is opt-in because it resets the configured database. Use only a disposable
database, provide connection values through the environment, and keep credentials out of
command history and source control.

```bash
pip install -e ".[dev,graph]"
DRAGBACK_RUN_NEO4J_TESTS=1 python -m pytest -m neo4j
```

The suite seeds `graph-v17` repeatedly and compares the persisted graph, selective invalidation
report, and `ALLOW`/`REPLAN` behavior with the in-memory store. Without the opt-in variable, the
tests skip and the normal deterministic suite needs no Neo4j credentials.

## Repository layout

```text
AGENTS.md                         Codex operating instructions
TASKS.md                          prioritized implementation queue
dragback.md                       complete product brief
docs/                             architecture, graph, API, demo, and test docs
fixtures/                         seeded company artifacts and decision changes
backend/dragback/                 Python package
  authority/                      authority and selective invalidation engine
  graph/                          in-memory and Neo4j stores
  llm/                            fixture and Anthropic extraction adapters
  loop/                           agent-loop controller and LangGraph adapter
  services/                       FastAPI authority, agent, and executor apps
frontend/                         thin React/TypeScript demo interface
scripts/                          bootstrap, demo, service, and validation scripts
```

## Hackathon scope

Build the reasoning and enforcement for real. Keep OAuth, webhooks, real PR creation, authentication, multitenancy, and production key management simulated. The exact scope boundaries are in [`AGENTS.md`](AGENTS.md).
