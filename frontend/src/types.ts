export type Validity = "VALID" | "NEEDS_REVIEW" | "INVALIDATED";
export type Verdict = "ALLOW" | "REPLAN" | "BLOCK" | "HUMAN_REVIEW";

export interface Artifact {
  id: string;
  kind: string;
  title: string;
  scopes: string[];
  validity: Validity;
  invalidated_scopes: string[];
}

export interface Edge {
  source_id: string;
  target_id: string;
  kind: string;
  scopes?: string[];
  evidence_ref?: string | null;
}

export interface InvalidationPath {
  artifact_id: string;
  node_ids: string[];
}

export interface InvalidationReport {
  graph_version: string;
  changed_decision_id: string;
  superseded_decision_id: string;
  affected_scopes: string[];
  affected_artifact_ids: string[];
  preserved_artifact_ids: string[];
  paths: InvalidationPath[];
  evidence_refs: string[];
}

export interface AuthorityState {
  graph_version: string;
  artifacts: Artifact[];
  edges: Edge[];
  last_report: InvalidationReport | null;
}

export interface PlanAction {
  id: string;
  description: string;
  scopes: string[];
  attributes: Record<string, unknown>;
}

export interface AgentPlan {
  id: string;
  ticket_id: string;
  objective: string;
  actions: PlanAction[];
}

export interface AgentState {
  run: null | {
    run_id: string;
    ticket_id: string;
    state: string;
    tests_passed: boolean;
    graph_snapshot: string | null;
    grant_token: string | null;
    history: string[];
    plan: AgentPlan;
  };
  last_authorization: null | {
    verdict: Verdict;
    reason: string;
    graph_version: string;
    affected_scopes: string[];
    invalidation_path: string[];
    evidence_refs: string[];
    grant: null | {
      payload: {
        authorization_id: string;
        run_id: string;
        task_id: string;
        decision_snapshot: string;
        plan_hash: string;
        verdict: Verdict;
        issued_at: string;
        expires_at: string;
      };
      token: string;
    };
  };
  initial_grant_token: string | null;
  initial_plan: AgentPlan | null;
}

export interface ExecuteResult {
  applied: boolean;
  reason: string;
  pull_request_url?: string;
}

export interface ExecutionAttempt extends ExecuteResult {
  grant: "graph-v17" | "graph-v18";
}
