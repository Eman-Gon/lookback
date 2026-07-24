import type { ScenarioResultStatus, ScenarioStageId } from "../model";
import { SCENARIO_STAGES, stageProgress } from "../utils";

export function FourStageRail({
  activeStage,
  runStatus = "not-run",
}: {
  activeStage: ScenarioStageId;
  runStatus?: ScenarioResultStatus;
}) {
  return (
    <nav className="sl-stage-rail" aria-label="Scenario progress">
      <ol>
        {SCENARIO_STAGES.map((stage, index) => {
          const progress = stageProgress(stage.id, activeStage, runStatus);
          return (
            <li
              className={`sl-stage sl-stage--${progress}`}
              key={stage.id}
              aria-current={
                progress === "current" || progress === "failed"
                  ? "step"
                  : undefined
              }
              aria-label={
                progress === "failed" ? `${stage.label}: failed` : undefined
              }
            >
              <div className="sl-stage__number" aria-hidden="true">
                {progress === "complete" ? (
                  <svg viewBox="0 0 18 18">
                    <path d="m4.2 9.4 3 3 6.6-6.4" />
                  </svg>
                ) : progress === "failed" ? (
                  <svg viewBox="0 0 18 18">
                    <path d="m5 5 8 8m0-8-8 8" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <div className="sl-stage__copy">
                <strong>{stage.label}</strong>
                <span>{stage.description}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
