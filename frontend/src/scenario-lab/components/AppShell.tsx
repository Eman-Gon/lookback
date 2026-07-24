import type { ReactNode } from "react";

export type ScenarioLabView = "catalog" | "run" | "report";

export interface AppShellAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export interface AppShellProps {
  children: ReactNode;
  activeView: ScenarioLabView;
  onNavigate: (view: Exclude<ScenarioLabView, "run">) => void;
  hasRunReport?: boolean;
  navigationDisabled?: boolean;
  graphSnapshot?: string;
  servicesOnline?: number;
  servicesTotal?: number;
  primaryAction?: AppShellAction;
}

export function AppShell({
  children,
  activeView,
  onNavigate,
  hasRunReport = false,
  navigationDisabled = false,
  graphSnapshot,
  servicesOnline,
  servicesTotal,
  primaryAction,
}: AppShellProps) {
  const servicesKnown =
    typeof servicesOnline === "number" && typeof servicesTotal === "number";
  const servicesHealthy = servicesKnown && servicesOnline === servicesTotal;

  return (
    <div className="sl-root">
      <header className="sl-header">
        <a
          className="sl-wordmark"
          href="/"
          aria-label="Dragback Guided Proof"
          aria-disabled={navigationDisabled || undefined}
          onClick={(event) => {
            if (navigationDisabled) event.preventDefault();
          }}
        >
          Dragback
        </a>

        <nav className="sl-header__nav" aria-label="Scenario Lab navigation">
          <a
            className="sl-nav-link"
            href="/"
            aria-disabled={navigationDisabled || undefined}
            onClick={(event) => {
              if (navigationDisabled) event.preventDefault();
            }}
          >
            Guided Proof
          </a>
          <button
            type="button"
            className="sl-nav-link"
            aria-current={activeView === "report" ? undefined : "page"}
            onClick={() => onNavigate("catalog")}
            disabled={navigationDisabled}
          >
            Scenario Lab
          </button>
          {hasRunReport ? (
            <button
              type="button"
              className="sl-nav-link"
              aria-current={activeView === "report" ? "page" : undefined}
              onClick={() => onNavigate("report")}
              disabled={navigationDisabled}
            >
              Run report
            </button>
          ) : null}
        </nav>

        <div className="sl-header__utilities">
          {(graphSnapshot || servicesKnown) && (
            <div className="sl-system-state" aria-label="System status">
              <span
                className={`sl-system-state__dot ${
                  servicesHealthy ? "is-online" : "is-degraded"
                }`}
                aria-hidden="true"
              />
              {servicesKnown ? (
                <span>
                  {servicesHealthy
                    ? "Services connected"
                    : `${servicesOnline}/${servicesTotal} services`}
                </span>
              ) : graphSnapshot ? (
                <span>{graphSnapshot}</span>
              ) : null}
            </div>
          )}

          <a
            className="sl-docs-link"
            href="https://github.com/Eman-Gon/lookback#readme"
            target="_blank"
            rel="noreferrer"
          >
            Docs
          </a>

          {primaryAction ? (
            <button
              className="sl-button sl-button--primary sl-header__action"
              type="button"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
            >
              {primaryAction.busy ? "Working…" : primaryAction.label}
            </button>
          ) : null}
        </div>

        <details className="sl-mobile-menu">
          <summary>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
            <span>Menu</span>
          </summary>
          <nav aria-label="Mobile Scenario Lab navigation">
            <a
              href="/"
              aria-disabled={navigationDisabled || undefined}
              onClick={(event) => {
                if (navigationDisabled) event.preventDefault();
              }}
            >
              Guided Proof
            </a>
            <button
              type="button"
              aria-current={activeView === "report" ? undefined : "page"}
              disabled={navigationDisabled}
              onClick={(event) => {
                onNavigate("catalog");
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
            >
              Scenario Lab
            </button>
            {hasRunReport ? (
              <button
                type="button"
                aria-current={activeView === "report" ? "page" : undefined}
                disabled={navigationDisabled}
                onClick={(event) => {
                  onNavigate("report");
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }}
              >
                Run report
              </button>
            ) : null}
            <a
              href="https://github.com/Eman-Gon/lookback#readme"
              target="_blank"
              rel="noreferrer"
            >
              Docs
            </a>
          </nav>
        </details>
      </header>
      <main className="sl-main">{children}</main>
    </div>
  );
}
