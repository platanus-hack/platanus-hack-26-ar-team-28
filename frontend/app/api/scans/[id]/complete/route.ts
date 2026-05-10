import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticateRunner } from "@/lib/runner-auth";

const Body = z.object({
  summary: z.record(z.unknown()).optional(),
  status: z.enum(["completed", "failed", "cancelled"]).default("completed"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authenticateRunner(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = Body.parse(await req.json().catch(() => ({})));

  const svc = createServiceClient();
  const { data: scan } = await svc
    .from("scans")
    .select("id, owner_id")
    .eq("id", id)
    .single();
  if (!scan || scan.owner_id !== auth.payload.owner_id) {
    return NextResponse.json({ error: "scan_not_found" }, { status: 404 });
  }

  const { error } = await svc
    .from("scans")
    .update({
      status: body.status,
      summary: body.summary ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
