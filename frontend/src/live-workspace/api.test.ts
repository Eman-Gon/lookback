import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLiveWorkspaceClient,
  mapLiveWorkspace,
  parseWorkspaceDocument,
} from "./api";
import { SAMPLE_WORKSPACE } from "./sample";
import { RAW_WORKSPACE } from "./test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Live Workspace document parsing", () => {
  it("parses JSON and YAML into the same structured import payload", () => {
    const json = parseWorkspaceDocument(
      JSON.stringify(SAMPLE_WORKSPACE),
      "json",
    );
    const yaml = parseWorkspaceDocument(
      `
id: yaml-workspace
name: YAML workspace
authority_policy:
  product.scope: [product-admin]
baseline_decision: {id: DEC-1}
specification: {id: SPEC-1}
ticket: {id: TICKET-1}
tasks: [{id: TASK-1}]
plan: {id: PLAN-1}
`,
      "yaml",
    );
    expect(json.id).toBe("refund-operations");
    expect(yaml.id).toBe("yaml-workspace");
    expect(yaml.authority_policy["product.scope"]).toEqual([
      "product-admin",
    ]);
  });

  it("rejects empty, malformed, and non-object documents before transport", () => {
    expect(() => parseWorkspaceDocument("", "json")).toThrow(
      "Paste a workspace document",
    );
    expect(() => parseWorkspaceDocument("{", "json")).toThrow(
      "could not be parsed",
    );
    expect(() => parseWorkspaceDocument("[]", "json")).toThrow(
      "one object",
    );
  });
});

describe("Live Workspace API mapping", () => {
  it("maps additive decision, authorization, executor, path, and history fields without tokens", () => {
    const workspace = mapLiveWorkspace(RAW_WORKSPACE);
    expect(workspace.latestApprovedMutation?.decision.title).toBe(
      "Refunds over $500 require human approval",
    );
    expect(workspace.initialAuthorization?.grant).toMatchObject({
      authorizationId: "AUTH-001",
      decisionSnapshot: "graph-v17",
      planHash: "abc123",
    });
    expect(workspace.initialVerification).toMatchObject({
      applied: false,
      verificationCode: "STALE_SNAPSHOT",
    });
    expect(workspace.conflictAuthorization?.invalidationPath).toEqual([
      "DEC-002",
      "DEC-001",
      "SPEC-001",
      "PAY-104",
      "TASK-003",
      "PLAN-001",
    ]);
    expect(JSON.stringify(workspace)).not.toContain("signed_token");
    expect(JSON.stringify(workspace)).not.toContain("grant_token");
  });

  it("uses the exact live-workspace routes and structured request bodies", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      const body = url.endsWith("/live-workspaces")
        ? { workspaces: [RAW_WORKSPACE] }
        : RAW_WORKSPACE;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createLiveWorkspaceClient();

    await client.list();
    await client.importWorkspace(SAMPLE_WORKSPACE);
    await client.approveBaseline("refund-operations", "finance-admin");
    await client.authorizePlan("refund-operations");
    await client.proposeChange("refund-operations", {
      decision: { id: "DEC-002" },
      supersedes_id: "DEC-001",
      affected_scopes: ["refund.execution"],
    });
    await client.cancelPendingChange("refund-operations");
    await client.approveChange(
      "refund-operations",
      "DEC-002",
      "finance-admin",
    );
    await client.verifyInitialGrant("refund-operations");
    await client.updatePlan("refund-operations", {
      id: "PLAN-002",
    });
    await client.reauthorize("refund-operations");
    await client.verifyReplacementGrant("refund-operations");

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: (init as RequestInit | undefined)?.method ?? "GET",
      body: (init as RequestInit | undefined)?.body,
    }));
    expect(calls.map((call) => call.url.replace(/^.*:8002/, ""))).toEqual([
      "/live-workspaces",
      "/live-workspaces/import",
      "/live-workspaces/refund-operations/baseline/approve",
      "/live-workspaces/refund-operations/authorize",
      "/live-workspaces/refund-operations/decisions/propose",
      "/live-workspaces/refund-operations/decisions/pending",
      "/live-workspaces/refund-operations/decisions/DEC-002/approve",
      "/live-workspaces/refund-operations/grants/initial/verify",
      "/live-workspaces/refund-operations/plan",
      "/live-workspaces/refund-operations/reauthorize",
      "/live-workspaces/refund-operations/grants/replacement/verify",
    ]);
    expect(calls[2]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ actor_role: "finance-admin" }),
    });
    expect(calls[5]).toMatchObject({
      method: "DELETE",
    });
    expect(calls[8]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ plan: { id: "PLAN-002" } }),
    });
  });
});
