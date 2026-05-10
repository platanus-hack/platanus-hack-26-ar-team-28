// Stream a scan event from the runner. Realtime publication wakes up the
// dashboard's agent feed.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateRunner } from "@/lib/runner-auth";

const Body = z.object({
  agent_name: z.string().min(1).max(64),
  event_type: z.string().min(1).max(64),
  message: z.string().max(8000).optional(),
  metadata: z.record(z.unknown()).optional(),
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
  const { data: scan } = await svc
    .from("scans")
    .select("id, owner_id")
    .eq("id", id)
    .single();
  if (!scan || scan.owner_id !== auth.payload.owner_id) {
    return NextResponse.json({ error: "scan_not_found" }, { status: 404 });
  }

  const { error } = await svc.from("scan_events").insert({
    scan_id: id,
    agent_name: body.agent_name,
    event_type: body.event_type,
    message: body.message ?? "",
    metadata: body.metadata ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
