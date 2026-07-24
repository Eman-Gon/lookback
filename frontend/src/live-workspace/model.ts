import type { InvalidationReport, Verdict } from "../types";

export type LiveWorkspaceStatus =
  | "imported"
  | "baseline-approved"
  | "authorized"
  | "change-proposed"
  | "change-applied"
  | "initial-grant-rejected"
  | "plan-updated"
  | "reauthorized"
  | "complete";

export type LiveWorkspaceStage =
  | "import"
  | "approve-baseline"
  | "authorize-plan"
  | "apply-change"
  | "verify-update";

export type WorkspaceDocumentFormat = "yaml" | "json";

export interface WorkspaceArtifact {
  id: string;
  kind: string;
  title: string;
  text: string;
  scopes: readonly string[];
  validity: "VALID" | "NEEDS_REVIEW" | "INVALIDATED";
  invalidatedScopes: readonly string[];
  approvalStatus?: "proposal" | "approved" | "rejected" | null;
  authorityRole?: string | null;
  confidence: number;
  effectiveAt?: string | null;
  sourceRef?: string | null;
  attributes: Record<string, unknown>;
}

export interface WorkspacePlanAction {
  id: string;
  description: string;
  scopes: readonly string[];
  attributes: Record<string, unknown>;
}

export interface WorkspacePlan {
  id: string;
  ticketId: string;
  objective: string;
  actions: readonly WorkspacePlanAction[];
}

export interface WorkspaceGrantMetadata {
  authorizationId: string;
  runId: string;
  taskId: string;
  decisionSnapshot: string;
  planHash: string;
  verdict: Verdict;
  issuedAt: string;
  expiresAt: string;
}

export interface WorkspaceMismatch {
  actionId: string;
  scope: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
}

export interface WorkspaceAuthorization {
  verdict: Verdict;
  reason: string;
  graphVersion: string;
  taskId: string;
  affectedScopes: readonly string[];
  mismatches: readonly WorkspaceMismatch[];
  currentRequirements: Record<string, Record<string, unknown>>;
  invalidationPath: readonly string[];
  invalidatedArtifactIds: readonly string[];
  preservedArtifactIds: readonly string[];
  evidenceRefs: readonly string[];
  grant?: WorkspaceGrantMetadata | null;
}

export interface WorkspaceExecution {
  applied: boolean;
  reason: string;
  verificationCode: string;
  pullRequestUrl?: string | null;
}

export interface WorkspaceDecisionMutation {
  decision: WorkspaceArtifact;
  supersedesId: string;
  affectedScopes: readonly string[];
}

export interface WorkspaceEvent {
  sequence: number;
  eventType: string;
  detail: string;
  createdAt: string;
  actorRole?: string | null;
  data: Record<string, unknown>;
}

export interface LiveWorkspaceView {
  id: string;
  name: string;
  description: string;
  status: LiveWorkspaceStatus;
  graphVersion: string;
  baselineApproved: boolean;
  baselineDecision: WorkspaceArtifact;
  specification: WorkspaceArtifact;
  ticket: WorkspaceArtifact;
  tasks: readonly WorkspaceArtifact[];
  currentPlan: WorkspacePlan;
  authorityPolicy: Record<string, readonly string[]>;
  pendingMutation?: WorkspaceDecisionMutation | null;
  latestApprovedMutation?: WorkspaceDecisionMutation | null;
  initialAuthorization?: WorkspaceAuthorization | null;
  conflictAuthorization?: WorkspaceAuthorization | null;
  replacementAuthorization?: WorkspaceAuthorization | null;
  invalidationReport?: InvalidationReport | null;
  initialVerification?: WorkspaceExecution | null;
  replacementVerification?: WorkspaceExecution | null;
  history: readonly WorkspaceEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceImportDocument {
  id: string;
  name: string;
  description?: string;
  authority_policy: Record<string, readonly string[]>;
  baseline_decision: Record<string, unknown>;
  specification: Record<string, unknown>;
  ticket: Record<string, unknown>;
  tasks: readonly Record<string, unknown>[];
  plan: Record<string, unknown>;
  edges?: readonly Record<string, unknown>[];
  graph_version?: number;
}

export interface WorkspaceValidationIssue {
  location: string;
  type: string;
}

export class LiveWorkspaceApiError extends Error {
  readonly code: string;
  readonly issues: readonly WorkspaceValidationIssue[];

  constructor(
    message: string,
    code = "WORKSPACE_ERROR",
    issues: readonly WorkspaceValidationIssue[] = [],
  ) {
    super(message);
    this.name = "LiveWorkspaceApiError";
    this.code = code;
    this.issues = issues;
  }
}

export interface LiveWorkspaceActionOptions {
  signal?: AbortSignal;
}

export interface LiveWorkspaceClient {
  list(
    options?: LiveWorkspaceActionOptions,
  ): Promise<readonly LiveWorkspaceView[]>;
  load(
    workspaceId: string,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
  importWorkspace(
    document: WorkspaceImportDocument,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
  approveBaseline(
    workspaceId: string,
    actorRole: string,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
  authorizePlan(
    workspaceId: string,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
  proposeChange(
    workspaceId: string,
    mutation: Record<string, unknown>,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
  cancelPendingChange(
    workspaceId: string,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
  approveChange(
    workspaceId: string,
    decisionId: string,
    actorRole: string,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
  verifyInitialGrant(
    workspaceId: string,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
  updatePlan(
    workspaceId: string,
    plan: Record<string, unknown>,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
  reauthorize(
    workspaceId: string,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
  verifyReplacementGrant(
    workspaceId: string,
    options?: LiveWorkspaceActionOptions,
  ): Promise<LiveWorkspaceView>;
}
