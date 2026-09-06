import { describe, expect, it } from "vitest";
import { createCampaign, defaultConfig } from "../src/sim/campaign.ts";
import { openWeek, queueCommand, resolveWeek } from "../src/sim/kernel.ts";
import { projectObservation } from "../src/sim/observation.ts";
import { createSnapshot, restoreSnapshot, serializeSnapshot } from "../src/sim/save.ts";
import { serviceable } from "../src/sim/util.ts";

describe("command-driven weekly kernel", () => {
  it("opens demand, auto-fulfills starter stock, and records a balanced ACC pulse", () => {
    const state = createCampaign(defaultConfig({ seed: 11, ticks: 24 }));
    const beforeStock = state.world.units.filter(
      (unit) => unit.ownerFirmId === "firm-0" && serviceable(unit.condition),
    ).length;

    openWeek(state);
    expect(state.phase).toBe("open");
    expect(state.world.rfqs.length).toBeGreaterThan(0);
    resolveWeek(state);

    const pulse = state.world.pulses.at(-1)!;
    expect(state.phase).toBe("resolved");
    expect(pulse.delta).toBe(pulse.sales + pulse.purchases + pulse.repair + pulse.logistics + pulse.overhead + pulse.penalties + pulse.contracts);
    expect(pulse.delta).toBeGreaterThan(0);
    expect(state.world.units.filter((unit) => unit.ownerFirmId === "firm-0" && serviceable(unit.condition)).length).toBeLessThan(beforeStock);
    expect(state.world.events.some((event) => event.kind === "deal_accepted")).toBe(true);
  });

  it("purchases an indivisible package through the command queue", () => {
    const state = createCampaign(defaultConfig({ seed: 17, ticks: 24 }));
    const listing = state.world.listings.find((candidate) => candidate.kind === "package")!;
    const before = state.world.firms[0]!.accBalance;
    const relationship = state.world.relationships.find(
      (candidate) => candidate.organizationId === listing.sellerOrganizationId,
    )!;
    const beforeRelationship = relationship.score;
    openWeek(state);
    queueCommand(state, "firm-0", {
      type: "purchase_listing",
      listingId: listing.id,
      destinationFacilityId: "fac-player-warehouse",
    });
    resolveWeek(state);

    expect(listing.status).toBe("sold");
    expect(state.world.firms[0]!.accBalance).not.toBe(before);
    expect(state.world.pulses.at(-1)!.purchases).toBeLessThan(0);
    expect(relationship.score).toBe(beforeRelationship + 4);
    const purchaseTransfer = state.world.transfers.find(
      (transfer) => transfer.purpose === "purchase" && transfer.relatedId === listing.id,
    );
    expect(purchaseTransfer?.assetIds.length).toBeGreaterThan(1);
  });

  it("round-trips state including RNG and pending commands", () => {
    const state = createCampaign(defaultConfig({ seed: 23, ticks: 24 }));
    openWeek(state);
    const listing = projectObservation(state).listings[0]!;
    queueCommand(state, "firm-0", {
      type: "purchase_listing",
      listingId: listing.id,
      destinationFacilityId: "fac-player-warehouse",
    });
    const restored = restoreSnapshot(serializeSnapshot(state, "2026-09-06T00:00:00.000Z"));
    expect(restored).toEqual(state);
    resolveWeek(state);
    resolveWeek(restored);
    expect(restored).toEqual(state);
  });

  it("rejects structurally incomplete version-one saves", () => {
    const state = createCampaign(defaultConfig({ seed: 29, ticks: 24 }));
    const parsed = JSON.parse(serializeSnapshot(state)) as { state: Record<string, unknown> };
    delete parsed.state.maxTicks;
    expect(() => restoreSnapshot(JSON.stringify(parsed))).toThrow();

    const missingCohorts = JSON.parse(serializeSnapshot(state)) as {
      state: { world: Record<string, unknown> };
    };
    delete missingCohorts.state.world.cohorts;
    expect(() => restoreSnapshot(JSON.stringify(missingCohorts))).toThrow();

    openWeek(state);
    const oldRfq = JSON.parse(serializeSnapshot(state)) as {
      state: { world: { rfqs: Record<string, unknown>[] } };
    };
    delete oldRfq.state.world.rfqs[0]!.pbhContractId;
    expect(() => restoreSnapshot(JSON.stringify(oldRfq))).toThrow();

    const missingEconomy = JSON.parse(serializeSnapshot(state)) as {
      state: { world: Record<string, unknown> };
    };
    delete missingEconomy.state.world.economy;
    expect(() => restoreSnapshot(JSON.stringify(missingEconomy))).toThrow();

    const missingNextId = JSON.parse(serializeSnapshot(state)) as {
      state: { world: Record<string, unknown> };
    };
    delete missingNextId.state.world.nextId;
    expect(() => restoreSnapshot(JSON.stringify(missingNextId))).toThrow();
  });

  it("migrates a structurally valid legacy format-one save to checksummed format two", () => {
    const state = createCampaign(defaultConfig({ seed: 30, ticks: 24 }));
    const legacy = JSON.parse(serializeSnapshot(state)) as {
      saveFormat: number;
      checksum?: string;
      state: { saveFormat: number };
    };
    legacy.saveFormat = 1;
    legacy.state.saveFormat = 1;
    delete legacy.checksum;
    const restored = restoreSnapshot(JSON.stringify(legacy));
    expect(restored.saveFormat).toBe(2);
    expect(restored.world).toEqual(state.world);
  });

  it("idempotently migrates older checksummed format-two snapshots", () => {
    const state = createCampaign(defaultConfig({ seed: 32, ticks: 24 }));
    const oldState = structuredClone(state);
    delete (oldState.world.cohorts[0] as unknown as Record<string, unknown>).deliveredQuantity;
    const restored = restoreSnapshot(JSON.stringify(createSnapshot(oldState)));
    expect(restored.world.cohorts[0]!.deliveredQuantity).toBe(0);
  });

  it("redacts private details for locked network nodes", () => {
    const state = createCampaign(defaultConfig({ seed: 31, ticks: 24 }));
    const listing = state.world.listings[0]!;
    listing.nodeId = "node-mro-fast";
    listing.exclusive = false;
    const observation = projectObservation(state);
    const locked = observation.nodes.find((node) => node.state === "locked");
    expect(locked).toBeDefined();
    expect(locked?.organizationId).toBe("locked");
    expect(locked?.facilityIds).toEqual([]);
    expect(locked?.hiddenDetail).toBe("");
    expect(observation.listings.some((candidate) => candidate.id === listing.id)).toBe(false);
    openWeek(state);
    queueCommand(state, "firm-0", {
      type: "purchase_listing",
      listingId: listing.id,
      destinationFacilityId: "fac-player-warehouse",
    });
    resolveWeek(state);
    expect(state.world.events.some(
      (event) => event.kind === "command_rejected" && event.payload.reason === "network_node_locked",
    )).toBe(true);
  });
});
