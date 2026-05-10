// User clicks "Rollback" → enqueue an `apply_rollback` job for the runner.
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
  const { data: snap } = await svc
    .from("snapshots")
    .select("*")
    .eq("id", id)
    .single();
  if (!snap || snap.owner_id !== user.id) {
    return NextResponse.json({ error: "snapshot_not_found" }, { status: 404 });
  }
  if (snap.status !== "available" && snap.status !== "applied") {
    return NextResponse.json({ error: "not_rollbackable" }, { status: 409 });
  }

  const { data: link } = await svc
    .from("project_runners")
    .select("runner_id")
    .eq("project_id", snap.project_id)
    .limit(1)
    .single();
  if (!link?.runner_id) {
    return NextResponse.json({ error: "no_runner" }, { status: 412 });
  }

  await svc
    .from("snapshots")
    .update({ status: "rollback_pending" })
    .eq("id", id);

  await svc.from("jobs").insert({
    owner_id: user.id,
    project_id: snap.project_id,
    runner_id: link.runner_id,
    type: "apply_rollback",
    status: "queued",
    payload: { snapshot_id: id },
  });

  return NextResponse.json({ ok: true });
}
