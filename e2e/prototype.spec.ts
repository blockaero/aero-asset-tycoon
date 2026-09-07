import { expect, test } from "@playwright/test";

test("founder zooms world → region → HQ, opens a market window, and walks back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Aero Asset Tycoon" })).toBeVisible();
  await page.getByRole("button", { name: "Enter the world" }).click();

  await expect(page.getByRole("button", { name: "Enter Kanto", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Location" })).toContainText("World");
  await page.screenshot({ path: "test-results/world-map.png", fullPage: true });

  await page.getByRole("button", { name: "Enter Kanto", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kanto", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter Tokyo HQ" })).toBeVisible();
  await page.screenshot({ path: "test-results/kanto-region.png", fullPage: true });

  await page.getByRole("button", { name: "Enter Tokyo HQ" }).click();
  await expect(page.getByRole("button", { name: /Open Marketplace/ })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Enter Kanto to reach Tokyo HQ");
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.screenshot({ path: "test-results/founder-hq.png", fullPage: true });

  await page.getByRole("button", { name: /Open Marketplace/ }).click();
  await expect(page.getByRole("dialog", { name: "Marketplace window" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
  await expect(page.getByText("WINDOW ON TOKYO HQ")).toBeVisible();
  const packageButton = page.getByRole("button", { name: "Buy package" }).first();
  await expect(packageButton).toBeVisible();
  await packageButton.click();
  await expect(page.getByRole("status")).toContainText("Queued for the next pulse");

  await page.getByRole("button", { name: "Pulse" }).click();
  await expect(page.getByText("WEEK 1 PULSE", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Purchase accepted" })).toBeVisible();

  await page.getByRole("button", { name: "Close window" }).click();
  await expect(page.getByRole("button", { name: /Open Marketplace/ })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Marketplace window" })).toHaveCount(0);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Kanto", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Enter Kanto", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Location" }).getByText("World", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved as founder-slot" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Continue saved campaign")).toBeVisible();
  await page.getByRole("button", { name: /founder-slot/ }).click();
  await expect(page.getByRole("button", { name: "Enter Kanto", exact: true })).toBeVisible();
});
