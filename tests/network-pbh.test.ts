import { describe, expect, it } from "vitest";
import { createCampaign, defaultConfig } from "../src/sim/campaign.ts";
import { openWeek, queueCommand, resolveWeek } from "../src/sim/kernel.ts";
import { updateNetworkReach } from "../src/sim/network.ts";
import { nextId } from "../src/sim/util.ts";
import { signPbhContract, settlePbhContracts } from "../src/sim/pbh.ts";
import { emptyPulseAccumulator } from "../src/sim/market.ts";

function qualifyForPbh(state: ReturnType<typeof createCampaign>): void {
  const contract = state.world.pbhContracts[0]!;
  const firm = state.world.firms[0]!;
  const airline = state.world.airlines.find((candidate) => candidate.id === contract.airlineId)!;
  const node = state.world.networkNodes.find(
    (candidate) => candidate.organizationId === airline.organizationId,
  )!;
  firm.globalReputation = 60;
  node.state = "partner";
  state.world.relationships.find(
    (relationship) => relationship.organizationId === airline.organizationId,
  )!.score = 60;
  state.world.agreements.push({
    id: nextId(state.world),
    nodeId: node.id,
    organizationId: airline.organizationId,
    kind: "preferred_vendor",
    startTick: state.world.tick,
    endTick: state.world.tick + 52,
    active: true,
    cadenceTicks: 4,
    nextTick: state.world.tick + 4,
    benefit: 0.12,
  });
}

describe("network progression and PBH", () => {
  it("signs a repeat network agreement through an accessible node", () => {
    const state = createCampaign(defaultConfig({ seed: 41, ticks: 24 }));
    const opportunity = state.world.opportunities.find(
      (candidate) => candidate.kind === "agreement" && candidate.nodeId === "node-factory",
    )!;
    state.world.relationships.find(
      (relationship) => relationship.organizationId === "org-maker",
    )!.score = 40;
    openWeek(state);
    queueCommand(state, "firm-0", {
      type: "sign_network_agreement",
      opportunityId: opportunity.id,
    });
    resolveWeek(state);
    expect(state.world.agreements).toHaveLength(1);
    expect(state.world.agreements[0]!.kind).toBe("supplier_allocation");
    expect(state.world.events.some((event) => event.kind === "network_agreement_signed")).toBe(true);
    openWeek(state);
    expect(state.world.listings.some((listing) => listing.title.startsWith("Allocated "))).toBe(true);
  });

  it("reveals a reputation-gated node without leaking it early", () => {
    const state = createCampaign(defaultConfig({ seed: 43, ticks: 24 }));
    const node = state.world.networkNodes.find((candidate) => candidate.id === "node-mro-fast")!;
    expect(node.state).toBe("locked");
    state.world.firms[0]!.globalReputation = node.reputationRequired;
    updateNetworkReach(state.world);
    expect(node.state).toBe("lead");
    updateNetworkReach(state.world);
    expect(node.state).toBe("lead");
    const introduction = state.world.opportunities.find(
      (opportunity) => opportunity.nodeId === node.id && opportunity.kind === "introduction",
    )!;
    openWeek(state);
    queueCommand(state, "firm-0", {
      type: "accept_network_opportunity",
      opportunityId: introduction.id,
    });
    resolveWeek(state);
    expect(node.state).toBe("known");
  });

  it("turns a preferred-vendor agreement into recurring buyer demand", () => {
    const state = createCampaign(defaultConfig({ seed: 45, ticks: 24 }));
    const opportunity = state.world.opportunities.find(
      (candidate) => candidate.kind === "agreement" && candidate.agreementKind === "preferred_vendor",
    )!;
    const node = state.world.networkNodes.find((candidate) => candidate.id === opportunity.nodeId)!;
    state.world.relationships.find(
      (relationship) => relationship.organizationId === node.organizationId,
    )!.score = 40;
    openWeek(state);
    queueCommand(state, "firm-0", {
      type: "sign_network_agreement",
      opportunityId: opportunity.id,
    });
    resolveWeek(state);
    openWeek(state);
    expect(state.world.events.some((event) => event.kind === "preferred_vendor_demand")).toBe(true);
  });

  it("signs PBH and applies steady ACC revenue", () => {
    const state = createCampaign(defaultConfig({ seed: 47, ticks: 24 }));
    const firm = state.world.firms[0]!;
    qualifyForPbh(state);
    const contract = state.world.pbhContracts[0]!;
    openWeek(state);
    queueCommand(state, firm.id, { type: "sign_pbh", contractId: contract.id });
    resolveWeek(state);
    expect(contract.status).toBe("active");

    openWeek(state);
    resolveWeek(state);
    expect(state.world.pulses.at(-1)!.contracts).toBeGreaterThanOrEqual(contract.minimumWeeklyRate);
  });

  it("keeps PBH behind the airline-partner and preferred-vendor ladder", () => {
    const state = createCampaign(defaultConfig({ seed: 48, ticks: 24 }));
    const contract = state.world.pbhContracts[0]!;
    state.world.firms[0]!.globalReputation = 100;
    expect(signPbhContract(state.world, "firm-0", contract.id)).toEqual({
      ok: false,
      reason: "reputation_or_relationship_too_low",
    });
    const airline = state.world.airlines.find((candidate) => candidate.id === contract.airlineId)!;
    const fleet = airline.fleetGroups[0]!;
    expect(contract.partIds.every((partId) => {
      const part = state.world.parts.find((candidate) => candidate.id === partId);
      return part?.seriesIds.includes(fleet.aircraftSeriesId) || part?.seriesIds.includes(fleet.engineSeriesId);
    })).toBe(true);
  });

  it("prevents another firm from activating the player contract and pays exactly 52 weeks", () => {
    const state = createCampaign(defaultConfig({ seed: 49, ticks: 100 }));
    const contract = state.world.pbhContracts[0]!;
    const rival = state.world.firms[1]!;
    rival.globalReputation = 100;
    expect(signPbhContract(state.world, rival.id, contract.id)).toEqual({
      ok: false,
      reason: "contract_unavailable",
    });

    contract.status = "active";
    contract.partIds = [];
    contract.startTick = 1;
    contract.endTick = 53;
    const firm = state.world.firms[0]!;
    const before = firm.accBalance;
    const airline = state.world.airlines.find((candidate) => candidate.id === contract.airlineId)!;
    const fleetHours = airline.fleetGroups
      .filter((fleet) => fleet.aircraftSeriesId === contract.seriesId)
      .reduce((sum, fleet) => sum + fleet.count * fleet.fhPerWeek, 0);
    const weeklyPayment = Math.round(Math.max(contract.minimumWeeklyRate, fleetHours * contract.ratePerFh));
    for (let tick = 1; tick <= 53; tick++) {
      state.world.tick = tick;
      settlePbhContracts(state.world, emptyPulseAccumulator());
    }
    expect(firm.accBalance - before).toBe(weeklyPayment * 52);
    expect(contract.status).toBe("completed");
  });

  it("charges ACC and reputation when covered availability misses the SLA", () => {
    const state = createCampaign(defaultConfig({ seed: 53, ticks: 24 }));
    const firm = state.world.firms[0]!;
    const contract = state.world.pbhContracts[0]!;
    const airline = state.world.airlines.find((candidate) => candidate.id === contract.airlineId)!;
    firm.globalReputation = 60;
    for (const unit of state.world.units) {
      if (unit.ownerFirmId === firm.id && contract.partIds.includes(unit.partId)) unit.ownerFirmId = null;
    }
    contract.status = "active";
    contract.startTick = 0;
    const relationship = state.world.relationships.find(
      (candidate) => candidate.organizationId === airline.organizationId,
    )!;
    const beforeRelationship = relationship.score;
    openWeek(state);
    state.world.rfqs.push({
      id: nextId(state.world),
      createdTick: state.world.tick,
      airlineId: airline.id,
      buyerOrganizationId: airline.organizationId,
      destinationFacilityId: airline.facilityId,
      partId: contract.partIds[0]!,
      kind: "oncondition",
      minCondition: "SV",
      qty: 1,
      maxPrice: 100_000,
      aog: true,
      expireTick: state.world.tick + 2,
      filled: 0,
      sourceCohortId: null,
      pbhContractId: null,
      pbhBreachRecorded: false,
      preferredFirmId: null,
    });
    resolveWeek(state);
    expect(contract.misses).toBe(0);
    openWeek(state);
    resolveWeek(state);
    expect(contract.misses).toBe(0);
    openWeek(state);
    resolveWeek(state);
    expect(contract.misses).toBeGreaterThan(0);
    expect(state.world.pulses.at(-1)!.penalties).toBe(-contract.penaltyPerMiss);
    expect(relationship.score).toBeLessThan(beforeRelationship);
    expect(state.world.events.some((event) => event.kind === "pbh_sla_miss")).toBe(true);
  });

  it("reserves covered demand from spot quotes and requires arrival inside the SLA", () => {
    const state = createCampaign(defaultConfig({ seed: 57, ticks: 24 }));
    const contract = state.world.pbhContracts[0]!;
    const firm = state.world.firms[0]!;
    const airline = state.world.airlines.find((candidate) => candidate.id === contract.airlineId)!;
    contract.status = "active";
    contract.startTick = 1;
    contract.endTick = 53;
    firm.globalReputation = 60;
    openWeek(state);
    const coveredUnit = state.world.units.find(
      (unit) =>
        unit.ownerFirmId === firm.id &&
        unit.partId === contract.partIds[0] &&
        unit.facilityId === firm.warehouseFacilityId,
    )!;
    const rfqId = nextId(state.world);
    state.world.rfqs.push({
      id: rfqId,
      createdTick: state.world.tick,
      airlineId: airline.id,
      buyerOrganizationId: airline.organizationId,
      destinationFacilityId: airline.facilityId,
      partId: coveredUnit.partId,
      kind: "oncondition",
      minCondition: "SV",
      qty: 1,
      maxPrice: 100_000,
      aog: false,
      expireTick: state.world.tick + 6,
      filled: 0,
      sourceCohortId: null,
      pbhContractId: null,
      pbhBreachRecorded: false,
      preferredFirmId: null,
    });
    queueCommand(state, firm.id, {
      type: "submit_quote",
      rfqId,
      unitIds: [coveredUnit.id],
      price: 100_000,
      tx: "outright",
    });
    resolveWeek(state);
    expect(state.world.events.some(
      (event) =>
        event.kind === "command_rejected" &&
        event.payload.reason === "rfq_reserved_for_pbh",
    )).toBe(true);
    expect(state.world.deals.some((deal) => deal.rfqId === rfqId)).toBe(false);

    const lateState = createCampaign(defaultConfig({ seed: 58, ticks: 24 }));
    const lateContract = lateState.world.pbhContracts[0]!;
    const lateFirm = lateState.world.firms[0]!;
    const lateAirline = lateState.world.airlines.find(
      (candidate) => candidate.id === lateContract.airlineId,
    )!;
    lateContract.status = "active";
    lateContract.startTick = 1;
    lateContract.endTick = 53;
    lateState.world.tick = 1;
    lateState.world.facilities.find(
      (facility) => facility.id === lateAirline.facilityId,
    )!.logisticsTatTicks = 8;
    const lateUnit = lateState.world.units.find(
      (unit) =>
        unit.ownerFirmId === lateFirm.id &&
        unit.partId === lateContract.partIds[0] &&
        unit.facilityId === lateFirm.warehouseFacilityId,
    )!;
    lateState.world.rfqs.push({
      id: nextId(lateState.world),
      createdTick: 1,
      airlineId: lateAirline.id,
      buyerOrganizationId: lateAirline.organizationId,
      destinationFacilityId: lateAirline.facilityId,
      partId: lateUnit.partId,
      kind: "oncondition",
      minCondition: "SV",
      qty: 1,
      maxPrice: 100_000,
      aog: true,
      expireTick: 6,
      filled: 0,
      sourceCohortId: null,
      pbhContractId: null,
      pbhBreachRecorded: false,
      preferredFirmId: null,
    });
    settlePbhContracts(lateState.world, emptyPulseAccumulator());
    expect(lateContract.misses).toBe(1);
    expect(lateState.world.events.some((event) => event.kind === "pbh_fulfilled")).toBe(false);
  });

  it("prevents a spot sale when PBH is signed in the same pulse", () => {
    const state = createCampaign(defaultConfig({ seed: 60, ticks: 24 }));
    const contract = state.world.pbhContracts[0]!;
    const firm = state.world.firms[0]!;
    const airline = state.world.airlines.find((candidate) => candidate.id === contract.airlineId)!;
    qualifyForPbh(state);
    openWeek(state);
    const unit = state.world.units.find(
      (candidate) =>
        candidate.ownerFirmId === firm.id &&
        contract.partIds.includes(candidate.partId) &&
        candidate.facilityId === firm.warehouseFacilityId,
    )!;
    const rfqId = nextId(state.world);
    state.world.rfqs.push({
      id: rfqId,
      createdTick: state.world.tick,
      airlineId: airline.id,
      buyerOrganizationId: airline.organizationId,
      destinationFacilityId: airline.facilityId,
      partId: unit.partId,
      kind: "oncondition",
      minCondition: "SV",
      qty: 1,
      maxPrice: 100_000,
      aog: false,
      expireTick: state.world.tick + 4,
      filled: 0,
      sourceCohortId: null,
      pbhContractId: null,
      pbhBreachRecorded: false,
      preferredFirmId: null,
    });
    queueCommand(state, firm.id, {
      type: "submit_quote",
      rfqId,
      unitIds: [unit.id],
      price: 100_000,
      tx: "outright",
    });
    queueCommand(state, firm.id, { type: "sign_pbh", contractId: contract.id });
    resolveWeek(state);
    expect(contract.status).toBe("active");
    expect(state.world.deals.some((deal) => deal.rfqId === rfqId)).toBe(false);
    expect(state.world.rfqs.find((rfq) => rfq.id === rfqId)?.pbhContractId).toBe(contract.id);
  });
});
