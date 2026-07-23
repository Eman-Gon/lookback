from dragback.authority.engine import IntentAuthority
from dragback.domain import ValidityStatus
from dragback.fixtures import load_decision_v18, load_graph_fixture
from dragback.grants import GrantSigner
from dragback.graph.memory import MemoryGraphStore


def test_selective_multi_hop_invalidation() -> None:
    version, artifacts, edges, _ = load_graph_fixture()
    graph = MemoryGraphStore()
    graph.reset(version=version, artifacts=artifacts, edges=edges)
    authority = IntentAuthority(graph=graph, signer=GrantSigner("test-secret"))

    result = authority.apply_decision_change(load_decision_v18())

    assert result.applied is True
    assert result.graph_version == "graph-v18"
    assert result.report is not None
    assert graph.get_artifact("TASK-101").validity is ValidityStatus.VALID
    assert graph.get_artifact("TASK-102").validity is ValidityStatus.INVALIDATED
    assert graph.get_artifact("PLAN-027").validity is ValidityStatus.NEEDS_REVIEW
    assert "TASK-101" in result.report.preserved_artifact_ids
    assert "TASK-102" in result.report.affected_artifact_ids
    task_path = next(
        path.node_ids for path in result.report.paths if path.artifact_id == "TASK-102"
    )
    assert task_path == ["DEC-018", "DEC-004", "SPEC-009", "TICKET-100", "TASK-102"]

    plan_path = next(
        path.node_ids for path in result.report.paths if path.artifact_id == "PLAN-027"
    )
    assert plan_path == [
        "DEC-018",
        "DEC-004",
        "SPEC-009",
        "TICKET-100",
        "TASK-102",
        "PLAN-027",
    ]
    assert result.report.evidence_refs == [
        "slack://compliance/decision-018",
        "slack://product/decision-004",
        "notion://specs/export-009",
        "linear://ticket/TICKET-100",
        "linear://ticket/TICKET-100#task-101",
        "linear://ticket/TICKET-100#task-102",
        "agent://run/RUN-27/plan/PLAN-027",
    ]
