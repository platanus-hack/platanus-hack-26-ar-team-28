import { beforeEach, describe, expect, test } from "vitest";
import { issueRunnerToken, verifyRunnerToken } from "@/lib/runner-token";

describe("runner token signing", () => {
  beforeEach(() => {
    process.env.VIBEFENCE_RUNNER_TOKEN_SECRET = "test_secret_at_least_16_chars_long";
  });

  test("issued tokens verify and include expiry metadata", () => {
    const token = issueRunnerToken({ runner_id: "r1", owner_id: "o1" });
    const payload = verifyRunnerToken(token);

    expect(payload?.runner_id).toBe("r1");
    expect(payload?.owner_id).toBe("o1");
    expect(payload?.exp ?? 0).toBeGreaterThan(Date.now());
  });

  test("tampered signatures and bodies are rejected", () => {
    const token = issueRunnerToken({ runner_id: "r1", owner_id: "o1" });
    const tamperedSignature = token.slice(0, -3) + "abc";
    expect(verifyRunnerToken(tamperedSignature)).toBeNull();

    const [body, sig] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.runner_id = "rOTHER";
    const tamperedBody = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    expect(verifyRunnerToken(`${tamperedBody}.${sig}`)).toBeNull();
  });

  test("malformed and foreign tokens are rejected", () => {
    expect(verifyRunnerToken("")).toBeNull();
    expect(verifyRunnerToken("garbage")).toBeNull();
    expect(verifyRunnerToken("ZmFrZQ.somesig")).toBeNull();
  });
});
