import { describe, expect, it } from "vitest";
import { runBalanceSuite } from "../src/experiment/balance-suite.ts";
import { defaultConfig, runCampaign } from "../src/sim/campaign.ts";
import { DEFAULT_POLICY } from "../src/sim/world.ts";

describe("common-seed synthetic playtest", () => {
  it("compares five strategy archetypes on identical worlds without one runaway policy", () => {
    const reports = runBalanceSuite([101, 102, 103, 104, 105], 24);
    expect(reports).toHaveLength(5);
    expect(reports.every((report) => report.seeds.join(",") === "101,102,103,104,105")).toBe(true);
    const navs = reports.map((report) => report.averageNav);
    const spread = Math.max(...navs) - Math.min(...navs);
    expect(spread).toBeLessThan(1_000_000);
    expect(reports.every((report) => Number.isFinite(report.averageFillRate))).toBe(true);
  });

  it("makes replenishment ceiling and expendable target economically active", () => {
    const conservative = runCampaign(
      defaultConfig({ seed: 109, ticks: 100 }),
      { ...DEFAULT_POLICY, replenishPriceCeil: 0.5, targetStockExpendable: 0 },
    );
    const permissive = runCampaign(
      defaultConfig({ seed: 109, ticks: 100 }),
      { ...DEFAULT_POLICY, replenishPriceCeil: 1.3, targetStockExpendable: 40 },
    );
    const conservativePurchases = conservative.world.events.filter(
      (event) => event.kind === "listing_purchased" && event.payload.firmId === "firm-0",
    ).length;
    const permissivePurchases = permissive.world.events.filter(
      (event) => event.kind === "listing_purchased" && event.payload.firmId === "firm-0",
    ).length;
    expect(permissivePurchases).not.toBe(conservativePurchases);
  });

  it("keeps at least one viable and measurably distinct long-run strategy", () => {
    const reports = runBalanceSuite([201, 202, 203, 204, 205], 100);
    expect(Math.max(...reports.map((report) => report.averageNav))).toBeGreaterThan(10_000_000);
    expect(
      Math.max(...reports.map((report) => report.averageNav)) -
      Math.min(...reports.map((report) => report.averageNav)),
    ).toBeGreaterThan(150_000);
    expect(
      Math.max(...reports.map((report) => report.averageFillRate)) -
      Math.min(...reports.map((report) => report.averageFillRate)),
    ).toBeGreaterThan(0.001);
    // Five archetypes over five seeds and a hundred weeks each. Every assertion above
    // stands; this only tells vitest the benchmark is expected to be slow.
  }, 60_000);
});
