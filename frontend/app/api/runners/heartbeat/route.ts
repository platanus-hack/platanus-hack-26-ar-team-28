import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { issueRunnerToken, verifyRunnerToken } from "@/lib/runner-token";

const HeartbeatBody = z.object({
  runner_token: z.string().min(10),
  discovered: z.record(z.unknown()).nullable().optional(),
  pending_event_count: z.number().int().nonnegative().optional(),
});

const ROTATE_AFTER_MS = 15 * 60 * 1000; // 15 min — well under 1h TTL

export async function POST(request: NextRequest) {
  let body;
  try {
    body = HeartbeatBody.parse(await request.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_payload", detail: e instanceof Error ? e.message : "unknown" },
      { status: 400 },
    );
  }

  const payload = verifyRunnerToken(body.runner_token);
  if (!payload) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const svc = createServiceClient();
  const now = new Date();

  await svc
    .from("runners")
    .update({ status: "online", last_seen_at: now.toISOString() })
    .eq("id", payload.runner_id);

  // Sweep stale runners on every beat — cheap idempotent SQL function. This
  // means the moment one healthy runner heartbeats, all stale rows flip to
  // offline. Fire-and-forget; we don't fail the heartbeat if sweep fails.
  void svc.rpc("sweep_stale_runners").then(() => {});

  // Rotate runner token if more than half its lifetime has elapsed.
  const elapsed = now.getTime() - payload.iat;
  const rotated =
    elapsed > ROTATE_AFTER_MS
      ? issueRunnerToken({ runner_id: payload.runner_id, owner_id: payload.owner_id })
      : null;

  // Atomically claim queued jobs for this runner.
  const { data: jobs } = await svc
    .from("jobs")
    .update({ status: "claimed", claimed_at: now.toISOString() })
    .eq("runner_id", payload.runner_id)
    .eq("status", "queued")
    .select("id, type, payload");

  return NextResponse.json({
    ok: true,
    runner_token: rotated,
    pending_jobs: jobs ?? [],
  });
}
