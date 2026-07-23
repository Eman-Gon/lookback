import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { DemoRunner, type DemoPhase, type DemoPhaseId } from "./components/DemoRunner";
import { GraphPanel } from "./components/GraphPanel";
import { GrantPanel } from "./components/GrantPanel";
import { LoopPanel } from "./components/LoopPanel";
import { RealityPanel } from "./components/RealityPanel";
import type { AgentState, AuthorityState, ExecutionAttempt } from "./types";

const DEMO_PHASES: readonly DemoPhase[] = [
  {
    id: "reset",
    shortLabel: "Baseline",
    label: "Restore graph-v17",
    description: "Reset authority and agent state to the approved all-user export decision.",
    holdMs: 500,
  },
  {
    id: "start",
    shortLabel: "Initial allow",
    label: "Start valid run",
    description: "Verify PLAN-027 and issue its snapshot-bound graph-v17 grant.",
    holdMs: 900,
  },
  {
    id: "tests",
    shortLabel: "Tests green",
    label: "Mark tests passed",
    description: "The implementation is complete and technically correct.",
    holdMs: 900,
  },
  {
    id: "decision",
    shortLabel: "Decision lands",
    label: "Apply graph-v18",
    description: "Ingest the approved admin-only decision and trace its downstream impact.",
    holdMs: 1700,
  },
  {
    id: "old-grant",
    shortLabel: "Stale grant",
    label: "Executor rejects",
    description: "The independent executor rejects authorization bound to graph-v17.",
    holdMs: 1500,
  },
  {
    id: "recheck",
    shortLabel: "Recheck",
    label: "Enter REPLAN",
    description: "Current requirements conflict with the all-users action, so the loop replans.",
    holdMs: 1700,
  },
  {
    id: "replan",
    shortLabel: "Correct plan",
    label: "Authorize graph-v18",
    description: "PLAN-028 keeps CSV generation and changes exposure to administrators only.",
    holdMs: 1200,
  },
  {
    id: "new-grant",
    shortLabel: "New grant",
    label: "Executor accepts",
    description: "The executor verifies the corrected plan and its graph-v18 authorization.",
    holdMs: 0,
  },
];

type PendingDelay = {
  timer: number;
  resolve: (shouldContinue: boolean) => void;
};

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught);
}

export default function App() {
  const [authority, setAuthority] = useState<AuthorityState | null>(null);
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [executorAttempts, setExecutorAttempts] = useState<ExecutionAttempt[]>([]);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<DemoPhaseId>>(() => new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [isManualBusy, setIsManualBusy] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const runSequenceRef = useRef(0);
  const pendingDelayRef = useRef<PendingDelay | null>(null);

  const refresh = useCallback(async () => {
    const [authorityState, agentState] = await Promise.all([api.authorityState(), api.agentState()]);
    setAuthority(authorityState);
    setAgent(agentState);
  }, []);

  useEffect(() => {
    refresh().catch((caught) => setError(`Unable to load demo state. ${errorMessage(caught)}`));
  }, [refresh]);

  useEffect(() => {
    return () => {
      runSequenceRef.current += 1;
      const pending = pendingDelayRef.current;
      if (pending) {
        window.clearTimeout(pending.timer);
        pending.resolve(false);
        pendingDelayRef.current = null;
      }
    };
  }, []);

  const performPhase = useCallback(async (phaseId: DemoPhaseId) => {
    switch (phaseId) {
      case "reset":
        setExecutorAttempts([]);
        await Promise.all([api.resetAuthority(), api.resetAgent()]);
        break;
      case "start":
        await api.start();
        break;
      case "tests":
        await api.testsPass();
        break;
      case "decision":
        await api.ingestDecision();
        break;
      case "old-grant":
      case "new-grant": {
        const liveAgent = await api.agentState();
        if (!liveAgent.run) {
          throw new Error("No active agent run is available for execution.");
        }

        const isOldGrant = phaseId === "old-grant";
        const token = isOldGrant ? liveAgent.initial_grant_token : liveAgent.run.grant_token;
        const plan = isOldGrant ? liveAgent.initial_plan : liveAgent.run.plan;
        if (!token) {
          throw new Error(isOldGrant ? "The graph-v17 grant is unavailable." : "The graph-v18 grant is unavailable.");
        }
        if (!plan) {
          throw new Error(isOldGrant ? "The graph-v17 plan is unavailable." : "The graph-v18 plan is unavailable.");
        }

        const result = await api.execute({
          token,
          run_id: liveAgent.run.run_id,
          task_id: liveAgent.run.ticket_id,
          plan,
        });
        const grant = isOldGrant ? "graph-v17" : "graph-v18";
        setExecutorAttempts((current) => [
          ...current.filter((attempt) => attempt.grant !== grant),
          { ...result, grant },
        ]);
        break;
      }
      case "recheck":
        await api.recheck();
        break;
      case "replan":
        await api.replan();
        break;
    }

    await refresh();
  }, [refresh]);

  const enabledIds = useMemo(() => {
    const enabled = new Set<DemoPhaseId>(["reset"]);
    const oldAttempt = executorAttempts.find((attempt) => attempt.grant === "graph-v17");

    if (authority?.graph_version === "graph-v17" && !agent?.run) enabled.add("start");
    if (agent?.run && !agent.run.tests_passed) enabled.add("tests");
    if (authority?.graph_version === "graph-v17" && agent?.run?.tests_passed) enabled.add("decision");
    if (
      authority?.graph_version === "graph-v18"
      && agent?.initial_grant_token
      && agent.run?.plan.id === "PLAN-027"
    ) {
      enabled.add("old-grant");
    }
    if (authority?.graph_version === "graph-v18" && oldAttempt?.applied === false) enabled.add("recheck");
    if (agent?.last_authorization?.verdict === "REPLAN") enabled.add("replan");
    if (
      authority?.graph_version === "graph-v18"
      && agent?.last_authorization?.verdict === "ALLOW"
      && agent.run?.graph_snapshot === "graph-v18"
      && agent.run.plan.id === "PLAN-028"
      && agent.run.grant_token
    ) {
      enabled.add("new-grant");
    }

    return enabled;
  }, [agent, authority, executorAttempts]);

  function waitForPhase(ms: number) {
    return new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        pendingDelayRef.current = null;
        resolve(true);
      }, ms);
      pendingDelayRef.current = { timer, resolve };
    });
  }

  function cancelPendingDelay() {
    const pending = pendingDelayRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pending.resolve(false);
    pendingDelayRef.current = null;
  }

  async function runDemo() {
    if (isRunning || isManualBusy) return;

    cancelPendingDelay();
    const sequence = runSequenceRef.current + 1;
    runSequenceRef.current = sequence;
    setError("");
    setIsComplete(false);
    setIsRunning(true);
    setCompletedIds(new Set());

    try {
      for (let index = 0; index < DEMO_PHASES.length; index += 1) {
        if (runSequenceRef.current !== sequence) return;
        const phase = DEMO_PHASES[index];
        setActiveIndex(index);
        await performPhase(phase.id);
        if (runSequenceRef.current !== sequence) return;
        setCompletedIds((current) => new Set(current).add(phase.id));

        if (phase.holdMs > 0 && index < DEMO_PHASES.length - 1) {
          const shouldContinue = await waitForPhase(phase.holdMs);
          if (!shouldContinue || runSequenceRef.current !== sequence) return;
        }
      }

      setActiveIndex(null);
      setIsComplete(true);
    } catch (caught) {
      setError(`Demo stopped. ${errorMessage(caught)}`);
    } finally {
      if (runSequenceRef.current === sequence) setIsRunning(false);
    }
  }

  function stopDemo() {
    runSequenceRef.current += 1;
    cancelPendingDelay();
    setIsRunning(false);
    setIsComplete(false);
  }

  async function runSinglePhase(index: number) {
    if (isRunning || isManualBusy) return;
    const phase = DEMO_PHASES[index];
    if (!enabledIds.has(phase.id)) return;

    setError("");
    setIsComplete(false);
    setIsManualBusy(true);
    setActiveIndex(index);
    try {
      await performPhase(phase.id);
      const nextCompleted = new Set(completedIds).add(phase.id);
      const completed = nextCompleted.size === DEMO_PHASES.length;
      setCompletedIds(nextCompleted);
      setIsComplete(completed);
      if (completed) setActiveIndex(null);
    } catch (caught) {
      setError(`Phase ${index + 1} failed. ${errorMessage(caught)}`);
    } finally {
      setIsManualBusy(false);
    }
  }

  const isBusy = isRunning || isManualBusy;

  return (
    <main>
      <header className="site-header">
        <div>
          <p className="eyebrow">Decision provenance for coding agents</p>
          <h1>Dragback</h1>
          <p>Tests prove the code works. Dragback proves the work is still wanted.</p>
        </div>
        <div className="system-state" aria-label={`Current graph ${authority?.graph_version ?? "offline"}`}>
          <span className={authority ? "online" : ""} aria-hidden="true" />
          {authority?.graph_version ?? "services offline"}
        </div>
      </header>

      <DemoRunner
        phases={DEMO_PHASES}
        activeIndex={activeIndex}
        completedIds={completedIds}
        enabledIds={enabledIds}
        isRunning={isRunning}
        isBusy={isBusy}
        isComplete={isComplete}
        onRun={runDemo}
        onStop={stopDemo}
        onPhase={runSinglePhase}
      />

      {error ? <div className="error" role="alert">{error}</div> : null}

      <div className="grid">
        <LoopPanel state={agent} />
        <GrantPanel state={agent} executorAttempts={executorAttempts} />
        <GraphPanel state={authority} />
        <RealityPanel />
      </div>
    </main>
  );
}
