import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { DemoRunner, type DemoPhase } from "./components/DemoRunner";
import { GraphPanel } from "./components/GraphPanel";
import { GrantPanel } from "./components/GrantPanel";
import { LoopPanel } from "./components/LoopPanel";
import { RealityPanel } from "./components/RealityPanel";
import { ScenarioLabRoute } from "./scenario-lab/ScenarioLabRoute";
import {
  completedPhasesAfter,
  DemoOperationController,
  enabledDemoPhases,
  isAbortError,
  OwnedCorrelationTracker,
  startSequentialPolling,
  type DemoPhaseId,
} from "./demo-control";
import type {
  AgentState,
  AuthorityState,
  ExecutionAttempt,
  ServiceHealth,
} from "./types";

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

function GuidedProof() {
  const [authority, setAuthority] = useState<AuthorityState | null>(null);
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [executorAttempts, setExecutorAttempts] = useState<ExecutionAttempt[]>([]);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<DemoPhaseId>>(() => new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [isManualBusy, setIsManualBusy] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth>({
    authority: false,
    agent: false,
    executor: false,
  });
  const pendingDelayRef = useRef<PendingDelay | null>(null);
  const authorityEventEpochRef = useRef(0);
  const agentEventEpochRef = useRef(0);
  const ownedResetCorrelationsRef = useRef<OwnedCorrelationTracker | null>(null);
  if (ownedResetCorrelationsRef.current === null) {
    ownedResetCorrelationsRef.current = new OwnedCorrelationTracker();
  }
  const ownedResetCorrelations = ownedResetCorrelationsRef.current;
  const operationControllerRef = useRef<DemoOperationController | null>(null);
  if (operationControllerRef.current === null) {
    operationControllerRef.current = new DemoOperationController();
  }
  const operationController = operationControllerRef.current;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const authorityEpoch = authorityEventEpochRef.current;
    const agentEpoch = agentEventEpochRef.current;
    const [healthResult, stateResult] = await Promise.allSettled([
      api.health(signal),
      Promise.all([api.authorityState(signal), api.agentState(signal)]),
    ]);
    signal?.throwIfAborted();
    if (healthResult.status === "fulfilled") {
      setServiceHealth(healthResult.value);
    }
    if (stateResult.status === "rejected") {
      throw stateResult.reason;
    }
    const [authorityState, agentState] = stateResult.value;
    if (authorityEventEpochRef.current === authorityEpoch) {
      setAuthority(authorityState);
    }
    if (agentEventEpochRef.current === agentEpoch) {
      setAgent(agentState);
    }
  }, []);

  const reconcileClientReset = useCallback(() => {
    setCompletedIds(new Set());
    setExecutorAttempts([]);
    setIsComplete(false);
  }, []);

  const cancelPendingDelay = useCallback(() => {
    const pending = pendingDelayRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pending.resolve(false);
    pendingDelayRef.current = null;
  }, []);

  const handleExternalReset = useCallback(() => {
    operationController.cancel();
    cancelPendingDelay();
    setActiveIndex(null);
    setIsRunning(false);
    setIsManualBusy(false);
    reconcileClientReset();
  }, [cancelPendingDelay, operationController, reconcileClientReset]);

  useEffect(() => {
    const operation = operationController.begin();
    refresh(operation.signal)
      .catch((caught) => {
        if (operationController.isCurrent(operation) && !isAbortError(caught)) {
          setError(`Unable to load demo state. ${errorMessage(caught)}`);
        }
      })
      .finally(() => operationController.finish(operation));

    return () => {
      if (operationController.isCurrent(operation)) {
        operationController.cancel();
      }
    };
  }, [operationController, refresh]);

  useEffect(() => {
    const closeAuthority = api.subscribeAuthority(
      (state, eventType, _sequence, correlationId) => {
        authorityEventEpochRef.current += 1;
        setAuthority(state);
        if (
          eventType === "graph.state.reset"
          && !ownedResetCorrelations.owns(correlationId)
        ) {
          handleExternalReset();
        }
      },
      (connected) => {
        setServiceHealth((current) => ({ ...current, authority: connected }));
      },
    );
    const closeAgent = api.subscribeAgent(
      (state, eventType, _sequence, correlationId) => {
        agentEventEpochRef.current += 1;
        setAgent(state);
        if (
          (eventType === "loop.state.reset" || state.run === null)
          && !ownedResetCorrelations.owns(correlationId)
        ) {
          handleExternalReset();
        }
      },
      (connected) => {
        setServiceHealth((current) => ({ ...current, agent: connected }));
      },
    );
    return () => {
      closeAuthority();
      closeAgent();
    };
  }, [handleExternalReset, ownedResetCorrelations]);

  useEffect(() => {
    return startSequentialPolling({
      poll: api.health,
      onResult: setServiceHealth,
      onError: () => {
        setServiceHealth({ authority: false, agent: false, executor: false });
      },
      intervalMs: 5000,
      timeoutMs: 4000,
    });
  }, []);

  useEffect(() => {
    return () => {
      operationController.cancel();
      const pending = pendingDelayRef.current;
      if (pending) {
        window.clearTimeout(pending.timer);
        pending.resolve(false);
        pendingDelayRef.current = null;
      }
    };
  }, [operationController]);

  const performPhase = useCallback(async (phaseId: DemoPhaseId, signal: AbortSignal) => {
    switch (phaseId) {
      case "reset":
        {
          const correlationId = `ui-reset-${crypto.randomUUID()}`;
          ownedResetCorrelations.register(correlationId);
          await api.resetAll(signal, correlationId);
        }
        signal.throwIfAborted();
        setExecutorAttempts([]);
        break;
      case "start":
        await api.start(signal);
        break;
      case "tests":
        await api.testsPass(signal);
        break;
      case "decision":
        await api.ingestDecision(signal);
        break;
      case "old-grant":
      case "new-grant": {
        const liveAgent = await api.agentState(signal);
        signal.throwIfAborted();
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

        const result = await api.execute(
          {
            token,
            run_id: liveAgent.run.run_id,
            task_id: liveAgent.run.ticket_id,
            plan,
          },
          signal,
        );
        signal.throwIfAborted();
        const grant = isOldGrant ? "graph-v17" : "graph-v18";
        setExecutorAttempts((current) => [
          ...current.filter((attempt) => attempt.grant !== grant),
          { ...result, grant },
        ]);
        break;
      }
      case "recheck":
        await api.recheck(signal);
        break;
      case "replan":
        await api.replan(signal);
        break;
    }

    signal.throwIfAborted();
    await refresh(signal);
  }, [ownedResetCorrelations, refresh]);

  const enabledIds = useMemo(() => {
    return enabledDemoPhases(authority, agent, executorAttempts);
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

  async function runDemo() {
    if (isRunning || isManualBusy) return;

    cancelPendingDelay();
    const operation = operationController.begin();
    setError("");
    setIsComplete(false);
    setIsRunning(true);
    setCompletedIds(new Set());

    try {
      for (let index = 0; index < DEMO_PHASES.length; index += 1) {
        if (!operationController.isCurrent(operation)) return;
        const phase = DEMO_PHASES[index];
        setActiveIndex(index);
        await performPhase(phase.id, operation.signal);
        if (!operationController.isCurrent(operation)) return;
        setCompletedIds((current) => completedPhasesAfter(current, phase.id));

        if (phase.holdMs > 0 && index < DEMO_PHASES.length - 1) {
          const shouldContinue = await waitForPhase(phase.holdMs);
          if (!shouldContinue || !operationController.isCurrent(operation)) return;
        }
      }

      setActiveIndex(null);
      setIsComplete(true);
    } catch (caught) {
      if (operationController.isCurrent(operation) && !isAbortError(caught)) {
        setError(`Demo stopped. ${errorMessage(caught)}`);
      }
    } finally {
      if (operationController.isCurrent(operation)) {
        operationController.finish(operation);
        setIsRunning(false);
      }
    }
  }

  function stopDemo() {
    operationController.cancel();
    cancelPendingDelay();
    setActiveIndex(null);
    setIsRunning(false);
    setIsManualBusy(false);
    setIsComplete(false);
  }

  async function runSinglePhase(index: number) {
    if (isRunning || isManualBusy) return;
    const phase = DEMO_PHASES[index];
    if (!enabledIds.has(phase.id)) return;

    const operation = operationController.begin();
    setError("");
    setIsComplete(false);
    setIsManualBusy(true);
    setActiveIndex(index);
    try {
      await performPhase(phase.id, operation.signal);
      if (!operationController.isCurrent(operation)) return;
      const nextCompleted = completedPhasesAfter(completedIds, phase.id);
      const completed = nextCompleted.size === DEMO_PHASES.length;
      setCompletedIds(nextCompleted);
      setIsComplete(completed);
      if (completed) setActiveIndex(null);
    } catch (caught) {
      if (operationController.isCurrent(operation) && !isAbortError(caught)) {
        setError(`Phase ${index + 1} failed. ${errorMessage(caught)}`);
      }
    } finally {
      if (operationController.isCurrent(operation)) {
        operationController.finish(operation);
        setIsManualBusy(false);
      }
    }
  }

  const isBusy = isRunning || isManualBusy;
  const onlineServiceCount = Object.values(serviceHealth).filter(Boolean).length;
  const allServicesOnline = onlineServiceCount === 3;

  return (
    <main>
      <header className="site-header">
        <div>
          <p className="eyebrow">Decision provenance for coding agents</p>
          <h1>Dragback</h1>
          <p>Tests prove the code works. Dragback proves the work is still wanted.</p>
        </div>
        <div className="site-header-actions">
          <a className="scenario-lab-link" href="/scenario-lab">
            Open Scenario Lab
          </a>
          <div
            className="system-state"
            aria-label={`${onlineServiceCount} of 3 services online. Current graph ${authority?.graph_version ?? "offline"}`}
          >
            <span className={allServicesOnline ? "online" : ""} aria-hidden="true" />
            {authority?.graph_version ?? "graph offline"} · {onlineServiceCount}/3 online
          </div>
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

export default function App() {
  return window.location.pathname.startsWith("/scenario-lab") ? (
    <ScenarioLabRoute />
  ) : (
    <GuidedProof />
  );
}
