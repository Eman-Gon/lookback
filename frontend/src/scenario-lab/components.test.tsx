import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  ScenarioDefinition,
  ScenarioRunState,
  ScenarioRunSummary,
} from "./model";
import { FourStageRail } from "./components/FourStageRail";
import { OutcomeLedger } from "./components/OutcomeLedger";
import { ResultRows } from "./components/ResultRows";
import { RunReport } from "./components/RunReport";
import { ScenarioRunView } from "./components/ScenarioRunView";
import { AppShell } from "./components/AppShell";

const scenario: ScenarioDefinition = {
  id: "csv-exports-admin-only",
  name: "CSV exports become admin-only",
  category: "compliance",
  description: "CSV exports narrow from all users to administrators.",
  riskLevel: "high",
  originalDecision: {
    id: "DEC-004",
    text: "CSV exports are available to all users.",
    graphSnapshot: "graph-v17",
  },
  newDecision: {
    id: "DEC-018",
    text: "CSV exports are restricted to administrators.",
    graphSnapshot: "graph-v18",
    reason: "Reduce exposure of account data.",
  },
  specification: {
    id: "SPEC-009",
    title: "CSV export",
    description: "Export account data.",
    scopes: ["exports.csv"],
  },
  ticket: {
    id: "TICKET-100",
    title: "Implement CSV export",
    description: "Build the export workflow.",
    scopes: ["exports.csv"],
  },
  tasks: [],
  initialPlan: {
    id: "PLAN-027",
    objective: "Ship CSV export",
    steps: ["Generate CSV files"],
    scope: ["exports.csv"],
    source: "agent",
  },
  riskIfContinued: "Standard users would retain access.",
  expectedOutcomes: [],
  expectedCorrectedBehavior: "Require administrator access.",
};

const run: ScenarioRunState = {
  runId: "RUN-27",
  scenarioId: scenario.id,
  status: "passed",
  activeStage: "reauthorized",
  graphSnapshot: "graph-v18",
  agentLoopState: "COMPLETE",
  provenancePath: {
    nodes: [],
    edges: [],
  },
  outcomes: [
    {
      id: "TASK-101",
      label: "Generate CSV files",
      kind: "preserved",
      basis: "actual",
      representation: "task",
    },
    {
      id: "TASK-104",
      label: "Display exports to standard users",
      kind: "stopped",
      basis: "actual",
      representation: "task",
    },
    {
      id: "ACTION-201",
      label: "Add administrator role check",
      kind: "newly-required",
      basis: "actual",
      source: "fixture",
      representation: "plan-action",
      persistedAsGraphArtifact: false,
      lifecycle: "authorized-plan-action",
    },
  ],
  originalGrant: {
    id: "AUTH-17",
    graphSnapshot: "graph-v17",
    planId: "PLAN-027",
    scope: ["exports.csv"],
    status: "rejected",
    verificationCode: "STALE_SNAPSHOT",
  },
  replacementGrant: {
    id: "AUTH-18",
    graphSnapshot: "graph-v18",
    planId: "PLAN-028",
    scope: ["exports.csv"],
    status: "applied",
    verificationCode: "VALID",
  },
  outcomeSummary: {
    preservedTaskIds: ["TASK-101", "TASK-102", "TASK-103"],
    invalidatedTaskIds: ["TASK-104", "TASK-105"],
    needsReviewArtifactIds: ["PLAN-027"],
    originalPlanId: "PLAN-027",
    originalPlanStatus: "NEEDS_REVIEW",
    correctiveActions: [],
    oldGrantVerificationCode: "STALE_SNAPSHOT",
    replacementAuthorizationVerdict: "ALLOW",
    replacementGrantVerificationCode: "VALID",
    mayContinue: true,
    primaryProvenancePath: [],
    historyScope: "session",
  },
  evidence: [],
  events: [],
};

const summary: ScenarioRunSummary = {
  runId: run.runId,
  scenarioId: scenario.id,
  scenarioName: scenario.name,
  category: scenario.category,
  riskLevel: scenario.riskLevel,
  status: "passed",
  preservedExpected: 3,
  preservedActual: 3,
  preservedExpectedIds: ["TASK-101", "TASK-102", "TASK-103"],
  preservedActualIds: ["TASK-101", "TASK-102", "TASK-103"],
  stoppedExpected: 2,
  stoppedActual: 2,
  stoppedExpectedIds: ["TASK-104", "TASK-105"],
  stoppedActualIds: ["TASK-104", "TASK-105"],
  falsePositiveInvalidations: [],
  missedInvalidations: [],
  oldGrantRejectedExpected: true,
  oldGrantRejected: true,
  reauthorizationExpected: true,
  reauthorizationSucceeded: true,
  planStatus: "NEEDS_REVIEW",
  needsReviewArtifactIds: ["PLAN-027"],
  oldGrantVerificationCode: "STALE_SNAPSHOT",
  replacementAuthorizationVerdict: "ALLOW",
  replacementGrantVerificationCode: "VALID",
  historyScope: "session",
  runtimeMs: 91,
  failureReasons: [],
  completedAt: "2026-07-23T12:00:00Z",
  inspectable: true,
};

describe("Scenario Lab executive story components", () => {
  it("keeps Scenario Lab active while exposing the separate Live Workspace route", () => {
    const html = renderToStaticMarkup(
      <AppShell activeView="catalog" onNavigate={() => undefined}>
        <p>Catalog</p>
      </AppShell>,
    );
    expect(html).toContain('href="/live-workspace"');
    expect(html).toContain(
      'class="sl-nav-link" aria-current="page">Scenario Lab',
    );
    expect(html).not.toContain(
      'href="/live-workspace" aria-current="page"',
    );
  });

  it("renders an immediate backend-backed outcome ledger", () => {
    const html = renderToStaticMarkup(
      <OutcomeLedger scenario={scenario} run={run} />,
    );
    expect(html).toContain("2 tasks invalidated. 3 continue.");
    expect(html).toContain("Needs Review");
    expect(html).toContain("Rejected · STALE_SNAPSHOT");
    expect(html).toContain("Applied · VALID");
  });

  it("does not present an unverified grant as active after a failed run", () => {
    const html = renderToStaticMarkup(
      <OutcomeLedger
        scenario={scenario}
        run={{
          ...run,
          status: "failed",
          activeStage: "authorized",
          graphSnapshot: "graph-v17",
          originalGrant: {
            ...run.originalGrant!,
            status: "active",
            verificationCode: undefined,
          },
          replacementGrant: undefined,
          outcomeSummary: {
            ...run.outcomeSummary!,
            oldGrantVerificationCode: null,
            replacementGrantVerificationCode: null,
          },
        }}
      />,
    );
    expect(html).toContain("Issued · run stopped");
    expect(html).not.toContain(">Active<");
  });

  it("separates invalidated tasks, plan review, and plan actions", () => {
    const html = renderToStaticMarkup(
      <ResultRows
        outcomes={run.outcomes}
        planReviewArtifactIds={run.outcomeSummary?.needsReviewArtifactIds}
        originalPlanId={run.outcomeSummary?.originalPlanId}
        planStatus={run.outcomeSummary?.originalPlanStatus}
      />,
    );
    expect(html).toContain("Invalidated tasks");
    expect(html).toContain("Plan needs review");
    expect(html).toContain("Fixture-generated plan actions");
    expect(html).toContain("not persisted graph Tasks");
  });

  it("renders the semantic Run All columns and session-only label", () => {
    const html = renderToStaticMarkup(
      <RunReport
        runs={[summary]}
        onInspect={() => undefined}
        onRunAll={() => undefined}
      />,
    );
    expect(html).toContain("Invalidated tasks");
    expect(html).toContain("Plan status");
    expect(html).toContain("Replacement grant");
    expect(html).toContain("Session-only history");
    expect(html).toContain("Invalidation recall");
    expect(html).toContain("Preservation recall");
    expect(html).not.toContain("Stopped E");
    expect(html).not.toContain("Invalidation accuracy");
  });

  it("does not call an unattempted grant verification allowed", () => {
    const html = renderToStaticMarkup(
      <RunReport
        runs={[
          {
            ...summary,
            status: "failed",
            oldGrantRejected: false,
            reauthorizationSucceeded: false,
            oldGrantVerificationCode: null,
            replacementAuthorizationVerdict: null,
            replacementGrantVerificationCode: null,
          },
        ]}
        onInspect={() => undefined}
        onRunAll={() => undefined}
      />,
    );
    expect(html).toContain("Not reached");
    expect(html).not.toContain(">Allowed<");
  });

  it("does not mark a stage current before the run starts", () => {
    const html = renderToStaticMarkup(
      <FourStageRail activeStage="authorized" runStatus="not-run" />,
    );
    expect(html).not.toContain("sl-stage--current");
    expect(html.match(/sl-stage--upcoming/g)).toHaveLength(4);
  });

  it("keeps a concise stage live region and stable layer relationships", () => {
    const html = renderToStaticMarkup(
      <ScenarioRunView
        scenario={scenario}
        run={run}
        onBack={() => undefined}
        onReset={() => undefined}
        onOpenEvidence={() => undefined}
        onDetailLayerChange={() => undefined}
        onShowEvidence={() => undefined}
      />,
    );
    expect(html).toContain(
      "Stage 4 of 4: Re-authorized. Scenario complete.",
    );
    expect(html).toContain('id="scenario-story-control"');
    expect(html).toContain('aria-controls="scenario-story-panel"');
    expect(html).toContain('id="scenario-story-panel"');
    expect(html).toContain('aria-controls="scenario-evidence-graph"');
    expect(html).toContain('aria-controls="scenario-evidence-timeline"');
  });

  it("gives requested evidence disclosures stable focus targets", () => {
    const html = renderToStaticMarkup(
      <ScenarioRunView
        scenario={scenario}
        run={run}
        detailLayer="evidence"
        evidenceSection="graph"
        onBack={() => undefined}
        onReset={() => undefined}
        onOpenEvidence={() => undefined}
        onDetailLayerChange={() => undefined}
      />,
    );
    expect(html).toContain('id="scenario-evidence-panel"');
    expect(html).toContain('id="scenario-evidence-graph"');
    expect(html).toContain('id="scenario-evidence-timeline"');
    expect(html).toContain(
      'id="scenario-evidence-graph" class="sl-disclosure" open=""',
    );
  });
});
