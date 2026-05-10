/**
 * E2E test for the Command Center dashboard surfaces:
 *   - Pending Approvals lists rows when approvals exist
 *   - Recent Snapshots lists rows when snapshots exist
 *   - Live Agent Activity shows running scans
 *   - MCP Event Feed shows recent events
 *
 * Strategy: sign in as the stable demo user (which already has approval +
 * snapshot rows from the scripted demo), navigate to /dashboard, assert.
 */
import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@vibefence.dev";
const DEMO_PASSWORD = "DemoPassword1!";

test("dashboard renders approvals + snapshots + mcp feed for paired user", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(DEMO_EMAIL);
  await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // Stat tiles
  await expect(page.getByText("Projects mapped").first()).toBeVisible();
  await expect(page.getByText("MCP gateway").first()).toBeVisible();
  await expect(page.getByText("Approvals", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Snapshots", { exact: true }).first()).toBeVisible();

  // MCP Event Feed should show at least one row referring to safe_db or Bash
  const mcpSection = page.locator("section", { has: page.getByRole("heading", { name: /MCP Event Feed/i }) });
  await expect(mcpSection).toBeVisible();
  // We expect at least the BLOCK and the snapshot_first events from the scripted demo.
  await expect(mcpSection.getByText(/block|snapshot_first|allow/i).first()).toBeVisible({ timeout: 5_000 });

  // Pending Approvals — heading + list
  const approvalsSection = page.locator("section", { has: page.getByRole("heading", { name: /Pending Approvals/i }) });
  await expect(approvalsSection).toBeVisible();
  await expect(
    approvalsSection.getByText(/ALTER TABLE users DROP COLUMN legacy_role/).first(),
  ).toBeVisible({ timeout: 5_000 });

  // Recent Snapshots — heading + at least one snapshot row showing the database type
  const snapshotsSection = page.locator("section", { has: page.getByRole("heading", { name: /Recent Snapshots/i }) });
  await expect(snapshotsSection).toBeVisible();
  await expect(snapshotsSection.getByText(/database/i).first()).toBeVisible({ timeout: 5_000 });
  await expect(snapshotsSection.getByText(/vibefence_snap_/).first()).toBeVisible();

  // Live Agent Activity — heading present (may show "No scans running" if the
  // most-recent scan completed; we only assert the heading exists, since the
  // section's purpose is to *light up* during a scan).
  const liveSection = page.locator("section", { has: page.getByRole("heading", { name: /Live Agent Activity/i }) });
  await expect(liveSection).toBeVisible();
});
