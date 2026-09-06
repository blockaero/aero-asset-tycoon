import { expect, test } from "@playwright/test";

test("founder buys a package, resolves a pulse, and explores the network", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Aero Asset Tycoon" })).toBeVisible();
  await page.getByRole("button", { name: "Enter Tokyo HQ" }).click();

  await expect(page.getByRole("button", { name: /Open Marketplace/ })).toBeVisible();
  await page.screenshot({ path: "test-results/founder-hq.png", fullPage: true });
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();

  await page.getByRole("button", { name: /Open Marketplace/ }).click();
  await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
  const packageButton = page.getByRole("button", { name: "Buy package" }).first();
  await expect(packageButton).toBeVisible();
  await packageButton.click();
  await expect(page.getByRole("status")).toContainText("Queued for the next pulse");

  await page.getByRole("button", { name: "Step" }).click();
  await expect(page.getByText("WEEK 1 PULSE")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Purchase accepted");

  await page.getByRole("button", { name: "Network Map" }).click();
  await expect(page.getByRole("heading", { name: "Network Map" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Relationship network/ })).toBeVisible();
  await page.screenshot({ path: "test-results/network-map.png", fullPage: true });

  await page.getByRole("button", { name: /Tokyo HQ; partner/ }).press("Enter");
  await expect(page.getByRole("button", { name: /Open Marketplace/ })).toBeVisible();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Saved as founder-slot");
  await page.reload();
  await expect(page.getByText("Continue saved campaign")).toBeVisible();
  await page.getByRole("button", { name: /founder-slot/ }).click();
  await expect(page.getByRole("button", { name: /Open Marketplace/ })).toBeVisible();
});
