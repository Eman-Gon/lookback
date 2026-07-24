import type { LiveWorkspaceView, WorkspaceImportDocument } from "./model";

export const SAMPLE_WORKSPACE: WorkspaceImportDocument = {
  id: "refund-operations",
  name: "Refund operations",
  description: "A real workspace imported from dragback.yaml",
  graph_version: 17,
  authority_policy: {
    "refund.calculation": ["finance-admin"],
    "refund.identity": ["finance-admin"],
    "refund.execution": ["finance-admin"],
  },
  baseline_decision: {
    id: "DEC-001",
    kind: "Decision",
    title: "Refunds may be issued automatically",
    text: "Verified customer refunds may be calculated and issued automatically.",
    scopes: [
      "refund.calculation",
      "refund.identity",
      "refund.execution",
    ],
    approval_status: "proposal",
    authority_role: "finance-admin",
    confidence: 0.99,
    source_ref: "workspace://refund-operations/decisions/DEC-001",
    attributes: {
      requirements: {
        "refund.calculation": { method: "standard" },
        "refund.identity": { verification: "required" },
        "refund.execution": { mode: "automatic" },
      },
    },
  },
  specification: {
    id: "SPEC-001",
    kind: "Specification",
    title: "Refund processing controls",
    text: "Calculate refunds, confirm customer identity, and issue approved refunds.",
    scopes: [
      "refund.calculation",
      "refund.identity",
      "refund.execution",
    ],
    source_ref: "workspace://refund-operations/specifications/SPEC-001",
  },
  ticket: {
    id: "PAY-104",
    kind: "Ticket",
    title: "Automate customer refunds",
    text: "Implement the approved refund workflow.",
    scopes: [
      "refund.calculation",
      "refund.identity",
      "refund.execution",
    ],
    source_ref: "workspace://refund-operations/tickets/PAY-104",
  },
  tasks: [
    {
      id: "TASK-001",
      kind: "Task",
      title: "Calculate refund amount",
      text: "Calculate a refund using the standard method.",
      scopes: ["refund.calculation"],
      source_ref: "workspace://refund-operations/tasks/TASK-001",
    },
    {
      id: "TASK-002",
      kind: "Task",
      title: "Confirm customer identity",
      text: "Require customer identity verification.",
      scopes: ["refund.identity"],
      source_ref: "workspace://refund-operations/tasks/TASK-002",
    },
    {
      id: "TASK-003",
      kind: "Task",
      title: "Issue refund automatically",
      text: "Issue the approved refund without a manual handoff.",
      scopes: ["refund.execution"],
      source_ref: "workspace://refund-operations/tasks/TASK-003",
    },
  ],
  plan: {
    id: "PLAN-001",
    ticket_id: "PAY-104",
    objective: "Execute refund operations under the approved policy",
    actions: [
      {
        id: "ACTION-001",
        description: "Calculate refund amount",
        scopes: ["refund.calculation"],
        attributes: {
          task_id: "TASK-001",
          method: "standard",
        },
      },
      {
        id: "ACTION-002",
        description: "Confirm customer identity",
        scopes: ["refund.identity"],
        attributes: {
          task_id: "TASK-002",
          verification: "required",
        },
      },
      {
        id: "ACTION-003",
        description: "Issue refund automatically",
        scopes: ["refund.execution"],
        attributes: {
          task_id: "TASK-003",
          mode: "automatic",
        },
      },
    ],
  },
};

export const SAMPLE_WORKSPACE_JSON = JSON.stringify(SAMPLE_WORKSPACE, null, 2);

export function initialChangeDocument(
  workspace: LiveWorkspaceView,
): Record<string, unknown> {
  const sortedScopes = [...workspace.baselineDecision.scopes].sort();
  const scope =
    sortedScopes.find((candidate) => candidate === "refund.execution") ??
    sortedScopes.find((candidate) => candidate.endsWith(".execution")) ??
    sortedScopes[0] ??
    "workspace.change";
  const refundSample =
    scope.toLowerCase().includes("refund") && scope.endsWith("execution");
  const requirements = refundSample
    ? { [scope]: { mode: "human_approval_over_500" } }
    : { [scope]: { requires_review: true } };
  return {
    decision: {
      id: refundSample ? "DEC-002" : `${workspace.baselineDecision.id}-CHANGE`,
      kind: "Decision",
      title: refundSample
        ? "Refunds over $500 require human approval"
        : `Review required for ${scope}`,
      text: refundSample
        ? "Refunds over $500 must be escalated to a human approver."
        : `Work in ${scope} now requires explicit review.`,
      scopes: [scope],
      approval_status: "proposal",
      authority_role:
        workspace.baselineDecision.authorityRole ??
        workspace.authorityPolicy[scope]?.[0] ??
        "admin",
      confidence: 0.99,
      source_ref: `workspace://${workspace.id}/decisions/change`,
      attributes: { requirements },
    },
    supersedes_id: workspace.baselineDecision.id,
    affected_scopes: [scope],
  };
}

export function correctedPlanDocument(
  workspace: LiveWorkspaceView,
): Record<string, unknown> {
  const invalidated = new Set(
    workspace.invalidationReport?.invalidated_task_ids ??
      workspace.invalidationReport?.stopped_work_artifact_ids ??
      [],
  );
  const affectedScopes = new Set(
    workspace.invalidationReport?.affected_scopes ??
      workspace.pendingMutation?.affectedScopes ??
      workspace.latestApprovedMutation?.affectedScopes ??
      [],
  );
  const retainedActions = workspace.currentPlan.actions
    .filter((action) => {
      const taskId = action.attributes.task_id;
      const referencesInvalidatedTask =
        typeof taskId === "string" && invalidated.has(taskId);
      const intersectsChangedScope = action.scopes.some((scope) =>
        affectedScopes.has(scope),
      );
      return !referencesInvalidatedTask && !intersectsChangedScope;
    })
    .map((action) => ({
      id: action.id,
      description: action.description,
      scopes: [...action.scopes],
      attributes: { ...action.attributes },
    }));
  const requirements =
    workspace.conflictAuthorization?.currentRequirements ??
    (workspace.pendingMutation?.decision.attributes.requirements as
      | Record<string, Record<string, unknown>>
      | undefined) ??
    {};
  const correctiveActions = [...affectedScopes].sort().map((scope, index) => ({
    id: `ACTION-CORRECTED-${index + 1}`,
    description:
      workspace.id === "refund-operations"
        ? "Escalate qualifying refunds for human approval"
        : `Satisfy the approved requirement for ${scope}`,
    scopes: [scope],
    attributes: { ...(requirements[scope] ?? {}) },
  }));
  return {
    id: `${workspace.currentPlan.id}-REV1`,
    ticket_id: workspace.currentPlan.ticketId,
    objective:
      workspace.id === "refund-operations"
        ? "Execute refund operations with the updated approval rule"
        : `Correct ${workspace.currentPlan.objective} for the approved change`,
    actions: [...retainedActions, ...correctiveActions],
  };
}
