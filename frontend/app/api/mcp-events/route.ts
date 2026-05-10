// Runner posts an MCP / hook decision here. Realtime broadcast wakes up
// the dashboard's MCP Event Feed + Trust Graph.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateRunner } from "@/lib/runner-auth";

const Body = z.object({
  project_id: z.string().uuid().optional().nullable(),
  source_type: z
    .enum([
      "system_policy",
      "org_policy",
      "user_instruction",
      "project_policy",
      "repo_code",
      "test_file",
      "documentation",
      "web_content",
      "tool_output",
      "model_plan",
    ])
    .optional()
    .nullable(),
  source_path: z.string().optional().nullable(),
  trust_level: z.number().int().min(0).max(100).optional().nullable(),
  tool_name: z.string().min(1).max(128),
  action_summary: z.string().optional().nullable(),
  risk_level: z.enum(["critical", "high", "medium", "low"]).optional().nullable(),
  decision: z.enum([
    "allow",
    "allow_logged",
    "block",
    "require_approval",
    "snapshot_first",
    "sandbox_first",
    "allow_readonly",
    "require_strong_confirm",
    "ask_clarify",
  ]),
  reason: z.string().optional().nullable(),
  decision_trace: z.record(z.unknown()).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = authenticateRunner(req);
  if (!auth.ok) return auth.response;

  let body;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_payload", detail: e instanceof Error ? e.message : "" },
      { status: 400 },
    );
  }

  const svc = createServiceClient();

  // If a project_id was passed, verify it belongs to this runner's owner.
  if (body.project_id) {
    const { data: project } = await svc
      .from("projects")
      .select("owner_id")
      .eq("id", body.project_id)
      .single();
    if (!project || project.owner_id !== auth.payload.owner_id) {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }
  }

  const { data: row, error } = await svc
    .from("mcp_events")
    .insert({
      owner_id: auth.payload.owner_id,
      project_id: body.project_id ?? null,
      runner_id: auth.payload.runner_id,
      source_type: body.source_type ?? null,
      source_path: body.source_path ?? null,
      trust_level: body.trust_level ?? null,
      tool_name: body.tool_name,
      action_summary: body.action_summary ?? null,
      risk_level: body.risk_level ?? null,
      decision: body.decision,
      reason: body.reason ?? null,
      decision_trace: body.decision_trace ?? null,
      metadata: body.metadata ?? null,
    })
    .select("id")
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "insert_failed", detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ id: row.id });
}
