import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppShell } from "../scenario-lab/components/AppShell";
import {
  LiveWorkspaceApiError,
  type LiveWorkspaceClient,
  type LiveWorkspaceStatus,
  type LiveWorkspaceView,
  type WorkspaceDocumentFormat,
  type WorkspaceValidationIssue,
} from "./model";
import { parseWorkspaceDocument } from "./api";
import {
  correctedPlanDocument,
  initialChangeDocument,
  SAMPLE_WORKSPACE,
  SAMPLE_WORKSPACE_JSON,
} from "./sample";
import {
  editWorkspaceDocument,
  workspaceGuide,
  workspaceReadiness,
  workspaceVerificationReport,
} from "./state";
import { ValidationSummary } from "./components/ValidationSummary";
import {
  WorkspaceActivity,
  type WorkspaceLiveUpdate,
} from "./components/WorkspaceActivity";
import { WorkspaceAuthorization } from "./components/WorkspaceAuthorization";
import { WorkspaceBaseline } from "./components/WorkspaceBaseline";
import { WorkspaceChange } from "./components/WorkspaceChange";
import { WorkspaceGuide } from "./components/WorkspaceGuide";
import { WorkspaceImportForm } from "./components/WorkspaceImportForm";
import { WorkspaceImpact } from "./components/WorkspaceImpact";
import { WorkspaceStageRail } from "./components/WorkspaceStageRail";
import "./live-workspace.css";

interface ActionError {
  message: string;
  issues: readonly WorkspaceValidationIssue[];
}

const IMPACT_STATUSES = new Set<LiveWorkspaceStatus>([
  "initial-grant-rejected",
  "plan-updated",
  "reauthorized",
  "complete",
]);

export interface LiveWorkspaceProps {
  client: LiveWorkspaceClient;
  initialWorkspace?: LiveWorkspaceView | null;
  servicesOnline?: number;
  servicesTotal?: number;
  onWorkspaceLoaded?: (workspaceId: string) => void;
}

function actionError(caught: unknown): ActionError {
  if (caught instanceof LiveWorkspaceApiError) {
    return { message: caught.message, issues: caught.issues };
  }
  return {
    message: caught instanceof Error ? caught.message : String(caught),
    issues: [],
  };
}

function actorRoleFor(workspace: LiveWorkspaceView): string {
  return (
    workspace.baselineDecision.authorityRole ??
    Object.values(workspace.authorityPolicy).flat()[0] ??
    ""
  );
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function LiveWorkspace({
  client,
  initialWorkspace = null,
  servicesOnline,
  servicesTotal,
  onWorkspaceLoaded,
}: LiveWorkspaceProps) {
  const [workspace, setWorkspace] = useState<LiveWorkspaceView | null>(
    initialWorkspace,
  );
  const [documentContent, setDocumentContent] = useState(SAMPLE_WORKSPACE_JSON);
  const [documentFormat, setDocumentFormat] =
    useState<WorkspaceDocumentFormat>("json");
  const [sourceName, setSourceName] = useState("");
  const [actorRole, setActorRole] = useState(
    initialWorkspace ? actorRoleFor(initialWorkspace) : "",
  );
  const [changeContent, setChangeContent] = useState(() =>
    initialWorkspace
      ? JSON.stringify(initialChangeDocument(initialWorkspace), null, 2)
      : "",
  );
  const [planContent, setPlanContent] = useState(() =>
    initialWorkspace
      ? JSON.stringify(correctedPlanDocument(initialWorkspace), null, 2)
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionError>({
    message: "",
    issues: [],
  });
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [localUpdate, setLocalUpdate] =
    useState<WorkspaceLiveUpdate | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const fileReadIdRef = useRef(0);
  const focusAfterActionRef = useRef(false);
  const changeInitializedRef = useRef(initialWorkspace?.id ?? "");
  const planInitializedRef = useRef(
    initialWorkspace?.status === "initial-grant-rejected"
      ? initialWorkspace.id
      : "",
  );

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!focusAfterActionRef.current) return;
    focusAfterActionRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("workspace-stage-title")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspace?.status]);

  useEffect(() => {
    if (
      workspace?.status === "authorized" &&
      changeInitializedRef.current !== workspace.id
    ) {
      setChangeContent(
        JSON.stringify(initialChangeDocument(workspace), null, 2),
      );
      changeInitializedRef.current = workspace.id;
    }
  }, [workspace]);

  useEffect(() => {
    if (
      workspace?.status === "initial-grant-rejected" &&
      planInitializedRef.current !== workspace.id
    ) {
      setPlanContent(
        JSON.stringify(correctedPlanDocument(workspace), null, 2),
      );
      planInitializedRef.current = workspace.id;
    }
  }, [workspace]);

  const parsedDocument = useMemo(() => {
    try {
      return parseWorkspaceDocument(documentContent, documentFormat);
    } catch {
      return {};
    }
  }, [documentContent, documentFormat]);
  const readiness = useMemo(
    () => workspaceReadiness(parsedDocument),
    [parsedDocument],
  );

  const runAction = useCallback(
    async (
      action: (signal: AbortSignal) => Promise<LiveWorkspaceView>,
      options: { updateUrl?: boolean } = {},
    ) => {
      if (requestRef.current) return;
      const controller = new AbortController();
      requestRef.current = controller;
      setBusy(true);
      setError({ message: "", issues: [] });
      setLocalUpdate(null);
      try {
        const next = await action(controller.signal);
        controller.signal.throwIfAborted();
        focusAfterActionRef.current = true;
        setWorkspace(next);
        setActorRole((current) => current || actorRoleFor(next));
        if (options.updateUrl) onWorkspaceLoaded?.(next.id);
      } catch (caught) {
        if (!controller.signal.aborted) {
          const nextError = actionError(caught);
          setError(nextError);
          setLocalUpdate({
            title: "This step could not finish",
            detail: nextError.message,
            tone: "negative",
          });
          window.requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(".lw-validation")?.focus();
          });
        }
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setBusy(false);
        }
      }
    },
    [onWorkspaceLoaded],
  );

  const importWorkspace = useCallback(() => {
    void runAction(
      async (signal) => {
        const document = parseWorkspaceDocument(
          documentContent,
          documentFormat,
        );
        return client.importWorkspace(document, { signal });
      },
      { updateUrl: true },
    );
  }, [client, documentContent, documentFormat, runAction]);

  const acceptFile = useCallback((file: File) => {
    if (file.size > 1_000_000) {
      setError({
        message: "Choose a YAML or JSON file smaller than 1 MB.",
        issues: [],
      });
      setLocalUpdate({
        title: "File not accepted",
        detail: "Choose a YAML or JSON file smaller than 1 MB.",
        tone: "negative",
      });
      return;
    }
    const suffix = file.name.split(".").pop()?.toLowerCase();
    if (!["yaml", "yml", "json"].includes(suffix ?? "")) {
      setError({
        message: "Choose a .yaml, .yml, or .json workspace file.",
        issues: [],
      });
      setLocalUpdate({
        title: "File not accepted",
        detail: "Only .yaml, .yml, and .json workspace files are supported.",
        tone: "negative",
      });
      return;
    }
    const readId = fileReadIdRef.current + 1;
    fileReadIdRef.current = readId;
    setError({ message: "", issues: [] });
    setLocalUpdate({
      title: `Reading ${file.name}`,
      detail: "The file is being read locally. Nothing has been uploaded yet.",
    });
    void file
      .text()
      .then((content) => {
        if (fileReadIdRef.current !== readId) return;
        setSourceName(file.name);
        setDocumentFormat(suffix === "json" ? "json" : "yaml");
        setDocumentContent(content);
        setLocalUpdate({
          title: `${file.name} is ready`,
          detail:
            "Review the file if needed, then choose Validate and continue.",
          tone: "positive",
        });
      })
      .catch(() => {
        if (fileReadIdRef.current !== readId) return;
        setError({
          message: `The browser could not read ${file.name}.`,
          issues: [],
        });
        setLocalUpdate({
          title: "The file could not be read",
          detail: `Try choosing ${file.name} again or use the starter JSON.`,
          tone: "negative",
        });
      });
  }, []);

  const guide = workspaceGuide(workspace?.status);

  const downloadTemplate = useCallback(() => {
    downloadJson("dragback-workspace.json", SAMPLE_WORKSPACE);
    setLocalUpdate({
      title: "Starter JSON downloaded",
      detail:
        "Edit the file with your own decision, ticket, tasks, plan, and authority roles, then upload it here.",
      tone: "positive",
    });
  }, []);

  const downloadReport = useCallback(() => {
    if (!workspace) return;
    downloadJson(
      `${workspace.id}-verification-report.json`,
      workspaceVerificationReport(workspace),
    );
    setLocalUpdate({
      title: "Verification report downloaded",
      detail:
        "The report contains the outcome, provenance path, and activity history without secret tokens.",
      tone: "positive",
    });
  }, [workspace]);

  return (
    <AppShell
      activeView="workspace"
      surface="live-workspace"
      onNavigate={(view) => {
        window.location.href =
          view === "report" ? "/scenario-lab?view=report" : "/scenario-lab";
      }}
      navigationDisabled={busy}
      graphSnapshot={workspace?.graphVersion}
      servicesOnline={servicesOnline}
      servicesTotal={servicesTotal}
    >
      <article className="sl-page lw-page" aria-labelledby="live-workspace-title">
        <header className="lw-heading">
          <div>
            <h1 id="live-workspace-title">Live Workspace</h1>
            <p>
              {workspace
                ? workspace.name
                : "Bring your own decisions, tasks, and agent plan into Dragback."}
            </p>
          </div>
          {workspace ? (
            <div className="lw-heading__status" aria-label="Workspace status">
              <code>{workspace.graphVersion}</code>
              <span
                className={
                  workspace.status === "complete" ? "is-positive" : ""
                }
              >
                {workspace.status === "complete"
                  ? "Verified"
                  : guide.stateLabel}
              </span>
            </div>
          ) : null}
        </header>

        <WorkspaceStageRail status={workspace?.status} />
        <WorkspaceGuide guide={guide} busy={busy} />

        <div className="lw-workspace-layout">
          <div className="lw-workspace-action">
            {!workspace ? (
              <WorkspaceImportForm
                content={documentContent}
                sourceName={sourceName}
                format={documentFormat}
                readiness={readiness}
                busy={busy}
                errorMessage={error.message}
                validationIssues={error.issues}
                onContentChange={(content) => {
                  const next = editWorkspaceDocument(
                    {
                      content: documentContent,
                      format: documentFormat,
                    },
                    content,
                  );
                  setDocumentContent(next.content);
                  setDocumentFormat(next.format);
                }}
                onFile={acceptFile}
                onSubmit={importWorkspace}
                onDownloadTemplate={downloadTemplate}
                onDismissError={() =>
                  setError({ message: "", issues: [] })
                }
              />
            ) : (
              <>
                <ValidationSummary
                  message={error.message}
                  issues={error.issues}
                  onDismiss={() =>
                    setError({ message: "", issues: [] })
                  }
                />
                {workspace.status === "imported" ? (
                  <WorkspaceBaseline
                    workspace={workspace}
                    actorRole={actorRole}
                    busy={busy}
                    onActorRoleChange={setActorRole}
                    onApprove={() =>
                      void runAction((signal) =>
                        client.approveBaseline(workspace.id, actorRole, {
                          signal,
                        }),
                      )
                    }
                  />
                ) : null}
                {workspace.status === "baseline-approved" ? (
                  <WorkspaceAuthorization
                    workspace={workspace}
                    busy={busy}
                    onAuthorize={() =>
                      void runAction((signal) =>
                        client.authorizePlan(workspace.id, { signal }),
                      )
                    }
                  />
                ) : null}
                {["authorized", "change-proposed", "change-applied"].includes(
                  workspace.status,
                ) ? (
                  <WorkspaceChange
                    workspace={workspace}
                    content={changeContent}
                    actorRole={actorRole}
                    busy={busy}
                    onContentChange={setChangeContent}
                    onActorRoleChange={setActorRole}
                    onPropose={() =>
                      void runAction((signal) => {
                        const mutation = parseWorkspaceDocument(
                          changeContent,
                          "json",
                        ) as unknown as Record<string, unknown>;
                        return client.proposeChange(workspace.id, mutation, {
                          signal,
                        });
                      })
                    }
                    onCancel={() =>
                      void runAction((signal) =>
                        client.cancelPendingChange(workspace.id, { signal }),
                      )
                    }
                    onApprove={() =>
                      void runAction((signal) => {
                        const decisionId =
                          workspace.pendingMutation?.decision.id;
                        if (!decisionId) {
                          throw new LiveWorkspaceApiError(
                            "The workspace has no pending decision proposal.",
                          );
                        }
                        return client.approveChange(
                          workspace.id,
                          decisionId,
                          actorRole,
                          { signal },
                        );
                      })
                    }
                    onVerify={() =>
                      void runAction((signal) =>
                        client.verifyInitialGrant(workspace.id, { signal }),
                      )
                    }
                  />
                ) : null}
                {IMPACT_STATUSES.has(workspace.status) ? (
                  <WorkspaceImpact
                    workspace={workspace}
                    planContent={planContent}
                    busy={busy}
                    evidenceOpen={evidenceOpen}
                    onPlanContentChange={setPlanContent}
                    onToggleEvidence={() => {
                      const next = !evidenceOpen;
                      setEvidenceOpen(next);
                      window.requestAnimationFrame(() => {
                        document
                          .getElementById(
                            next
                              ? "workspace-technical-evidence"
                              : "workspace-evidence-toggle",
                          )
                          ?.focus();
                      });
                    }}
                    onDownloadReport={downloadReport}
                    onSaveAndReauthorize={() =>
                      void runAction(async (signal) => {
                        const plan = parseWorkspaceDocument(
                          planContent,
                          "json",
                        ) as unknown as Record<string, unknown>;
                        const updated = await client.updatePlan(
                          workspace.id,
                          plan,
                          { signal },
                        );
                        if (!signal.aborted) setWorkspace(updated);
                        return client.reauthorize(workspace.id, { signal });
                      })
                    }
                    onReauthorize={() =>
                      void runAction((signal) =>
                        client.reauthorize(workspace.id, { signal }),
                      )
                    }
                    onVerifyReplacement={() =>
                      void runAction((signal) =>
                        client.verifyReplacementGrant(workspace.id, {
                          signal,
                        }),
                      )
                    }
                  />
                ) : null}
              </>
            )}
          </div>

          <WorkspaceActivity
            events={workspace?.history ?? []}
            busy={busy}
            busyMessage={guide.busyMessage}
            localUpdate={localUpdate}
          />
        </div>
      </article>
    </AppShell>
  );
}
