from dragback.authority.engine import IntentAuthority
from dragback.fixtures import load_decision_v18, load_graph_fixture
from dragback.grants import GrantSigner
from dragback.graph.memory import MemoryGraphStore
from dragback.hashing import stable_hash


def test_old_grant_fails_after_graph_change() -> None:
    version, artifacts, edges, run = load_graph_fixture()
    graph = MemoryGraphStore()
    graph.reset(version=version, artifacts=artifacts, edges=edges)
    authority = IntentAuthority(graph=graph, signer=GrantSigner("test-secret"))

    initial = authority.evaluate_plan(run_id=run.run_id, task_id=run.ticket_id, plan=run.plan)
    assert initial.grant is not None
    assert initial.grant.payload.plan_hash == stable_hash(run.plan)

    authority.apply_decision_change(load_decision_v18())
    verification = authority.verify_grant(
        token=initial.grant.token,
        run_id=run.run_id,
        task_id=run.ticket_id,
        plan=run.plan,
    )
    assert verification.valid is False
    assert "stale" in verification.reason.lower()
