from __future__ import annotations

from enum import StrEnum

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from dragback.config import settings
from dragback.domain import AgentPlan, GrantVerificationRequest, GrantVerificationResult
from dragback.services.support import (
    CORRELATION_ID_HEADER,
    DEMO_FRONTEND_ORIGINS,
    correlated_payload,
    install_api_support,
    post_model,
)


class AuthorityContextKind(StrEnum):
    SCENARIO = "scenario"
    WORKSPACE = "workspace"


class ExecuteRequest(BaseModel):
    token: str
    run_id: str
    task_id: str
    plan: AgentPlan
    context_id: str | None = Field(
        default=None,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    )
    context_kind: AuthorityContextKind = AuthorityContextKind.SCENARIO


app = FastAPI(title="Dragback Mock Executor", version="0.1.0")
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
    return correlated_payload({"status": "ok"})


@app.post("/execute")
def execute(request: ExecuteRequest) -> dict[str, object]:
    payload = GrantVerificationRequest(
        token=request.token,
        run_id=request.run_id,
        task_id=request.task_id,
        plan=request.plan,
    )
    if request.context_id and request.context_kind is AuthorityContextKind.WORKSPACE:
        verification_url = (
            f"{settings.authority_url}/live-workspaces/authority/contexts/"
            f"{request.context_id}/grants/verify"
        )
    elif request.context_id:
        verification_url = (
            f"{settings.authority_url}/scenario-lab/authority/contexts/"
            f"{request.context_id}/grants/verify"
        )
    else:
        verification_url = f"{settings.authority_url}/grants/verify"
    verification = post_model(
        url=verification_url,
        payload=payload,
        response_model=GrantVerificationResult,
        upstream_name="Intent authority",
        upstream_code="AUTHORITY",
        timeout_seconds=settings.service_timeout_seconds,
    )

    if not verification.valid:
        return correlated_payload(
            {
                "applied": False,
                "reason": verification.reason,
                "verification_code": verification.code.value,
            }
        )
    return correlated_payload(
        {
            "applied": True,
            "reason": "Grant verified; mock pull request created.",
            "verification_code": verification.code.value,
            "pull_request_url": "https://example.invalid/dragback/pull/42",
        }
    )
