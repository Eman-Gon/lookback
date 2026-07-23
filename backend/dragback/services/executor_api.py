from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dragback.config import settings
from dragback.domain import AgentPlan, GrantVerificationRequest, GrantVerificationResult
from dragback.services.support import (
    CORRELATION_ID_HEADER,
    correlated_payload,
    install_api_support,
    post_model,
)


class ExecuteRequest(BaseModel):
    token: str
    run_id: str
    task_id: str
    plan: AgentPlan


app = FastAPI(title="Dragback Mock Executor", version="0.1.0")
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
    return correlated_payload({"status": "ok"})


@app.post("/execute")
def execute(request: ExecuteRequest) -> dict[str, object]:
    payload = GrantVerificationRequest(
        token=request.token,
        run_id=request.run_id,
        task_id=request.task_id,
        plan=request.plan,
    )
    verification = post_model(
        url=f"{settings.authority_url}/grants/verify",
        payload=payload,
        response_model=GrantVerificationResult,
        upstream_name="Intent authority",
        upstream_code="AUTHORITY",
        timeout_seconds=settings.service_timeout_seconds,
    )

    if not verification.valid:
        return correlated_payload({"applied": False, "reason": verification.reason})
    return correlated_payload(
        {
            "applied": True,
            "reason": "Grant verified; mock pull request created.",
            "pull_request_url": "https://example.invalid/dragback/pull/42",
        }
    )
