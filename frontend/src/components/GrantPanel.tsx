import type { AgentState, ExecutionAttempt } from "../types";

function formatUtc(timestamp: string) {
  return `${new Date(timestamp).toISOString().slice(11, 19)} UTC`;
}

function ExecutorIcon({ applied }: { applied: boolean }) {
  return applied ? (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="m4.5 10.3 3.4 3.4 7.6-7.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export function GrantPanel({
  state,
  executorAttempts,
}: {
  state: AgentState | null;
  executorAttempts: ExecutionAttempt[];
}) {
  const authorization = state?.last_authorization;
  const grant = authorization?.grant?.payload;

  return (
    <section className="panel grant-panel">
      <div className="panel-heading">
        <div>
          <h2>Authorization</h2>
          <p className="panel-intro">Authority issues grants; the executor verifies them independently.</p>
        </div>
        {state?.run ? <span className="plan-label">{state.run.plan.id}</span> : null}
      </div>

      <div className="authorization-summary">
        <div className={`verdict verdict-${authorization?.verdict?.toLowerCase() ?? "none"}`}>
          {authorization?.verdict ?? "NO VERDICT"}
        </div>
        <p>{authorization?.reason ?? "Start a run to request deterministic authorization."}</p>
      </div>

      {grant ? (
        <dl className="grant-grid">
          <dt>Grant</dt><dd>{grant.authorization_id}</dd>
          <dt>Bound to</dt><dd>{grant.run_id} · {grant.task_id}</dd>
          <dt>Snapshot</dt><dd><code>{grant.decision_snapshot}</code></dd>
          <dt>Plan hash</dt><dd><code>{grant.plan_hash.slice(0, 24)}…</code></dd>
          <dt>Expires</dt><dd>{formatUtc(grant.expires_at)}</dd>
        </dl>
      ) : null}

      {executorAttempts.length > 0 ? (
        <div className="executor-attempts" aria-live="polite" aria-label="Executor results">
          <h3>Independent executor</h3>
          {executorAttempts.map((attempt) => (
            <div className={`executor-result ${attempt.applied ? "accepted" : "rejected"}`} key={attempt.grant}>
              <div className="executor-icon"><ExecutorIcon applied={attempt.applied} /></div>
              <div>
                <span>{attempt.grant} grant</span>
                <strong>{attempt.applied ? "APPLIED" : "REJECTED"}</strong>
                <p>{attempt.reason}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
