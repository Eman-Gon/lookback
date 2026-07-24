from __future__ import annotations

from threading import RLock

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from dragback.config import settings
from dragback.domain import (
    AuthorizationRequest,
    DecisionMutation,
    GrantVerificationRequest,
)
from dragback.runtime import create_authority_runtime
from dragback.scenarios.authority_contexts import (
    ScenarioAuthorityContextConflict,
    ScenarioAuthorityContextCreateRequest,
    ScenarioAuthorityContextNotFound,
    ScenarioAuthorityContextRegistry,
    ScenarioDefinitionNotFound,
)
from dragback.services.events import EventBroker, snapshot_event, stream_events
from dragback.services.support import (
    CORRELATION_ID_HEADER,
    DEMO_FRONTEND_ORIGINS,
    ApiError,
    correlated_payload,
    install_api_support,
)
from dragback.workspaces.authority_contexts import (
    DynamicAuthorityContextConflict,
    DynamicAuthorityContextCreateRequest,
    DynamicAuthorityContextNotFound,
    DynamicAuthorityContextRegistry,
    DynamicMutationApprovalRequest,
)
from dragback.workspaces.models import WorkspaceApprovalRequest

runtime = create_authority_runtime()
scenario_contexts = ScenarioAuthorityContextRegistry(
    grant_secret=settings.grant_secret,
    grant_ttl_seconds=settings.grant_ttl_seconds,
    authority_threshold=settings.authority_threshold,
)
workspace_contexts = DynamicAuthorityContextRegistry(
    grant_secret=settings.grant_secret,
    grant_ttl_seconds=settings.grant_ttl_seconds,
    authority_threshold=settings.authority_threshold,
)
event_broker = EventBroker()
runtime_lock = RLock()
app = FastAPI(title="Dragback Intent Authority", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEMO_FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[CORRELATION_ID_HEADER],
)
install_api_support(app)


@app.get("/health")
def health() -> dict[str, str]:
    with runtime_lock:
        graph_version = runtime.graph.version_label
    return correlated_payload({"status": "ok", "graph_version": graph_version})


def _state_body() -> dict[str, object]:
    with runtime_lock:
        state = runtime.graph.snapshot()
        state["last_report"] = (
            runtime.authority.last_report.model_dump(mode="json")
            if runtime.authority.last_report
            else None
        )
        return state


def _require_demo_reset() -> None:
    if not settings.demo_reset_enabled:
        raise ApiError(
            status_code=403,
            code="DEMO_RESET_DISABLED",
            message="Demo graph reset is disabled in this environment.",
        )


@app.post("/graph/reset")
@app.post("/demo/reset")
def reset_demo() -> dict[str, object]:
    _require_demo_reset()
    with runtime_lock:
        runtime.reset()
        state = _state_body()
        event_broker.publish("graph.state.reset", state)
    return correlated_payload(state)


@app.get("/demo/state")
def demo_state() -> dict[str, object]:
    with runtime_lock:
        state = _state_body()
    return correlated_payload(state)


@app.get("/events")
def events(request: Request) -> StreamingResponse:
    with runtime_lock:
        initial = snapshot_event(
            sequence=event_broker.current_sequence,
            event_type="graph.state.snapshot",
            data=_state_body(),
        )
    return StreamingResponse(
        stream_events(request=request, broker=event_broker, initial=initial),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/decisions/ingest")
def ingest_decision(mutation: DecisionMutation):
    try:
        with runtime_lock:
            result = runtime.authority.apply_decision_change(mutation)
            event_broker.publish(
                "graph.state.changed" if result.applied else "graph.decision.reviewed",
                _state_body(),
            )
    except KeyError as exc:
        raise ApiError(
            status_code=404,
            code="ARTIFACT_NOT_FOUND",
            message="The superseded artifact does not exist.",
        ) from exc
    except ValueError as exc:
        raise ApiError(
            status_code=409,
            code="ARTIFACT_CONFLICT",
            message="The decision artifact already exists.",
        ) from exc
    return correlated_payload(result)


@app.post("/authorize")
def authorize(request: AuthorizationRequest):
    with runtime_lock:
        result = runtime.authority.evaluate_plan(
            run_id=request.run_id,
            task_id=request.task_id,
            plan=request.plan,
        )
    return correlated_payload(result)


@app.post("/grants/verify")
def verify_grant(request: GrantVerificationRequest):
    with runtime_lock:
        result = runtime.authority.verify_grant(
            token=request.token,
            run_id=request.run_id,
            task_id=request.task_id,
            plan=request.plan,
        )
    return correlated_payload(result)


@app.post("/scenario-lab/authority/contexts", status_code=201)
def create_scenario_authority_context(
    request: ScenarioAuthorityContextCreateRequest,
) -> dict[str, object]:
    try:
        state = scenario_contexts.create(request)
    except ScenarioDefinitionNotFound as exc:
        raise ApiError(
            status_code=404,
            code="SCENARIO_NOT_FOUND",
            message="The requested scenario does not exist.",
        ) from exc
    except ScenarioAuthorityContextConflict as exc:
        raise ApiError(
            status_code=409,
            code="SCENARIO_CONTEXT_CONFLICT",
            message=str(exc),
        ) from exc
    return correlated_payload(state)


@app.get("/scenario-lab/authority/contexts/{context_id}")
def scenario_authority_context_state(context_id: str) -> dict[str, object]:
    try:
        state = scenario_contexts.state(context_id)
    except ScenarioAuthorityContextNotFound as exc:
        raise ApiError(
            status_code=404,
            code="SCENARIO_CONTEXT_NOT_FOUND",
            message="The requested Scenario Lab authority context does not exist.",
        ) from exc
    return correlated_payload(state)


@app.delete("/scenario-lab/authority/contexts/{context_id}")
def delete_scenario_authority_context(context_id: str) -> dict[str, object]:
    try:
        scenario_contexts.delete(context_id)
    except ScenarioAuthorityContextNotFound as exc:
        raise ApiError(
            status_code=404,
            code="SCENARIO_CONTEXT_NOT_FOUND",
            message="The requested Scenario Lab authority context does not exist.",
        ) from exc
    return correlated_payload({"context_id": context_id, "deleted": True})


@app.post("/scenario-lab/authority/contexts/{context_id}/mutation")
def apply_scenario_authority_mutation(context_id: str) -> dict[str, object]:
    try:
        result = scenario_contexts.apply_mutation(context_id)
    except ScenarioAuthorityContextNotFound as exc:
        raise ApiError(
            status_code=404,
            code="SCENARIO_CONTEXT_NOT_FOUND",
            message="The requested Scenario Lab authority context does not exist.",
        ) from exc
    except ScenarioAuthorityContextConflict as exc:
        raise ApiError(
            status_code=409,
            code="SCENARIO_CONTEXT_CONFLICT",
            message=str(exc),
        ) from exc
    return correlated_payload(result)


@app.post("/scenario-lab/authority/contexts/{context_id}/authorize")
def authorize_in_scenario_context(
    context_id: str,
    request: AuthorizationRequest,
) -> dict[str, object]:
    try:
        result = scenario_contexts.authorize(context_id, request)
    except ScenarioAuthorityContextNotFound as exc:
        raise ApiError(
            status_code=404,
            code="SCENARIO_CONTEXT_NOT_FOUND",
            message="The requested Scenario Lab authority context does not exist.",
        ) from exc
    return correlated_payload(result)


@app.post("/scenario-lab/authority/contexts/{context_id}/grants/verify")
def verify_grant_in_scenario_context(
    context_id: str,
    request: GrantVerificationRequest,
) -> dict[str, object]:
    try:
        result = scenario_contexts.verify_grant(context_id, request)
    except ScenarioAuthorityContextNotFound as exc:
        raise ApiError(
            status_code=404,
            code="SCENARIO_CONTEXT_NOT_FOUND",
            message="The requested Scenario Lab authority context does not exist.",
        ) from exc
    return correlated_payload(result)


def _workspace_context_error(exc: Exception) -> ApiError:
    if isinstance(exc, DynamicAuthorityContextNotFound):
        return ApiError(
            status_code=404,
            code="WORKSPACE_CONTEXT_NOT_FOUND",
            message=str(exc),
        )
    return ApiError(
        status_code=409,
        code="WORKSPACE_CONTEXT_CONFLICT",
        message=str(exc),
    )


@app.post("/live-workspaces/authority/contexts", status_code=201)
def create_workspace_authority_context(
    request: DynamicAuthorityContextCreateRequest,
) -> dict[str, object]:
    try:
        state = workspace_contexts.create(request)
    except DynamicAuthorityContextConflict as exc:
        raise _workspace_context_error(exc) from exc
    return correlated_payload(state)


@app.get("/live-workspaces/authority/contexts/{context_id}")
def workspace_authority_context_state(context_id: str) -> dict[str, object]:
    try:
        state = workspace_contexts.state(context_id)
    except DynamicAuthorityContextNotFound as exc:
        raise _workspace_context_error(exc) from exc
    return correlated_payload(state)


@app.delete("/live-workspaces/authority/contexts/{context_id}")
def delete_workspace_authority_context(context_id: str) -> dict[str, object]:
    try:
        workspace_contexts.delete(context_id)
    except DynamicAuthorityContextNotFound as exc:
        raise _workspace_context_error(exc) from exc
    return correlated_payload({"context_id": context_id, "deleted": True})


@app.post("/live-workspaces/authority/contexts/{context_id}/baseline/approve")
def approve_workspace_baseline(
    context_id: str,
    request: WorkspaceApprovalRequest,
) -> dict[str, object]:
    try:
        state = workspace_contexts.approve_baseline(context_id, request)
    except (DynamicAuthorityContextNotFound, DynamicAuthorityContextConflict) as exc:
        raise _workspace_context_error(exc) from exc
    return correlated_payload(state)


@app.post("/live-workspaces/authority/contexts/{context_id}/mutations/approve")
def approve_workspace_mutation(
    context_id: str,
    request: DynamicMutationApprovalRequest,
) -> dict[str, object]:
    try:
        result = workspace_contexts.approve_mutation(context_id, request)
    except (DynamicAuthorityContextNotFound, DynamicAuthorityContextConflict) as exc:
        raise _workspace_context_error(exc) from exc
    return correlated_payload(result)


@app.post("/live-workspaces/authority/contexts/{context_id}/authorize")
def authorize_in_workspace_context(
    context_id: str,
    request: AuthorizationRequest,
) -> dict[str, object]:
    try:
        result = workspace_contexts.authorize(context_id, request)
    except DynamicAuthorityContextNotFound as exc:
        raise _workspace_context_error(exc) from exc
    return correlated_payload(result)


@app.post("/live-workspaces/authority/contexts/{context_id}/grants/verify")
def verify_grant_in_workspace_context(
    context_id: str,
    request: GrantVerificationRequest,
) -> dict[str, object]:
    try:
        result = workspace_contexts.verify_grant(context_id, request)
    except DynamicAuthorityContextNotFound as exc:
        raise _workspace_context_error(exc) from exc
    return correlated_payload(result)
