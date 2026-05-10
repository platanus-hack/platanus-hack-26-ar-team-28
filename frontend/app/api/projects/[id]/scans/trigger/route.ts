// User clicks "Run scan" → we create a scan row + a job for the paired runner.
// The user must specify a scan target: a target_url (where the app is running)
// and a target_repo (path on the runner where its source lives). These are
// per-scan, not per-runner — one runner can scan many apps.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const Body = z.object({
  target_url: z.string().min(1).max(500),
  target_repo: z.string().min(1).max(1000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: project_id } = await params;

  let body;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_payload", detail: e instanceof Error ? e.message : "" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data: project } = await svc
    .from("projects")
    .select("*")
    .eq("id", project_id)
    .single();
  if (!project || project.owner_id !== user.id) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const { data: link } = await svc
    .from("project_runners")
    .select("runner_id, runners(*)")
    .eq("project_id", project_id)
    .limit(1)
    .single();
  if (!link?.runners) {
    return NextResponse.json(
      { error: "no_runner_paired", detail: "Pair a local runner first." },
      { status: 412 },
    );
  }
  const runner = link.runners as unknown as { id: string; status: string };
  if (runner.status !== "online") {
    return NextResponse.json(
      { error: "runner_offline", detail: "Runner is not online. Run `vibefence start` on the paired machine." },
      { status: 412 },
    );
  }

  // Persist the most-recent target on the project so the next scan pre-fills.
  if (project.local_url !== body.target_url) {
    await svc.from("projects").update({ local_url: body.target_url }).eq("id", project_id);
  }

  const { data: scan, error: scanErr } = await svc
    .from("scans")
    .insert({
      owner_id: user.id,
      project_id,
      runner_id: runner.id,
      target_url: body.target_url,
      intensity: "safe",
      status: "queued",
    })
    .select("id")
    .single();
  if (scanErr || !scan) {
    return NextResponse.json({ error: "scan_create_failed", detail: scanErr?.message }, { status: 500 });
  }

  const { error: jobErr } = await svc.from("jobs").insert({
    owner_id: user.id,
    project_id,
    runner_id: runner.id,
    type: "scan",
    status: "queued",
    payload: {
      scan_id: scan.id,
      target_url: body.target_url,
      target_repo: body.target_repo,
    },
  });
  if (jobErr) {
    return NextResponse.json({ error: "job_create_failed", detail: jobErr.message }, { status: 500 });
  }

  return NextResponse.json({ scan_id: scan.id });
}
