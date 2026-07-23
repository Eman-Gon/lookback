export type DemoPhaseId =
  | "reset"
  | "start"
  | "tests"
  | "decision"
  | "old-grant"
  | "recheck"
  | "replan"
  | "new-grant";

export interface DemoPhase {
  id: DemoPhaseId;
  label: string;
  shortLabel: string;
  description: string;
  holdMs: number;
}

interface DemoRunnerProps {
  phases: readonly DemoPhase[];
  activeIndex: number | null;
  completedIds: ReadonlySet<DemoPhaseId>;
  enabledIds: ReadonlySet<DemoPhaseId>;
  isRunning: boolean;
  isBusy: boolean;
  isComplete: boolean;
  onRun: () => void;
  onStop: () => void;
  onPhase: (index: number) => void;
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
      <path d="M6.5 4.6v10.8L15 10 6.5 4.6Z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="17" height="17">
      <rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14">
      <path d="m4.5 10.4 3.4 3.3 7.6-7.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function DemoRunner({
  phases,
  activeIndex,
  completedIds,
  enabledIds,
  isRunning,
  isBusy,
  isComplete,
  onRun,
  onStop,
  onPhase,
}: DemoRunnerProps) {
  const completedCount = completedIds.size;
  const activePhase = activeIndex === null ? null : phases[activeIndex];
  const progress = (completedCount / phases.length) * 100;

  return (
    <section className="demo-runner" aria-labelledby="demo-runner-title">
      <div className="runner-heading">
        <div>
          <h2 id="demo-runner-title">Run the full authorization proof</h2>
          <p>One click advances through eight deterministic API phases, pausing on every proof point.</p>
        </div>
        <div className="runner-actions">
          {isRunning ? (
            <button className="stop-button" type="button" onClick={onStop}>
              <StopIcon />
              Stop demo
            </button>
          ) : (
            <button className="run-button" type="button" onClick={onRun} disabled={isBusy}>
              <PlayIcon />
              {isComplete ? "Run again" : "Run full demo"}
            </button>
          )}
        </div>
      </div>

      <div
        className="runner-progress"
        role="progressbar"
        aria-label="Demo progress"
        aria-valuemin={0}
        aria-valuemax={phases.length}
        aria-valuenow={completedCount}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <ol className="phase-list" aria-label="Demo phases">
        {phases.map((phase, index) => {
          const isActive = activeIndex === index;
          const isDone = completedIds.has(phase.id);
          const isEnabled = enabledIds.has(phase.id);
          const stateClass = isActive ? "active" : isDone ? "complete" : "pending";

          return (
            <li className={`phase-item ${stateClass}`} key={phase.id}>
              <button
                type="button"
                onClick={() => onPhase(index)}
                disabled={isBusy || !isEnabled}
                aria-current={isActive ? "step" : undefined}
                aria-label={`${index + 1}. ${phase.label}. ${phase.description}`}
              >
                <span className="phase-number">{isDone ? <CheckIcon /> : index + 1}</span>
                <span>
                  <strong>{phase.shortLabel}</strong>
                  <small>{phase.label}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="runner-status" aria-live="polite" aria-atomic="true">
        <span className={`runner-status-dot ${isRunning ? "running" : ""}`} aria-hidden="true" />
        {isRunning && activePhase ? (
          <p>
            <strong>Phase {(activeIndex ?? 0) + 1} of {phases.length}: {activePhase.label}</strong>
            <span>{activePhase.description}</span>
          </p>
        ) : isComplete ? (
          <p>
            <strong>Demo complete</strong>
            <span>The graph-v18 plan is authorized and the executor accepted its new grant.</span>
          </p>
        ) : (
          <p>
            <strong>Ready to run</strong>
            <span>The full runner restores graph-v17 before starting the proof.</span>
          </p>
        )}
      </div>
    </section>
  );
}
