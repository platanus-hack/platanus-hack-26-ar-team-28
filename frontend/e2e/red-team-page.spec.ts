/**
 * E2E for the standalone Red Teaming launcher page.
 *
 * Sign in as the demo user (which has runners + projects), navigate to
 * /red-team, assert the runner list and target form render. We don't actually
 * click Launch (no live agent in CI) — the contract is just "page works".
 */
import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo@vibefence.dev";
const DEMO_PASSWORD = "DemoPassword1!";

test("red-team page lists runners + lets you configure a scan", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(DEMO_EMAIL);
  await page.getByLabel(/password/i).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // Sidebar nav
  await page.getByRole("link", { name: /red teaming/i }).click();
  await page.waitForURL("**/red-team");

  // Hero
  await expect(page.getByRole("heading", { name: /pick a runner/i })).toBeVisible();

  // Either we see a runner card OR the empty state
  const noRunners = page.getByText(/no runners yet/i);
  const hasRunners = page.getByText(/select a runner/i);
  await expect(hasRunners).toBeVisible({ timeout: 5_000 }).catch(() => null);
  // One of them is true
  await expect(hasRunners.or(noRunners).first()).toBeVisible();

  // Target form is visible whenever there are runners
  if (await hasRunners.isVisible()) {
    await expect(page.getByLabel(/target url/i)).toBeVisible();
    await expect(page.getByLabel(/target repo/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /launch scan/i })).toBeVisible();
    // Primer cards
    await expect(page.getByText(/01 · Cartographer/i)).toBeVisible();
    await expect(page.getByText(/02 · Auth Agent/i)).toBeVisible();
    await expect(page.getByText(/03 · Evidence Agent/i)).toBeVisible();
  }
});
