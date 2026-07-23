from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dragback.domain import (
    AuthorizationRequest,
    DecisionMutation,
    GrantVerificationRequest,
)
from dragback.runtime import create_authority_runtime
from dragback.services.support import (
    CORRELATION_ID_HEADER,
    ApiError,
    correlated_payload,
    install_api_support,
)

runtime = create_authority_runtime()
app = FastAPI(title="Dragback Intent Authority", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[CORRELATION_ID_HEADER],
)
install_api_support(app)


@app.get("/health")
def health() -> dict[str, str]:
    return correlated_payload({"status": "ok", "graph_version": runtime.graph.version_label})


@app.post("/demo/reset")
def reset_demo() -> dict[str, object]:
    runtime.reset()
    return correlated_payload(runtime.graph.snapshot())


@app.get("/demo/state")
def demo_state() -> dict[str, object]:
    state = runtime.graph.snapshot()
    state["last_report"] = (
        runtime.authority.last_report.model_dump(mode="json")
        if runtime.authority.last_report
        else None
    )
    return correlated_payload(state)


@app.post("/decisions/ingest")
def ingest_decision(mutation: DecisionMutation):
    try:
        result = runtime.authority.apply_decision_change(mutation)
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
    return correlated_payload(
        runtime.authority.evaluate_plan(
            run_id=request.run_id,
            task_id=request.task_id,
            plan=request.plan,
        )
    )


@app.post("/grants/verify")
def verify_grant(request: GrantVerificationRequest):
    return correlated_payload(
        runtime.authority.verify_grant(
            token=request.token,
            run_id=request.run_id,
            task_id=request.task_id,
            plan=request.plan,
        )
    )
