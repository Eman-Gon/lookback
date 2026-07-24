from __future__ import annotations

from threading import RLock
from typing import NoReturn

from dragback.domain import (
    ApprovalStatus,
    Artifact,
    ArtifactKind,
    AuthorizationRequest,
    EdgeKind,
    Verdict,
    VerificationCode,
    utc_now,
)
from dragback.workspaces.authority_contexts import (
    DynamicAuthorityContextCreateRequest,
    DynamicAuthorityContextState,
    DynamicMutationApprovalRequest,
)
from dragback.workspaces.models import (
    ApprovedWorkspaceMutation,
    LiveWorkspaceImportRequest,
    LiveWorkspaceList,
    LiveWorkspaceRecord,
    LiveWorkspaceStatus,
    LiveWorkspaceView,
    WorkspaceApprovalRequest,
    WorkspaceEvent,
    WorkspacePlanUpdateRequest,
    WorkspaceProposalRequest,
)
from dragback.workspaces.repository import LiveWorkspaceRepository
from dragback.workspaces.transport import (
    HttpLiveWorkspaceTransport,
    LiveWorkspaceTransport,
)


class LiveWorkspaceStateConflict(ValueError):
    pass


class LiveWorkspaceOrchestrator:
    """Persistent agent-owned workflow over HTTP authority and executor boundaries."""

    def __init__(
        self,
        *,
        repository: LiveWorkspaceRepository,
        transport: LiveWorkspaceTransport | None = None,
    ) -> None:
        self._repository = repository
        self._transport = transport or HttpLiveWorkspaceTransport()
        self._lock = RLock()

    @staticmethod
    def _run_id(record: LiveWorkspaceRecord) -> str:
        return f"LIVE-{record.definition.id.upper()}-RUN"

    @staticmethod
    def _event(
        record: LiveWorkspaceRecord,
        *,
        event_type: str,
        detail: str,
        actor_role: str | None = None,
        data: dict[str, object] | None = None,
    ) -> None:
        record.history.append(
            WorkspaceEvent(
                sequence=len(record.history) + 1,
                event_type=event_type,
                detail=detail,
                actor_role=actor_role,
                data=data or {},
            )
        )
        record.updated_at = utc_now()

    @staticmethod
    def _conflict(message: str) -> NoReturn:
        raise LiveWorkspaceStateConflict(message)

    def _context_request(
        self, record: LiveWorkspaceRecord
    ) -> DynamicAuthorityContextCreateRequest:
        definition = record.definition
        return DynamicAuthorityContextCreateRequest(
            context_id=record.context_id,
            version=definition.graph_version,
            artifacts=definition.graph_artifacts(),
            edges=definition.graph_edges(),
            authority_policy=definition.authority_policy,
            baseline_decision_id=definition.baseline_decision.id,
        )

    @staticmethod
    def _governance_signature(artifact: Artifact) -> tuple[object, ...]:
        return (
            artifact.id,
            artifact.kind,
            artifact.title,
            artifact.text,
            frozenset(artifact.scopes),
            artifact.authority_role,
            artifact.confidence,
            artifact.effective_at,
            artifact.source_ref,
            artifact.attributes,
        )

    def _context_matches_record(
        self,
        record: LiveWorkspaceRecord,
        state: DynamicAuthorityContextState,
    ) -> bool:
        if (
            state.graph_version != record.graph_version
            or state.baseline_decision_id
            != record.definition.baseline_decision.id
            or state.baseline_approved is not record.baseline_approved
            or state.authority_policy != record.definition.authority_policy
        ):
            return False

        expected_artifacts = {
            artifact.id: artifact
            for artifact in record.definition.graph_artifacts()
        }
        expected_decisions = {
            record.definition.baseline_decision.id:
                record.definition.baseline_decision.model_copy(deep=True)
        }
        if record.baseline_approved:
            expected_decisions[
                record.definition.baseline_decision.id
            ].approval_status = ApprovalStatus.APPROVED
        for approved in record.approved_mutations:
            decision = approved.mutation.decision.model_copy(deep=True)
            decision.approval_status = ApprovalStatus.APPROVED
            expected_artifacts[decision.id] = decision
            expected_decisions[decision.id] = decision

        actual_artifacts = {artifact.id: artifact for artifact in state.artifacts}
        if set(actual_artifacts) != set(expected_artifacts):
            return False
        for artifact_id, expected in expected_artifacts.items():
            if self._governance_signature(
                actual_artifacts[artifact_id]
            ) != self._governance_signature(expected):
                return False
        actual_decisions = {
            artifact.id: artifact
            for artifact in state.artifacts
            if artifact.kind is ArtifactKind.DECISION
        }
        if set(actual_decisions) != set(expected_decisions):
            return False
        if any(
            actual_decisions[decision_id].approval_status
            is not expected.approval_status
            for decision_id, expected in expected_decisions.items()
        ):
            return False

        expected_supersessions = {
            (approved.mutation.decision.id, approved.mutation.supersedes_id)
            for approved in record.approved_mutations
        }
        actual_supersessions = {
            (edge.source_id, edge.target_id)
            for edge in state.edges
            if edge.kind is EdgeKind.SUPERSEDES
        }
        return actual_supersessions == expected_supersessions

    def _ensure_context(self, record: LiveWorkspaceRecord) -> None:
        current = self._transport.context_state(record.context_id)
        if current is not None and self._context_matches_record(record, current):
            return
        if current is not None:
            self._transport.delete_context(record.context_id)
        state = self._transport.create_context(self._context_request(record))
        if record.baseline_approved:
            if record.baseline_approval_role is None:
                raise RuntimeError("Approved baseline is missing its approval role.")
            state = self._transport.approve_baseline(
                record.context_id,
                WorkspaceApprovalRequest(actor_role=record.baseline_approval_role),
            )
        for approved in record.approved_mutations:
            result = self._transport.approve_mutation(
                record.context_id,
                DynamicMutationApprovalRequest(
                    mutation=approved.mutation,
                    actor_role=approved.actor_role,
                ),
            )
            state.graph_version = result.graph_version
        if state.graph_version != record.graph_version:
            raise RuntimeError(
                "Rehydrated authority graph does not match the persisted graph version."
            )
        rebuilt = self._transport.context_state(record.context_id)
        if rebuilt is None or not self._context_matches_record(record, rebuilt):
            raise RuntimeError(
                "Rehydrated authority graph does not match the persisted lineage."
            )

    @staticmethod
    def _has_verified_stale_grant(record: LiveWorkspaceRecord) -> bool:
        verification = record.initial_verification
        return (
            verification is not None
            and not verification.applied
            and verification.verification_code is VerificationCode.STALE_SNAPSHOT
        )

    def import_workspace(
        self, request: LiveWorkspaceImportRequest
    ) -> LiveWorkspaceView:
        with self._lock:
            record = LiveWorkspaceRecord(
                definition=request.model_copy(deep=True),
                context_id=f"live-{request.id}",
                graph_version=f"graph-v{request.graph_version}",
                current_plan=request.plan.model_copy(deep=True),
            )
            self._event(
                record,
                event_type="workspace.imported",
                detail=(
                    f"Imported {len(request.tasks)} tasks and plan {request.plan.id}; "
                    "the baseline remains a proposal until an authorized role approves it."
                ),
            )
            self._repository.create(record)
            return LiveWorkspaceView.from_record(record)

    def list(self) -> LiveWorkspaceList:
        with self._lock:
            return LiveWorkspaceList(
                workspaces=[
                    LiveWorkspaceView.from_record(record)
                    for record in self._repository.list()
                ]
            )

    def get(self, workspace_id: str) -> LiveWorkspaceView:
        with self._lock:
            return LiveWorkspaceView.from_record(self._repository.get(workspace_id))

    def approve_baseline(
        self,
        workspace_id: str,
        request: WorkspaceApprovalRequest,
    ) -> LiveWorkspaceView:
        with self._lock:
            record = self._repository.get(workspace_id)
            if record.status is not LiveWorkspaceStatus.IMPORTED:
                self._conflict("The workspace baseline is not awaiting approval.")
            self._ensure_context(record)
            state = self._transport.approve_baseline(record.context_id, request)
            record.baseline_approved = True
            record.baseline_approval_role = request.actor_role
            record.status = LiveWorkspaceStatus.BASELINE_APPROVED
            record.graph_version = state.graph_version
            self._event(
                record,
                event_type="baseline.approved",
                detail=(
                    f"{record.definition.baseline_decision.id} approved at "
                    f"{state.graph_version}."
                ),
                actor_role=request.actor_role,
            )
            self._repository.save(record)
            return LiveWorkspaceView.from_record(record)

    def authorize(self, workspace_id: str) -> LiveWorkspaceView:
        with self._lock:
            record = self._repository.get(workspace_id)
            if record.status not in {
                LiveWorkspaceStatus.BASELINE_APPROVED,
                LiveWorkspaceStatus.AUTHORIZED,
            }:
                self._conflict("Approve the baseline before requesting authorization.")
            self._ensure_context(record)
            result = self._transport.authorize(
                record.context_id,
                AuthorizationRequest(
                    run_id=self._run_id(record),
                    task_id=record.definition.ticket.id,
                    plan=record.current_plan,
                ),
            )
            record.initial_authorization = result
            record.graph_version = result.graph_version
            if result.verdict is Verdict.ALLOW and result.grant is not None:
                record.status = LiveWorkspaceStatus.AUTHORIZED
            self._event(
                record,
                event_type="authorization.evaluated",
                detail=f"Initial plan verdict: {result.verdict.value}.",
                data={"verdict": result.verdict.value},
            )
            self._repository.save(record)
            return LiveWorkspaceView.from_record(record)

    def propose_decision(
        self,
        workspace_id: str,
        request: WorkspaceProposalRequest,
    ) -> LiveWorkspaceView:
        with self._lock:
            record = self._repository.get(workspace_id)
            if record.status is not LiveWorkspaceStatus.AUTHORIZED:
                self._conflict(
                    "Obtain an initial authorization before proposing a decision change."
                )
            existing_ids = {
                record.definition.baseline_decision.id,
                *(item.mutation.decision.id for item in record.approved_mutations),
            }
            if request.decision.id in existing_ids:
                self._conflict("The proposed Decision ID is already present.")
            known_decisions = {
                record.definition.baseline_decision.id:
                    record.definition.baseline_decision,
                **{
                    item.mutation.decision.id: item.mutation.decision
                    for item in record.approved_mutations
                },
            }
            superseded = known_decisions.get(request.supersedes_id)
            if superseded is None:
                self._conflict(
                    "The proposed supersession target does not exist in this workspace."
                )
            if not request.affected_scopes <= superseded.scopes:
                self._conflict(
                    "The proposed change includes scopes absent from its supersession target."
                )
            record.pending_mutation = request.mutation()
            record.status = LiveWorkspaceStatus.CHANGE_PROPOSED
            self._event(
                record,
                event_type="decision.proposed",
                detail=(
                    f"{request.decision.id} was recorded as a proposal; "
                    "the graph has not changed."
                ),
                data={"decision_id": request.decision.id},
            )
            self._repository.save(record)
            return LiveWorkspaceView.from_record(record)

    def cancel_pending_decision(self, workspace_id: str) -> LiveWorkspaceView:
        with self._lock:
            record = self._repository.get(workspace_id)
            mutation = record.pending_mutation
            if (
                record.status is not LiveWorkspaceStatus.CHANGE_PROPOSED
                or mutation is None
            ):
                self._conflict("There is no pending Decision proposal to cancel.")
            record.pending_mutation = None
            record.status = LiveWorkspaceStatus.AUTHORIZED
            self._event(
                record,
                event_type="decision.proposal-canceled",
                detail=(
                    f"Canceled pending proposal {mutation.decision.id}; "
                    "the authority graph was unchanged."
                ),
                data={"decision_id": mutation.decision.id},
            )
            self._repository.save(record)
            return LiveWorkspaceView.from_record(record)

    def approve_decision(
        self,
        workspace_id: str,
        decision_id: str,
        request: WorkspaceApprovalRequest,
    ) -> LiveWorkspaceView:
        with self._lock:
            record = self._repository.get(workspace_id)
            mutation = record.pending_mutation
            if (
                record.status is not LiveWorkspaceStatus.CHANGE_PROPOSED
                or mutation is None
                or mutation.decision.id != decision_id
            ):
                self._conflict("The requested Decision is not awaiting approval.")
            self._ensure_context(record)
            result = self._transport.approve_mutation(
                record.context_id,
                DynamicMutationApprovalRequest(
                    mutation=mutation,
                    actor_role=request.actor_role,
                ),
            )
            if not result.applied or result.report is None:
                self._conflict(result.reason)
            conflict = self._transport.authorize(
                record.context_id,
                AuthorizationRequest(
                    run_id=self._run_id(record),
                    task_id=record.definition.ticket.id,
                    plan=record.current_plan,
                ),
            )
            record.approved_mutations.append(
                ApprovedWorkspaceMutation(
                    mutation=mutation.model_copy(deep=True),
                    actor_role=request.actor_role,
                )
            )
            record.pending_mutation = None
            record.graph_version = result.graph_version
            record.invalidation_report = result.report
            record.conflict_authorization = conflict
            record.status = LiveWorkspaceStatus.CHANGE_APPLIED
            self._event(
                record,
                event_type="decision.approved",
                detail=(
                    f"{decision_id} advanced the graph to {result.graph_version}; "
                    f"the current plan verdict is {conflict.verdict.value}."
                ),
                actor_role=request.actor_role,
                data={
                    "decision_id": decision_id,
                    "verdict": conflict.verdict.value,
                    "invalidated_task_ids": result.report.invalidated_task_ids,
                    "preserved_task_ids": result.report.preserved_task_ids,
                },
            )
            self._repository.save(record)
            return LiveWorkspaceView.from_record(record)

    def verify_initial_grant(self, workspace_id: str) -> LiveWorkspaceView:
        with self._lock:
            record = self._repository.get(workspace_id)
            if record.status not in {
                LiveWorkspaceStatus.CHANGE_APPLIED,
                LiveWorkspaceStatus.INITIAL_GRANT_REJECTED,
            }:
                self._conflict("Apply an approved decision change before verification.")
            if (
                record.status is LiveWorkspaceStatus.INITIAL_GRANT_REJECTED
                and self._has_verified_stale_grant(record)
            ):
                return LiveWorkspaceView.from_record(record)
            authorization = record.initial_authorization
            if authorization is None or authorization.grant is None:
                self._conflict("The workspace has no initial ALLOW grant to verify.")
            self._ensure_context(record)
            execution = self._transport.execute(
                context_id=record.context_id,
                token=authorization.grant.token,
                run_id=self._run_id(record),
                task_id=record.definition.ticket.id,
                plan=record.definition.plan,
            )
            record.initial_verification = execution
            if (
                not execution.applied
                and execution.verification_code is VerificationCode.STALE_SNAPSHOT
            ):
                record.status = LiveWorkspaceStatus.INITIAL_GRANT_REJECTED
            else:
                record.status = LiveWorkspaceStatus.CHANGE_APPLIED
            self._event(
                record,
                event_type="initial-grant.verified",
                detail=(
                    f"Executor verification returned "
                    f"{execution.verification_code.value}."
                ),
                data={
                    "applied": execution.applied,
                    "verification_code": execution.verification_code.value,
                },
            )
            self._repository.save(record)
            return LiveWorkspaceView.from_record(record)

    def update_plan(
        self,
        workspace_id: str,
        request: WorkspacePlanUpdateRequest,
    ) -> LiveWorkspaceView:
        with self._lock:
            record = self._repository.get(workspace_id)
            if record.status not in {
                LiveWorkspaceStatus.INITIAL_GRANT_REJECTED,
                LiveWorkspaceStatus.PLAN_UPDATED,
            }:
                self._conflict(
                    "Verify the initial grant as STALE_SNAPSHOT before updating the plan."
                )
            if not self._has_verified_stale_grant(record):
                self._conflict(
                    "A verified STALE_SNAPSHOT result is required before updating the plan."
                )
            if request.plan.ticket_id != record.definition.ticket.id:
                self._conflict("The corrected plan is bound to a different ticket.")
            record.current_plan = request.plan.model_copy(deep=True)
            record.replacement_authorization = None
            record.replacement_verification = None
            record.status = LiveWorkspaceStatus.PLAN_UPDATED
            self._event(
                record,
                event_type="plan.updated",
                detail=f"Corrected plan {request.plan.id} is ready for authority review.",
                data={"plan_id": request.plan.id},
            )
            self._repository.save(record)
            return LiveWorkspaceView.from_record(record)

    def reauthorize(self, workspace_id: str) -> LiveWorkspaceView:
        with self._lock:
            record = self._repository.get(workspace_id)
            if record.status not in {
                LiveWorkspaceStatus.PLAN_UPDATED,
                LiveWorkspaceStatus.REAUTHORIZED,
            }:
                self._conflict("Submit a corrected plan before reauthorization.")
            if not self._has_verified_stale_grant(record):
                self._conflict(
                    "A verified STALE_SNAPSHOT result is required before reauthorization."
                )
            self._ensure_context(record)
            result = self._transport.authorize(
                record.context_id,
                AuthorizationRequest(
                    run_id=self._run_id(record),
                    task_id=record.definition.ticket.id,
                    plan=record.current_plan,
                ),
            )
            record.replacement_authorization = result
            if result.verdict is Verdict.ALLOW and result.grant is not None:
                record.status = LiveWorkspaceStatus.REAUTHORIZED
            else:
                record.status = LiveWorkspaceStatus.PLAN_UPDATED
            self._event(
                record,
                event_type="plan.reauthorized",
                detail=f"Corrected plan verdict: {result.verdict.value}.",
                data={"verdict": result.verdict.value},
            )
            self._repository.save(record)
            return LiveWorkspaceView.from_record(record)

    def verify_replacement_grant(self, workspace_id: str) -> LiveWorkspaceView:
        with self._lock:
            record = self._repository.get(workspace_id)
            if record.status not in {
                LiveWorkspaceStatus.REAUTHORIZED,
                LiveWorkspaceStatus.COMPLETE,
            }:
                self._conflict("Obtain a replacement ALLOW grant before verification.")
            if not self._has_verified_stale_grant(record):
                self._conflict(
                    "A verified STALE_SNAPSHOT result is required before completion."
                )
            authorization = record.replacement_authorization
            if authorization is None or authorization.grant is None:
                self._conflict("The workspace has no replacement grant to verify.")
            self._ensure_context(record)
            execution = self._transport.execute(
                context_id=record.context_id,
                token=authorization.grant.token,
                run_id=self._run_id(record),
                task_id=record.definition.ticket.id,
                plan=record.current_plan,
            )
            record.replacement_verification = execution
            if (
                execution.applied
                and execution.verification_code is VerificationCode.VALID
            ):
                record.status = LiveWorkspaceStatus.COMPLETE
            self._event(
                record,
                event_type="replacement-grant.verified",
                detail=(
                    f"Executor verification returned "
                    f"{execution.verification_code.value}."
                ),
                data={
                    "applied": execution.applied,
                    "verification_code": execution.verification_code.value,
                },
            )
            self._repository.save(record)
            return LiveWorkspaceView.from_record(record)
