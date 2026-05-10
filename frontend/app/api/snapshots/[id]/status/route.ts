// Runner-token-authed status update for a snapshot row. Used by the agent
// when an apply_migration / apply_rollback job completes.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateRunner } from "@/lib/runner-auth";

const Body = z.object({
  status: z.enum(["available", "applied", "rollback_pending", "rolled_back", "lost"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authenticateRunner(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
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
  const { data: snap } = await svc
    .from("snapshots")
    .select("owner_id")
    .eq("id", id)
    .single();
  if (!snap || snap.owner_id !== auth.payload.owner_id) {
    return NextResponse.json({ error: "snapshot_not_found" }, { status: 404 });
  }

  await svc.from("snapshots").update({ status: body.status }).eq("id", id);
  return NextResponse.json({ ok: true });
}
