import type { LiveWorkspaceView } from "../model";

export function WorkspaceAuthorization({
  workspace,
  busy,
  onAuthorize,
}: {
  workspace: LiveWorkspaceView;
  busy: boolean;
  onAuthorize: () => void;
}) {
  return (
    <div className="lw-action-layout">
      <section aria-labelledby="plan-review-title">
        <div className="lw-section-heading">
          <div>
            <h2 id="plan-review-title">Review the current agent plan</h2>
            <p>
              Dragback will evaluate every scoped action against the approved
              graph snapshot.
            </p>
          </div>
          <code>{workspace.currentPlan.id}</code>
        </div>
        <div className="lw-plan-summary">
          <div>
            <span>Objective</span>
            <strong>{workspace.currentPlan.objective}</strong>
          </div>
          <ol>
            {workspace.currentPlan.actions.map((action, index) => (
              <li key={action.id}>
                <span>{index + 1}</span>
                <div>
                  <code>{action.id}</code>
                  <strong>{action.description}</strong>
                  <small>{action.scopes.join(", ")}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <aside className="lw-action-panel" aria-labelledby="authorize-action-title">
        <h2 id="authorize-action-title">Authorize plan</h2>
        <p>
          A successful authorization binds the run, ticket, graph snapshot, and
          exact plan hash.
        </p>
        <dl>
          <div>
            <dt>Approved snapshot</dt>
            <dd>{workspace.graphVersion}</dd>
          </div>
          <div>
            <dt>Ticket</dt>
            <dd>{workspace.currentPlan.ticketId}</dd>
          </div>
          <div>
            <dt>Plan actions</dt>
            <dd>{workspace.currentPlan.actions.length}</dd>
          </div>
        </dl>
        <button
          className="sl-button sl-button--primary"
          type="button"
          disabled={busy}
          onClick={onAuthorize}
        >
          {busy ? "Authorizing…" : "Issue snapshot-bound authorization"}
        </button>
        <small>The browser never mints or signs a grant.</small>
      </aside>
    </div>
  );
}
