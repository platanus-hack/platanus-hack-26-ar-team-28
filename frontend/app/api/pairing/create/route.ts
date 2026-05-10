// Authenticated user requests a fresh pairing code for a project.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePairingCode } from "@/lib/pairing-code";

const TTL_MINUTES = 10;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { project_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", body.project_id)
      .single();
    if (!project) {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }
  }

  // Try a few times in case of code collision (unlikely with 24×24×900 space).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePairingCode();
    const expires_at = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();
    const { error } = await supabase.from("pairing_codes").insert({
      code,
      owner_id: user.id,
      project_id: body.project_id ?? null,
      expires_at,
    });
    if (!error) {
      return NextResponse.json({ code, expires_at, project_id: body.project_id ?? null });
    }
    // 23505 = unique violation
    if (!error.code || error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "code_collision" }, { status: 500 });
}
