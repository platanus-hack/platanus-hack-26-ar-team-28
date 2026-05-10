// User approves a pending approval. Marks it approved AND enqueues an
// `apply_migration` job for the runner to pick up via heartbeat.
import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: ap } = await svc
    .from("approvals")
    .select("*")
    .eq("id", id)
    .single();
  if (!ap || ap.owner_id !== user.id) {
    return NextResponse.json({ error: "approval_not_found" }, { status: 404 });
  }
  if (ap.status !== "pending") {
    return NextResponse.json({ error: "already_resolved" }, { status: 409 });
  }

  // Find the runner for this project.
  const { data: link } = await svc
    .from("project_runners")
    .select("runner_id")
    .eq("project_id", ap.project_id)
    .limit(1)
    .single();
  if (!link?.runner_id) {
    return NextResponse.json({ error: "no_runner" }, { status: 412 });
  }

  // Mark approved.
  await svc
    .from("approvals")
    .update({
      status: "approved",
      approved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Enqueue the apply job. Payload is minimal — the runner already cached
  // the migration SQL when it created the approval.
  await svc.from("jobs").insert({
    owner_id: user.id,
    project_id: ap.project_id,
    runner_id: link.runner_id,
    type: "apply_migration",
    status: "queued",
    payload: { approval_id: id },
  });

  return NextResponse.json({ ok: true });
}
