import type { ScenarioRunState } from "../model";

export function ShortestProvenancePath({
  run,
}: {
  run: ScenarioRunState | null;
}) {
  const pathIds = run?.outcomeSummary?.primaryProvenancePath ?? [];
  if (pathIds.length === 0) return null;

  const nodeById = new Map(
    run?.provenancePath.nodes.map((node) => [node.id, node]) ?? [],
  );

  return (
    <section
      className="sl-shortest-path"
      aria-labelledby="shortest-provenance-title"
    >
      <h2 id="shortest-provenance-title">Shortest graph-derived path</h2>
      <ol>
        {pathIds.map((nodeId, index) => {
          const node = nodeById.get(nodeId);
          return (
            <li key={`${nodeId}-${index}`}>
              <div title={node?.title ?? nodeId}>
                <span>{node?.kind ?? "Artifact"}</span>
                <strong>{nodeId}</strong>
              </div>
              {index < pathIds.length - 1 ? (
                <svg viewBox="0 0 32 18" aria-hidden="true">
                  <path d="M1 9h28m-6-6 6 6-6 6" />
                </svg>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
