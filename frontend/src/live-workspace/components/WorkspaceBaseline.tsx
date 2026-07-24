import type { LiveWorkspaceView } from "../model";

function ArtifactRow({
  label,
  id,
  title,
  detail,
}: {
  label: string;
  id: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="lw-artifact-row">
      <span>{label}</span>
      <code>{id}</code>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

export function WorkspaceBaseline({
  workspace,
  actorRole,
  busy,
  onActorRoleChange,
  onApprove,
}: {
  workspace: LiveWorkspaceView;
  actorRole: string;
  busy: boolean;
  onActorRoleChange: (role: string) => void;
  onApprove: () => void;
}) {
  const roles = Array.from(
    new Set(Object.values(workspace.authorityPolicy).flat()),
  ).sort();
  return (
    <section className="lw-stage-content" aria-labelledby="baseline-review-title">
      <div className="lw-stage-content__main">
        <div className="lw-section-heading">
          <div>
            <h2 id="baseline-review-title">Review what was imported</h2>
            <p>
              This is still a proposal. Check the decision and the work it
              governs before approving it.
            </p>
          </div>
          <span>{workspace.tasks.length} tasks</span>
        </div>
        <div className="lw-baseline-overview">
          <article>
            <span>Decision proposal</span>
            <h3>{workspace.baselineDecision.title}</h3>
            <p>{workspace.baselineDecision.text}</p>
          </article>
          <dl>
            <div>
              <dt>Ticket</dt>
              <dd>{workspace.ticket.title}</dd>
            </div>
            <div>
              <dt>Governed scopes</dt>
              <dd>{workspace.baselineDecision.scopes.length}</dd>
            </div>
            <div>
              <dt>Plan actions</dt>
              <dd>{workspace.currentPlan.actions.length}</dd>
            </div>
          </dl>
        </div>

        <details className="lw-disclosure">
          <summary>Review all imported artifacts</summary>
          <div className="lw-artifact-list">
            <ArtifactRow
              label="Decision proposal"
              id={workspace.baselineDecision.id}
              title={workspace.baselineDecision.title}
              detail={workspace.baselineDecision.text}
            />
            <ArtifactRow
              label="Specification"
              id={workspace.specification.id}
              title={workspace.specification.title}
              detail={workspace.specification.text}
            />
            <ArtifactRow
              label="Ticket"
              id={workspace.ticket.id}
              title={workspace.ticket.title}
              detail={workspace.ticket.text}
            />
            {workspace.tasks.map((task) => (
              <ArtifactRow
                key={task.id}
                label="Task"
                id={task.id}
                title={task.title}
                detail={task.scopes.join(", ")}
              />
            ))}
          </div>
        </details>
      </div>

      <div className="lw-action-panel" aria-labelledby="baseline-action-title">
        <div>
          <h3 id="baseline-action-title">Approve this baseline</h3>
          <p>
            Choose the role responsible for these scopes. Dragback checks the
            role on the server.
          </p>
        </div>
        <div className="lw-action-panel__controls">
          <label htmlFor="baseline-actor-role">Approver role</label>
          <select
            id="baseline-actor-role"
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
            {busy ? "Approving baseline…" : "Approve baseline"}
          </button>
        </div>
      </div>
      <p className="lw-stage-note">
        Approval is required because the newest decision is not automatically
        authoritative.
      </p>
    </section>
  );
}
