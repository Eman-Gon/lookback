import type { Artifact, AuthorityState } from "../types";

const ARTIFACT_ORDER = ["DEC-018", "DEC-004", "SPEC-009", "TICKET-100", "TASK-101", "TASK-102", "PLAN-027"];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="m4.5 10.3 3.4 3.4 7.6-7.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function InvalidateIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function ArtifactCard({
  artifact,
  isOnPath,
  isPreserved,
}: {
  artifact: Artifact;
  isOnPath: boolean;
  isPreserved: boolean;
}) {
  const status = isPreserved ? "PRESERVED" : artifact.validity;

  return (
    <div
      className={`artifact ${artifact.validity.toLowerCase()} ${isOnPath ? "on-path" : ""} ${isPreserved ? "preserved" : ""}`}
      role="listitem"
    >
      <span className="artifact-id">{artifact.id}</span>
      <strong>{artifact.title}</strong>
      <span className="artifact-status">{status}</span>
      <small>{artifact.scopes.join(", ")}</small>
    </div>
  );
}

export function GraphPanel({ state }: { state: AuthorityState | null }) {
  const artifacts = ARTIFACT_ORDER
    .map((id) => state?.artifacts.find((item) => item.id === id))
    .filter((artifact): artifact is Artifact => artifact !== undefined);
  const report = state?.last_report;
  const activePath = report?.paths.find((item) => item.artifact_id === "PLAN-027")?.node_ids
    ?? report?.paths.find((item) => item.artifact_id === "TASK-102")?.node_ids
    ?? [];
  const pathIds = new Set(activePath);
  const preservedIds = new Set(report?.preserved_artifact_ids ?? []);
  const preservedTask = state?.artifacts.find((item) => item.id === "TASK-101");
  const invalidatedTask = state?.artifacts.find((item) => item.id === "TASK-102");
  const changedDecision = state?.artifacts.find(
    (item) => item.id === report?.changed_decision_id,
  );
  const ticketId = activePath.find((nodeId) => nodeId.startsWith("TICKET-"));
  const decisionMentionsTicket = ticketId
    ? report?.directly_mentioned_artifact_ids.includes(ticketId) ?? false
    : null;
  const ticketEvidence = ticketId === undefined
    ? "No ticket appears on the selected provenance path."
    : decisionMentionsTicket
      ? `The decision text directly names ${ticketId}.`
      : `The approved decision never names ${ticketId}; the graph finds it through lineage.`;
  const ticketBadge = ticketId === undefined
    ? "no ticket on path"
    : decisionMentionsTicket
      ? "direct reference present"
      : "ticket not directly named";

  function relationship(sourceId: string, targetId: string) {
    return state?.edges.find((edge) => edge.source_id === sourceId && edge.target_id === targetId)?.kind.replaceAll("_", " ") ?? "DRIVES";
  }

  return (
    <section className="panel graph-panel">
      <div className="panel-heading">
        <div>
          <h2>Decision provenance</h2>
          <p className="panel-intro">Deterministic graph traversal, not a UI inference.</p>
        </div>
        <span className="version">{state?.graph_version ?? "offline"}</span>
      </div>

      <div className="graph-list" role="list" aria-label="Decision provenance artifacts">
        {artifacts.map((artifact) => (
          <ArtifactCard
            artifact={artifact}
            isOnPath={pathIds.has(artifact.id)}
            isPreserved={preservedIds.has(artifact.id)}
            key={artifact.id}
          />
        ))}
      </div>

      {report && changedDecision ? (
        <div className="impact-breakdown">
          <div className="impact-heading">
            <div>
              <h3>What changed vs what stopped</h3>
              <p>The payload separates provenance context from executable work.</p>
            </div>
            <span>{ticketBadge}</span>
          </div>
          <div className="impact-grid">
            <article>
              <small>Upstream provenance chain</small>
              <strong>{report.upstream_chain_artifact_ids.join(" → ")}</strong>
              <blockquote>“{changedDecision.text}”</blockquote>
            </article>
            <article>
              <small>Downstream work stopped</small>
              <strong>{report.stopped_work_artifact_ids.join(" · ")}</strong>
              <p>{ticketEvidence}</p>
            </article>
          </div>
        </div>
      ) : null}

      {report && preservedTask && invalidatedTask ? (
        <div className="selective-result">
          <div className="result-heading">
            <div>
              <h3>Selective invalidation</h3>
              <p>Same ticket, different scopes, different outcomes.</p>
            </div>
            <span className="scope-label">{report.affected_scopes.join(", ")}</span>
          </div>
          <div className="sibling-grid">
            <article className="sibling-outcome preserved-outcome">
              <div className="outcome-icon"><CheckIcon /></div>
              <div>
                <span className="artifact-id">{preservedTask.id}</span>
                <strong>Preserved</strong>
                <p>{preservedTask.title}</p>
                <small>{preservedTask.scopes.join(", ")} stays VALID</small>
              </div>
            </article>
            <article className="sibling-outcome invalidated-outcome">
              <div className="outcome-icon"><InvalidateIcon /></div>
              <div>
                <span className="artifact-id">{invalidatedTask.id}</span>
                <strong>Invalidated</strong>
                <p>{invalidatedTask.title}</p>
                <small>{invalidatedTask.scopes.join(", ")} changed</small>
              </div>
            </article>
          </div>
        </div>
      ) : null}

      {activePath.length > 0 ? (
        <div className="path-box">
          <div className="path-heading">
            <div>
              <h3>Active invalidation path</h3>
              <p>{activePath.length - 1} graph relationships connect the upstream decision to the active plan.</p>
            </div>
            <span className="path-live"><span aria-hidden="true" /> active</span>
          </div>
          <div
            className="path-track"
            role="list"
            aria-label={`Invalidation path: ${activePath.join(" to ")}`}
          >
            {activePath.map((nodeId, index) => (
              <div className="path-segment" key={nodeId}>
                <div className="path-node" role="listitem">{nodeId}</div>
                {index < activePath.length - 1 ? (
                  <div className="path-arrow" title={relationship(nodeId, activePath[index + 1])}>
                    <span className="path-pulse" aria-hidden="true" />
                    <ArrowIcon />
                    <small>{relationship(nodeId, activePath[index + 1])}</small>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="evidence-refs">
            <span>Evidence references</span>
            <div>
              {(report?.evidence_refs ?? []).map((reference) => (
                <code key={reference}>{reference}</code>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
