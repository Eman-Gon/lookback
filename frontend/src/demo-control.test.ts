import { describe, expect, it, vi } from "vitest";
import {
  completedPhasesAfter,
  DemoOperationController,
  enabledDemoPhases,
  OwnedCorrelationTracker,
  startSequentialPolling,
  type DemoPhaseId,
} from "./demo-control";
import type {
  AgentState,
  AuthorityState,
  ExecutionAttempt,
} from "./types";

const ALL_PHASES: readonly DemoPhaseId[] = [
  "reset",
  "start",
  "tests",
  "decision",
  "old-grant",
  "recheck",
  "replan",
  "new-grant",
];

describe("completedPhasesAfter", () => {
  it("clears stale progress when the baseline is restored manually", () => {
    const completed = completedPhasesAfter(new Set(ALL_PHASES), "reset");

    expect([...completed]).toEqual(["reset"]);
  });

  it("preserves progress for a normal phase transition", () => {
    const completed = completedPhasesAfter(new Set<DemoPhaseId>(["reset"]), "start");

    expect([...completed]).toEqual(["reset", "start"]);
  });
});

describe("enabledDemoPhases", () => {
  const authority = (graphVersion: string): AuthorityState => ({
    graph_version: graphVersion,
    artifacts: [],
    edges: [],
    last_report: null,
  });
  const agent = (
    planId: "PLAN-027" | "PLAN-028",
    {
      graphSnapshot,
      testsPassed = true,
      verdict = "ALLOW",
    }: {
      graphSnapshot: string;
      testsPassed?: boolean;
      verdict?: "ALLOW" | "REPLAN";
    },
  ): AgentState => ({
    run: {
      run_id: "RUN-27",
      ticket_id: "TICKET-100",
      state: verdict === "REPLAN" ? "REPLAN" : "ACT",
      tests_passed: testsPassed,
      graph_snapshot: graphSnapshot,
      grant_token: "signed-grant",
      history: [],
      plan: {
        id: planId,
        ticket_id: "TICKET-100",
        objective: "Export account data",
        actions: [],
      },
    },
    last_authorization: {
      verdict,
      reason: "fixture",
      graph_version: graphSnapshot,
      affected_scopes: [],
      invalidation_path: [],
      evidence_refs: [],
      grant: null,
    },
    initial_grant_token: "initial-grant",
    initial_plan: null,
  });
  const attempt = (
    grant: "graph-v17" | "graph-v18",
    applied: boolean,
  ): ExecutionAttempt => ({ grant, applied, reason: "fixture" });

  it("advances only the next valid phase and disables completed actions", () => {
    expect([...enabledDemoPhases(authority("graph-v17"), null, [])]).toEqual([
      "reset",
      "start",
    ]);
    expect([
      ...enabledDemoPhases(
        authority("graph-v18"),
        agent("PLAN-027", { graphSnapshot: "graph-v17" }),
        [],
      ),
    ]).toEqual(["reset", "old-grant"]);
    expect([
      ...enabledDemoPhases(
        authority("graph-v18"),
        agent("PLAN-027", { graphSnapshot: "graph-v17" }),
        [attempt("graph-v17", false)],
      ),
    ]).toEqual(["reset", "recheck"]);
    expect([
      ...enabledDemoPhases(
        authority("graph-v18"),
        agent("PLAN-027", {
          graphSnapshot: "graph-v18",
          verdict: "REPLAN",
        }),
        [attempt("graph-v17", false)],
      ),
    ]).toEqual(["reset", "replan"]);
    expect([
      ...enabledDemoPhases(
        authority("graph-v18"),
        agent("PLAN-028", { graphSnapshot: "graph-v18" }),
        [attempt("graph-v17", false)],
      ),
    ]).toEqual(["reset", "new-grant"]);
    expect([
      ...enabledDemoPhases(
        authority("graph-v18"),
        agent("PLAN-028", { graphSnapshot: "graph-v18" }),
        [attempt("graph-v17", false), attempt("graph-v18", true)],
      ),
    ]).toEqual(["reset"]);
  });
});

describe("DemoOperationController", () => {
  it("aborts and invalidates an operation when a new one begins", () => {
    const controller = new DemoOperationController();
    const first = controller.begin();
    const second = controller.begin();

    expect(first.signal.aborted).toBe(true);
    expect(controller.isCurrent(first)).toBe(false);
    expect(controller.isCurrent(second)).toBe(true);
  });

  it("aborts the active operation when cancelled", () => {
    const controller = new DemoOperationController();
    const operation = controller.begin();

    controller.cancel();

    expect(operation.signal.aborted).toBe(true);
    expect(controller.isCurrent(operation)).toBe(false);
  });

  it("does not let a stale operation finish a newer operation", () => {
    const controller = new DemoOperationController();
    const first = controller.begin();
    const second = controller.begin();

    controller.finish(first);

    expect(controller.isCurrent(second)).toBe(true);
  });
});

describe("OwnedCorrelationTracker", () => {
  it("matches only reset events initiated by this client", () => {
    const tracker = new OwnedCorrelationTracker();
    tracker.register("ui-reset-owned");

    expect(tracker.owns("ui-reset-owned")).toBe(true);
    expect(tracker.owns("external-reset")).toBe(false);
    expect(tracker.owns(null)).toBe(false);
  });
});

describe("startSequentialPolling", () => {
  it("waits for one probe to finish before scheduling the next", async () => {
    vi.useFakeTimers();
    let releaseProbe: (() => void) | undefined;
    let activeSignal: AbortSignal | undefined;
    const poll = vi.fn((signal: AbortSignal) => {
      activeSignal = signal;
      return new Promise<string>((resolve) => {
        releaseProbe = () => resolve("online");
      });
    });
    const onResult = vi.fn();
    const stop = startSequentialPolling({
      poll,
      onResult,
      onError: vi.fn(),
      intervalMs: 10,
      timeoutMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(100);
    expect(poll).toHaveBeenCalledTimes(1);

    releaseProbe?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(poll).toHaveBeenCalledTimes(2);

    stop();
    expect(activeSignal?.aborted).toBe(true);
    expect(onResult).toHaveBeenCalledWith("online");
    vi.useRealTimers();
  });
});
