import type { AgentState, PlanAction } from "../types";

const LOOP_STATES = ["PLAN", "VERIFY", "ACT", "REPLAN", "BLOCKED", "HUMAN_REVIEW"];

function ActionRow({ action }: { action: PlanAction }) {
  const isCorrected = action.attributes.audience === "admin_only";
  const attributes = Object.entries(action.attributes)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");

  return (
    <li className={isCorrected ? "corrected" : ""}>
      <div className="action-heading">
        <code>{action.id}</code>
        {isCorrected ? <span>corrected</span> : null}
      </div>
      <p>{action.description}</p>
      <small>{attributes}</small>
    </li>
  );
}

export function LoopPanel({ state }: { state: AgentState | null }) {
  const run = state?.run;
  const active = run?.state;

  return (
    <section className="panel loop-panel">
      <div className="panel-heading">
        <div>
          <h2>Agent loop</h2>
          <p className="panel-intro">The planner requests authority; it never approves itself.</p>
        </div>
        <span className={`tests-status ${run?.tests_passed ? "passed" : ""}`}>
          <span aria-hidden="true" />
          Tests {run?.tests_passed ? "passed" : "pending"}
        </span>
      </div>

      <div className="loop-row" aria-label={`Agent loop state: ${active ?? "not started"}`}>
        {LOOP_STATES.map((item) => (
          <div className={`state-chip ${item === active ? "active" : ""}`} aria-current={item === active ? "step" : undefined} key={item}>
            {item}
          </div>
        ))}
      </div>

      {run ? (
        <div className="current-plan">
          <div className="current-plan-heading">
            <div>
              <span>Current plan</span>
              <strong>{run.plan.id}</strong>
            </div>
            <code>{run.graph_snapshot ?? "unverified"}</code>
          </div>
          <ul className="action-list">
            {run.plan.actions.map((action) => <ActionRow action={action} key={action.id} />)}
          </ul>
        </div>
      ) : (
        <div className="empty-state">No active run. Restore the baseline, then start the proof.</div>
      )}

      {run?.history.length ? (
        <div className="history-wrap">
          <h3>Transition history</h3>
          <ol className="history">
            {run.history.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
