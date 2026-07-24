# Live Workspace CLI

The Dragback CLI turns the Live Workspace API into an enforceable terminal and CI
workflow. It imports user-owned YAML or JSON, requests real snapshot-bound
authorizations, and exits nonzero when the executor rejects a stored grant.

## Install and connect

Install the project in editable mode:

```bash
python -m pip install -e .
```

The CLI uses `http://127.0.0.1:8002` by default. Point it at another agent service
with either option:

```bash
export DRAGBACK_AGENT_URL=https://dragback-agent.example.com
dragback workspace list

dragback --agent-url https://dragback-agent.example.com workspace list
```

`--agent-url`, `--timeout`, and `--json` may appear before or after a workspace
command.

## Run the practical refund example

Start the three Dragback services, then run:

```bash
# 1. Import user-owned decisions, work, provenance, and an agent plan.
dragback workspace import examples/dragback-workspace.yaml

# 2. An authoritative role approves the proposed baseline, creating graph-v17.
dragback workspace approve-baseline refund-operations --role finance-admin

# 3. Authorize the initial plan against graph-v17.
dragback workspace authorize refund-operations

# 4. Propose and approve a new upstream decision, creating graph-v18.
dragback workspace propose-change refund-operations examples/dragback-change.yaml
dragback workspace approve-change \
  refund-operations DEC-REFUND-002 --role finance-admin

# 5. The old graph-v17 grant is now rejected. This command exits 1.
dragback workspace verify refund-operations --grant initial

# 6. Store the corrected plan and request its replacement authorization.
dragback workspace update-plan \
  refund-operations examples/dragback-corrected-plan.json

# 7. The executor accepts the graph-v18 replacement grant.
dragback workspace verify refund-operations --grant replacement
```

The decision change never names `PAY-104`. Dragback reaches it through the
decision → specification → ticket provenance chain. The calculation task remains
valid because its scope does not intersect the changed execution policy; the
automatic issue-refund task is invalidated.

`update-plan` intentionally performs two API operations: it stores the plan, then
requests the replacement authorization. Deterministic authority code still decides
whether that replacement is allowed.

## Commands

```text
dragback workspace import FILE
dragback workspace list
dragback workspace show WORKSPACE_ID
dragback workspace approve-baseline WORKSPACE_ID --role ROLE
dragback workspace authorize WORKSPACE_ID
dragback workspace propose-change WORKSPACE_ID FILE
dragback workspace approve-change WORKSPACE_ID DECISION_ID --role ROLE
dragback workspace cancel-change WORKSPACE_ID
dragback workspace verify WORKSPACE_ID [--grant initial|replacement]
dragback workspace update-plan WORKSPACE_ID FILE
```

Use `-` instead of a filename to read YAML or JSON from standard input. Add
`--json` for scripting. Signed grant tokens are never printed; if an upstream
response accidentally contains a token field, the CLI replaces it with
`"[REDACTED]"`.

If a proposal is wrong or no longer needed, `cancel-change` deletes only the
pending proposal. It does not mutate the authority graph, invalidate work, or
replace the existing initial authorization.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Request succeeded; for `verify`, the code is `VALID` and execution was applied. |
| `1` | Verification deterministically rejected the grant or did not apply execution. |
| `2` | Usage, input, transport, or API/protocol error. |

This makes verification usable as a CI gate:

```bash
dragback workspace verify refund-operations --grant initial
```

## GitHub Actions

The repository includes a composite action:

```yaml
- name: Verify Dragback authorization
  uses: Eman-Gon/lookback/.github/actions/dragback-verify@main
  with:
    agent-url: ${{ secrets.DRAGBACK_AGENT_URL }}
    workspace-id: refund-operations
    grant: initial
```

The runner must be able to reach the configured agent service. The action installs
the CLI from the referenced repository version and lets the CLI exit code decide
the job result. It never accepts or prints a signed grant token.

## Security boundary

The CLI is a client, not an authority:

- User input may propose graph structure and decision changes.
- Only the service validates role authority, approval, scope, confidence, graph
  traversal, plan requirements, and grants.
- The CLI does not mint, decode, persist, or locally trust signed grants.
- `--role` represents the prototype's explicit approval actor. Production
  deployments should derive that role from authenticated identity instead.
