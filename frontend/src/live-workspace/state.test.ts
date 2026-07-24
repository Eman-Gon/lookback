import { describe, expect, it } from "vitest";
import { mapLiveWorkspace } from "./api";
import {
  correctedPlanDocument,
  initialChangeDocument,
  SAMPLE_WORKSPACE,
} from "./sample";
import {
  activeWorkspaceStage,
  editWorkspaceDocument,
  workspaceGuide,
  workspaceReadiness,
  workspaceStageProgress,
  workspaceVerificationReport,
} from "./state";
import { RAW_WORKSPACE } from "./test-fixtures";

describe("Live Workspace state helpers", () => {
  it("preserves YAML parsing mode while the imported document is edited", () => {
    expect(
      editWorkspaceDocument(
        { content: "id: first", format: "yaml" },
        "id: edited",
      ),
    ).toEqual({ content: "id: edited", format: "yaml" });
  });

  it("derives the five guided stages from backend-owned status", () => {
    expect(activeWorkspaceStage()).toBe("import");
    expect(activeWorkspaceStage("imported")).toBe("approve-baseline");
    expect(activeWorkspaceStage("baseline-approved")).toBe("authorize-plan");
    expect(activeWorkspaceStage("authorized")).toBe("apply-change");
    expect(activeWorkspaceStage("initial-grant-rejected")).toBe(
      "verify-update",
    );
    expect(workspaceStageProgress("import", "authorized")).toBe("complete");
    expect(workspaceStageProgress("apply-change", "authorized")).toBe(
      "current",
    );
    expect(
      workspaceStageProgress("verify-update", "initial-grant-rejected"),
    ).toBe("attention");
    expect(workspaceStageProgress("verify-update", "complete")).toBe(
      "complete",
    );
  });

  it("returns concise current-step guidance and explicit wait copy", () => {
    expect(workspaceGuide()).toMatchObject({
      step: 1,
      totalSteps: 5,
      title: "Add your workspace",
      stateLabel: "Waiting for a file",
    });
    expect(workspaceGuide("change-applied")).toMatchObject({
      step: 4,
      title: "Check the original authorization",
      busyMessage:
        "The independent executor is checking the original authorization…",
    });
    expect(workspaceGuide("complete")).toMatchObject({
      step: 5,
      title: "Workspace verified",
      tone: "complete",
    });
  });

  it("requires the decision, ticket/tasks, scoped plan, and authority policy", () => {
    expect(workspaceReadiness(SAMPLE_WORKSPACE)).toEqual({
      approvedDecision: true,
      ticketAndTasks: true,
      scopedPlan: true,
      authorityRoles: true,
      ready: true,
    });
    expect(
      workspaceReadiness({
        ...SAMPLE_WORKSPACE,
        authority_policy: {},
      }).ready,
    ).toBe(false);
  });

  it("replaces changed-scope actions even when they have no task_id", () => {
    const workspace = mapLiveWorkspace({
      ...RAW_WORKSPACE,
      current_plan: {
        ...RAW_WORKSPACE.current_plan,
        actions: [
          {
            id: "ACTION-EXTERNAL",
            description: "External action without task metadata",
            scopes: ["refund.execution"],
            attributes: { mode: "automatic" },
          },
          {
            id: "ACTION-SAFE",
            description: "Safe calculation",
            scopes: ["refund.calculation"],
            attributes: { method: "standard" },
          },
        ],
      },
    });
    const corrected = correctedPlanDocument(workspace) as {
      actions: Array<{
        id: string;
        scopes: string[];
        attributes: Record<string, unknown>;
      }>;
    };
    expect(corrected.actions.map((action) => action.id)).toEqual([
      "ACTION-SAFE",
      "ACTION-CORRECTED-1",
    ]);
    expect(corrected.actions[1]?.attributes).toEqual({
      mode: "human_approval_over_500",
    });
  });

  it("chooses the refund execution scope independent of API set ordering", () => {
    const workspace = mapLiveWorkspace({
      ...RAW_WORKSPACE,
      baseline_decision: {
        ...RAW_WORKSPACE.baseline_decision,
        scopes: [
          "refund.execution",
          "refund.identity",
          "refund.calculation",
        ],
      },
      authority_policy: {
        "refund.execution": ["finance-admin"],
        "refund.identity": ["finance-admin"],
        "refund.calculation": ["finance-admin"],
      },
    });
    const change = initialChangeDocument(workspace) as {
      affected_scopes: string[];
      decision: {
        attributes: {
          requirements: Record<string, Record<string, unknown>>;
        };
      };
    };

    expect(change.affected_scopes).toEqual(["refund.execution"]);
    expect(change.decision.attributes.requirements).toEqual({
      "refund.execution": { mode: "human_approval_over_500" },
    });
  });

  it("builds a useful verification report without raw authorization tokens", () => {
    const report = workspaceVerificationReport(mapLiveWorkspace(RAW_WORKSPACE));
    const serialized = JSON.stringify(report);
    expect(serialized).toContain("STALE_SNAPSHOT");
    expect(serialized).toContain("TASK-003");
    expect(serialized).toContain("DEC-002");
    expect(serialized).not.toContain("signed_token");
    expect(serialized).not.toContain("grant_token");
    expect(serialized).not.toContain("token");
  });
});
