import { describe, expect, it } from "vitest";
import { createCampaign, defaultConfig } from "../src/sim/campaign.ts";
import { advanceWeek, openWeek, queueCommand, resolveWeek } from "../src/sim/kernel.ts";
import { nextId } from "../src/sim/util.ts";

describe("asset market and facility loop", () => {
  it("moves an AR asset through logistics, repair TAT, and back to the warehouse", () => {
    const state = createCampaign(defaultConfig({ seed: 59, ticks: 24 }));
    const asset = state.world.units.find(
      (unit) => unit.ownerFirmId === "firm-0" && unit.condition === "AR",
    )!;
    const shop = state.world.shops.find((candidate) => candidate.id === "shop-fast")!;
    shop.failP = 0;
    state.world.networkNodes.find((node) => node.id === "node-mro-fast")!.state = "known";
    const relationship = state.world.relationships.find(
      (candidate) => candidate.organizationId === shop.organizationId,
    )!;
    const beforeRelationship = relationship.score;

    openWeek(state);
    queueCommand(state, "firm-0", {
      type: "send_to_shop",
      assetId: asset.id,
      shopId: shop.id,
      workscope: "oh",
    });
    resolveWeek(state);
    expect(asset.transferId).not.toBeNull();
    expect(state.world.jobs).toHaveLength(1);

    for (let i = 0; i < 12 && asset.facilityId !== "fac-player-warehouse"; i++) {
      advanceWeek(state);
    }
    expect(asset.facilityId).toBe("fac-player-warehouse");
    expect(asset.condition).toBe("OH");
    expect(asset.tsr).toBe(0);
    expect(asset.csr).toBe(0);
    expect(asset.listed).toBe(true);
    expect(relationship.score).toBe(beforeRelationship + 4);
  });

  it("makes an overextended organization insolvent through weekly costs", () => {
    const state = createCampaign(defaultConfig({ seed: 61, ticks: 24 }));
    state.world.firms[0]!.accBalance = 1;
    state.world.firms[0]!.salesStrategy.reserveStock = 999;
    openWeek(state);
    resolveWeek(state);
    expect(state.world.firms[0]!.insolvent).toBe(true);
    expect(state.world.firms[0]!.accBalance).toBe(0);
    const pulse = state.world.pulses.at(-1)!;
    expect(pulse.overhead).toBeLessThan(0);
    expect(pulse.delta).toBe(pulse.sales + pulse.purchases + pulse.repair + pulse.logistics + pulse.overhead + pulse.penalties + pulse.contracts);
  });

  it("keeps unavailable assets out of automatic fulfillment", () => {
    const state = createCampaign(defaultConfig({ seed: 67, ticks: 24 }));
    const unit = state.world.units.find(
      (candidate) => candidate.ownerFirmId === "firm-0" && candidate.condition === "OH",
    )!;
    unit.facilityId = null;
    unit.transferId = 9999;
    openWeek(state);
    resolveWeek(state);
    const sold = state.world.events.some(
      (event) => event.kind === "deal_accepted" && event.payload.firmId === "firm-0",
    );
    // Other available starter stock may sell, but the in-transit unit cannot.
    expect(unit.ownerFirmId).toBe("firm-0");
    expect(unit.transferId).toBe(9999);
    expect(typeof sold).toBe("boolean");
  });

  it("rejects duplicate IDs and wrong-P/N asset substitution in quotes", () => {
    const state = createCampaign(defaultConfig({ seed: 69, ticks: 24 }));
    openWeek(state);
    const rfq = state.world.rfqs[0]!;
    const wrong = state.world.units.find(
      (unit) => unit.ownerFirmId === "firm-0" && unit.partId !== rfq.partId,
    )!;
    expect(() => queueCommand(state, "firm-0", {
      type: "submit_quote",
      rfqId: rfq.id,
      unitIds: [wrong.id, wrong.id],
      price: Math.min(1_000, rfq.maxPrice),
      tx: "outright",
    })).toThrow();
    queueCommand(state, "firm-0", {
      type: "submit_quote",
      rfqId: rfq.id,
      unitIds: [wrong.id],
      price: Math.min(1_000, rfq.maxPrice),
      tx: "outright",
    });
    resolveWeek(state);
    expect(state.world.events.some(
      (event) =>
        event.kind === "command_rejected" &&
        event.payload.reason === "no_eligible_assets",
    )).toBe(true);
    expect(wrong.ownerFirmId).toBe("firm-0");
  });

  it("holds a returning asset in transit when warehouse capacity is full", () => {
    const state = createCampaign(defaultConfig({ seed: 70, ticks: 24 }));
    const warehouse = state.world.facilities.find(
      (facility) => facility.id === "fac-player-warehouse",
    )!;
    const asset = state.world.units.find((unit) => unit.ownerFirmId === "firm-0")!;
    asset.facilityId = null;
    const occupied = state.world.units.filter(
      (unit) => unit.facilityId === warehouse.id,
    ).length;
    warehouse.capacity = occupied;
    const transferId = nextId(state.world);
    asset.transferId = transferId;
    state.world.transfers.push({
      id: transferId,
      assetIds: [asset.id],
      fromFacilityId: "fac-repair-mid",
      toFacilityId: warehouse.id,
      departTick: 0,
      arriveTick: 1,
      purpose: "repair_return",
      relatedId: null,
      rfqId: null,
      cohortId: null,
    });
    openWeek(state);
    expect(asset.facilityId).toBeNull();
    expect(asset.transferId).toBe(transferId);
    expect(state.world.events.some((event) => event.kind === "transfer_capacity_delay")).toBe(true);
  });

  it("uses source/category condition rules and restricts exchange eligibility", () => {
    const state = createCampaign(defaultConfig({ seed: 72, ticks: 24 }));
    const factoryListings = state.world.listings.filter(
      (listing) => listing.sellerOrganizationId === "org-maker",
    );
    expect(factoryListings.length).toBeGreaterThan(0);
    expect(factoryListings.every((listing) =>
      listing.items.every((item) => item.condition === "NE" || item.condition === "NS"),
    )).toBe(true);

    openWeek(state);
    const nonRepairable = state.world.parts.find((part) => !part.repairable)!;
    const rfq = state.world.rfqs[0]!;
    rfq.partId = nonRepairable.id;
    const unit = state.world.units.find((candidate) => candidate.ownerFirmId === "firm-0")!;
    unit.partId = nonRepairable.id;
    queueCommand(state, "firm-0", {
      type: "submit_quote",
      rfqId: rfq.id,
      unitIds: [unit.id],
      price: Math.min(1_000, rfq.maxPrice),
      tx: "exchange",
    });
    resolveWeek(state);
    expect(state.world.events.some(
      (event) => event.kind === "command_rejected" && event.payload.reason === "exchange_not_eligible",
    )).toBe(true);
  });
});
