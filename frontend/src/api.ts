import type { AgentState, AuthorityState, ExecuteResult } from "./types";

const AUTHORITY = import.meta.env.VITE_AUTHORITY_URL ?? "http://localhost:8001";
const AGENT = import.meta.env.VITE_AGENT_URL ?? "http://localhost:8002";
const EXECUTOR = import.meta.env.VITE_EXECUTOR_URL ?? "http://localhost:8003";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  authorityState: () => json<AuthorityState>(`${AUTHORITY}/demo/state`),
  agentState: () => json<AgentState>(`${AGENT}/demo/state`),
  resetAuthority: () => json<AuthorityState>(`${AUTHORITY}/demo/reset`, { method: "POST" }),
  resetAgent: () => json(`${AGENT}/demo/reset`, { method: "POST" }),
  start: () => json<AgentState>(`${AGENT}/demo/start`, { method: "POST" }),
  testsPass: () => json<AgentState>(`${AGENT}/demo/tests-pass`, { method: "POST" }),
  recheck: () => json<AgentState>(`${AGENT}/demo/recheck`, { method: "POST" }),
  replan: () => json<AgentState>(`${AGENT}/demo/replan`, { method: "POST" }),
  ingestDecision: () =>
    json(`${AUTHORITY}/decisions/ingest`, {
      method: "POST",
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
  execute: (body: { token: string; run_id: string; task_id: string; plan: unknown }) =>
    json<ExecuteResult>(`${EXECUTOR}/execute`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
