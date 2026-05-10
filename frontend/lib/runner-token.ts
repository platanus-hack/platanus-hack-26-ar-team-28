// Signed runner tokens — minimal HMAC-based JWT-ish blob.
// Used for runner -> cloud auth on /heartbeat and event endpoints.
// Rotated on every heartbeat to bound the blast radius of a leaked token.
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const ENC = "base64url";

export type RunnerTokenPayload = {
  runner_id: string;
  owner_id: string;
  iat: number; // ms epoch
  exp: number;
  jti: string; // random per-issue
};

function ensureSecret(): string {
  const secret = process.env.VIBEFENCE_RUNNER_TOKEN_SECRET ?? "";
  if (secret.length < 16) {
    throw new Error(
      "VIBEFENCE_RUNNER_TOKEN_SECRET is not set. Generate with `openssl rand -hex 32` and set in .env.local.",
    );
  }
  return secret;
}

function sign(input: string): string {
  return createHmac("sha256", ensureSecret()).update(input).digest("base64url");
}

export function issueRunnerToken(opts: { runner_id: string; owner_id: string }): string {
  const now = Date.now();
  const payload: RunnerTokenPayload = {
    runner_id: opts.runner_id,
    owner_id: opts.owner_id,
    iat: now,
    exp: now + TOKEN_TTL_MS,
    jti: randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString(ENC);
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function verifyRunnerToken(token: string): RunnerTokenPayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, ENC).toString("utf8")) as RunnerTokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
