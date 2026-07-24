import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mapLiveWorkspace } from "./api";
import { LiveWorkspace } from "./LiveWorkspace";
import type { LiveWorkspaceClient } from "./model";
import { WorkspaceImpact } from "./components/WorkspaceImpact";
import { WorkspaceImportForm } from "./components/WorkspaceImportForm";
import { WorkspaceChange } from "./components/WorkspaceChange";
import { WorkspaceGuide } from "./components/WorkspaceGuide";
import { WorkspaceActivity } from "./components/WorkspaceActivity";
import { workspaceGuide, workspaceReadiness } from "./state";
import { SAMPLE_WORKSPACE, SAMPLE_WORKSPACE_JSON } from "./sample";
import { RAW_WORKSPACE } from "./test-fixtures";

const client = {} as LiveWorkspaceClient;

describe("Live Workspace components", () => {
  it("renders the approved import information architecture and accessible form", () => {
    const html = renderToStaticMarkup(
      <WorkspaceImportForm
        content={SAMPLE_WORKSPACE_JSON}
        sourceName="dragback.json"
        format="json"
        readiness={workspaceReadiness(SAMPLE_WORKSPACE)}
        busy={false}
        errorMessage=""
        validationIssues={[]}
        onContentChange={() => undefined}
        onFile={() => undefined}
        onSubmit={() => undefined}
        onDownloadTemplate={() => undefined}
        onDismissError={() => undefined}
      />,
    );
    expect(html).toContain("Choose a workspace file");
    expect(html).toContain('accept=".yaml,.yml,.json');
    expect(html).toContain("Review or edit the workspace document");
    expect(html).toContain("What Dragback needs");
    expect(html).toContain("Download starter JSON");
    expect(html).toContain("Validate and continue");
    expect(html).toContain("Server validation is next");
  });

  it("labels an uploaded YAML document as YAML while preserving the same form", () => {
    const html = renderToStaticMarkup(
      <WorkspaceImportForm
        content="id: refund-operations"
        sourceName="dragback.yaml"
        format="yaml"
        readiness={workspaceReadiness({})}
        busy={false}
        errorMessage=""
        validationIssues={[]}
        onContentChange={() => undefined}
        onFile={() => undefined}
        onSubmit={() => undefined}
        onDownloadTemplate={() => undefined}
        onDismissError={() => undefined}
      />,
    );
    expect(html).toContain("Workspace YAML");
    expect(html).not.toContain("Workspace JSON");
  });

  it("renders the full Live Workspace shell with active navigation and no invented report", () => {
    const html = renderToStaticMarkup(
      <LiveWorkspace client={client} servicesOnline={3} servicesTotal={3} />,
    );
    expect(html).toContain("Live Workspace");
    expect(html).toContain('href="/live-workspace" aria-current="page"');
    expect(html).toContain("Guided Proof");
    expect(html).toContain("Scenario Lab");
    expect(html).not.toContain("Run report");
    expect(html).toContain("Step 1 of 5");
    expect(html).toContain("What happens next");
    expect(html).not.toContain("Example workflow");
  });

  it("renders backend-owned stale grant, selective tasks, actual decision wording, and token-free evidence", () => {
    const workspace = mapLiveWorkspace(RAW_WORKSPACE);
    const html = renderToStaticMarkup(
      <WorkspaceImpact
        workspace={workspace}
        planContent='{"id":"PLAN-002"}'
        busy={false}
        evidenceOpen
        onPlanContentChange={() => undefined}
        onSaveAndReauthorize={() => undefined}
        onReauthorize={() => undefined}
        onVerifyReplacement={() => undefined}
        onDownloadReport={() => undefined}
        onToggleEvidence={() => undefined}
      />,
    );
    expect(html).toContain("The original authorization is stale.");
    expect(html).toContain("1 task stopped.");
    expect(html).toContain("1 task remains valid.");
    expect(html).toContain("Refunds over $500 require human approval");
    expect(html).toContain("Rejected · STALE_SNAPSHOT");
    expect(html).toContain("Calculate amount");
    expect(html).toContain("Issue automatically");
    expect(html).toContain("Preserved");
    expect(html).toContain("Stopped");
    expect(html).toContain("DEC-002");
    expect(html).toContain("Grant signatures and raw tokens are intentionally not exposed.");
    expect(html).not.toContain("signed_token");
  });

  it("offers a low-emphasis recovery action while a decision proposal is pending", () => {
    const workspace = mapLiveWorkspace({
      ...RAW_WORKSPACE,
      status: "change-proposed",
      pending_mutation: RAW_WORKSPACE.latest_approved_mutation,
      latest_approved_mutation: null,
      conflict_authorization: null,
      initial_verification: null,
      invalidation_report: null,
    });
    const html = renderToStaticMarkup(
      <WorkspaceChange
        workspace={workspace}
        content="{}"
        actorRole="finance-admin"
        busy={false}
        onContentChange={() => undefined}
        onActorRoleChange={() => undefined}
        onPropose={() => undefined}
        onCancel={() => undefined}
        onApprove={() => undefined}
        onVerify={() => undefined}
      />,
    );
    expect(html).toContain("Cancel proposal");
    expect(html).toContain("sl-button--quiet");
  });

  it("explains one current step and one next outcome without repeating all stage descriptions", () => {
    const html = renderToStaticMarkup(
      <WorkspaceGuide
        guide={workspaceGuide("initial-grant-rejected")}
        busy={false}
      />,
    );
    expect(html).toContain("Step 5 of 5");
    expect(html).toContain("Do this now");
    expect(html).toContain("Update the affected plan");
    expect(html).toContain("What happens next");
    expect(html).toContain("Old authorization rejected");
    expect(html).not.toContain("Bring in your decisions");
  });

  it("uses explicit wait language while a step is running", () => {
    const guide = workspaceGuide("change-applied");
    const guideHtml = renderToStaticMarkup(
      <WorkspaceGuide guide={guide} busy />,
    );
    const activityHtml = renderToStaticMarkup(
      <WorkspaceActivity
        events={[]}
        busy
        busyMessage={guide.busyMessage}
      />,
    );
    expect(guideHtml).toContain("Dragback is working");
    expect(guideHtml).toContain("Please wait");
    expect(guideHtml).toContain("Keep this page open");
    expect(activityHtml).toContain("Working on this step");
    expect(activityHtml).toContain("independent executor is checking");
  });

  it("maps known activity types to readable updates without inferring tone from free text", () => {
    const html = renderToStaticMarkup(
      <WorkspaceActivity
        events={[
          {
            sequence: 1,
            eventType: "initial-grant.verified",
            detail: "Executor verification returned STALE_SNAPSHOT.",
            createdAt: "2026-07-23T18:00:00Z",
            data: { applied: false },
          },
        ]}
        busy={false}
        busyMessage="Checking"
      />,
    );
    expect(html).toContain("Original authorization checked");
    expect(html).toContain("Activity history (1)");
    expect(html).toContain("lw-activity__current--negative");
    expect(html).not.toContain("initial-grant verified");
  });
});
