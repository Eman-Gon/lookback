import type {
  GrantView,
  ScenarioDefinition,
  ScenarioRunState,
} from "../model";
import { formatCategory } from "../utils";

type LedgerTone = "neutral" | "positive" | "warning" | "negative";

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function grantLabel(
  grant: GrantView | undefined,
  verificationCode: string | null | undefined,
  runStopped = false,
): { value: string; tone: LedgerTone } {
  if (verificationCode) {
    if (verificationCode === "VALID") {
      return {
        value: `${grant?.status === "applied" ? "Applied" : "Verified"} · VALID`,
        tone: "positive",
      };
    }
    return { value: `Rejected · ${verificationCode}`, tone: "negative" };
  }
  if (!grant) return { value: "Not issued", tone: "neutral" };
  if (runStopped) {
    return { value: "Issued · run stopped", tone: "neutral" };
  }
  if (grant.status === "active") return { value: "Active", tone: "positive" };
  if (grant.status === "issued") {
    return { value: "Issued · verification pending", tone: "neutral" };
  }
  if (grant.status === "pending") return { value: "Pending", tone: "warning" };
  return {
    value: formatCategory(grant.status),
    tone:
      grant.status === "applied"
        ? "positive"
        : grant.status === "not-applied"
          ? "warning"
          : "negative",
  };
}

function headline(
  scenario: ScenarioDefinition,
  run: ScenarioRunState | null,
): { title: string; detail: string } {
  if (!run) {
    return {
      title: "Ready to verify the original plan.",
      detail: `No authorization has been issued. Start the run to verify ${scenario.initialPlan.id} against ${scenario.originalDecision.graphSnapshot}.`,
    };
  }
  if (run.status === "failed") {
    return {
      title: "The scenario stopped before completion.",
      detail:
        run.evaluation?.checks.find((check) => !check.passed)?.label ??
        "Open Evidence to inspect the last committed backend result.",
    };
  }
  if (run.activeStage === "authorized") {
    return {
      title: `The original plan is authorized on ${run.graphSnapshot}.`,
      detail:
        "The upstream change has not been applied. The initial snapshot-bound grant remains active.",
      };
  }
  const preserved = run.outcomeSummary?.preservedTaskIds.length ?? 0;
  const invalidated = run.outcomeSummary?.invalidatedTaskIds.length ?? 0;
  if (run.activeStage === "decision-changed") {
    return {
      title: `An approved upstream decision created ${run.graphSnapshot}.`,
      detail:
        run.outcomeSummary
          ? `The downstream ticket is untouched. ${countLabel(invalidated, "task")} invalidated; ${countLabel(preserved, "task")} remain valid.`
          : "The downstream ticket is untouched. Dragback found the graph-derived path to the active plan.",
    };
  }

  if (
    run.activeStage === "reauthorized" &&
    run.outcomeSummary?.mayContinue === false
  ) {
    return {
      title: `${countLabel(invalidated, "task")} invalidated. ${countLabel(preserved, "task")} continue.`,
      detail:
        "The replacement authorization has not produced an executable valid grant.",
    };
  }
  return {
    title: `${countLabel(invalidated, "task")} invalidated. ${preserved} continue.`,
    detail:
      run.activeStage === "reauthorized"
        ? run.outcomeSummary?.mayContinue === true
          ? `The old ${scenario.originalDecision.graphSnapshot} authorization was rejected. A corrected ${run.graphSnapshot} plan may continue.`
          : "Replacement execution was not reported by this API version. Open Evidence for the available grant metadata."
        : "Conflicting tasks lost authorization, the active plan needs review, and unaffected sibling tasks remain valid.",
  };
}

export function OutcomeLedger({
  scenario,
  run,
}: {
  scenario: ScenarioDefinition;
  run: ScenarioRunState | null;
}) {
  const message = headline(scenario, run);
  const summary = run?.outcomeSummary;
  const changed =
    run &&
    (run.activeStage === "decision-changed" ||
      run.activeStage === "work-stopped" ||
      run.activeStage === "reauthorized");
  const oldGrant = grantLabel(
    run?.originalGrant,
    summary?.oldGrantVerificationCode,
    run?.status === "failed",
  );
  const replacementGrant = grantLabel(
    run?.replacementGrant,
    summary?.replacementGrantVerificationCode,
    run?.status === "failed",
  );
  const planStatus = !run
    ? "Not verified"
    : summary?.originalPlanStatus ?? "Not reported";

  const items: readonly {
    label: string;
    value: string;
    tone: LedgerTone;
  }[] = [
    {
      label: "Decision",
      value: changed
        ? scenario.newDecision.text
        : scenario.originalDecision.text,
      tone: "neutral",
    },
    {
      label: "Plan",
      value: formatCategory(planStatus),
      tone:
        planStatus === "NEEDS_REVIEW"
          ? "warning"
          : planStatus === "INVALIDATED"
            ? "negative"
            : run
              ? "positive"
              : "neutral",
    },
    {
      label: "Old grant",
      value: oldGrant.value,
      tone: oldGrant.tone,
    },
    {
      label: "Replacement grant",
      value: replacementGrant.value,
      tone: replacementGrant.tone,
    },
  ];

  return (
    <section className="sl-outcome-ledger" aria-labelledby="outcome-ledger-title">
      <div
        className="sl-outcome-ledger__message"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <h2 id="outcome-ledger-title">{message.title}</h2>
        <p>{message.detail}</p>
      </div>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd className={`sl-ledger-value sl-ledger-value--${item.tone}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
