import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DemoPhaseId } from "../demo-control";
import type { AgentState, AuthorityState, ExecutionAttempt } from "../types";
import {
  GuidedProofView,
  type GuidedProofPhase,
} from "./GuidedProofView";

const PHASE_IDS: readonly DemoPhaseId[] = [
  "reset",
  "start",
  "tests",
  "decision",
  "old-grant",
  "recheck",
  "replan",
  "new-grant",
];

const phases: readonly GuidedProofPhase[] = PHASE_IDS.map((id) => ({
  id,
  label: id,
  shortLabel: id,
  description: id,
  holdMs: 0,
}));

const authority: AuthorityState = {
  graph_version: "graph-v18",
  artifacts: [
    {
      id: "DEC-004",
      kind: "DECISION",
      title: "All users may export account data",
      text: "All users may export account data.",
      scopes: ["export.authorization", "export.generation"],
      validity: "NEEDS_REVIEW",
      invalidated_scopes: ["export.authorization"],
    },
    {
      id: "DEC-018",
      kind: "DECISION",
      title: "Exports must be admin-only",
      text: "For compliance, CSV exports are restricted to administrators.",
      scopes: ["export.authorization"],
      validity: "VALID",
      invalidated_scopes: [],
    },
    {
      id: "TASK-101",
      kind: "TASK",
      title: "Generate valid CSV files",
      text: "Generate valid CSV files",
      scopes: ["export.generation"],
      validity: "VALID",
      invalidated_scopes: [],
    },
    {
      id: "TASK-102",
      kind: "TASK",
      title: "Expose export to all users",
      text: "Expose export to all users",
      scopes: ["export.authorization"],
      validity: "INVALIDATED",
      invalidated_scopes: ["export.authorization"],
    },
  ],
  edges: [],
  last_report: {
    graph_version: "graph-v18",
    changed_decision_id: "DEC-018",
    superseded_decision_id: "DEC-004",
    affected_scopes: ["export.authorization"],
    affected_artifact_ids: [
      "DEC-004",
      "SPEC-009",
      "TICKET-100",
      "TASK-102",
      "PLAN-027",
    ],
    upstream_chain_artifact_ids: [
      "DEC-018",
      "DEC-004",
      "SPEC-009",
      "TICKET-100",
    ],
    stopped_work_artifact_ids: ["TASK-102", "PLAN-027"],
    directly_mentioned_artifact_ids: [],
    preserved_artifact_ids: ["TASK-101"],
    preserved_task_ids: ["TASK-101"],
    invalidated_task_ids: ["TASK-102"],
    needs_review_artifact_ids: ["PLAN-027"],
    paths: [
      {
        artifact_id: "PLAN-027",
        node_ids: [
          "DEC-018",
          "DEC-004",
          "SPEC-009",
          "TICKET-100",
          "TASK-102",
          "PLAN-027",
        ],
      },
    ],
    evidence_refs: [
      "slack://compliance/decision-018",
      "linear://ticket/TICKET-100",
    ],
  },
};

const agent: AgentState = {
  run: {
    run_id: "RUN-27",
    ticket_id: "TICKET-100",
    state: "ACT",
    tests_passed: true,
    graph_snapshot: "graph-v18",
    grant_token: "replacement-token",
    history: [],
    plan: {
      id: "PLAN-028",
      ticket_id: "TICKET-100",
      objective: "Build a compliant CSV export",
      actions: [
        {
          id: "ACTION-1",
          description: "Generate a valid CSV file",
          scopes: ["export.generation"],
          attributes: { format: "csv" },
        },
        {
          id: "ACTION-2",
          description: "Expose export to administrators only",
          scopes: ["export.authorization"],
          attributes: { audience: "admin_only" },
        },
      ],
    },
  },
  last_authorization: {
    verdict: "ALLOW",
    reason: "Plan matches current approved requirements.",
    graph_version: "graph-v18",
    affected_scopes: [],
    invalidation_path: [],
    evidence_refs: [],
    grant: {
      payload: {
        authorization_id: "AUTH-028",
        run_id: "RUN-27",
        task_id: "TICKET-100",
        decision_snapshot: "graph-v18",
        plan_hash: "sha256:replacement-plan",
        verdict: "ALLOW",
        issued_at: "2026-07-23T12:00:00Z",
        expires_at: "2026-07-23T13:00:00Z",
      },
      token: "replacement-token",
    },
  },
  initial_grant_token: "original-token",
  initial_plan: {
    id: "PLAN-027",
    ticket_id: "TICKET-100",
    objective: "Build a CSV export",
    actions: [],
  },
};

const executorAttempts: readonly ExecutionAttempt[] = [
  {
    grant: "graph-v17",
    applied: false,
    reason: "Grant snapshot graph-v17 is stale; current graph is graph-v18.",
  },
  {
    grant: "graph-v18",
    applied: true,
    reason: "Grant verified; mock pull request created.",
  },
];

function renderView({
  authorityState = null,
  agentState = null,
  attempts = [],
  completedIds = new Set<DemoPhaseId>(),
  isComplete = false,
}: {
  authorityState?: AuthorityState | null;
  agentState?: AgentState | null;
  attempts?: readonly ExecutionAttempt[];
  completedIds?: ReadonlySet<DemoPhaseId>;
  isComplete?: boolean;
} = {}) {
  return renderToStaticMarkup(
    <GuidedProofView
      authority={authorityState}
      agent={agentState}
      executorAttempts={attempts}
      phases={phases}
      activeIndex={null}
      completedIds={completedIds}
      isRunning={false}
      isComplete={isComplete}
      error=""
      onRun={vi.fn()}
      onStop={vi.fn()}
    />,
  );
}

describe("GuidedProofView", () => {
  it("presents one minimal four-act story before the proof runs", () => {
    const html = renderView();

    expect(html).toContain("The ticket didn’t change.");
    expect(html).toContain("Run guided proof");
    expect(html).toContain("Work authorized");
    expect(html).toContain("Decision changed");
    expect(html).toContain("Unsafe work stopped");
    expect(html).toContain("Work re-authorized");
    expect(html.match(/class="gp-story-step /g)).toHaveLength(4);
    expect(html).toContain("View technical evidence");
    expect(html).not.toContain("Agent loop");
    expect(html).not.toContain("Transition history");
    expect(html).not.toContain("Real vs simulated");
    expect(html).not.toContain("Run full demo");
    expect(html).not.toContain("Open Scenario Lab");
  });

  it("makes the completed selective outcome and grant transition unmistakable", () => {
    const html = renderView({
      authorityState: authority,
      agentState: agent,
      attempts: executorAttempts,
      completedIds: new Set(PHASE_IDS),
      isComplete: true,
    });

    expect(html).toContain("Unsafe work stopped. Valid work preserved.");
    expect(html).toContain("No ticket update required.");
    expect(html).toContain("Expose export to all users");
    expect(html).toContain("Generate valid CSV files");
    expect(html).toMatch(
      /gp-task gp-task--negative[\s\S]*Stopped[\s\S]*gp-task gp-task--positive[\s\S]*Continues/,
    );
    expect(html).toMatch(
      /gp-grant gp-grant--negative[\s\S]*graph-v17[\s\S]*Rejected/,
    );
    expect(html).toMatch(
      /gp-grant gp-grant--positive[\s\S]*graph-v18[\s\S]*Accepted/,
    );
    expect(html).toContain(
      "The approved decision never names TICKET-100.",
    );
    expect(html).toContain("DEC-018");
    expect(html).toContain("PLAN-027");
    expect(html).toContain("What is real in this prototype");
    expect(html).toContain("Fixture-driven:");
  });

  it("uses semantic colors for change and rejection instead of marking every act green", () => {
    const html = renderView({
      authorityState: authority,
      agentState: agent,
      attempts: executorAttempts,
      completedIds: new Set(PHASE_IDS),
      isComplete: true,
    });

    expect(html).toContain(
      "gp-story-step gp-story-step--change gp-story-step--complete",
    );
    expect(html).toContain(
      "gp-story-step gp-story-step--negative gp-story-step--complete",
    );
  });
});
