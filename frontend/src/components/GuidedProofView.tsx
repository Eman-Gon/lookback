import type { DemoPhaseId } from "../demo-control";
import type {
  AgentState,
  Artifact,
  AuthorityState,
  ExecutionAttempt,
} from "../types";

export interface GuidedProofPhase {
  id: DemoPhaseId;
  label: string;
  shortLabel: string;
  description: string;
  holdMs: number;
}

interface GuidedProofViewProps {
  authority: AuthorityState | null;
  agent: AgentState | null;
  executorAttempts: readonly ExecutionAttempt[];
  phases: readonly GuidedProofPhase[];
  activeIndex: number | null;
  completedIds: ReadonlySet<DemoPhaseId>;
  isRunning: boolean;
  isComplete: boolean;
  error: string;
  onRun: () => void;
  onStop: () => void;
}

type StoryAct = {
  id: "authorized" | "changed" | "stopped" | "reauthorized";
  label: string;
  description: string;
  tone: "positive" | "change" | "negative";
  phaseIds: readonly DemoPhaseId[];
  completionPhase: DemoPhaseId;
};

const STORY_ACTS: readonly StoryAct[] = [
  {
    id: "authorized",
    label: "Work authorized",
    description: "The original plan is valid.",
    tone: "positive",
    phaseIds: ["reset", "start", "tests"],
    completionPhase: "tests",
  },
  {
    id: "changed",
    label: "Decision changed",
    description: "Compliance narrows the rule.",
    tone: "change",
    phaseIds: ["decision"],
    completionPhase: "decision",
  },
  {
    id: "stopped",
    label: "Unsafe work stopped",
    description: "The stale grant is rejected.",
    tone: "negative",
    phaseIds: ["old-grant", "recheck"],
    completionPhase: "recheck",
  },
  {
    id: "reauthorized",
    label: "Work re-authorized",
    description: "The corrected plan continues.",
    tone: "positive",
    phaseIds: ["replan", "new-grant"],
    completionPhase: "new-grant",
  },
];

const PHASE_STATUS: Record<DemoPhaseId, string> = {
  reset: "Preparing the original approved state…",
  start: "Authorizing the original coding plan…",
  tests: "Confirming the implementation passes its checks…",
  decision: "Applying the new approved compliance decision…",
  "old-grant": "Asking the executor to verify the old authorization…",
  recheck: "Tracing the change and stopping conflicting work…",
  replan: "Correcting the plan to match the new decision…",
  "new-grant": "Verifying the replacement authorization…",
};

const ORIGINAL_DECISION_FALLBACK = "All users may export account data.";
const NEW_DECISION_FALLBACK =
  "For compliance, CSV exports are restricted to administrators.";
const PRESERVED_TASK_FALLBACK = "Generate valid CSV files";
const STOPPED_TASK_FALLBACK = "Expose export to all users";

function ArrowIcon({ vertical = false }: { vertical?: boolean }) {
  return (
    <svg
      className={vertical ? "is-vertical" : undefined}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M5 12h13m-5-5 5 5-5 5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4.5 10.2 3.4 3.4 7.6-7.3" />
    </svg>
  );
}

function ChangeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 7h10m-3-3 3 3-3 3M16 13H6m3 3-3-3 3-3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m6 6 8 8m0-8-8 8" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 5.2v9.6l7.6-4.8L7 5.2Z" />
    </svg>
  );
}

function artifactById(
  authority: AuthorityState | null,
  id: string,
): Artifact | undefined {
  return authority?.artifacts.find((artifact) => artifact.id === id);
}

function StoryMark({
  index,
  act,
  state,
}: {
  index: number;
  act: StoryAct;
  state: "complete" | "current" | "upcoming";
}) {
  if (state !== "complete") {
    return <span>{index + 1}</span>;
  }
  if (act.tone === "change") return <ChangeIcon />;
  if (act.tone === "negative") return <StopIcon />;
  return <CheckIcon />;
}

function storyActState(
  act: StoryAct,
  activePhaseId: DemoPhaseId | null,
  completedIds: ReadonlySet<DemoPhaseId>,
): "complete" | "current" | "upcoming" {
  if (completedIds.has(act.completionPhase)) return "complete";
  if (activePhaseId && act.phaseIds.includes(activePhaseId)) return "current";
  return "upcoming";
}

function FourActStory({
  activePhaseId,
  completedIds,
}: {
  activePhaseId: DemoPhaseId | null;
  completedIds: ReadonlySet<DemoPhaseId>;
}) {
  return (
    <ol className="gp-story-steps" aria-label="Guided proof progress">
      {STORY_ACTS.map((act, index) => {
        const state = storyActState(act, activePhaseId, completedIds);
        return (
          <li
            className={`gp-story-step gp-story-step--${act.tone} gp-story-step--${state}`}
            key={act.id}
            aria-current={state === "current" ? "step" : undefined}
          >
            <div className="gp-story-step__mark" aria-hidden="true">
              <StoryMark index={index} act={act} state={state} />
            </div>
            <div>
              <strong>{act.label}</strong>
              <span>{act.description}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DecisionChange({
  originalDecision,
  newDecision,
}: {
  originalDecision: string;
  newDecision: string;
}) {
  return (
    <section className="gp-decision" aria-labelledby="decision-change-title">
      <h2 id="decision-change-title" className="sl-visually-hidden">
        Approved decision change
      </h2>
      <div className="gp-decision__rule">
        <span>Originally approved</span>
        <p>{originalDecision}</p>
      </div>
      <div className="gp-decision__arrow">
        <ArrowIcon />
      </div>
      <div className="gp-decision__rule gp-decision__rule--new">
        <span>New approved decision</span>
        <p>{newDecision}</p>
      </div>
      <p className="gp-ticket-note">
        <CheckIcon />
        <span>
          <strong>The ticket never changed.</strong> Dragback found the impact
          through decision lineage.
        </span>
      </p>
    </section>
  );
}

function TaskOutcome({
  title,
  result,
  tone,
  resolved,
}: {
  title: string;
  result: string;
  tone: "positive" | "negative";
  resolved: boolean;
}) {
  return (
    <li
      className={`gp-task gp-task--${resolved ? tone : "pending"}`}
    >
      <div className="gp-task__mark" aria-hidden="true">
        {resolved ? tone === "positive" ? <CheckIcon /> : <StopIcon /> : null}
      </div>
      <div>
        <strong>{title}</strong>
        <span>{resolved ? result : "Active before the decision change"}</span>
      </div>
      <b>{resolved ? result : "Active"}</b>
    </li>
  );
}

function AuthorizationTransition({
  originalStatus,
  replacementStatus,
}: {
  originalStatus: "Active" | "Stale" | "Rejected" | "Pending";
  replacementStatus: "Accepted" | "Issued" | "Waiting";
}) {
  const originalTone =
    originalStatus === "Rejected"
      ? "negative"
      : originalStatus === "Stale"
        ? "change"
        : "neutral";
  const replacementTone =
    replacementStatus === "Accepted" || replacementStatus === "Issued"
      ? "positive"
      : "neutral";

  return (
    <div className="gp-authorization" aria-label="Authorization transition">
      <div className={`gp-grant gp-grant--${originalTone}`}>
        <span>Original authorization</span>
        <code>graph-v17</code>
        <strong>{originalStatus}</strong>
      </div>
      <div className="gp-authorization__arrow">
        <ArrowIcon />
      </div>
      <div className={`gp-grant gp-grant--${replacementTone}`}>
        <span>Corrected authorization</span>
        <code>graph-v18</code>
        <strong>{replacementStatus}</strong>
      </div>
    </div>
  );
}

function EvidencePath({ nodeIds }: { nodeIds: readonly string[] }) {
  return (
    <ol className="gp-path" aria-label={`Provenance path: ${nodeIds.join(" to ")}`}>
      {nodeIds.map((nodeId, index) => (
        <li key={nodeId}>
          <code>{nodeId}</code>
          {index < nodeIds.length - 1 ? <ArrowIcon /> : null}
        </li>
      ))}
    </ol>
  );
}

function TechnicalEvidence({
  authority,
  agent,
  executorAttempts,
}: {
  authority: AuthorityState | null;
  agent: AgentState | null;
  executorAttempts: readonly ExecutionAttempt[];
}) {
  const report = authority?.last_report;
  const activePath =
    report?.paths.find((path) => path.artifact_id === "PLAN-027")?.node_ids ??
    report?.paths.find((path) => path.artifact_id === "TASK-102")?.node_ids ??
    [];
  const originalAttempt = executorAttempts.find(
    (attempt) => attempt.grant === "graph-v17",
  );
  const replacementAttempt = executorAttempts.find(
    (attempt) => attempt.grant === "graph-v18",
  );
  const grant = agent?.last_authorization?.grant?.payload;

  return (
    <details className="gp-evidence">
      <summary>
        <span>
          <strong>View technical evidence</strong>
          <small>Provenance path, grant checks, and simulation boundaries</small>
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </summary>
      <div className="gp-evidence__body">
        <section>
          <h3>Why untouched work was affected</h3>
          {activePath.length > 0 ? (
            <>
              <EvidencePath nodeIds={activePath} />
              <p>
                The approved decision never names TICKET-100. Deterministic graph
                traversal reaches it through the provenance chain.
              </p>
            </>
          ) : (
            <p>Run the proof to populate the exact provenance path.</p>
          )}
        </section>

        <section>
          <h3>Executor verification</h3>
          <dl className="gp-evidence__grants">
            <div>
              <dt>Original graph-v17 grant</dt>
              <dd>
                {originalAttempt
                  ? originalAttempt.applied
                    ? "Accepted"
                    : `Rejected — ${originalAttempt.reason}`
                  : "Not checked yet"}
              </dd>
            </div>
            <div>
              <dt>Replacement graph-v18 grant</dt>
              <dd>
                {replacementAttempt
                  ? replacementAttempt.applied
                    ? `Accepted — ${replacementAttempt.reason}`
                    : `Rejected — ${replacementAttempt.reason}`
                  : "Not issued yet"}
              </dd>
            </div>
            {grant ? (
              <>
                <div>
                  <dt>Authorization ID</dt>
                  <dd>
                    <code>{grant.authorization_id}</code>
                  </dd>
                </div>
                <div>
                  <dt>Plan hash</dt>
                  <dd>
                    <code>{grant.plan_hash}</code>
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </section>

        <section>
          <h3>What is real in this prototype</h3>
          <div className="gp-evidence__boundaries">
            <p>
              <strong>Real:</strong> graph mutation, authority rules, multi-hop
              traversal, selective invalidation, plan hashing, grant rejection,
              loop transition, and corrected reauthorization.
            </p>
            <p>
              <strong>Fixture-driven:</strong> Slack, Linear, and GitHub intake;
              the corrective plan template; repository edits; and pull-request
              creation.
            </p>
          </div>
        </section>

        {report && report.evidence_refs.length > 0 ? (
          <section>
            <h3>Evidence references</h3>
            <div className="gp-evidence__references">
              {report.evidence_refs.map((reference) => (
                <code key={reference}>{reference}</code>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </details>
  );
}

export function GuidedProofView({
  authority,
  agent,
  executorAttempts,
  phases,
  activeIndex,
  completedIds,
  isRunning,
  isComplete,
  error,
  onRun,
  onStop,
}: GuidedProofViewProps) {
  const activePhase = activeIndex === null ? null : phases[activeIndex];
  const report = authority?.last_report;
  const originalDecision =
    artifactById(authority, "DEC-004")?.text || ORIGINAL_DECISION_FALLBACK;
  const newDecision =
    artifactById(authority, "DEC-018")?.text || NEW_DECISION_FALLBACK;
  const preservedTask =
    artifactById(authority, "TASK-101")?.title || PRESERVED_TASK_FALLBACK;
  const stoppedTask =
    artifactById(authority, "TASK-102")?.title || STOPPED_TASK_FALLBACK;
  const originalAttempt = executorAttempts.find(
    (attempt) => attempt.grant === "graph-v17",
  );
  const replacementAttempt = executorAttempts.find(
    (attempt) => attempt.grant === "graph-v18",
  );
  const reportReady = report !== null && report !== undefined;
  const originalStatus: "Active" | "Stale" | "Rejected" | "Pending" =
    originalAttempt && !originalAttempt.applied
      ? "Rejected"
      : reportReady
        ? "Stale"
        : agent?.initial_grant_token
          ? "Active"
          : "Pending";
  const replacementStatus: "Accepted" | "Issued" | "Waiting" =
    replacementAttempt?.applied
      ? "Accepted"
      : agent?.last_authorization?.grant?.payload.decision_snapshot ===
          "graph-v18"
        ? "Issued"
        : "Waiting";
  const visualCompletedIds = new Set(completedIds);
  if (agent?.initial_grant_token) {
    visualCompletedIds.add("reset");
    visualCompletedIds.add("start");
  }
  if (agent?.run?.tests_passed) visualCompletedIds.add("tests");
  if (reportReady) visualCompletedIds.add("decision");
  if (
    agent?.last_authorization?.verdict === "REPLAN" ||
    agent?.run?.plan.id === "PLAN-028"
  ) {
    visualCompletedIds.add("old-grant");
    visualCompletedIds.add("recheck");
  }
  if (agent?.run?.plan.id === "PLAN-028") visualCompletedIds.add("replan");
  if (replacementAttempt?.applied) visualCompletedIds.add("new-grant");
  const visualActivePhaseId =
    activePhase?.id ??
    (visualCompletedIds.has("replan") &&
    !visualCompletedIds.has("new-grant")
      ? "new-grant"
      : null);
  const outcomeTitle =
    originalStatus === "Rejected" || replacementStatus !== "Waiting"
      ? "Unsafe work stopped. Valid work preserved."
      : reportReady
        ? "The decision changed. Dragback found the exact work affected."
        : "Two tasks share one ticket. Only one should stop.";
  const outcomeDetail =
    originalStatus === "Rejected" || replacementStatus !== "Waiting"
      ? "No ticket update required."
      : reportReady
        ? "The generation task remains valid while all-user exposure loses authorization."
        : "Run the proof to see Dragback trace the change, reject stale authority, and keep valid work moving.";

  return (
    <article className="gp-page" aria-labelledby="guided-proof-title">
      <header className="gp-hero">
        <div>
          <h1 id="guided-proof-title">
            <span>The ticket didn’t change.</span>
            <span>The decision did.</span>
          </h1>
          <p>
            Dragback checks whether coding-agent work is still authorized by the
            company’s latest approved intent—not merely whether the code passes.
          </p>
        </div>
        <div className="gp-hero__action">
          <button
            className={`sl-button ${
              isRunning ? "sl-button--secondary" : "sl-button--primary"
            }`}
            type="button"
            onClick={isRunning ? onStop : onRun}
          >
            {isRunning ? <StopIcon /> : <PlayIcon />}
            {isRunning
              ? "Stop proof"
              : isComplete
                ? "Run proof again"
                : "Run guided proof"}
          </button>
          <p aria-live="polite">
            {isRunning && activePhase
              ? PHASE_STATUS[activePhase.id]
              : isComplete
                ? "Proof complete. The corrected work is authorized."
                : "One click runs the complete authorization proof."}
          </p>
        </div>
      </header>

      {error ? (
        <div className="gp-error" role="alert">
          <strong>The proof stopped.</strong>
          <span>{error.replace(/^Demo stopped\.\s*/, "")}</span>
        </div>
      ) : null}

      <DecisionChange
        originalDecision={originalDecision}
        newDecision={newDecision}
      />

      <FourActStory
        activePhaseId={visualActivePhaseId}
        completedIds={visualCompletedIds}
      />

      <section className="gp-outcome" aria-labelledby="proof-outcome-title">
        <div className="gp-outcome__heading">
          <div>
            <h2 id="proof-outcome-title">{outcomeTitle}</h2>
            <p>{outcomeDetail}</p>
          </div>
          {isComplete ? (
            <span className="gp-outcome__complete">
              <CheckIcon />
              Proof complete
            </span>
          ) : null}
        </div>

        <div className="gp-outcome__content">
          <ul className="gp-tasks" aria-label="Selective task outcomes">
            <TaskOutcome
              title={stoppedTask}
              result="Stopped"
              tone="negative"
              resolved={reportReady}
            />
            <TaskOutcome
              title={preservedTask}
              result="Continues"
              tone="positive"
              resolved={reportReady}
            />
          </ul>
          <AuthorizationTransition
            originalStatus={originalStatus}
            replacementStatus={replacementStatus}
          />
        </div>
      </section>

      <TechnicalEvidence
        authority={authority}
        agent={agent}
        executorAttempts={executorAttempts}
      />
    </article>
  );
}
