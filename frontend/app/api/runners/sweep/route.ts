// Mark stale runners offline. Called from the dashboard on load + heartbeat
// route after each beat. Cheap idempotent SQL function.
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data, error } = await svc.rpc("sweep_stale_runners");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ marked_offline: data ?? 0 });
}
