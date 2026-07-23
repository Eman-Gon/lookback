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
from dragback.services.events import EventBroker, snapshot_event, stream_events
from dragback.services.support import (
    CORRELATION_ID_HEADER,
    DEMO_FRONTEND_ORIGINS,
    ApiError,
    correlated_payload,
    install_api_support,
)

runtime = create_authority_runtime()
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
