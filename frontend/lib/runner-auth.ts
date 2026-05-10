// Helper to authenticate runner-token-bearing requests at the cloud edge.
import { NextResponse, type NextRequest } from "next/server";
import { verifyRunnerToken, type RunnerTokenPayload } from "@/lib/runner-token";

export type RunnerAuth = {
  ok: true;
  payload: RunnerTokenPayload;
} | {
  ok: false;
  response: NextResponse;
};

export function authenticateRunner(request: NextRequest): RunnerAuth {
  const token =
    request.headers.get("x-vibefence-runner-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const payload = verifyRunnerToken(token);
  if (!payload) {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_runner_token" }, { status: 401 }),
    };
  }
  return { ok: true, payload };
}
