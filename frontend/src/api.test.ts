import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api cancellation", () => {
  it("forwards the active operation signal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ graph_version: "graph-v17" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await api.authorityState(controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/demo\/state$/),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

describe("coordinated reset", () => {
  it("uses one agent-owned reset request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reset: true, graph_version: "graph-v17" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.resetAll(undefined, "ui-reset-test");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/demo\/reset-all$/),
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-ID": "ui-reset-test",
        },
      }),
    );
  });
});

describe("service errors", () => {
  it("shows the safe service message and correlation reference", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "AUTHORITY_UNAVAILABLE",
              message: "Intent authority is unavailable.",
              retryable: true,
            },
            correlation_id: "demo-run-27",
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "X-Correlation-ID": "demo-run-27",
            },
            status: 503,
          },
        ),
      ),
    );

    await expect(api.authorityState()).rejects.toThrow(
      "Intent authority: Intent authority is unavailable. Reference: demo-run-27.",
    );
  });

  it("identifies the service when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(api.agentState()).rejects.toThrow(
      "Agent service: network request failed.",
    );
  });
});

describe("state events", () => {
  it("applies pushed authority snapshots and closes cleanly", () => {
    class FakeMessageEvent {
      constructor(
        readonly data: string,
        readonly lastEventId: string,
      ) {}
    }

    class FakeEventSource {
      static instances: FakeEventSource[] = [];
      readonly listeners = new Map<string, Set<EventListener>>();
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      closed = false;

      constructor(readonly url: string) {
        FakeEventSource.instances.push(this);
      }

      addEventListener(eventType: string, listener: EventListener) {
        const listeners = this.listeners.get(eventType) ?? new Set<EventListener>();
        listeners.add(listener);
        this.listeners.set(eventType, listeners);
      }

      removeEventListener(eventType: string, listener: EventListener) {
        this.listeners.get(eventType)?.delete(listener);
      }

      emit(eventType: string, data: string, lastEventId = "1") {
        const event = new FakeMessageEvent(data, lastEventId) as unknown as Event;
        this.listeners.get(eventType)?.forEach((listener) => listener(event));
      }

      close() {
        this.closed = true;
      }
    }

    vi.stubGlobal("MessageEvent", FakeMessageEvent);
    vi.stubGlobal("EventSource", FakeEventSource);
    const onState = vi.fn();
    const onConnection = vi.fn();
    const close = api.subscribeAuthority(onState, onConnection);
    const source = FakeEventSource.instances[0];

    source.onopen?.();
    source.emit(
      "graph.state.changed",
      JSON.stringify({
        event: "graph.state.changed",
        data: { graph_version: "graph-v18", artifacts: [], edges: [], last_report: null },
        correlation_id: "decision-018",
      }),
    );
    close();

    expect(source.url).toMatch(/\/events$/);
    expect(onConnection).toHaveBeenCalledWith(true);
    expect(onState).toHaveBeenCalledWith(
      expect.objectContaining({ graph_version: "graph-v18" }),
      "graph.state.changed",
      1,
      "decision-018",
    );
    expect(source.closed).toBe(true);
  });
});
