import type { ScenarioRunState } from "../model";
import { formatCategory } from "../utils";

export function FailureSummary({ run }: { run: ScenarioRunState }) {
  const lastEvent = run.events[run.events.length - 1];
  const failedChecks =
    run.evaluation?.checks.filter((check) => !check.passed) ?? [];

  return (
    <section className="sl-failure-summary" aria-labelledby="failure-summary-title">
      <div>
        <h2 id="failure-summary-title">
          Scenario stopped at {formatCategory(run.activeStage)}.
        </h2>
        <p>
          Dragback keeps the last confirmed state visible and does not claim that
          later authority or executor steps completed.
        </p>
      </div>
      <dl>
        <div>
          <dt>Last confirmed event</dt>
          <dd>{lastEvent?.label ?? "No committed event was returned"}</dd>
        </div>
        <div>
          <dt>Graph snapshot</dt>
          <dd>{run.graphSnapshot}</dd>
        </div>
        <div>
          <dt>Agent loop</dt>
          <dd>{run.agentLoopState ?? "Unavailable"}</dd>
        </div>
      </dl>
      {failedChecks.length > 0 ? (
        <div className="sl-failure-summary__checks">
          <h3>Failed checks</h3>
          <ul>
            {failedChecks.map((check) => (
              <li key={check.id}>
                <strong>{check.label}</strong>
                <span>
                  Expected {check.expected}; received {check.actual}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
