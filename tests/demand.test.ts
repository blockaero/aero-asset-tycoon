import { describe, expect, it } from "vitest";
import { createCampaign, defaultConfig, runCampaign } from "../src/sim/campaign.ts";
import { advanceWeek } from "../src/sim/kernel.ts";
import { completeScheduledReplacement } from "../src/sim/demand.ts";

describe("aviation demand signals", () => {
  it("keeps source kinds honest and AOG as an overlay", () => {
    const result = runCampaign(defaultConfig({ seed: 71, ticks: 16, scenario: "prototype" }));
    const posted = result.world.events.filter((event) => event.kind === "demand_posted");
    const kinds = new Set(posted.map((event) => event.payload.demandKind));
    expect(kinds).toContain("hardtime");
    expect(kinds).toContain("oncondition");
    expect(kinds).toContain("conditionmonitored");
    expect(kinds).toContain("ad");
    expect(kinds).toContain("sb");
    expect(posted.some((event) => event.payload.aog === true)).toBe(true);
    expect(kinds.has("aog")).toBe(false);
  });

  it("exposes real series and coherent aggregate fleet groups", () => {
    const result = runCampaign(defaultConfig({ seed: 73, ticks: 2 }));
    const names = result.world.series.map((series) => series.name);
    expect(names).toContain("Airbus A320-200");
    expect(names).toContain("Boeing 737-800");
    expect(names).toContain("Embraer E175");
    expect(names).toContain("CFM56-5B");
    expect(names).toContain("CFM56-7B");
    expect(names).toContain("GE CF34-8E");
    expect(result.world.airlines.every((airline) => airline.fleetGroups.length >= 1)).toBe(true);
    expect(result.world.parts.every((part) => part.id.startsWith("AAT-"))).toBe(true);
    expect(result.world.parts.every((part) => part.mtbrFh > 0)).toBe(true);
    const fleet = result.world.airlines[0]!.fleetGroups[0]!;
    const enginePart = result.world.parts.find((part) => part.seriesIds.includes(fleet.engineSeriesId));
    const engineCohort = result.world.cohorts.find(
      (cohort) => cohort.fleetGroupId === fleet.id && cohort.partId === enginePart?.id,
    );
    expect(engineCohort?.quantity).toBe(fleet.count * fleet.enginesPerAircraft * (enginePart?.positions ?? 0));
  });

  it("runs the authored traffic shock with recovery bounds", () => {
    const result = runCampaign(defaultConfig({ seed: 79, ticks: 15, scenario: "prototype" }));
    expect(result.world.events.some((event) => event.kind === "traffic_shock" && event.payload.scenario === true)).toBe(true);
    expect(result.world.economy.traffic).toBeGreaterThanOrEqual(0.5);
  });

  it("keeps an overdue hard-time cohort grounded until replacement is fulfilled", () => {
    const state = createCampaign(defaultConfig({ seed: 80, ticks: 24 }));
    const cohort = state.world.cohorts.find((candidate) => {
      const part = state.world.parts.find((item) => item.id === candidate.partId);
      return part?.removalMode === "hardtime";
    })!;
    for (const unit of state.world.units) unit.listed = false;
    for (const firm of state.world.firms) {
      firm.buyingStrategy.enabled = false;
      firm.salesStrategy.reserveStock = 999;
    }
    for (let week = 0; week < 5; week++) advanceWeek(state);
    expect(cohort.overdue).toBe(true);
    expect(Math.min(cohort.remainingFh ?? Infinity, cohort.remainingFc ?? Infinity)).toBe(0);
    expect(cohort.replacementRfqId).not.toBeNull();
  });

  it("clears a scheduled due batch only after every due unit arrives", () => {
    const state = createCampaign(defaultConfig({ seed: 81, ticks: 24 }));
    const cohort = state.world.cohorts.find((candidate) => {
      const part = state.world.parts.find((item) => item.id === candidate.partId);
      return part?.removalMode === "hardtime";
    })!;
    cohort.overdue = true;
    cohort.dueQuantity = 2;
    cohort.deliveredQuantity = 0;
    completeScheduledReplacement(state.world, cohort.id, 999, 1);
    expect(cohort.overdue).toBe(true);
    expect(cohort.deliveredQuantity).toBe(1);
    completeScheduledReplacement(state.world, cohort.id, 999, 1);
    expect(cohort.overdue).toBe(false);
    expect(cohort.dueQuantity).toBe(0);
  });
});
