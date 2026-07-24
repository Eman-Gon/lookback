import type { LiveWorkspaceStatus } from "../model";
import {
  WORKSPACE_STAGES,
  workspaceStageProgress,
} from "../state";

export function WorkspaceStageRail({
  status,
}: {
  status?: LiveWorkspaceStatus;
}) {
  return (
    <nav className="lw-stage-rail" aria-label="Live Workspace progress">
      <ol>
        {WORKSPACE_STAGES.map((stage, index) => {
          const progress = workspaceStageProgress(stage.id, status);
          return (
            <li
              key={stage.id}
              className={`lw-stage lw-stage--${progress}`}
              aria-current={
                progress === "current" || progress === "attention"
                  ? "step"
                  : undefined
              }
            >
              <span className="lw-stage__number" aria-hidden="true">
                {progress === "complete" ? (
                  <svg viewBox="0 0 18 18">
                    <path d="m4.2 9.4 3 3 6.6-6.4" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className="lw-stage__copy">
                <strong>{stage.label}</strong>
                <span>{stage.description}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
