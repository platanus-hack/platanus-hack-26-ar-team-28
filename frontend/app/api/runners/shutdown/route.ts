// Runner gracefully announces it's going offline (Ctrl+C). Authenticated by
// runner-token. Idempotent.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyRunnerToken } from "@/lib/runner-token";

const Body = z.object({ runner_token: z.string().min(10) });

export async function POST(req: NextRequest) {
  let body;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_payload", detail: e instanceof Error ? e.message : "" },
      { status: 400 },
    );
  }
  const payload = verifyRunnerToken(body.runner_token);
  if (!payload) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const svc = createServiceClient();
  await svc
    .from("runners")
    .update({ status: "offline" })
    .eq("id", payload.runner_id);

  return NextResponse.json({ ok: true });
}
