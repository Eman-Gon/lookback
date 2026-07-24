import type {
  ScenarioDefinition,
  ScenarioRunState,
  ScenarioStageId,
} from "../model";
import { formatCategory, SCENARIO_STAGES } from "../utils";
import { DecisionChange } from "./DecisionChange";
import {
  EVIDENCE_DISCLOSURE_IDS,
  EvidenceWorkspace,
  type EvidenceSection,
} from "./EvidenceWorkspace";
import { FailureSummary } from "./FailureSummary";
import { FourStageRail } from "./FourStageRail";
import { GrantRejectionStrip } from "./GrantRejectionStrip";
import { OutcomeLedger } from "./OutcomeLedger";
import { ResultRows } from "./ResultRows";
import {
  SCENARIO_LAYER_CONTROL_IDS,
  SCENARIO_LAYER_PANEL_IDS,
  ScenarioLayerNav,
  type ScenarioDetailLayer,
} from "./ScenarioLayerNav";
import { ScenarioOverview } from "./ScenarioOverview";
import { ShortestProvenancePath } from "./ShortestProvenancePath";

function StoryStageContent({
  activeStage,
  scenario,
  run,
}: {
  activeStage: ScenarioStageId;
  scenario: ScenarioDefinition;
  run: ScenarioRunState | null;
}) {
  const summary = run?.outcomeSummary;

  if (activeStage === "authorized") {
    return <ScenarioOverview scenario={scenario} run={run} />;
  }

  if (activeStage === "decision-changed") {
    return (
      <>
        <DecisionChange scenario={scenario} />
        <ShortestProvenancePath run={run} />
      </>
    );
  }

  if (activeStage === "work-stopped") {
    return (
      <>
        <ResultRows
          outcomes={run?.outcomes ?? []}
          planReviewArtifactIds={summary?.needsReviewArtifactIds}
          originalPlanId={summary?.originalPlanId}
          planStatus={summary?.originalPlanStatus}
        />
        {run?.grantRejection ? (
          <GrantRejectionStrip rejection={run.grantRejection} />
        ) : null}
        <ShortestProvenancePath run={run} />
      </>
    );
  }

  return (
    <>
      <ResultRows outcomes={run?.outcomes ?? []} />
      <ShortestProvenancePath run={run} />
      {run?.correctedPlan ? (
        <section
          className="sl-corrective-plan-note"
          aria-labelledby="corrective-plan-note-title"
        >
          <div>
            <h2 id="corrective-plan-note-title">
              Fixture-generated corrective plan
            </h2>
            <p>
              Its wording is seeded for this scenario. Deterministic authority
              still decides whether it receives a valid grant.
            </p>
          </div>
          <div>
            <code>{run.correctedPlan.id}</code>
            <strong>{run.correctedPlan.objective}</strong>
          </div>
        </section>
      ) : null}
    </>
  );
}

function EvidenceActions({
  eventCount,
  onShowEvidence,
  onOpenDrawer,
}: {
  eventCount: number;
  onShowEvidence: (section: Exclude<EvidenceSection, null>) => void;
  onOpenDrawer: () => void;
}) {
  return (
    <div className="sl-story-evidence-actions" aria-label="Evidence shortcuts">
      <button
        type="button"
        aria-controls={EVIDENCE_DISCLOSURE_IDS.graph}
        onClick={() => onShowEvidence("graph")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="4" r="2.25" />
          <circle cx="5" cy="19" r="2.25" />
          <circle cx="19" cy="19" r="2.25" />
          <path d="m11 6-5 10m7-10 5 10M7.5 19h9" />
        </svg>
        View complete graph
      </button>
      <button
        type="button"
        aria-controls={EVIDENCE_DISCLOSURE_IDS.timeline}
        onClick={() => onShowEvidence("timeline")}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6l4 2" />
        </svg>
        Show {eventCount}-event timeline
      </button>
      <button type="button" onClick={onOpenDrawer}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14" />
        </svg>
        View technical evidence
      </button>
    </div>
  );
}

export interface ScenarioRunViewProps {
  scenario: ScenarioDefinition;
  run: ScenarioRunState | null;
  busy?: boolean;
  onBack: () => void;
  backLabel?: string;
  onReset: () => void;
  onOpenEvidence: () => void;
  detailLayer?: ScenarioDetailLayer;
  evidenceSection?: EvidenceSection;
  onDetailLayerChange?: (layer: ScenarioDetailLayer) => void;
  onShowEvidence?: (section: Exclude<EvidenceSection, null>) => void;
  autoRun?: boolean;
  onToggleAutoRun?: () => void;
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    busy?: boolean;
  };
}

export function ScenarioRunView({
  scenario,
  run,
  busy = false,
  onBack,
  backLabel = "All scenarios",
  onReset,
  onOpenEvidence,
  detailLayer = "story",
  evidenceSection = null,
  onDetailLayerChange,
  onShowEvidence,
  autoRun = false,
  onToggleAutoRun,
  primaryAction,
}: ScenarioRunViewProps) {
  const activeStage = run?.activeStage ?? "authorized";
  const runDisplayStatus = !run
    ? "Not started"
    : run.status === "passed"
      ? "Complete"
      : formatCategory(run.status);
  const activeStageIndex = SCENARIO_STAGES.findIndex(
    (stage) => stage.id === activeStage,
  );
  const activeStageLabel =
    SCENARIO_STAGES[activeStageIndex]?.label ?? "Scenario";
  const liveStageStatus = !run
    ? "Scenario not started. All four stages are pending."
    : run.status === "failed"
      ? `Stage ${activeStageIndex + 1} of ${SCENARIO_STAGES.length}: ${activeStageLabel}. Scenario failed.`
      : run.status === "passed"
        ? `Stage ${SCENARIO_STAGES.length} of ${SCENARIO_STAGES.length}: ${activeStageLabel}. Scenario complete.`
        : `Stage ${activeStageIndex + 1} of ${SCENARIO_STAGES.length}: ${activeStageLabel}.`;
  const showEvidence = (section: Exclude<EvidenceSection, null>) => {
    if (onShowEvidence) onShowEvidence(section);
    else onDetailLayerChange?.("evidence");
  };

  return (
    <article className="sl-page sl-run-view" aria-labelledby="scenario-run-title">
      <header className="sl-run-heading">
        <div>
          <button
            className="sl-back-link"
            type="button"
            onClick={onBack}
            disabled={busy}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m12.5 4.5-5.5 5.5 5.5 5.5" />
            </svg>
            {backLabel}
          </button>
          <h1 id="scenario-run-title" tabIndex={-1}>
            {scenario.name}
          </h1>
          <p>{scenario.description}</p>
        </div>
        <dl className="sl-run-metadata">
          <div>
            <dt>Domain</dt>
            <dd>{formatCategory(scenario.category)}</dd>
          </div>
          <div>
            <dt>Severity</dt>
            <dd className={`sl-run-metadata__risk sl-run-metadata__risk--${scenario.riskLevel}`}>
              {formatCategory(scenario.riskLevel)}
            </dd>
          </div>
          <div>
            <dt>Run ID</dt>
            <dd>{run?.runId ?? "Not started"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd
              className={`sl-run-metadata__status sl-run-metadata__status--${run?.status ?? "not-run"}`}
            >
              {runDisplayStatus}
            </dd>
          </div>
        </dl>
      </header>

      <FourStageRail
        activeStage={activeStage}
        runStatus={run?.status ?? "not-run"}
      />

      <p
        className="sl-visually-hidden"
        role={detailLayer === "evidence" ? "status" : undefined}
        aria-live={detailLayer === "evidence" ? "polite" : "off"}
        aria-atomic="true"
      >
        {liveStageStatus}
      </p>

      <ScenarioLayerNav
        activeLayer={detailLayer}
        onChange={(layer) => onDetailLayerChange?.(layer)}
        disabled={busy}
      />

      {detailLayer === "story" ? (
        <div
          id={SCENARIO_LAYER_PANEL_IDS.story}
          className="sl-story-layer"
          role="region"
          aria-labelledby={SCENARIO_LAYER_CONTROL_IDS.story}
          aria-busy={busy}
        >
          <OutcomeLedger scenario={scenario} run={run} />
          {run?.status === "failed" ? (
            <FailureSummary run={run} />
          ) : (
            <section
              className="sl-story-canvas"
              aria-label={`${
                SCENARIO_STAGES.find((stage) => stage.id === activeStage)?.label ??
                "Scenario"
              } story`}
            >
              <StoryStageContent
                activeStage={activeStage}
                scenario={scenario}
                run={run}
              />
            </section>
          )}
          {run ? (
            <EvidenceActions
              eventCount={run.events.length}
              onShowEvidence={showEvidence}
              onOpenDrawer={onOpenEvidence}
            />
          ) : null}
        </div>
      ) : (
        <div
          id={SCENARIO_LAYER_PANEL_IDS.evidence}
          role="region"
          aria-labelledby={SCENARIO_LAYER_CONTROL_IDS.evidence}
        >
          <EvidenceWorkspace
            scenario={scenario}
            run={run}
            openSection={evidenceSection}
            onOpenDrawer={onOpenEvidence}
          />
        </div>
      )}

      <footer className="sl-run-footer">
        <div className="sl-run-footer__secondary">
          <button
            className="sl-button sl-button--quiet"
            type="button"
            onClick={onReset}
            disabled={busy}
          >
            Reset scenario
          </button>
          {run?.status === "running" && onToggleAutoRun ? (
            <button
              className="sl-button sl-button--secondary sl-auto-run-button"
              type="button"
              onClick={onToggleAutoRun}
              disabled={busy && !autoRun}
              aria-pressed={autoRun}
            >
              {autoRun ? "Pause automatic run" : "Run remaining steps"}
            </button>
          ) : null}
        </div>
        <button
          className="sl-evidence-button"
          type="button"
          onClick={() =>
            onDetailLayerChange?.(
              detailLayer === "story" ? "evidence" : "story",
            )
          }
          disabled={busy}
        >
          {detailLayer === "story" ? "View Evidence" : "Back to Story"}
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d={
                detailLayer === "story"
                  ? "m5 7.5 5 5 5-5"
                  : "m12.5 4.5-5.5 5.5 5.5 5.5"
              }
            />
          </svg>
        </button>
        {primaryAction ? (
          <button
            className="sl-button sl-button--primary sl-run-footer__primary"
            type="button"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
          >
            {primaryAction.busy ? "Working…" : primaryAction.label}
          </button>
        ) : null}
      </footer>
    </article>
  );
}
