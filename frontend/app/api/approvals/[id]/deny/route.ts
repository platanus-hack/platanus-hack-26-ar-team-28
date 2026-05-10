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
    .select("owner_id, status")
    .eq("id", id)
    .single();
  if (!ap || ap.owner_id !== user.id) {
    return NextResponse.json({ error: "approval_not_found" }, { status: 404 });
  }
  if (ap.status !== "pending") {
    return NextResponse.json({ error: "already_resolved" }, { status: 409 });
  }
  await svc
    .from("approvals")
    .update({
      status: "denied",
      approved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
  return NextResponse.json({ ok: true });
}
