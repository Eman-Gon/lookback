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
  workspaceReadiness,
  workspaceStageProgress,
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

  it("derives the four guarded stages from backend-owned status", () => {
    expect(activeWorkspaceStage()).toBe("import");
    expect(activeWorkspaceStage("imported")).toBe("approve-baseline");
    expect(activeWorkspaceStage("baseline-approved")).toBe("authorize-plan");
    expect(activeWorkspaceStage("authorized")).toBe("verify-change");
    expect(workspaceStageProgress("import", "authorized")).toBe("complete");
    expect(workspaceStageProgress("verify-change", "authorized")).toBe(
      "current",
    );
    expect(
      workspaceStageProgress("verify-change", "initial-grant-rejected"),
    ).toBe("attention");
    expect(workspaceStageProgress("verify-change", "complete")).toBe(
      "complete",
    );
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
});
