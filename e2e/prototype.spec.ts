import { expect, test } from "@playwright/test";

test("founder names a company, works the desk, and reaches every surface", async ({ page }) => {
  await page.goto("/");

  // --- New game: name the company and the founder, pick a portrait -----------
  await expect(page.getByRole("heading", { name: "Aero Asset Tycoon" })).toBeVisible();
  await page.getByRole("button", { name: /Roll a company name/ }).click();
  await page.getByRole("button", { name: /Roll a founder name and portrait/ }).click();
  await page.screenshot({ path: "test-results/new-game.png", fullPage: true });

  await page.getByRole("button", { name: /Open the desk/ }).click();

  // --- Office HQ: the three monitors, the wall, and the side screen ----------
  const strip = page.getByRole("button", { name: "Fleet Manager", exact: false });
  await expect(strip.first()).toBeVisible();
  await page.screenshot({ path: "test-results/office-hq.png", fullPage: true });

  // The pulse wheel is the turn control and carries the week and year.
  const wheel = page.getByRole("button", { name: /Resolve week/ });
  await expect(wheel).toBeVisible();

  // --- Marketplace: buy a package, then resolve the pulse --------------------
  await page.getByRole("button", { name: "Marketplace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
  const packageButton = page.getByRole("button", { name: "Buy package" }).first();
  await expect(packageButton).toBeVisible();
  await packageButton.click();
  await expect(page.getByRole("status").first()).toContainText("Queued for the next pulse");

  await wheel.click();
  await expect(page.getByRole("status").filter({ hasText: "Purchase accepted" }).first()).toBeVisible();

  // --- Network map: fog of war and the ATA filter bar ------------------------
  await page.getByRole("button", { name: "Network Map", exact: true }).click();
  await expect(page.getByText(/TAM/).first()).toBeVisible();
  await page.screenshot({ path: "test-results/network-map.png", fullPage: true });

  // --- The rest of the surfaces open ----------------------------------------
  for (const surface of ["Finance", "Fleet Manager", "Intelligence", "Tribal Knowledge", "Team"]) {
    await page.getByRole("button", { name: surface, exact: true }).click();
    await expect(page.locator(".workspace")).toBeVisible();
    await page.screenshot({
      path: `test-results/surface-${surface.toLowerCase().replace(/ /g, "-")}.png`,
      fullPage: true,
    });
  }

  // --- Save and reload ------------------------------------------------------
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved as founder-slot" }).first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /founder-slot/ }).click();
  await expect(page.getByRole("button", { name: /Resolve week/ })).toBeVisible();
});
