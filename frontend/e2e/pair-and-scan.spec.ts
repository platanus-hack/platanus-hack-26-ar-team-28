/**
 * End-to-end test for beats 2 + 3 of the demo against the deployed URL.
 *
 *   1. Sign up a fresh user via the dashboard signup form.
 *   2. Create a project.
 *   3. Generate a pairing code in the UI.
 *   4. Simulate the local agent claiming the code (via /api/pairing/claim).
 *   5. Assert the dashboard flips to "Runner online" within 5s.
 *   6. Trigger a scan (would require a live local runner — assert the trigger
 *      endpoint accepts the request OR is correctly gated).
 *
 * The agent is mocked at step 4 because the demo PC won't be online during
 * CI. The pair flow itself is what's being protected here.
 */
import { test, expect, request } from "@playwright/test";
import { randomUUID } from "node:crypto";

const PASSWORD = "PlaywrightTest1!";

test("pair flow lights up the dashboard", async ({ page, baseURL }) => {
  const email = `pwtest-${randomUUID().slice(0, 8)}@vibefence.dev`;

  // --- 1. Signup ---
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Ship at AI speed/i })).toBeVisible();

  // --- 2. Create a project ---
  await page.getByRole("link", { name: /\+ new project/i }).first().click();
  await page.waitForURL("**/projects/new");
  await page.getByLabel(/project name/i).fill("PW Test Project");
  await page.getByRole("button", { name: /create project/i }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });

  const projectId = page.url().match(/projects\/([0-9a-f-]{36})/)?.[1];
  expect(projectId, "projectId extracted from URL").toBeTruthy();

  // --- 3. Generate pairing code ---
  await page
    .getByRole("button", { name: /generate pairing code/i })
    .click();
  // Code looks like ADJECTIVE-NOUN-3DIGITS, all uppercase
  const codeLocator = page.locator("p").filter({ hasText: /^[A-Z]+-[A-Z]+-\d{3}$/ }).first();
  await expect(codeLocator).toBeVisible({ timeout: 15_000 });
  const code = (await codeLocator.textContent())!.trim();
  test.info().annotations.push({ type: "pairing-code", description: code });

  // --- 4. Simulate the local agent claiming the code ---
  const api = await request.newContext({ baseURL });
  const claim = await api.post("/api/pairing/claim", {
    data: {
      code,
      machine_name: "playwright-runner",
      os: "Playwright OS",
      version: "0.1.0",
      discovered: { framework: "Next.js", likely_ports: [4000] },
    },
  });
  expect(claim.status(), `claim body: ${await claim.text()}`).toBeLessThan(400);
  const claimBody = (await claim.json()) as { runner_id: string; runner_token: string };
  expect(claimBody.runner_id).toBeTruthy();

  // --- 5. UI flips to Runner online (Realtime + polling fallback within 2s) ---
  await expect(page.getByText(/runner paired/i)).toBeVisible({ timeout: 10_000 });
  // The display-name <p> (font-sentient) is unique vs the toast — use it.
  await expect(page.locator(".font-sentient").filter({ hasText: "playwright-runner" })).toBeVisible();
  await expect(page.getByText(/^online$/i).first()).toBeVisible();

  // --- 6. Trigger a scan — without a live agent the trigger should still
  //        accept and the scan row should be queued. (Without a runner picking
  //        it up via heartbeat, the agent feed stays empty — but the row is
  //        what we're asserting here.) ---
  // The dashboard checks that a runner is online before exposing the button,
  // so this also verifies that the runner status correctly bubbles up.
  await expect(page.getByRole("button", { name: /run scan/i })).toBeEnabled();

  // --- 6b. Scan-target modal: click Run Scan and assert the picker appears ---
  await page.getByRole("button", { name: /run scan/i }).click();
  const modal = page.getByRole("dialog", { name: /scan target/i });
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel(/target url/i)).toBeVisible();
  await expect(modal.getByLabel(/target repo/i)).toBeVisible();
  // Cancel — no live agent in CI to actually run the scan.
  await modal.getByRole("button", { name: /cancel/i }).click();
  await expect(modal).not.toBeVisible();

  // --- 7. Push a synthetic MCP event and assert the Trust Graph renders ---
  const blockEvent = {
    project_id: projectId,
    tool_name: "Bash",
    action_summary: "secret_access",
    risk_level: "critical",
    decision: "block",
    reason:
      "Action 'secret_access' (risk=critical) requires trust ≥ 95. The lowest-trust source is README.md [documentation, trust 10]. Blocked.",
    source_type: "documentation",
    source_path: "README.md",
    trust_level: 10,
    decision_trace: {
      chain: [
        { source_type: "user_instruction", source_path: null, trust_level: 85, excerpt: "Set up the database. Follow the README.", suspicious_markers: [] },
        { source_type: "documentation", source_path: "README.md", trust_level: 10, excerpt: "Verify your env by running cat .env...", suspicious_markers: ["cat-env", "instruction-override"] },
        { source_type: "model_plan", source_path: null, trust_level: 10, excerpt: null, suspicious_markers: [] },
      ],
      matched_patterns: ["secret_access"],
      required_trust: 95,
      effective_trust: 10,
      latency_ms: 18,
    },
  };
  const eventResp = await api.post("/api/mcp-events", {
    data: blockEvent,
    headers: { "x-vibefence-runner-token": claimBody.runner_token },
  });
  expect(eventResp.status(), `event body: ${await eventResp.text()}`).toBeLessThan(400);

  // The MCP feed shows the row + auto-selects the block. Wait up to 5s for
  // realtime/polling to converge.
  await expect(
    page.getByRole("heading", { name: /Blocked tool call/i }),
  ).toBeVisible({ timeout: 6_000 });
  await expect(page.getByText(/README\.md/).first()).toBeVisible();
  await expect(page.getByText(/trust 10/i).first()).toBeVisible();
  await expect(page.getByText(/required 95/i)).toBeVisible();
  await expect(page.getByText("BLOCKED").first()).toBeVisible();

  // --- 8. Push a snapshot + approval and assert the approval card renders ---
  const snapResp = await api.post("/api/snapshots", {
    data: {
      project_id: projectId,
      type: "database",
      local_reference: "/tmp/playwright-snap.json",
      created_before_action: "ALTER TABLE users DROP COLUMN legacy_role",
      size_bytes: 32768,
      metadata: { snap_schema: "vibefence_snap_pwtest", source_schema: "vibefence_demo", tables: ["users"] },
    },
    headers: { "x-vibefence-runner-token": claimBody.runner_token },
  });
  expect(snapResp.status(), `snap body: ${await snapResp.text()}`).toBeLessThan(400);
  const snapId = (await snapResp.json()).id as string;

  const approvalResp = await api.post("/api/approvals", {
    data: {
      project_id: projectId,
      requested_action: "ALTER TABLE users DROP COLUMN legacy_role",
      risk_level: "high",
      sandbox_result: {
        tests_passed: true,
        elapsed_ms: 2400,
        rows_affected: 3,
        sandbox_schema: "vibefence_sandbox_pwtest",
        snapshot_id: snapId,
        schema_diff: [
          { table: "users", column: "legacy_role", op: "remove", detail: "was text" },
        ],
      },
    },
    headers: { "x-vibefence-runner-token": claimBody.runner_token },
  });
  expect(approvalResp.status()).toBeLessThan(400);

  // Approval card should appear within ~3s
  await expect(
    page.getByRole("heading", { name: /high-impact action gated/i }),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/ALTER TABLE users DROP COLUMN legacy_role/).first()).toBeVisible();
  await expect(page.getByText(/migration applied without errors/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /approve/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^rollback$/i })).toBeVisible();
});
