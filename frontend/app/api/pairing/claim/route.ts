// Local agent claims a pairing code. Public endpoint — auth is the code itself.
// Uses service role to read the code and create the runner; the code's TTL +
// single-use semantics bound the blast radius.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { issueRunnerToken } from "@/lib/runner-token";

const ClaimBody = z.object({
  code: z.string().min(3),
  machine_name: z.string().min(1).max(200),
  os: z.string().min(1).max(200),
  version: z.string().min(1).max(40),
  discovered: z.record(z.unknown()).nullable().optional(),
});

export async function POST(request: NextRequest) {
  let body;
  try {
    body = ClaimBody.parse(await request.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_payload", detail: e instanceof Error ? e.message : "unknown" },
      { status: 400 },
    );
  }

  const svc = createServiceClient();

  // 1. Atomically reserve the code before issuing a runner token.
  const now = new Date().toISOString();
  const { data: code, error: codeError } = await svc
    .from("pairing_codes")
    .update({ claimed_at: now })
    .eq("code", body.code)
    .is("claimed_at", null)
    .gt("expires_at", now)
    .select("*")
    .single();
  if (codeError || !code) {
    return NextResponse.json({ error: "invalid_code" }, { status: 404 });
  }

  // 2. Auto-fill project metadata from discovery (PRD §10.2)
  const discovered = body.discovered ?? {};
  if (code.project_id) {
    const update: Record<string, unknown> = {};
    if (typeof discovered.framework === "string") update.framework = discovered.framework;
    if (Array.isArray(discovered.likely_ports) && discovered.likely_ports.length > 0) {
      const port = (discovered.likely_ports as number[])[0];
      update.local_url = `http://localhost:${port}`;
    }
    if (typeof discovered.git_repo_name === "string") update.repo_alias = discovered.git_repo_name;
    if (Object.keys(update).length > 0) {
      await svc.from("projects").update(update).eq("id", code.project_id);
    }
  }

  // 3. Create runner row
  const { data: runner, error: runnerError } = await svc
    .from("runners")
    .insert({
      owner_id: code.owner_id,
      machine_name: body.machine_name,
      os: body.os,
      version: body.version,
      status: "online",
      paired_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (runnerError || !runner) {
    return NextResponse.json(
      { error: "runner_create_failed", detail: runnerError?.message },
      { status: 500 },
    );
  }

  // 4. Link runner to project (if any)
  if (code.project_id) {
    await svc.from("project_runners").insert({
      project_id: code.project_id,
      runner_id: runner.id,
      status: "active",
    });
  }

  // 5. Mark code claimed
  await svc
    .from("pairing_codes")
    .update({ claimed_runner_id: runner.id })
    .eq("code", code.code);

  // 6. Issue signed runner token
  const runner_token = issueRunnerToken({ runner_id: runner.id, owner_id: code.owner_id });

  return NextResponse.json({
    runner_id: runner.id,
    project_id: code.project_id,
    owner_id: code.owner_id,
    runner_token,
    realtime_channel: `runner:${runner.id}`,
    paired_at: runner.paired_at,
  });
}
