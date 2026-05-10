// Runner posts an approval request when a high-impact action is intercepted.
// User-side GET is below — same route, returns the project's open approvals.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { authenticateRunner } from "@/lib/runner-auth";

const Body = z.object({
  project_id: z.string().uuid(),
  mcp_event_id: z.string().uuid().optional().nullable(),
  requested_action: z.string().min(1).max(2000),
  risk_level: z.enum(["critical", "high", "medium", "low"]).optional(),
  sandbox_result: z.record(z.unknown()).optional().nullable(),
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
  const { data: project } = await svc
    .from("projects")
    .select("owner_id")
    .eq("id", body.project_id)
    .single();
  if (!project || project.owner_id !== auth.payload.owner_id) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

  const { data: row, error } = await svc
    .from("approvals")
    .insert({
      owner_id: auth.payload.owner_id,
      project_id: body.project_id,
      mcp_event_id: body.mcp_event_id ?? null,
      status: "pending",
      requested_action: body.requested_action,
      risk_level: body.risk_level ?? null,
      sandbox_result: body.sandbox_result ?? null,
      expires_at: expires,
    })
    .select("id")
    .single();
  if (error || !row) {
    return NextResponse.json(
      { error: "insert_failed", detail: error?.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ id: row.id });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "missing_project_id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ approvals: data ?? [] });
}
