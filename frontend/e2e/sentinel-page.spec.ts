/**
 * Sign in as the demo user, navigate to /sentinel, assert the live
 * supervision page renders with project picker + HUD + sections.
 */
import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@vibefence.dev";
const DEMO_PASSWORD = "DemoPassword1!";

test("sentinel page renders live supervision surfaces", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(DEMO_EMAIL);
  await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  await page.getByRole("link", { name: /sentinel/i }).click();
  await page.waitForURL("**/sentinel");

  // Hero
  await expect(page.getByRole("heading", { name: /sentinel/i })).toBeVisible();
  await expect(page.getByText(/Pillar I \+ III · Live supervision/i)).toBeVisible();

  // HUD cards
  await expect(page.getByText("Events", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Blocks", { exact: true })).toBeVisible();
  await expect(page.getByText(/pending approvals/i)).toBeVisible();
  await expect(page.getByText("Snapshots", { exact: true }).first()).toBeVisible();

  // Section headers — both pillars present
  await expect(page.getByText(/Pillar I · MCP supervision/i)).toBeVisible();
  await expect(page.getByText(/Pillar III · Approvals/i)).toBeVisible();
  await expect(page.getByText(/Reversible state/i)).toBeVisible();
});
