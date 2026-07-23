from __future__ import annotations

from threading import RLock

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from dragback.config import settings
from dragback.domain import (
    AgentPlan,
    AgentRun,
    AuthorizationRequest,
    AuthorizationResult,
    LoopState,
    Verdict,
)
from dragback.fixtures import load_graph_fixture
from dragback.loop.workflow import replan_for_requirements
from dragback.services.events import EventBroker, snapshot_event, stream_events
from dragback.services.support import (
    CORRELATION_ID_HEADER,
    DEMO_FRONTEND_ORIGINS,
    ApiError,
    correlated_payload,
    install_api_support,
    post_model,
)

app = FastAPI(title="Dragback Agent Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEMO_FRONTEND_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[CORRELATION_ID_HEADER],
)
install_api_support(app)

run_state: AgentRun | None = None
last_authorization: AuthorizationResult | None = None
initial_grant_token: str | None = None
initial_plan: AgentPlan | None = None
event_broker = EventBroker()
state_lock = RLock()


class EmptyRequest(BaseModel):
    pass


class AuthorityResetState(BaseModel):
    graph_version: str


def _authorize(run: AgentRun) -> AuthorizationResult:
    return post_model(
        url=f"{settings.authority_url}/authorize",
        payload=AuthorizationRequest(run_id=run.run_id, task_id=run.ticket_id, plan=run.plan),
        response_model=AuthorizationResult,
        upstream_name="Intent authority",
        upstream_code="AUTHORITY",
        timeout_seconds=settings.service_timeout_seconds,
    )


def _apply_result(run: AgentRun, result: AuthorizationResult) -> None:
    run.graph_snapshot = result.graph_version
    run.grant_token = result.grant.token if result.grant else None
    if result.verdict is Verdict.ALLOW:
        run.state = LoopState.ACT
    elif result.verdict is Verdict.REPLAN:
        run.state = LoopState.REPLAN
    elif result.verdict is Verdict.BLOCK:
        run.state = LoopState.BLOCKED
    else:
        run.state = LoopState.HUMAN_REVIEW


def _reset_local_state() -> None:
    global run_state, last_authorization, initial_grant_token, initial_plan
    with state_lock:
        run_state = None
        last_authorization = None
        initial_grant_token = None
        initial_plan = None


def _state_body() -> dict[str, object]:
    with state_lock:
        return {
            "run": run_state.model_dump(mode="json") if run_state else None,
            "last_authorization": (
                last_authorization.model_dump(mode="json") if last_authorization else None
            ),
            "initial_grant_token": initial_grant_token,
            "initial_plan": initial_plan.model_dump(mode="json") if initial_plan else None,
        }


def _publish_state(event_type: str) -> None:
    with state_lock:
        event_broker.publish(event_type, _state_body())


def _require_demo_reset() -> None:
    if not settings.demo_reset_enabled:
        raise ApiError(
            status_code=403,
            code="DEMO_RESET_DISABLED",
            message="Demo reset is disabled in this environment.",
        )


@app.get("/health")
def health() -> dict[str, str]:
    return correlated_payload({"status": "ok"})


@app.post("/demo/reset")
def reset_demo() -> dict[str, object]:
    _require_demo_reset()
    with state_lock:
        _reset_local_state()
        _publish_state("loop.state.reset")
    return correlated_payload({"reset": True})


@app.post("/demo/reset-all")
def reset_all() -> dict[str, object]:
    """Reset authority first, then clear the agent only after graph-v17 is confirmed."""

    _require_demo_reset()
    with state_lock:
        authority_state = post_model(
            url=f"{settings.authority_url}/graph/reset",
            payload=EmptyRequest(),
            response_model=AuthorityResetState,
            upstream_name="Intent authority",
            upstream_code="AUTHORITY",
            timeout_seconds=settings.service_timeout_seconds,
        )
        if authority_state.graph_version != "graph-v17":
            raise ApiError(
                status_code=502,
                code="AUTHORITY_RESET_INVALID",
                message="Intent authority reset to an unexpected graph version.",
            )
        _reset_local_state()
        _publish_state("loop.state.reset")
    return correlated_payload(
        {
            "reset": True,
            "graph_version": authority_state.graph_version,
        }
    )


@app.post("/demo/start")
def start_demo() -> dict[str, object]:
    global run_state, last_authorization, initial_grant_token, initial_plan
    with state_lock:
        _, _, _, fixture_run = load_graph_fixture()
        run_state = fixture_run.model_copy(deep=True)
        initial_plan = run_state.plan.model_copy(deep=True)
        run_state.state = LoopState.VERIFY
        last_authorization = _authorize(run_state)
        _apply_result(run_state, last_authorization)
        initial_grant_token = run_state.grant_token
        run_state.history.append(f"Initial verification: {last_authorization.verdict.value}")
        _publish_state("loop.state.changed")
        return state_payload()


@app.post("/demo/tests-pass")
def tests_pass() -> dict[str, object]:
    with state_lock:
        if run_state is None:
            raise ApiError(
                status_code=409,
                code="DEMO_NOT_STARTED",
                message="Start the demo first.",
            )
        if (
            last_authorization is None
            or last_authorization.verdict is not Verdict.ALLOW
            or run_state.grant_token is None
        ):
            raise ApiError(
                status_code=409,
                code="AUTHORIZATION_REQUIRED",
                message="A current ALLOW authorization with a grant is required.",
            )
        run_state.tests_passed = True
        run_state.state = LoopState.ACT
        run_state.history.append("Implementation complete; tests passed.")
        _publish_state("loop.state.changed")
        return state_payload()


@app.post("/demo/recheck")
def recheck() -> dict[str, object]:
    global last_authorization
    with state_lock:
        if run_state is None:
            raise ApiError(
                status_code=409,
                code="DEMO_NOT_STARTED",
                message="Start the demo first.",
            )
        run_state.state = LoopState.VERIFY
        last_authorization = _authorize(run_state)
        _apply_result(run_state, last_authorization)
        run_state.history.append(f"Reauthorization: {last_authorization.verdict.value}")
        _publish_state("loop.state.changed")
        return state_payload()


@app.post("/demo/replan")
def replan() -> dict[str, object]:
    global last_authorization
    with state_lock:
        if run_state is None or last_authorization is None:
            raise ApiError(
                status_code=409,
                code="RECHECK_REQUIRED",
                message="Recheck the current plan first.",
            )
        if last_authorization.verdict is not Verdict.REPLAN:
            raise ApiError(
                status_code=409,
                code="REPLAN_NOT_AUTHORIZED",
                message="The current authority verdict is not REPLAN.",
            )
        run_state.plan = replan_for_requirements(
            run_state.plan, last_authorization.current_requirements
        )
        run_state.state = LoopState.VERIFY
        last_authorization = _authorize(run_state)
        _apply_result(run_state, last_authorization)
        run_state.history.append(
            f"Corrected plan verification: {last_authorization.verdict.value}"
        )
        _publish_state("loop.state.changed")
        return state_payload()


@app.get("/demo/state")
def state_payload() -> dict[str, object]:
    with state_lock:
        state = _state_body()
    return correlated_payload(state)


@app.get("/events")
def events(request: Request) -> StreamingResponse:
    with state_lock:
        initial = snapshot_event(
            sequence=event_broker.current_sequence,
            event_type="loop.state.snapshot",
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
