import type { LiveWorkspaceView } from "../model";
import { CodeDocumentEditor } from "./CodeDocumentEditor";

export function WorkspaceChange({
  workspace,
  content,
  actorRole,
  busy,
  onContentChange,
  onActorRoleChange,
  onPropose,
  onCancel,
  onApprove,
  onVerify,
}: {
  workspace: LiveWorkspaceView;
  content: string;
  actorRole: string;
  busy: boolean;
  onContentChange: (content: string) => void;
  onActorRoleChange: (role: string) => void;
  onPropose: () => void;
  onCancel: () => void;
  onApprove: () => void;
  onVerify: () => void;
}) {
  const roles = Array.from(
    new Set(Object.values(workspace.authorityPolicy).flat()),
  ).sort();
  const pending = workspace.pendingMutation;
  const approved = workspace.latestApprovedMutation;
  const proposed = workspace.status === "change-proposed" && pending;
  const applied = workspace.status === "change-applied";

  return (
    <div className="lw-action-layout">
      <section aria-labelledby="change-title">
        <div className="lw-section-heading">
          <div>
            <h2 id="change-title">
              {proposed ? "Review the decision proposal" : "Propose a changed decision"}
            </h2>
            <p>
              The proposal cannot change the graph until an authoritative role
              approves it.
            </p>
          </div>
          <span>{workspace.graphVersion}</span>
        </div>
        {proposed ? (
          <div className="lw-change-comparison">
            <article>
              <span>Approved baseline</span>
              <code>{workspace.baselineDecision.id}</code>
              <h3>{workspace.baselineDecision.title}</h3>
              <p>{workspace.baselineDecision.text}</p>
            </article>
            <svg viewBox="0 0 40 20" aria-hidden="true">
              <path d="M2 10h34m-7-6 7 6-7 6" />
            </svg>
            <article>
              <span>Decision proposal</span>
              <code>{pending.decision.id}</code>
              <h3>{pending.decision.title}</h3>
              <p>{pending.decision.text}</p>
            </article>
          </div>
        ) : applied ? (
          <div className="lw-decision-applied">
            <span aria-hidden="true">✓</span>
            <div>
              <small>Approved decision</small>
              <h3>
                {approved?.decision.title ??
                  "Approved decision created a new graph snapshot."}
              </h3>
              {approved?.decision.text ? (
                <p>{approved.decision.text}</p>
              ) : null}
              <p>
                Ask the independent executor to verify the original
                authorization against {workspace.graphVersion}.
              </p>
            </div>
          </div>
        ) : (
          <CodeDocumentEditor
            id="workspace-change-document"
            label="Changed decision (JSON)"
            description="Edit the proposal, superseded decision, and affected scopes before submitting."
            value={content}
            onChange={onContentChange}
            disabled={busy}
            rows={16}
          />
        )}
      </section>

      <aside className="lw-action-panel" aria-labelledby="change-action-title">
        <h2 id="change-action-title">
          {proposed
            ? "Approve changed decision"
            : applied
              ? "Verify original grant"
              : "Submit proposal"}
        </h2>
        <p>
          {proposed
            ? "The server validates role authority, scope containment, confidence, and requirement shape."
            : applied
              ? "Verification uses the stored grant and plan; no token is exposed to this page."
              : "Submitting only records a proposal. It does not invalidate active work."}
        </p>
        <dl>
          <div>
            <dt>Current snapshot</dt>
            <dd>{workspace.graphVersion}</dd>
          </div>
          <div>
            <dt>Original grant</dt>
            <dd>
              {workspace.initialAuthorization?.grant?.authorizationId ??
                "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{workspace.status.replaceAll("-", " ")}</dd>
          </div>
        </dl>
        {proposed ? (
          <>
            <label htmlFor="change-actor-role">Approver role</label>
            <select
              id="change-actor-role"
              value={actorRole}
              disabled={busy}
              onChange={(event) => onActorRoleChange(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              className="sl-button sl-button--primary"
              type="button"
              disabled={busy || !actorRole}
              onClick={onApprove}
            >
              {busy ? "Approving…" : "Approve changed decision"}
            </button>
            <button
              className="sl-button sl-button--quiet"
              type="button"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel and edit proposal
            </button>
          </>
        ) : applied ? (
          <button
            className="sl-button sl-button--primary"
            type="button"
            disabled={busy}
            onClick={onVerify}
          >
            {busy ? "Verifying…" : "Run independent verification"}
          </button>
        ) : (
          <button
            className="sl-button sl-button--primary"
            type="button"
            disabled={busy}
            onClick={onPropose}
          >
            {busy ? "Submitting…" : "Submit decision proposal"}
          </button>
        )}
      </aside>
    </div>
  );
}
