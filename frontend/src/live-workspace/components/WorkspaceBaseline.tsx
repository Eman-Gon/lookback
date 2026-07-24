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
    <div className="lw-action-layout">
      <section aria-labelledby="baseline-review-title">
        <div className="lw-section-heading">
          <div>
            <h2 id="baseline-review-title">Review the proposed baseline</h2>
            <p>
              These artifacts will seed the graph. Approval is still required
              before they become authoritative.
            </p>
          </div>
          <span>{workspace.tasks.length} tasks</span>
        </div>
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
      </section>

      <aside className="lw-action-panel" aria-labelledby="baseline-action-title">
        <h2 id="baseline-action-title">Approve baseline</h2>
        <p>
          The selected role must be authoritative for every governed scope.
          Dragback checks this on the server.
        </p>
        <dl>
          <div>
            <dt>Starting graph</dt>
            <dd>{workspace.graphVersion}</dd>
          </div>
          <div>
            <dt>Governed scopes</dt>
            <dd>{workspace.baselineDecision.scopes.length}</dd>
          </div>
          <div>
            <dt>Approval status</dt>
            <dd>Proposal</dd>
          </div>
        </dl>
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
          {busy ? "Approving…" : "Approve baseline"}
        </button>
        <small>Newest is not automatically authoritative.</small>
      </aside>
    </div>
  );
}
