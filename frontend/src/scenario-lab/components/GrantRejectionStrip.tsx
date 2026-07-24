import type { GrantRejection } from "../model";

export function GrantRejectionStrip({
  rejection,
}: {
  rejection: GrantRejection;
}) {
  return (
    <section
      className="sl-rejection-strip"
      aria-labelledby="grant-rejection-title"
      aria-live="polite"
    >
      <div className="sl-rejection-strip__mark" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="m6 6 8 8m0-8-8 8" />
        </svg>
      </div>
      <div className="sl-rejection-strip__copy">
        <span className="sl-rejection-strip__code">{rejection.code}</span>
        <h3 id="grant-rejection-title">Old authorization rejected</h3>
        <p>{rejection.message}</p>
        <small>{rejection.reason}</small>
      </div>
      <div className="sl-rejection-strip__snapshots">
        <span>{rejection.previousSnapshot}</span>
        <svg viewBox="0 0 24 18" aria-hidden="true">
          <path d="M1 9h20m-5-5 5 5-5 5" />
        </svg>
        <strong>{rejection.currentSnapshot}</strong>
      </div>
    </section>
  );
}
