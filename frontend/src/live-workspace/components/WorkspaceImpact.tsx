import type { LiveWorkspaceView, WorkspaceArtifact } from "../model";
import { CodeDocumentEditor } from "./CodeDocumentEditor";

function taskOutcome(
  task: WorkspaceArtifact,
  invalidated: ReadonlySet<string>,
): "invalidated" | "preserved" {
  return invalidated.has(task.id) ? "invalidated" : "preserved";
}

function primaryPath(workspace: LiveWorkspaceView): readonly string[] {
  if (workspace.conflictAuthorization?.invalidationPath.length) {
    return workspace.conflictAuthorization.invalidationPath;
  }
  const paths = workspace.invalidationReport?.paths ?? [];
  return [...paths].sort(
    (left, right) =>
      left.node_ids.length - right.node_ids.length ||
      left.artifact_id.localeCompare(right.artifact_id),
  )[0]?.node_ids ?? [];
}

export function WorkspaceImpact({
  workspace,
  planContent,
  busy,
  evidenceOpen,
  onPlanContentChange,
  onSaveAndReauthorize,
  onReauthorize,
  onVerifyReplacement,
  onToggleEvidence,
}: {
  workspace: LiveWorkspaceView;
  planContent: string;
  busy: boolean;
  evidenceOpen: boolean;
  onPlanContentChange: (content: string) => void;
  onSaveAndReauthorize: () => void;
  onReauthorize: () => void;
  onVerifyReplacement: () => void;
  onToggleEvidence: () => void;
}) {
  const report = workspace.invalidationReport;
  const invalidatedIds = new Set(
    report?.invalidated_task_ids ?? report?.stopped_work_artifact_ids ?? [],
  );
  const invalidatedCount = workspace.tasks.filter((task) =>
    invalidatedIds.has(task.id),
  ).length;
  const preservedCount = workspace.tasks.length - invalidatedCount;
  const decision =
    workspace.latestApprovedMutation?.decision ??
    workspace.pendingMutation?.decision;
  const oldVerification = workspace.initialVerification;
  const replacementVerification = workspace.replacementVerification;
  const planAuthorized =
    workspace.status === "reauthorized" || workspace.status === "complete";
  const complete = workspace.status === "complete";
  const path = primaryPath(workspace);

  return (
    <>
      <section className="lw-outcome-ledger" aria-labelledby="workspace-outcome-title">
        <div className="lw-outcome-ledger__message">
          <span
            className={
              complete
                ? "lw-outcome-ledger__mark lw-outcome-ledger__mark--positive"
                : "lw-outcome-ledger__mark"
            }
            aria-hidden="true"
          >
            {complete ? "✓" : "!"}
          </span>
          <div>
            <h2 id="workspace-outcome-title">
              {complete
                ? `The replacement grant is valid. ${invalidatedCount} task invalidated. ${preservedCount} continue.`
                : `The original grant is stale. ${invalidatedCount} task invalidated. ${preservedCount} continue.`}
            </h2>
            <p>
              {complete
                ? `The executor accepted the ${workspace.graphVersion} authorization for the corrected plan.`
                : `The executor rejected the original authorization after the approved decision created ${workspace.graphVersion}.`}
            </p>
          </div>
        </div>
        <dl>
          <div>
            <dt>Decision</dt>
            <dd>{decision?.title ?? "Approved decision changed"}</dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd className={planAuthorized ? "is-positive" : "is-warning"}>
              {planAuthorized ? "Authorized" : "Needs review"}
            </dd>
          </div>
          <div>
            <dt>Old grant</dt>
            <dd className="is-negative">
              {oldVerification
                ? `Rejected · ${oldVerification.verificationCode}`
                : "Verification pending"}
            </dd>
          </div>
          <div>
            <dt>Replacement grant</dt>
            <dd className={complete ? "is-positive" : undefined}>
              {replacementVerification
                ? `${replacementVerification.applied ? "Applied" : "Rejected"} · ${replacementVerification.verificationCode}`
                : workspace.replacementAuthorization?.grant
                  ? "Issued · verification pending"
                  : "Not issued"}
            </dd>
          </div>
        </dl>
      </section>

      <div className="lw-impact-layout">
        <section className="lw-selective-impact" aria-labelledby="selective-impact-title">
          <h2 id="selective-impact-title">Selective impact</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Status</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {workspace.tasks.map((task) => {
                const outcome = taskOutcome(task, invalidatedIds);
                return (
                  <tr key={task.id}>
                    <th scope="row">
                      <span
                        className={`lw-task-mark lw-task-mark--${outcome}`}
                        aria-hidden="true"
                      >
                        {outcome === "preserved" ? "✓" : "!"}
                      </span>
                      {task.title}
                    </th>
                    <td className={`is-${outcome}`}>
                      {outcome === "preserved" ? "Preserved" : "Invalidated"}
                    </td>
                    <td>
                      {outcome === "preserved"
                        ? "No change in decision scope."
                        : "Conflicts with the new decision rule."}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="lw-shortest-path">
            <h3>Shortest graph-derived path</h3>
            {path.length > 0 ? (
              <ol>
                {path.map((nodeId, index) => (
                  <li key={`${nodeId}-${index}`}>
                    <code>{nodeId}</code>
                    {index < path.length - 1 ? (
                      <svg viewBox="0 0 30 18" aria-hidden="true">
                        <path d="M2 9h24m-5-4 5 4-5 4" />
                      </svg>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p>The authority did not return a provenance path.</p>
            )}
          </div>
        </section>

        <section className="lw-correct-plan" aria-labelledby="correct-plan-title">
          <h2 id="correct-plan-title">
            {complete ? "Corrected plan verified" : "Correct the plan"}
          </h2>
          <p>
            {complete
              ? "The replacement authorization is bound to this exact plan."
              : "Paste or edit the updated agent plan (JSON)."}
          </p>
          <CodeDocumentEditor
            id="corrected-plan-document"
            label="Updated agent plan"
            value={planContent}
            onChange={onPlanContentChange}
            disabled={busy || complete}
            rows={14}
          />
          <div className="lw-correct-plan__actions">
            {workspace.status === "initial-grant-rejected" ? (
              <button
                className="sl-button sl-button--primary"
                type="button"
                disabled={busy}
                onClick={onSaveAndReauthorize}
              >
                {busy ? "Saving…" : "Save and reauthorize"}
              </button>
            ) : workspace.status === "plan-updated" ? (
              <button
                className="sl-button sl-button--primary"
                type="button"
                disabled={busy}
                onClick={onReauthorize}
              >
                {busy ? "Reauthorizing…" : "Reauthorize saved plan"}
              </button>
            ) : workspace.status === "reauthorized" ? (
              <button
                className="sl-button sl-button--primary"
                type="button"
                disabled={busy}
                onClick={onVerifyReplacement}
              >
                {busy ? "Verifying…" : "Verify replacement grant"}
              </button>
            ) : (
              <button
                className="sl-button sl-button--primary"
                type="button"
                disabled
              >
                Replacement grant verified
              </button>
            )}
            <button
              className="sl-button sl-button--secondary"
              type="button"
              aria-expanded={evidenceOpen}
              aria-controls="workspace-technical-evidence"
              onClick={onToggleEvidence}
            >
              View technical evidence
            </button>
          </div>
          <small>
            Dragback evaluates the plan against {workspace.graphVersion} before
            issuing a replacement grant.
          </small>
        </section>
      </div>

      {evidenceOpen ? (
        <section
          className="lw-technical-evidence"
          id="workspace-technical-evidence"
          aria-labelledby="workspace-technical-evidence-title"
          tabIndex={-1}
        >
          <div>
            <h2 id="workspace-technical-evidence-title">Technical evidence</h2>
            <button type="button" onClick={onToggleEvidence}>
              Close
            </button>
          </div>
          <dl>
            <div>
              <dt>Graph snapshot</dt>
              <dd><code>{workspace.graphVersion}</code></dd>
            </div>
            <div>
              <dt>Original authorization</dt>
              <dd>
                <code>
                  {workspace.initialAuthorization?.grant?.authorizationId ??
                    "Unavailable"}
                </code>
              </dd>
            </div>
            <div>
              <dt>Original plan hash</dt>
              <dd>
                <code>
                  {workspace.initialAuthorization?.grant?.planHash ??
                    "Unavailable"}
                </code>
              </dd>
            </div>
            <div>
              <dt>Evidence references</dt>
              <dd>
                {(workspace.conflictAuthorization?.evidenceRefs ?? []).join(
                  ", ",
                ) || "Unavailable"}
              </dd>
            </div>
          </dl>
          <p>Grant signatures and raw tokens are intentionally not exposed.</p>
        </section>
      ) : null}
    </>
  );
}
