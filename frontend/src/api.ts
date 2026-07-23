import type {
  AgentState,
  AuthorityState,
  ExecuteResult,
  ServiceHealth,
  StateEventEnvelope,
} from "./types";

const AUTHORITY = import.meta.env.VITE_AUTHORITY_URL ?? "http://localhost:8001";
const AGENT = import.meta.env.VITE_AGENT_URL ?? "http://localhost:8002";
const EXECUTOR = import.meta.env.VITE_EXECUTOR_URL ?? "http://localhost:8003";

function serviceLabel(url: string): string {
  if (url.startsWith(AUTHORITY)) return "Intent authority";
  if (url.startsWith(AGENT)) return "Agent service";
  if (url.startsWith(EXECUTOR)) return "Executor";
  return "Dragback service";
}

async function responseError(response: Response, url: string): Promise<Error> {
  let message = `HTTP ${response.status}`;
  let correlationId = response.headers.get("X-Correlation-ID");
  try {
    const body = await response.json() as {
      error?: { message?: unknown };
      correlation_id?: unknown;
    };
    if (typeof body.error?.message === "string") {
      message = body.error.message;
    }
    if (!correlationId && typeof body.correlation_id === "string") {
      correlationId = body.correlation_id;
    }
  } catch {
    // Preserve the safe status fallback when an upstream response is not JSON.
  }
  const sentence = message.endsWith(".") ? message : `${message}.`;
  const reference = correlationId ? ` Reference: ${correlationId}.` : "";
  return new Error(`${serviceLabel(url)}: ${sentence}${reference}`);
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (caught) {
    if (
      init?.signal?.aborted
      || (caught instanceof DOMException && caught.name === "AbortError")
    ) {
      throw caught;
    }
    throw new Error(`${serviceLabel(url)}: network request failed.`);
  }
  if (!response.ok) {
    throw await responseError(response, url);
  }
  return response.json() as Promise<T>;
}

async function isHealthy(url: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(url, { signal });
    return response.ok;
  } catch (caught) {
    signal?.throwIfAborted();
    return false;
  }
}

function stateEvents<State>(
  url: string,
  eventTypes: readonly string[],
  onState: (
    state: State,
    eventType: string,
    sequence: number | null,
    correlationId: string | null,
  ) => void,
  onConnection: (connected: boolean) => void,
): () => void {
  const source = new EventSource(url);
  const receive: EventListener = (rawEvent) => {
    if (!(rawEvent instanceof MessageEvent)) return;
    try {
      const envelope = JSON.parse(rawEvent.data) as StateEventEnvelope<State>;
      const sequence = Number.parseInt(rawEvent.lastEventId, 10);
      onState(
        envelope.data,
        envelope.event,
        Number.isNaN(sequence) ? null : sequence,
        typeof envelope.correlation_id === "string" ? envelope.correlation_id : null,
      );
    } catch {
      onConnection(false);
    }
  };
  eventTypes.forEach((eventType) => source.addEventListener(eventType, receive));
  source.onopen = () => onConnection(true);
  source.onerror = () => onConnection(false);

  return () => {
    eventTypes.forEach((eventType) => source.removeEventListener(eventType, receive));
    source.close();
  };
}

export const api = {
  authorityState: (signal?: AbortSignal) =>
    json<AuthorityState>(`${AUTHORITY}/demo/state`, { signal }),
  agentState: (signal?: AbortSignal) =>
    json<AgentState>(`${AGENT}/demo/state`, { signal }),
  health: async (signal?: AbortSignal): Promise<ServiceHealth> => {
    const [authority, agent, executor] = await Promise.all([
      isHealthy(`${AUTHORITY}/health`, signal),
      isHealthy(`${AGENT}/health`, signal),
      isHealthy(`${EXECUTOR}/health`, signal),
    ]);
    return { authority, agent, executor };
  },
  resetAuthority: (signal?: AbortSignal) =>
    json<AuthorityState>(`${AUTHORITY}/demo/reset`, { method: "POST", signal }),
  resetAgent: (signal?: AbortSignal) =>
    json(`${AGENT}/demo/reset`, { method: "POST", signal }),
  resetAll: (signal?: AbortSignal, correlationId?: string) =>
    json(`${AGENT}/demo/reset-all`, {
      method: "POST",
      signal,
      headers: correlationId ? { "X-Correlation-ID": correlationId } : undefined,
    }),
  start: (signal?: AbortSignal) =>
    json<AgentState>(`${AGENT}/demo/start`, { method: "POST", signal }),
  testsPass: (signal?: AbortSignal) =>
    json<AgentState>(`${AGENT}/demo/tests-pass`, { method: "POST", signal }),
  recheck: (signal?: AbortSignal) =>
    json<AgentState>(`${AGENT}/demo/recheck`, { method: "POST", signal }),
  replan: (signal?: AbortSignal) =>
    json<AgentState>(`${AGENT}/demo/replan`, { method: "POST", signal }),
  ingestDecision: (signal?: AbortSignal) =>
    json(`${AUTHORITY}/decisions/ingest`, {
      method: "POST",
      signal,
      body: JSON.stringify({
        decision: {
          id: "DEC-018",
          kind: "Decision",
          title: "Exports must be admin-only",
          text: "For compliance, CSV exports are restricted to administrators.",
          scopes: ["export.authorization"],
          approval_status: "approved",
          authority_role: "compliance",
          confidence: 0.97,
          effective_at: "2026-07-20T14:30:00Z",
          source_ref: "slack://compliance/decision-018",
          attributes: {
            requirements: { "export.authorization": { audience: "admin_only" } },
          },
        },
        supersedes_id: "DEC-004",
        affected_scopes: ["export.authorization"],
      }),
    }),
  execute: (
    body: { token: string; run_id: string; task_id: string; plan: unknown },
    signal?: AbortSignal,
  ) =>
    json<ExecuteResult>(`${EXECUTOR}/execute`, {
      method: "POST",
      signal,
      body: JSON.stringify(body),
    }),
  subscribeAuthority: (
    onState: (
      state: AuthorityState,
      eventType: string,
      sequence: number | null,
      correlationId: string | null,
    ) => void,
    onConnection: (connected: boolean) => void,
  ) =>
    stateEvents(
      `${AUTHORITY}/events`,
      [
        "graph.state.snapshot",
        "graph.state.reset",
        "graph.state.changed",
        "graph.decision.reviewed",
      ],
      onState,
      onConnection,
    ),
  subscribeAgent: (
    onState: (
      state: AgentState,
      eventType: string,
      sequence: number | null,
      correlationId: string | null,
    ) => void,
    onConnection: (connected: boolean) => void,
  ) =>
    stateEvents(
      `${AGENT}/events`,
      ["loop.state.snapshot", "loop.state.reset", "loop.state.changed"],
      onState,
      onConnection,
    ),
};
