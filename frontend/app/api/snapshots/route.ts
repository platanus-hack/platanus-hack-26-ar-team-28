// Runner posts snapshot metadata after creating one locally.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateRunner } from "@/lib/runner-auth";

const Body = z.object({
  project_id: z.string().uuid(),
  type: z.enum(["git", "database", "filesystem", "sandbox"]).default("database"),
  local_reference: z.string(),
  created_before_action: z.string().optional().nullable(),
  size_bytes: z.number().int().nonnegative().optional(),
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
  const { data: project } = await svc
    .from("projects")
    .select("owner_id")
    .eq("id", body.project_id)
    .single();
  if (!project || project.owner_id !== auth.payload.owner_id) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const { data: row, error } = await svc
    .from("snapshots")
    .insert({
      owner_id: auth.payload.owner_id,
      project_id: body.project_id,
      runner_id: auth.payload.runner_id,
      type: body.type,
      local_reference: body.local_reference,
      created_before_action: body.created_before_action ?? null,
      status: "available",
      size_bytes: body.size_bytes ?? null,
      metadata: body.metadata ?? null,
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
