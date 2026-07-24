import type { ScenarioDefinition } from "../model";

export function DecisionChange({
  scenario,
  mode = "changed",
}: {
  scenario: ScenarioDefinition;
  mode?: "preview" | "changed";
}) {
  const preview = mode === "preview";
  return (
    <section
      className="sl-decision-change"
      aria-labelledby="decision-change-title"
    >
      <div className="sl-section-heading">
        <div>
          <h2 id="decision-change-title">
            {preview
              ? "Approved baseline and incoming decision."
              : "The approved intent changed upstream."}
          </h2>
          <p>
            {preview
              ? "The incoming decision is shown for context; it has not changed the active graph yet."
              : scenario.newDecision.reason}
          </p>
        </div>
      </div>
      <div className="sl-decision-change__comparison">
        <article className="sl-decision sl-decision--original">
          <span>
            {preview ? "Active decision" : "Prior decision"} ·{" "}
            {scenario.originalDecision.graphSnapshot}
          </span>
          <strong>{scenario.originalDecision.id}</strong>
          <p>{scenario.originalDecision.text}</p>
        </article>
        <div className="sl-decision-change__arrow" aria-hidden="true">
          <svg viewBox="0 0 34 20">
            <path d="M1 10h30m-6-6 6 6-6 6" />
          </svg>
        </div>
        <article className="sl-decision sl-decision--new">
          <span>
            {preview ? "Incoming decision · applied in step 2" : "New approved decision"}{" "}
            · {scenario.newDecision.graphSnapshot}
          </span>
          <strong>{scenario.newDecision.id}</strong>
          <p>{scenario.newDecision.text}</p>
          {preview ? (
            <small className="sl-decision__reason">
              Why it is incoming: {scenario.newDecision.reason}
            </small>
          ) : null}
        </article>
      </div>
    </section>
  );
}
