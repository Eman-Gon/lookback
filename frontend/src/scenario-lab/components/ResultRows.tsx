import type {
  OutcomeKind,
  PlanValidity,
  ScenarioOutcome,
} from "../model";

const OUTCOME_GROUPS: readonly {
  kind: OutcomeKind;
  label: string;
  empty: string;
  symbol: string;
}[] = [
  {
    kind: "preserved",
    label: "Preserved tasks",
    empty: "No preserved work was reported.",
    symbol: "✓",
  },
  {
    kind: "stopped",
    label: "Invalidated tasks",
    empty: "No invalidated work was reported.",
    symbol: "×",
  },
  {
    kind: "newly-required",
    label: "Newly required",
    empty: "No newly required work was reported.",
    symbol: "+",
  },
];

function OutcomeGroup({
  outcomes,
  kind,
  label,
  empty,
  symbol,
}: {
  outcomes: readonly ScenarioOutcome[];
  kind: OutcomeKind;
  label: string;
  empty: string;
  symbol: string;
}) {
  const matching = outcomes.filter((outcome) => outcome.kind === kind);
  const expectedOnly =
    matching.length > 0 &&
    matching.every((outcome) => outcome.basis === "expected");
  const containsPlanActions = matching.some(
    (outcome) => outcome.representation === "plan-action",
  );
  return (
    <section
      className={`sl-result-group sl-result-group--${kind}`}
      aria-labelledby={`outcome-${kind}`}
    >
      <header>
        <span className="sl-result-row__icon" aria-hidden="true">
          {symbol}
        </span>
        <div>
          <h3 id={`outcome-${kind}`}>{label}</h3>
          {containsPlanActions ? (
            <small>
              Fixture-generated plan actions · not persisted graph Tasks
            </small>
          ) : expectedOnly ? (
            <small>Fixture expectation · assertion only</small>
          ) : null}
        </div>
        <strong>{matching.length}</strong>
      </header>
      {matching.length > 0 ? (
        <ul>
          {matching.map((outcome) => (
            <li key={outcome.id}>
              <span className="sl-result-row__icon" aria-hidden="true">
                {symbol}
              </span>
              <strong>{outcome.label}</strong>
              <span className="sl-visually-hidden">
                {outcome.basis === "expected"
                  ? "Fixture expectation."
                  : "Actual backend result."}{" "}
                Artifact {outcome.id}.
                {outcome.detail ? ` ${outcome.detail}.` : ""}
                {outcome.representation === "plan-action"
                  ? " Fixture-generated plan action; not a persisted graph Task."
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

export function ResultRows({
  outcomes,
  statement,
  planReviewArtifactIds = [],
  originalPlanId,
  planStatus,
}: {
  outcomes: readonly ScenarioOutcome[];
  statement?: string;
  planReviewArtifactIds?: readonly string[];
  originalPlanId?: string;
  planStatus?: PlanValidity | null;
}) {
  const hasActualCorrectiveActions = outcomes.some(
    (outcome) =>
      outcome.kind === "newly-required" && outcome.basis === "actual",
  );
  return (
    <div className="sl-results">
      <div className="sl-results__groups">
        {OUTCOME_GROUPS.map((group) => {
          const label =
            group.kind === "newly-required"
              ? hasActualCorrectiveActions
                ? "Proposed corrective actions"
                : "Expected corrective actions"
              : group.label;
          return (
            <OutcomeGroup
              outcomes={outcomes}
              {...group}
              label={label}
              key={group.kind}
            />
          );
        })}
      </div>
      {planReviewArtifactIds.length > 0 || planStatus === "NEEDS_REVIEW" ? (
        <section
          className="sl-plan-review"
          aria-labelledby="plan-review-title"
        >
          <div>
            <h3 id="plan-review-title">Plan needs review</h3>
            <p>
              This is separate from the invalidated-task count. The plan may be
              corrected while unaffected sibling tasks remain valid.
            </p>
          </div>
          <div>
            {(planReviewArtifactIds.length > 0
              ? planReviewArtifactIds
              : originalPlanId
                ? [originalPlanId]
                : []
            ).map((artifactId) => (
              <code key={artifactId}>{artifactId}</code>
            ))}
            <strong>{planStatus ?? "NEEDS_REVIEW"}</strong>
          </div>
        </section>
      ) : null}
      {statement ? <p className="sl-results__statement">{statement}</p> : null}
    </div>
  );
}
