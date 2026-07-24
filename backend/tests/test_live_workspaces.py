from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import cast
from urllib.parse import urlparse

import httpx
import pytest
from dragback.domain import (
    AgentPlan,
    ApprovalStatus,
    Artifact,
    ArtifactKind,
    EdgeKind,
    GrantVerificationResult,
    PlanAction,
    VerificationCode,
)
from dragback.services import agent_api, authority_api, executor_api, support
from dragback.workspaces.authority_contexts import (
    DynamicAuthorityContextCreateRequest,
    DynamicAuthorityContextRegistry,
)
from dragback.workspaces.models import (
    LiveWorkspaceImportRequest,
    LiveWorkspaceRecord,
    LiveWorkspaceStatus,
    WorkspaceExecutionResult,
)
from dragback.workspaces.orchestrator import LiveWorkspaceOrchestrator
from dragback.workspaces.repository import JsonFileLiveWorkspaceRepository
from fastapi.testclient import TestClient
from pydantic import ValidationError


def workspace_import() -> LiveWorkspaceImportRequest:
    baseline_time = datetime(2026, 1, 1, tzinfo=UTC)
    return LiveWorkspaceImportRequest(
        id="refund-control",
        name="Refund controls",
        description="Stop automatic high-value refunds when finance policy changes.",
        authority_policy={
            "refund.calculation": {"finance-admin"},
            "refund.execution": {"finance-admin"},
        },
        baseline_decision=Artifact(
            id="DEC-REFUND-1",
            kind=ArtifactKind.DECISION,
            title="Automatic refunds",
            text="Refund calculation and execution may be automatic.",
            scopes={"refund.calculation", "refund.execution"},
            approval_status=ApprovalStatus.PROPOSAL,
            authority_role="finance-admin",
            effective_at=baseline_time,
            source_ref="manual://finance/decision-1",
            attributes={
                "requirements": {
                    "refund.calculation": {"formula": "policy-v1"},
                    "refund.execution": {"human_approval": False},
                }
            },
        ),
        specification=Artifact(
            id="SPEC-REFUND",
            kind=ArtifactKind.SPECIFICATION,
            title="Refund specification",
            scopes={"refund.calculation", "refund.execution"},
            source_ref="manual://finance/spec",
        ),
        ticket=Artifact(
            id="PAY-104",
            kind=ArtifactKind.TICKET,
            title="Automate customer refunds",
            scopes={"refund.calculation", "refund.execution"},
            source_ref="manual://tickets/PAY-104",
        ),
        tasks=[
            Artifact(
                id="TASK-CALCULATE",
                kind=ArtifactKind.TASK,
                title="Calculate refund",
                scopes={"refund.calculation"},
                source_ref="manual://tickets/PAY-104#calculate",
            ),
            Artifact(
                id="TASK-ISSUE",
                kind=ArtifactKind.TASK,
                title="Issue refund",
                scopes={"refund.execution"},
                source_ref="manual://tickets/PAY-104#issue",
            ),
        ],
        plan=AgentPlan(
            id="PLAN-REFUND-1",
            ticket_id="PAY-104",
            objective="Automate refunds",
            actions=[
                PlanAction(
                    id="ACTION-CALCULATE",
                    description="Calculate the refund",
                    scopes={"refund.calculation"},
                    attributes={"formula": "policy-v1"},
                ),
                PlanAction(
                    id="ACTION-ISSUE",
                    description="Issue the refund automatically",
                    scopes={"refund.execution"},
                    attributes={"human_approval": False},
                ),
            ],
        ),
    )


def decision_proposal_body() -> dict[str, object]:
    return {
        "decision": Artifact(
            id="DEC-REFUND-2",
            kind=ArtifactKind.DECISION,
            title="High-value refunds need approval",
            text="Refund execution requires human approval.",
            scopes={"refund.execution"},
            approval_status=ApprovalStatus.PROPOSAL,
            authority_role="finance-admin",
            effective_at=datetime(2026, 1, 2, tzinfo=UTC),
            source_ref="manual://finance/decision-2",
            attributes={
                "requirements": {
                    "refund.execution": {"human_approval": True},
                }
            },
        ).model_dump(mode="json"),
        "supersedes_id": "DEC-REFUND-1",
        "affected_scopes": ["refund.execution"],
    }


def corrected_plan_body() -> dict[str, object]:
    plan = workspace_import().plan.model_copy(deep=True)
    plan.id = "PLAN-REFUND-2"
    issue = next(action for action in plan.actions if action.id == "ACTION-ISSUE")
    issue.description = "Wait for finance approval, then issue the refund"
    issue.attributes["human_approval"] = True
    return {"plan": plan.model_dump(mode="json")}


def test_import_builds_agent_plan_provenance_edges_and_persists_atomically(
    tmp_path: Path,
) -> None:
    definition = workspace_import()
    edges = definition.graph_edges()
    assert {
        edge.source_id
        for edge in edges
        if edge.kind is EdgeKind.CURRENTLY_DRIVES
        and edge.target_id == definition.plan.id
    } == {"TASK-CALCULATE", "TASK-ISSUE"}

    repository = JsonFileLiveWorkspaceRepository(tmp_path / "nested" / "workspaces.json")
    record = LiveWorkspaceRecord(
        definition=definition,
        context_id="live-refund-control",
        graph_version="graph-v17",
        current_plan=definition.plan,
    )
    repository.create(record)

    loaded = JsonFileLiveWorkspaceRepository(repository.path).get("refund-control")
    assert loaded.definition == definition
    assert loaded.status is LiveWorkspaceStatus.IMPORTED
    assert not list(repository.path.parent.glob("*.tmp"))


def test_import_rejects_a_decorative_disconnected_graph() -> None:
    raw = workspace_import().model_dump(mode="json")
    raw["edges"] = [
        {
            "source_id": "SPEC-REFUND",
            "target_id": "PAY-104",
            "kind": "CREATES",
            "scopes": ["refund.execution"],
        }
    ]

    with pytest.raises(ValidationError, match="missing authority provenance"):
        LiveWorkspaceImportRequest.model_validate(raw)


def test_import_rejects_an_unscoped_authority_path() -> None:
    definition = workspace_import()
    raw = definition.model_dump(mode="json")
    raw["edges"] = [
        edge.model_dump(mode="json") for edge in definition.graph_edges()
    ]
    first_edge = next(
        edge
        for edge in raw["edges"]
        if edge["source_id"] == "DEC-REFUND-1"
        and edge["target_id"] == "SPEC-REFUND"
    )
    first_edge["scopes"].remove("refund.execution")

    with pytest.raises(
        ValidationError,
        match="continuous scoped authority path.*refund.execution",
    ):
        LiveWorkspaceImportRequest.model_validate(raw)


@pytest.mark.parametrize(
    ("broken_layer", "message"),
    [
        ("requirement-object", "requirements must be objects"),
        ("specification", "missing from: Specification"),
        ("ticket", "missing from: Ticket"),
        ("task", "missing from: Task"),
        ("plan", "missing from: AgentPlan action"),
        ("authority-role", "authority_role is not authorized"),
    ],
)
def test_import_rejects_silently_ignored_requirement_scopes(
    broken_layer: str,
    message: str,
) -> None:
    raw = workspace_import().model_dump(mode="json")
    scope = "refund.execution"
    if broken_layer == "requirement-object":
        raw["baseline_decision"]["attributes"]["requirements"][scope] = [
            "not-an-object"
        ]
    elif broken_layer == "specification":
        raw["specification"]["scopes"].remove(scope)
    elif broken_layer == "ticket":
        # Before this guard, evaluate_plan intersected requirements with Ticket
        # scopes and silently ignored this approved requirement.
        raw["ticket"]["scopes"].remove(scope)
    elif broken_layer == "task":
        for task in raw["tasks"]:
            task["scopes"] = [
                item for item in task["scopes"] if item != scope
            ]
    elif broken_layer == "plan":
        for action in raw["plan"]["actions"]:
            action["scopes"] = [
                item for item in action["scopes"] if item != scope
            ]
    else:
        raw["authority_policy"][scope] = ["security-reviewer"]

    with pytest.raises(ValidationError, match=message):
        LiveWorkspaceImportRequest.model_validate(raw)


@pytest.mark.parametrize("broken_input", ["requirement-mismatch", "task-reference"])
def test_import_rejects_a_plan_that_cannot_receive_initial_authorization(
    broken_input: str,
) -> None:
    raw = workspace_import().model_dump(mode="json")
    issue_action = next(
        action
        for action in raw["plan"]["actions"]
        if action["id"] == "ACTION-ISSUE"
    )
    if broken_input == "requirement-mismatch":
        issue_action["attributes"]["human_approval"] = True
        message = "does not satisfy baseline requirement"
    else:
        issue_action["attributes"]["task_id"] = "TASK-DOES-NOT-EXIST"
        message = "references a missing or non-valid Task"

    with pytest.raises(ValidationError, match=message):
        LiveWorkspaceImportRequest.model_validate(raw)


def test_dynamic_authority_seed_rejects_extra_decisions() -> None:
    definition = workspace_import()
    extra = definition.baseline_decision.model_copy(deep=True)
    extra.id = "DEC-PREAPPROVED-INJECTION"
    extra.approval_status = ApprovalStatus.APPROVED

    with pytest.raises(ValidationError, match="only its baseline Decision"):
        DynamicAuthorityContextCreateRequest(
            context_id="seed-purity-check",
            version=17,
            artifacts=[*definition.graph_artifacts(), extra],
            edges=definition.graph_edges(),
            authority_policy=definition.authority_policy,
            baseline_decision_id=definition.baseline_decision.id,
        )


@pytest.fixture
def live_services(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[TestClient, TestClient, TestClient, Path]:
    authority = TestClient(authority_api.app)
    agent = TestClient(agent_api.app)
    executor = TestClient(executor_api.app)
    store_path = tmp_path / "live-workspaces.json"

    monkeypatch.setattr(
        authority_api,
        "workspace_contexts",
        DynamicAuthorityContextRegistry(
            grant_secret="live-workspace-test-secret",
            grant_ttl_seconds=3600,
            authority_threshold=0.75,
        ),
    )
    monkeypatch.setattr(
        agent_api,
        "workspace_orchestrator",
        LiveWorkspaceOrchestrator(
            repository=JsonFileLiveWorkspaceRepository(store_path)
        ),
    )

    def route_post(url: str, **kwargs: object) -> httpx.Response:
        parsed = urlparse(url)
        headers = cast(dict[str, str], kwargs.get("headers", {}))
        body = cast(dict[str, object] | None, kwargs.get("json"))
        if parsed.port == 8001:
            return authority.post(parsed.path, json=body, headers=headers)
        if parsed.port == 8003:
            return executor.post(parsed.path, json=body, headers=headers)
        raise httpx.ConnectError(
            f"Unexpected service URL: {url}",
            request=httpx.Request("POST", url),
        )

    def route_get(url: str, **kwargs: object) -> httpx.Response:
        parsed = urlparse(url)
        if parsed.port == 8001:
            return authority.get(
                parsed.path,
                headers=cast(dict[str, str], kwargs.get("headers", {})),
            )
        raise httpx.ConnectError(
            f"Unexpected service URL: {url}",
            request=httpx.Request("GET", url),
        )

    def route_delete(url: str, **kwargs: object) -> httpx.Response:
        parsed = urlparse(url)
        if parsed.port == 8001:
            return authority.delete(
                parsed.path,
                headers=cast(dict[str, str], kwargs.get("headers", {})),
            )
        raise httpx.ConnectError(
            f"Unexpected service URL: {url}",
            request=httpx.Request("DELETE", url),
        )

    monkeypatch.setattr(support.httpx, "post", route_post)
    monkeypatch.setattr(support.httpx, "get", route_get)
    monkeypatch.setattr(support.httpx, "delete", route_delete)
    return agent, authority, executor, store_path


def _assert_no_signed_token(body: dict[str, object]) -> None:
    serialized = json.dumps(body)
    assert '"token"' not in serialized


def _authorize_workspace(agent: TestClient) -> None:
    assert (
        agent.post(
            "/live-workspaces/import",
            json=workspace_import().model_dump(mode="json"),
        ).status_code
        == 201
    )
    assert (
        agent.post(
            "/live-workspaces/refund-control/baseline/approve",
            json={"actor_role": "finance-admin"},
        ).status_code
        == 200
    )
    assert (
        agent.post(
            "/live-workspaces/refund-control/authorize",
            json={},
        ).json()["status"]
        == "authorized"
    )


def _apply_workspace_change(agent: TestClient) -> None:
    _authorize_workspace(agent)
    assert (
        agent.post(
            "/live-workspaces/refund-control/decisions/propose",
            json=decision_proposal_body(),
        ).status_code
        == 200
    )
    assert (
        agent.post(
            "/live-workspaces/refund-control/decisions/DEC-REFUND-2/approve",
            json={"actor_role": "finance-admin"},
        ).json()["status"]
        == "change-applied"
    )


def test_live_workspace_service_flow_is_real_selective_and_persistent(
    live_services: tuple[TestClient, TestClient, TestClient, Path],
) -> None:
    agent, authority, _executor, store_path = live_services

    imported_response = agent.post(
        "/live-workspaces/import",
        json=workspace_import().model_dump(mode="json"),
    )
    assert imported_response.status_code == 201
    imported = imported_response.json()
    assert imported["status"] == "imported"
    assert imported["baseline_approved"] is False
    assert imported["graph_version"] == "graph-v17"
    _assert_no_signed_token(imported)

    unapproved = agent.post("/live-workspaces/refund-control/authorize", json={})
    assert unapproved.status_code == 409

    rejected = agent.post(
        "/live-workspaces/refund-control/baseline/approve",
        json={"actor_role": "engineer"},
    )
    assert rejected.status_code == 409
    rejected_state = authority.get(
        "/live-workspaces/authority/contexts/live-refund-control"
    ).json()
    assert rejected_state["baseline_approved"] is False
    assert rejected_state["graph_version"] == "graph-v17"

    baseline = agent.post(
        "/live-workspaces/refund-control/baseline/approve",
        json={"actor_role": "finance-admin"},
    ).json()
    assert baseline["status"] == "baseline-approved"
    assert baseline["baseline_approved"] is True
    assert baseline["baseline_decision"]["approval_status"] == "approved"

    authorized = agent.post(
        "/live-workspaces/refund-control/authorize",
        json={},
    ).json()
    assert authorized["status"] == "authorized"
    assert authorized["initial_authorization"]["verdict"] == "ALLOW"
    assert authorized["initial_authorization"]["grant"]["decision_snapshot"] == "graph-v17"
    _assert_no_signed_token(authorized)

    proposed = agent.post(
        "/live-workspaces/refund-control/decisions/propose",
        json=decision_proposal_body(),
    ).json()
    assert proposed["status"] == "change-proposed"
    assert proposed["graph_version"] == "graph-v17"

    changed = agent.post(
        "/live-workspaces/refund-control/decisions/DEC-REFUND-2/approve",
        json={"actor_role": "finance-admin"},
    ).json()
    assert changed["status"] == "change-applied"
    assert changed["graph_version"] == "graph-v18"
    assert changed["latest_approved_mutation"]["decision"]["text"] == (
        "Refund execution requires human approval."
    )
    assert (
        changed["latest_approved_mutation"]["decision"]["approval_status"]
        == "approved"
    )
    assert changed["conflict_authorization"]["verdict"] == "REPLAN"
    assert changed["invalidation_report"]["invalidated_task_ids"] == ["TASK-ISSUE"]
    assert changed["invalidation_report"]["preserved_task_ids"] == ["TASK-CALCULATE"]
    plan_path = next(
        path["node_ids"]
        for path in changed["invalidation_report"]["paths"]
        if path["artifact_id"] == "PLAN-REFUND-1"
    )
    assert plan_path == [
        "DEC-REFUND-2",
        "DEC-REFUND-1",
        "SPEC-REFUND",
        "PAY-104",
        "TASK-ISSUE",
        "PLAN-REFUND-1",
    ]

    stale = agent.post(
        "/live-workspaces/refund-control/grants/initial/verify",
        json={},
    ).json()
    assert stale["status"] == "initial-grant-rejected"
    assert stale["initial_verification"]["applied"] is False
    assert stale["initial_verification"]["verification_code"] == "STALE_SNAPSHOT"

    updated = agent.put(
        "/live-workspaces/refund-control/plan",
        json=corrected_plan_body(),
    ).json()
    assert updated["status"] == "plan-updated"

    reauthorized = agent.post(
        "/live-workspaces/refund-control/reauthorize",
        json={},
    ).json()
    assert reauthorized["status"] == "reauthorized"
    assert reauthorized["replacement_authorization"]["verdict"] == "ALLOW"
    assert (
        reauthorized["replacement_authorization"]["grant"]["decision_snapshot"]
        == "graph-v18"
    )

    complete = agent.post(
        "/live-workspaces/refund-control/grants/replacement/verify",
        json={},
    ).json()
    assert complete["status"] == "complete"
    assert complete["replacement_verification"]["applied"] is True
    assert complete["replacement_verification"]["verification_code"] == "VALID"
    assert len(complete["history"]) == 9
    _assert_no_signed_token(complete)

    persisted = JsonFileLiveWorkspaceRepository(store_path).get("refund-control")
    assert persisted.status is LiveWorkspaceStatus.COMPLETE
    assert persisted.initial_authorization is not None
    assert persisted.initial_authorization.grant is not None
    assert persisted.initial_authorization.grant.token
    listed = agent.get("/live-workspaces").json()
    assert listed["workspaces"][0]["id"] == "refund-control"
    _assert_no_signed_token(listed)


def test_restart_rehydrates_authority_by_replaying_approved_changes(
    live_services: tuple[TestClient, TestClient, TestClient, Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _authority, _executor, store_path = live_services
    agent.post(
        "/live-workspaces/import",
        json=workspace_import().model_dump(mode="json"),
    )
    agent.post(
        "/live-workspaces/refund-control/baseline/approve",
        json={"actor_role": "finance-admin"},
    )
    agent.post("/live-workspaces/refund-control/authorize", json={})
    agent.post(
        "/live-workspaces/refund-control/decisions/propose",
        json=decision_proposal_body(),
    )
    changed = agent.post(
        "/live-workspaces/refund-control/decisions/DEC-REFUND-2/approve",
        json={"actor_role": "finance-admin"},
    )
    assert changed.status_code == 200

    monkeypatch.setattr(
        authority_api,
        "workspace_contexts",
        DynamicAuthorityContextRegistry(
            grant_secret="live-workspace-test-secret",
            grant_ttl_seconds=3600,
            authority_threshold=0.75,
        ),
    )
    monkeypatch.setattr(
        agent_api,
        "workspace_orchestrator",
        LiveWorkspaceOrchestrator(
            repository=JsonFileLiveWorkspaceRepository(store_path)
        ),
    )

    verified = agent.post(
        "/live-workspaces/refund-control/grants/initial/verify",
        json={},
    )
    assert verified.status_code == 200
    body = verified.json()
    assert body["graph_version"] == "graph-v18"
    assert body["initial_verification"]["verification_code"] == "STALE_SNAPSHOT"
    state = TestClient(authority_api.app).get(
        "/live-workspaces/authority/contexts/live-refund-control"
    ).json()
    assert state["graph_version"] == "graph-v18"
    artifacts = {artifact["id"]: artifact for artifact in state["artifacts"]}
    assert artifacts["TASK-CALCULATE"]["validity"] == "VALID"
    assert artifacts["TASK-ISSUE"]["validity"] == "INVALIDATED"


def test_plan_update_requires_executor_proof_of_stale_snapshot(
    live_services: tuple[TestClient, TestClient, TestClient, Path],
) -> None:
    agent, _authority, _executor, _store_path = live_services
    _apply_workspace_change(agent)

    skipped_verification = agent.put(
        "/live-workspaces/refund-control/plan",
        json=corrected_plan_body(),
    )

    assert skipped_verification.status_code == 409
    state = agent.get("/live-workspaces/refund-control").json()
    assert state["status"] == "change-applied"
    assert state["initial_verification"] is None


def test_non_stale_grant_failure_cannot_unlock_replanning(
    live_services: tuple[TestClient, TestClient, TestClient, Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent, _authority, _executor, _store_path = live_services
    _apply_workspace_change(agent)

    def expired_verification(**_kwargs: object) -> GrantVerificationResult:
        return GrantVerificationResult(
            valid=False,
            code=VerificationCode.EXPIRED,
            reason="The injected grant has expired.",
        )

    monkeypatch.setattr(executor_api, "post_model", expired_verification)
    verified = agent.post(
        "/live-workspaces/refund-control/grants/initial/verify",
        json={},
    )

    assert verified.status_code == 200
    body = verified.json()
    assert body["status"] == "change-applied"
    assert body["initial_verification"]["verification_code"] == "EXPIRED"
    blocked = agent.put(
        "/live-workspaces/refund-control/plan",
        json=corrected_plan_body(),
    )
    assert blocked.status_code == 409


def test_completion_rechecks_persisted_stale_snapshot_proof(
    live_services: tuple[TestClient, TestClient, TestClient, Path],
) -> None:
    agent, _authority, _executor, store_path = live_services
    _apply_workspace_change(agent)
    agent.post(
        "/live-workspaces/refund-control/grants/initial/verify",
        json={},
    )
    agent.put(
        "/live-workspaces/refund-control/plan",
        json=corrected_plan_body(),
    )
    reauthorized = agent.post(
        "/live-workspaces/refund-control/reauthorize",
        json={},
    )
    assert reauthorized.json()["status"] == "reauthorized"

    repository = JsonFileLiveWorkspaceRepository(store_path)
    record = repository.get("refund-control")
    record.initial_verification = WorkspaceExecutionResult(
        applied=False,
        reason="Persisted proof was replaced with a non-stale failure.",
        verification_code=VerificationCode.EXPIRED,
    )
    repository.save(record)

    completion = agent.post(
        "/live-workspaces/refund-control/grants/replacement/verify",
        json={},
    )
    assert completion.status_code == 409
    assert agent.get("/live-workspaces/refund-control").json()["status"] == (
        "reauthorized"
    )


def test_missing_supersession_target_is_rejected_before_persistence_and_by_authority(
    live_services: tuple[TestClient, TestClient, TestClient, Path],
) -> None:
    agent, authority, _executor, _store_path = live_services
    _authorize_workspace(agent)
    proposal = decision_proposal_body()
    proposal["supersedes_id"] = "DEC-DOES-NOT-EXIST"

    rejected = agent.post(
        "/live-workspaces/refund-control/decisions/propose",
        json=proposal,
    )
    assert rejected.status_code == 409
    state = agent.get("/live-workspaces/refund-control").json()
    assert state["status"] == "authorized"
    assert state["pending_mutation"] is None

    direct = authority.post(
        (
            "/live-workspaces/authority/contexts/live-refund-control/"
            "mutations/approve"
        ),
        json={
            "mutation": {
                "decision": proposal["decision"],
                "supersedes_id": "DEC-DOES-NOT-EXIST",
                "affected_scopes": proposal["affected_scopes"],
            },
            "actor_role": "finance-admin",
        },
    )
    assert direct.status_code == 409
    assert "does not exist" in direct.json()["error"]["message"]
    assert (
        authority.get(
            "/live-workspaces/authority/contexts/live-refund-control"
        ).json()["graph_version"]
        == "graph-v17"
    )


def test_bad_pending_proposal_can_be_canceled_and_replaced(
    live_services: tuple[TestClient, TestClient, TestClient, Path],
) -> None:
    agent, _authority, _executor, _store_path = live_services
    _authorize_workspace(agent)
    bad = decision_proposal_body()
    bad_decision = cast(dict[str, object], bad["decision"])
    bad_decision["authority_role"] = "engineer"

    assert (
        agent.post(
            "/live-workspaces/refund-control/decisions/propose",
            json=bad,
        ).json()["status"]
        == "change-proposed"
    )
    rejected = agent.post(
        "/live-workspaces/refund-control/decisions/DEC-REFUND-2/approve",
        json={"actor_role": "engineer"},
    )
    assert rejected.status_code == 409
    assert agent.get("/live-workspaces/refund-control").json()["status"] == (
        "change-proposed"
    )

    canceled = agent.delete(
        "/live-workspaces/refund-control/decisions/pending"
    )
    assert canceled.status_code == 200
    assert canceled.json()["status"] == "authorized"
    assert canceled.json()["pending_mutation"] is None
    replacement = agent.post(
        "/live-workspaces/refund-control/decisions/propose",
        json=decision_proposal_body(),
    )
    assert replacement.status_code == 200
    assert replacement.json()["status"] == "change-proposed"


def test_existing_context_with_wrong_lineage_is_rebuilt_before_mutation(
    live_services: tuple[TestClient, TestClient, TestClient, Path],
) -> None:
    agent, authority, _executor, _store_path = live_services
    _authorize_workspace(agent)
    assert (
        authority.delete(
            "/live-workspaces/authority/contexts/live-refund-control"
        ).status_code
        == 200
    )
    poisoned = workspace_import()
    poisoned.baseline_decision.text = "Poisoned baseline with the same IDs."
    created = authority.post(
        "/live-workspaces/authority/contexts",
        json=DynamicAuthorityContextCreateRequest(
            context_id="live-refund-control",
            version=17,
            artifacts=poisoned.graph_artifacts(),
            edges=poisoned.graph_edges(),
            authority_policy=poisoned.authority_policy,
            baseline_decision_id=poisoned.baseline_decision.id,
        ).model_dump(mode="json"),
    )
    assert created.status_code == 201
    assert (
        authority.post(
            (
                "/live-workspaces/authority/contexts/live-refund-control/"
                "baseline/approve"
            ),
            json={"actor_role": "finance-admin"},
        ).status_code
        == 200
    )

    agent.post(
        "/live-workspaces/refund-control/decisions/propose",
        json=decision_proposal_body(),
    )
    applied = agent.post(
        "/live-workspaces/refund-control/decisions/DEC-REFUND-2/approve",
        json={"actor_role": "finance-admin"},
    )
    assert applied.status_code == 200
    assert applied.json()["graph_version"] == "graph-v18"
    state = authority.get(
        "/live-workspaces/authority/contexts/live-refund-control"
    ).json()
    baseline = next(
        artifact
        for artifact in state["artifacts"]
        if artifact["id"] == "DEC-REFUND-1"
    )
    assert baseline["text"] == workspace_import().baseline_decision.text
