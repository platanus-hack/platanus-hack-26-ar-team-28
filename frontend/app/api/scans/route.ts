// Allocate a scan row. Auth: runner-token (the agent kicks this off
// either from the CLI or in response to a "Run Scan" job posted by the UI).
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateRunner } from "@/lib/runner-auth";

const Body = z.object({
  target_url: z.string().min(1),
  project_id: z.string().uuid(),
  intensity: z.enum(["safe", "standard", "aggressive"]).default("safe"),
});

export async function POST(req: NextRequest) {
  const auth = authenticateRunner(req);
  if (!auth.ok) return auth.response;
  const { payload } = auth;

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

  // Verify the project belongs to the same owner as the runner token.
  const { data: project } = await svc
    .from("projects")
    .select("id, owner_id")
    .eq("id", body.project_id)
    .single();
  if (!project || project.owner_id !== payload.owner_id) {
    return NextResponse.json({ error: "project_not_found_for_runner" }, { status: 404 });
  }

  const { data: scan, error } = await svc
    .from("scans")
    .insert({
      owner_id: payload.owner_id,
      project_id: body.project_id,
      runner_id: payload.runner_id,
      target_url: body.target_url,
      intensity: body.intensity,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !scan) {
    return NextResponse.json({ error: "scan_create_failed", detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ id: scan.id });
}
