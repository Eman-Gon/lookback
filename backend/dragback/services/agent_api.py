from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
from dragback.services.support import (
    CORRELATION_ID_HEADER,
    ApiError,
    correlated_payload,
    install_api_support,
    post_model,
)

app = FastAPI(title="Dragback Agent Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[CORRELATION_ID_HEADER],
)
install_api_support(app)

run_state: AgentRun | None = None
last_authorization: AuthorizationResult | None = None
initial_grant_token: str | None = None
initial_plan: AgentPlan | None = None


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


@app.get("/health")
def health() -> dict[str, str]:
    return correlated_payload({"status": "ok"})


@app.post("/demo/reset")
def reset_demo() -> dict[str, object]:
    global run_state, last_authorization, initial_grant_token, initial_plan
    run_state = None
    last_authorization = None
    initial_grant_token = None
    initial_plan = None
    return correlated_payload({"reset": True})


@app.post("/demo/start")
def start_demo() -> dict[str, object]:
    global run_state, last_authorization, initial_grant_token, initial_plan
    _, _, _, fixture_run = load_graph_fixture()
    run_state = fixture_run.model_copy(deep=True)
    initial_plan = run_state.plan.model_copy(deep=True)
    run_state.state = LoopState.VERIFY
    last_authorization = _authorize(run_state)
    _apply_result(run_state, last_authorization)
    initial_grant_token = run_state.grant_token
    run_state.history.append(f"Initial verification: {last_authorization.verdict.value}")
    return state_payload()


@app.post("/demo/tests-pass")
def tests_pass() -> dict[str, object]:
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
    return state_payload()


@app.post("/demo/recheck")
def recheck() -> dict[str, object]:
    global last_authorization
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
    return state_payload()


@app.post("/demo/replan")
def replan() -> dict[str, object]:
    global last_authorization
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
    run_state.history.append(f"Corrected plan verification: {last_authorization.verdict.value}")
    return state_payload()


@app.get("/demo/state")
def state_payload() -> dict[str, object]:
    return correlated_payload(
        {
            "run": run_state.model_dump(mode="json") if run_state else None,
            "last_authorization": (
                last_authorization.model_dump(mode="json") if last_authorization else None
            ),
            "initial_grant_token": initial_grant_token,
            "initial_plan": initial_plan.model_dump(mode="json") if initial_plan else None,
        }
    )
