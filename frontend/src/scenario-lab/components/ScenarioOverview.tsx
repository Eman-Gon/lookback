import type {
  PlanView,
  ScenarioArtifactSummary,
  ScenarioDefinition,
  ScenarioRunState,
} from "../model";
import { DecisionChange } from "./DecisionChange";
import { GrantTransition } from "./GrantTransition";
import { ResultRows } from "./ResultRows";

function ArtifactSummary({
  artifact,
  label,
}: {
  artifact: ScenarioArtifactSummary;
  label: string;
}) {
  return (
    <article className="sl-overview-artifact">
      <span>{label}</span>
      <div>
        <strong>{artifact.id}</strong>
        <small>{artifact.scopes.join(", ")}</small>
      </div>
      <h3>{artifact.title}</h3>
      <p>{artifact.description}</p>
    </article>
  );
}

function OriginalPlan({ plan }: { plan: PlanView }) {
  return (
    <section className="sl-overview-plan" aria-labelledby="original-plan-title">
      <div className="sl-section-heading">
        <div>
          <h2 id="original-plan-title">Original agent plan.</h2>
          <p>
            These are the exact pre-change steps that receive the initial
            snapshot-bound authorization.
          </p>
        </div>
        <code>{plan.id}</code>
      </div>
      <p>{plan.objective}</p>
      <ol>
        {plan.steps.map((step, index) => (
          <li key={`${plan.id}-${index}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ScenarioOverview({
  scenario,
  run,
}: {
  scenario: ScenarioDefinition;
  run: ScenarioRunState | null;
}) {
  const plan = run?.originalPlan ?? scenario.initialPlan;
  const outcomes =
    run?.outcomes.length ? run.outcomes : scenario.expectedOutcomes;

  return (
    <div className="sl-authorized-stage">
      <DecisionChange scenario={scenario} mode="preview" />

      <section aria-labelledby="work-context-title">
        <div className="sl-section-heading">
          <div>
            <h2 id="work-context-title">Work context before the change.</h2>
            <p>
              The specification creates one ticket, which decomposes into
              sibling tasks with different expected impact.
            </p>
          </div>
        </div>
        <div className="sl-overview-context">
          <ArtifactSummary
            artifact={scenario.specification}
            label="Specification"
          />
          <ArtifactSummary artifact={scenario.ticket} label="Ticket" />
        </div>
        <div className="sl-overview-tasks">
          <div className="sl-overview-tasks__heading">
            <h3>Tasks</h3>
            <span>{scenario.tasks.length} sibling branches</span>
          </div>
          <ul>
            {scenario.tasks.map((task) => (
              <li key={task.id}>
                <div>
                  <code>{task.id}</code>
                  <span
                    className={`sl-task-expectation sl-task-expectation--${task.expectedStatus}`}
                  >
                    Expected {task.expectedStatus}
                  </span>
                </div>
                <strong>{task.title}</strong>
                <p>{task.description}</p>
                <small>{task.scopes.join(", ")}</small>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <OriginalPlan plan={plan} />

      <section aria-labelledby="expected-impact-title">
        <div className="sl-section-heading">
          <div>
            <h2 id="expected-impact-title">Expected selective impact.</h2>
            <p>
              These fixture expectations are assertions only. The authority
              must independently produce the actual result.
            </p>
          </div>
        </div>
        <ResultRows outcomes={outcomes} />
      </section>

      <GrantTransition originalGrant={run?.originalGrant} />
      <aside className="sl-risk-statement">
        <strong>Risk if this authorization continues after the change</strong>
        <p>{scenario.riskIfContinued}</p>
      </aside>
    </div>
  );
}
