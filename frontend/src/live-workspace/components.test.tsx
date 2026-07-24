import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mapLiveWorkspace } from "./api";
import { LiveWorkspace } from "./LiveWorkspace";
import type { LiveWorkspaceClient } from "./model";
import { WorkspaceImpact } from "./components/WorkspaceImpact";
import { WorkspaceImportForm } from "./components/WorkspaceImportForm";
import { WorkspaceChange } from "./components/WorkspaceChange";
import { workspaceReadiness } from "./state";
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
        onDismissError={() => undefined}
      />,
    );
    expect(html).toContain("Import workspace");
    expect(html).toContain('accept=".yaml,.yml,.json');
    expect(html).toContain("or paste JSON");
    expect(html).toContain("What Dragback needs");
    expect(html).toContain("Validate and import");
    expect(html).toContain("server validation is next");
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
        onDismissError={() => undefined}
      />,
    );
    expect(html).toContain("or edit YAML");
    expect(html).not.toContain("or paste JSON");
  });

  it("renders the full Live Workspace shell with active navigation and no invented report", () => {
    const html = renderToStaticMarkup(
      <LiveWorkspace client={client} servicesOnline={3} servicesTotal={3} />,
    );
    expect(html).toContain("Bring your own work");
    expect(html).toContain('href="/live-workspace" aria-current="page"');
    expect(html).toContain("Guided Proof");
    expect(html).toContain("Scenario Lab");
    expect(html).not.toContain("Run report");
    expect(html).toContain("No workspace loaded");
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
        onToggleEvidence={() => undefined}
      />,
    );
    expect(html).toContain("The original grant is stale.");
    expect(html).toContain("1 task invalidated. 1 continue.");
    expect(html).toContain("Refunds over $500 require human approval");
    expect(html).toContain("Rejected · STALE_SNAPSHOT");
    expect(html).toContain("Calculate amount");
    expect(html).toContain("Issue automatically");
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
    expect(html).toContain("Cancel and edit proposal");
    expect(html).toContain("sl-button--quiet");
  });
});
