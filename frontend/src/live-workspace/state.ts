import type {
  LiveWorkspaceStage,
  LiveWorkspaceStatus,
  WorkspaceDocumentFormat,
  WorkspaceImportDocument,
} from "./model";

export interface WorkspaceDocumentEditorState {
  content: string;
  format: WorkspaceDocumentFormat;
}

export function editWorkspaceDocument(
  current: WorkspaceDocumentEditorState,
  content: string,
): WorkspaceDocumentEditorState {
  return { ...current, content };
}

export const WORKSPACE_STAGES: ReadonlyArray<{
  id: LiveWorkspaceStage;
  label: string;
  description: string;
}> = [
  {
    id: "import",
    label: "Import",
    description: "Bring in your decisions, tasks, ticket, and agent plan.",
  },
  {
    id: "approve-baseline",
    label: "Approve baseline",
    description: "Approve the current baseline to create a snapshot.",
  },
  {
    id: "authorize-plan",
    label: "Authorize plan",
    description: "Issue a snapshot-bound authorization.",
  },
  {
    id: "verify-change",
    label: "Verify change",
    description: "Verify a changed decision against the baseline.",
  },
];

const STATUS_STAGE: Record<LiveWorkspaceStatus, LiveWorkspaceStage> = {
  imported: "approve-baseline",
  "baseline-approved": "authorize-plan",
  authorized: "verify-change",
  "change-proposed": "verify-change",
  "change-applied": "verify-change",
  "initial-grant-rejected": "verify-change",
  "plan-updated": "verify-change",
  reauthorized: "verify-change",
  complete: "verify-change",
};

export type WorkspaceStageProgress =
  | "complete"
  | "current"
  | "upcoming"
  | "attention";

export function activeWorkspaceStage(
  status?: LiveWorkspaceStatus,
): LiveWorkspaceStage {
  return status ? STATUS_STAGE[status] : "import";
}

export function workspaceStageProgress(
  stage: LiveWorkspaceStage,
  status?: LiveWorkspaceStatus,
): WorkspaceStageProgress {
  if (status === "complete") return "complete";
  if (
    stage === "verify-change" &&
    (status === "initial-grant-rejected" || status === "plan-updated")
  ) {
    return "attention";
  }
  const active = activeWorkspaceStage(status);
  const stageIndex = WORKSPACE_STAGES.findIndex((item) => item.id === stage);
  const activeIndex = WORKSPACE_STAGES.findIndex((item) => item.id === active);
  if (stageIndex < activeIndex) return "complete";
  if (stageIndex === activeIndex) return "current";
  return "upcoming";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface WorkspaceReadiness {
  approvedDecision: boolean;
  ticketAndTasks: boolean;
  scopedPlan: boolean;
  authorityRoles: boolean;
  ready: boolean;
}

export function workspaceReadiness(
  document: Partial<WorkspaceImportDocument>,
): WorkspaceReadiness {
  const baseline = document.baseline_decision;
  const ticket = document.ticket;
  const tasks = document.tasks;
  const plan = document.plan;
  const authorityPolicy = document.authority_policy;
  const baselineScopes =
    isRecord(baseline) && Array.isArray(baseline.scopes)
      ? baseline.scopes.filter((scope): scope is string => typeof scope === "string")
      : [];
  const approvedDecision =
    isRecord(baseline) &&
    baseline.kind === "Decision" &&
    baseline.approval_status === "proposal" &&
    baselineScopes.length > 0;
  const ticketAndTasks =
    isRecord(ticket) &&
    ticket.kind === "Ticket" &&
    Array.isArray(tasks) &&
    tasks.length > 0 &&
    tasks.every((task) => isRecord(task) && task.kind === "Task");
  const scopedPlan =
    isRecord(plan) &&
    typeof plan.id === "string" &&
    Array.isArray(plan.actions) &&
    plan.actions.length > 0;
  const authorityRoles =
    isRecord(authorityPolicy) &&
    baselineScopes.length > 0 &&
    baselineScopes.every(
      (scope) =>
        Array.isArray(authorityPolicy[scope]) &&
        (authorityPolicy[scope] as unknown[]).some(
          (role) => typeof role === "string" && role.length > 0,
        ),
    );
  return {
    approvedDecision,
    ticketAndTasks,
    scopedPlan,
    authorityRoles,
    ready:
      approvedDecision && ticketAndTasks && scopedPlan && authorityRoles,
  };
}
