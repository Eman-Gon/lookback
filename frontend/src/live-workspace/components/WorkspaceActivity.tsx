import type { WorkspaceEvent } from "../model";

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function eventIsNegative(event: WorkspaceEvent): boolean {
  const normalized = `${event.eventType} ${event.detail}`.toLowerCase();
  return normalized.includes("reject") || normalized.includes("stale");
}

export function WorkspaceActivity({
  events,
}: {
  events: readonly WorkspaceEvent[];
}) {
  if (events.length === 0) return null;
  return (
    <section className="lw-activity" aria-labelledby="workspace-activity-title">
      <h2 id="workspace-activity-title">Workspace activity</h2>
      <ol>
        {events.map((event) => {
          const negative = eventIsNegative(event);
          return (
            <li key={`${event.sequence}-${event.eventType}`}>
              <span
                className={
                  negative
                    ? "lw-activity__mark lw-activity__mark--negative"
                    : "lw-activity__mark"
                }
                aria-hidden="true"
              >
                {negative ? "!" : "✓"}
              </span>
              <div>
                <strong>{event.eventType.replaceAll(".", " ")}</strong>
                <time dateTime={event.createdAt}>
                  {formatEventTime(event.createdAt)}
                </time>
                <p>{event.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
