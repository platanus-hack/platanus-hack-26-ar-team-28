import { beforeEach, describe, expect, test, vi } from "vitest";
import { issueRunnerToken } from "@/lib/runner-token";

process.env.VIBEFENCE_RUNNER_TOKEN_SECRET = "test_secret_at_least_16_chars_long";

const createServiceClient = vi.fn();
const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient,
  createClient,
}));

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeRunnerToken(ownerId = "owner_1", runnerId = "runner_1") {
  return issueRunnerToken({ owner_id: ownerId, runner_id: runnerId });
}

function chain<T>(terminal: T, methods: string[]) {
  const obj: Record<string, unknown> = {};
  for (const method of methods) {
    obj[method] = vi.fn(() => obj);
  }
  obj.single = vi.fn(async () => terminal);
  obj.select = vi.fn(() => obj);
  obj.limit = vi.fn(() => obj);
  return obj;
}

describe("runner token verification and heartbeat job claim", () => {
  beforeEach(() => {
    vi.resetModules();
    createServiceClient.mockReset();
    createClient.mockReset();
  });

  test("heartbeat rejects invalid runner tokens", async () => {
    const { POST } = await import("@/app/api/runners/heartbeat/route");

    const resp = await POST(
      jsonRequest({ runner_token: "not-a-valid-token", discovered: {} }) as never,
    );

    expect(resp.status).toBe(401);
    await expect(resp.json()).resolves.toEqual({ error: "invalid_token" });
  });

  test("heartbeat marks runner online and atomically claims queued jobs", async () => {
    const jobs = [{ id: "job_1", type: "apply_migration", payload: { approval_id: "ap_1" } }];
    const calls: Array<Record<string, unknown>> = [];

    createServiceClient.mockReturnValue({
      from(table: string) {
        if (table === "runners") {
          return {
            update(values: unknown) {
              calls.push({ table, op: "update", values });
              return { eq: vi.fn(() => Promise.resolve({ data: null })) };
            },
          };
        }
        if (table === "jobs") {
          const q: Record<string, unknown> = {
            update(values: unknown) {
              calls.push({ table, op: "update", values });
              return q;
            },
            eq(field: string, value: unknown) {
              calls.push({ table, op: "eq", field, value });
              return q;
            },
            select: vi.fn(async () => ({ data: jobs })),
          };
          return q;
        }
        throw new Error(`unexpected table ${table}`);
      },
      rpc: vi.fn(async () => ({})),
    });

    const { POST } = await import("@/app/api/runners/heartbeat/route");
    const token = makeRunnerToken();
    const resp = await POST(jsonRequest({ runner_token: token, discovered: {} }) as never);
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.pending_jobs).toEqual(jobs);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "runners", op: "update" }),
        expect.objectContaining({ table: "jobs", op: "update" }),
        expect.objectContaining({ table: "jobs", op: "eq", field: "runner_id", value: "runner_1" }),
        expect.objectContaining({ table: "jobs", op: "eq", field: "status", value: "queued" }),
      ]),
    );
  });
});

describe("frontend API route auth boundaries", () => {
  beforeEach(() => {
    vi.resetModules();
    createServiceClient.mockReset();
    createClient.mockReset();
  });

  test("mcp-events rejects runner events for another owner's project", async () => {
    createServiceClient.mockReturnValue({
      from(table: string) {
        if (table === "projects") {
          return chain({ data: { owner_id: "owner_2" } }, ["eq"]);
        }
        if (table === "mcp_events") {
          throw new Error("mcp_events insert should not run");
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    const { POST } = await import("@/app/api/mcp-events/route");
    const token = makeRunnerToken("owner_1", "runner_1");
    const resp = await POST(
      jsonRequest(
        {
          project_id: "00000000-0000-4000-8000-000000000001",
          tool_name: "Bash",
          decision: "block",
        },
        { "x-vibefence-runner-token": token },
      ) as never,
    );

    expect(resp.status).toBe(404);
    await expect(resp.json()).resolves.toEqual({ error: "project_not_found" });
  });

  test("approval approve route requires an authenticated dashboard user", async () => {
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    const { POST } = await import("@/app/api/approvals/[id]/approve/route");
    const resp = await POST(jsonRequest({}) as never, {
      params: Promise.resolve({ id: "approval_1" }),
    });

    expect(resp.status).toBe(401);
    await expect(resp.json()).resolves.toEqual({ error: "unauthorized" });
  });

  test("scan events reject valid runner tokens for scans owned by someone else", async () => {
    createServiceClient.mockReturnValue({
      from(table: string) {
        if (table === "scans") {
          return chain({ data: { id: "scan_1", owner_id: "owner_2" } }, ["eq"]);
        }
        if (table === "scan_events") {
          throw new Error("scan_events insert should not run");
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    const { POST } = await import("@/app/api/scans/[id]/events/route");
    const token = makeRunnerToken("owner_1", "runner_1");
    const resp = await POST(
      jsonRequest(
        { agent_name: "cartographer", event_type: "start", message: "mapping" },
        { "x-vibefence-runner-token": token },
      ) as never,
      { params: Promise.resolve({ id: "scan_1" }) },
    );

    expect(resp.status).toBe(404);
    await expect(resp.json()).resolves.toEqual({ error: "scan_not_found" });
  });

  test("runner sweep route requires an authenticated dashboard user", async () => {
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });
    createServiceClient.mockReturnValue({
      rpc: vi.fn(() => {
        throw new Error("sweep should not run");
      }),
    });

    const { POST } = await import("@/app/api/runners/sweep/route");
    const resp = await POST();

    expect(resp.status).toBe(401);
    await expect(resp.json()).resolves.toEqual({ error: "unauthorized" });
  });

  test("pairing claim reserves a code before issuing a runner token", async () => {
    const codeRow = {
      code: "ABC-123",
      owner_id: "owner_1",
      project_id: "project_1",
    };
    const calls: Array<Record<string, unknown>> = [];

    createServiceClient.mockReturnValue({
      from(table: string) {
        if (table === "pairing_codes") {
          const q: Record<string, unknown> = {
            update(values: unknown) {
              calls.push({ table, op: "update", values });
              return q;
            },
            eq(field: string, value: unknown) {
              calls.push({ table, op: "eq", field, value });
              return q;
            },
            is(field: string, value: unknown) {
              calls.push({ table, op: "is", field, value });
              return q;
            },
            gt(field: string, value: unknown) {
              calls.push({ table, op: "gt", field, value });
              return q;
            },
            select: vi.fn(() => q),
            single: vi.fn(async () => ({ data: codeRow })),
          };
          return q;
        }
        if (table === "projects") {
          return { update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })) };
        }
        if (table === "runners") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "runner_1", paired_at: "2026-05-10T00:00:00.000Z" },
                })),
              })),
            })),
          };
        }
        if (table === "project_runners") {
          return { insert: vi.fn(async () => ({})) };
        }
        throw new Error(`unexpected table ${table}`);
      },
    });

    const { POST } = await import("@/app/api/pairing/claim/route");
    const resp = await POST(
      jsonRequest({
        code: "ABC-123",
        machine_name: "devbox",
        os: "darwin",
        version: "0.1.0",
      }) as never,
    );

    expect(resp.status).toBe(200);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "pairing_codes", op: "update" }),
        expect.objectContaining({ table: "pairing_codes", op: "is", field: "claimed_at", value: null }),
        expect.objectContaining({ table: "pairing_codes", op: "gt", field: "expires_at" }),
      ]),
    );
  });
});
