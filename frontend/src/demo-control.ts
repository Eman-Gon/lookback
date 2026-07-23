import type {
  AgentState,
  AuthorityState,
  ExecutionAttempt,
} from "./types";

export type DemoPhaseId =
  | "reset"
  | "start"
  | "tests"
  | "decision"
  | "old-grant"
  | "recheck"
  | "replan"
  | "new-grant";

export interface DemoOperation {
  id: number;
  signal: AbortSignal;
}

const MAX_OWNED_CORRELATIONS = 8;

export class OwnedCorrelationTracker {
  private readonly correlationIds = new Set<string>();

  register(correlationId: string): void {
    this.correlationIds.delete(correlationId);
    this.correlationIds.add(correlationId);
    if (this.correlationIds.size > MAX_OWNED_CORRELATIONS) {
      const oldest = this.correlationIds.values().next().value;
      if (oldest !== undefined) {
        this.correlationIds.delete(oldest);
      }
    }
  }

  owns(correlationId: string | null): boolean {
    return correlationId !== null && this.correlationIds.has(correlationId);
  }
}

export class DemoOperationController {
  private nextId = 0;
  private current: { id: number; controller: AbortController } | null = null;

  begin(): DemoOperation {
    this.current?.controller.abort();
    const controller = new AbortController();
    const operation = { id: this.nextId + 1, controller };
    this.nextId = operation.id;
    this.current = operation;
    return { id: operation.id, signal: controller.signal };
  }

  cancel(): void {
    this.current?.controller.abort();
    this.current = null;
  }

  isCurrent(operation: DemoOperation): boolean {
    return this.current?.id === operation.id && !operation.signal.aborted;
  }

  finish(operation: DemoOperation): void {
    if (this.current?.id === operation.id) {
      this.current = null;
    }
  }
}

export function completedPhasesAfter(
  current: ReadonlySet<DemoPhaseId>,
  phaseId: DemoPhaseId,
): Set<DemoPhaseId> {
  if (phaseId === "reset") {
    return new Set<DemoPhaseId>(["reset"]);
  }
  return new Set(current).add(phaseId);
}

export function enabledDemoPhases(
  authority: AuthorityState | null,
  agent: AgentState | null,
  executorAttempts: readonly ExecutionAttempt[],
): Set<DemoPhaseId> {
  const enabled = new Set<DemoPhaseId>(["reset"]);
  const run = agent?.run;
  const oldAttempt = executorAttempts.find((attempt) => attempt.grant === "graph-v17");
  const newAttempt = executorAttempts.find((attempt) => attempt.grant === "graph-v18");

  if (authority?.graph_version === "graph-v17" && !run) {
    enabled.add("start");
  }
  if (
    authority?.graph_version === "graph-v17"
    && run?.plan.id === "PLAN-027"
    && !run.tests_passed
  ) {
    enabled.add("tests");
  }
  if (
    authority?.graph_version === "graph-v17"
    && run?.plan.id === "PLAN-027"
    && run.tests_passed
  ) {
    enabled.add("decision");
  }
  if (
    authority?.graph_version === "graph-v18"
    && agent?.initial_grant_token
    && run?.plan.id === "PLAN-027"
    && oldAttempt === undefined
  ) {
    enabled.add("old-grant");
  }
  if (
    authority?.graph_version === "graph-v18"
    && oldAttempt?.applied === false
    && run?.plan.id === "PLAN-027"
    && run.graph_snapshot === "graph-v17"
  ) {
    enabled.add("recheck");
  }
  if (
    agent?.last_authorization?.verdict === "REPLAN"
    && run?.plan.id === "PLAN-027"
  ) {
    enabled.add("replan");
  }
  if (
    authority?.graph_version === "graph-v18"
    && agent?.last_authorization?.verdict === "ALLOW"
    && run?.graph_snapshot === "graph-v18"
    && run.plan.id === "PLAN-028"
    && run.grant_token
    && newAttempt?.applied !== true
  ) {
    enabled.add("new-grant");
  }

  return enabled;
}

export function isAbortError(caught: unknown): boolean {
  return caught instanceof Error && caught.name === "AbortError";
}

interface SequentialPollingOptions<Result> {
  poll: (signal: AbortSignal) => Promise<Result>;
  onResult: (result: Result) => void;
  onError: (caught: unknown) => void;
  intervalMs: number;
  timeoutMs: number;
}

export function startSequentialPolling<Result>({
  poll,
  onResult,
  onError,
  intervalMs,
  timeoutMs,
}: SequentialPollingOptions<Result>): () => void {
  let stopped = false;
  let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let activeController: AbortController | null = null;

  const schedule = () => {
    scheduleTimer = setTimeout(() => {
      scheduleTimer = null;
      void run();
    }, intervalMs);
  };

  const run = async () => {
    const controller = new AbortController();
    activeController = controller;
    timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await poll(controller.signal);
      if (!stopped) {
        onResult(result);
      }
    } catch (caught) {
      if (!stopped) {
        onError(caught);
      }
    } finally {
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (activeController === controller) {
        activeController = null;
      }
      if (!stopped) {
        schedule();
      }
    }
  };

  schedule();

  return () => {
    stopped = true;
    if (scheduleTimer !== null) {
      clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    if (timeoutTimer !== null) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    activeController?.abort();
    activeController = null;
  };
}
