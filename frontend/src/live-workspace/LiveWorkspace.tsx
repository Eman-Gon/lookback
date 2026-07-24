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
  type LiveWorkspaceView,
  type WorkspaceDocumentFormat,
  type WorkspaceValidationIssue,
} from "./model";
import { parseWorkspaceDocument } from "./api";
import {
  correctedPlanDocument,
  initialChangeDocument,
  SAMPLE_WORKSPACE_JSON,
} from "./sample";
import {
  activeWorkspaceStage,
  editWorkspaceDocument,
  workspaceReadiness,
} from "./state";
import { ExampleWorkflow } from "./components/ExampleWorkflow";
import { ValidationSummary } from "./components/ValidationSummary";
import { WorkspaceActivity } from "./components/WorkspaceActivity";
import { WorkspaceAuthorization } from "./components/WorkspaceAuthorization";
import { WorkspaceBaseline } from "./components/WorkspaceBaseline";
import { WorkspaceChange } from "./components/WorkspaceChange";
import { WorkspaceImportForm } from "./components/WorkspaceImportForm";
import { WorkspaceImpact } from "./components/WorkspaceImpact";
import { WorkspaceStageRail } from "./components/WorkspaceStageRail";
import "./live-workspace.css";

interface ActionError {
  message: string;
  issues: readonly WorkspaceValidationIssue[];
}

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
  const [sourceName, setSourceName] = useState("dragback.json");
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
  const requestRef = useRef<AbortController | null>(null);
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
      try {
        const next = await action(controller.signal);
        controller.signal.throwIfAborted();
        focusAfterActionRef.current = true;
        setWorkspace(next);
        setActorRole((current) => current || actorRoleFor(next));
        if (options.updateUrl) onWorkspaceLoaded?.(next.id);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(actionError(caught));
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
      return;
    }
    const suffix = file.name.split(".").pop()?.toLowerCase();
    if (!["yaml", "yml", "json"].includes(suffix ?? "")) {
      setError({
        message: "Choose a .yaml, .yml, or .json workspace file.",
        issues: [],
      });
      return;
    }
    setError({ message: "", issues: [] });
    setSourceName(file.name);
    setDocumentFormat(suffix === "json" ? "json" : "yaml");
    void file
      .text()
      .then(setDocumentContent)
      .catch(() => {
        setError({
          message: `The browser could not read ${file.name}.`,
          issues: [],
        });
      });
  }, []);

  const stage = activeWorkspaceStage(workspace?.status);
  const stageLiveMessage = workspace
    ? `${workspace.name}: ${stage.replaceAll("-", " ")}. Current snapshot ${workspace.graphVersion}.`
    : "No workspace loaded. Import is the current stage.";
  const impactStatuses = new Set([
    "initial-grant-rejected",
    "plan-updated",
    "reauthorized",
    "complete",
  ]);

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
            <h1 id="live-workspace-title">
              {workspace?.name ?? "Bring your own work"}
            </h1>
            <p>
              {workspace?.description ||
                "Import a workspace, approve its baseline, and issue a real snapshot-bound authorization."}
            </p>
          </div>
          <div className="lw-heading__status" aria-label="Workspace status">
            {workspace ? (
              <>
                <code>{workspace.graphVersion}</code>
                <span
                  className={
                    workspace.status === "complete" ? "is-positive" : ""
                  }
                >
                  {workspace.status === "complete" ? "Ready" : "Action required"}
                </span>
              </>
            ) : (
              <span>No workspace loaded</span>
            )}
          </div>
        </header>

        <WorkspaceStageRail status={workspace?.status} />
        <p className="sl-visually-hidden" role="status" aria-live="polite">
          {stageLiveMessage}
        </p>

        <div id="workspace-stage-title" tabIndex={-1}>
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
              {impactStatuses.has(workspace.status) ? (
                <WorkspaceImpact
                  workspace={workspace}
                  planContent={planContent}
                  busy={busy}
                  evidenceOpen={evidenceOpen}
                  onPlanContentChange={setPlanContent}
                  onToggleEvidence={() =>
                    setEvidenceOpen((current) => !current)
                  }
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

        {workspace ? (
          <WorkspaceActivity events={workspace.history} />
        ) : (
          <ExampleWorkflow />
        )}
      </article>
    </AppShell>
  );
}
