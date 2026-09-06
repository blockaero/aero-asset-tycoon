import { LOGISTICS_COST_PER_UNIT_TICK } from "./balance.ts";
import { adjustRelationship } from "./network.ts";
import type { PulseAccumulator } from "./market.ts";
import type { PbhContract, Transfer, Unit, World } from "./types.ts";
import { logisticsTat, meetsCondition, nextId, relationshipScore, serviceable } from "./util.ts";

export function signPbhContract(
  world: World,
  firmId: string,
  contractId: number,
): { ok: true; contract: PbhContract } | { ok: false; reason: string } {
  const firm = world.firms.find((candidate) => candidate.id === firmId);
  const contract = world.pbhContracts.find((candidate) => candidate.id === contractId);
  const airline = contract
    ? world.airlines.find((candidate) => candidate.id === contract.airlineId)
    : undefined;
  if (
    !firm ||
    !contract ||
    !airline ||
    contract.status !== "offered" ||
    contract.firmId !== firmId
  ) {
    return { ok: false, reason: "contract_unavailable" };
  }
  const airlineNode = world.networkNodes.find(
    (node) => node.organizationId === airline.organizationId,
  );
  const preferredAgreement = world.agreements.some(
    (agreement) =>
      agreement.active &&
      agreement.organizationId === airline.organizationId &&
      agreement.kind === "preferred_vendor",
  );
  if (
    firm.globalReputation < 50 ||
    relationshipScore(world, airline.organizationId) < 45 ||
    airlineNode?.state !== "partner" ||
    !preferredAgreement
  ) {
    return { ok: false, reason: "reputation_or_relationship_too_low" };
  }
  const covered = contract.partIds.every((partId) =>
    world.units.some(
      (unit) =>
        unit.ownerFirmId === firmId &&
        unit.facilityId === firm.warehouseFacilityId &&
        unit.partId === partId &&
        serviceable(unit.condition),
    ),
  );
  if (!covered) return { ok: false, reason: "insufficient_serviceable_coverage" };
  contract.status = "active";
  contract.startTick = world.tick;
  contract.endTick = world.tick + 52;
  world.events.push({
    tick: world.tick,
    kind: "pbh_signed",
    payload: {
      contractId,
      airlineId: airline.id,
      ratePerFh: contract.ratePerFh,
      minimumWeeklyRate: contract.minimumWeeklyRate,
    },
  });
  return { ok: true, contract };
}

export function settlePbhContracts(world: World, pulse: PulseAccumulator): void {
  reservePbhDemand(world);
  for (const contract of world.pbhContracts) {
    if (contract.status !== "active") continue;
    const firm = world.firms.find((candidate) => candidate.id === contract.firmId);
    const airline = world.airlines.find((candidate) => candidate.id === contract.airlineId);
    if (!firm || !airline || firm.insolvent) continue;
    if (world.tick >= contract.endTick) {
      contract.status = "completed";
      continue;
    }
    const fleetHours = airline.fleetGroups
      .filter((fleet) => fleet.aircraftSeriesId === contract.seriesId)
      .reduce((sum, fleet) => sum + fleet.count * fleet.fhPerWeek, 0) *
      world.economy.traffic;
    const payment = Math.round(
      Math.max(contract.minimumWeeklyRate, fleetHours * contract.ratePerFh),
    );
    firm.accBalance += payment;
    if (firm.id === "firm-0") pulse.contracts += payment;

    const covered = world.rfqs.filter(
      (rfq) =>
        rfq.airlineId === airline.id &&
        contract.partIds.includes(rfq.partId) &&
        rfq.filled < rfq.qty &&
        !rfq.pbhBreachRecorded &&
        (rfq.pbhContractId === null || rfq.pbhContractId === contract.id),
    );
    for (const rfq of covered) {
      rfq.pbhContractId = contract.id;
      const needed = rfq.qty - rfq.filled;
      const deadline = Math.min(rfq.expireTick, rfq.createdTick + contract.slaTicks);
      const tat = logisticsTat(world, firm.warehouseFacilityId, airline.facilityId);
      const units = world.units
        .filter(
          (unit): unit is Unit =>
            unit.ownerFirmId === firm.id &&
            unit.facilityId === firm.warehouseFacilityId &&
            unit.transferId === null &&
            unit.reservedForRfq === null &&
            serviceable(unit.condition) &&
            meetsCondition(unit.condition, rfq.minCondition) &&
            unit.partId === rfq.partId,
        )
        .slice(0, needed);
      if (units.length < needed || world.tick + tat > deadline) {
        if (world.tick < deadline && world.tick + tat <= deadline) continue;
        contract.misses += 1;
        const paidPenalty = Math.min(firm.accBalance, contract.penaltyPerMiss);
        firm.accBalance -= paidPenalty;
        if (firm.id === "firm-0") pulse.penalties -= paidPenalty;
        rfq.pbhBreachRecorded = true;
        rfq.filled = rfq.qty;
        adjustRelationship(world, airline.organizationId, -10, false);
        world.events.push({
          tick: world.tick,
          kind: "pbh_sla_miss",
          payload: {
            contractId: contract.id,
            rfqId: rfq.id,
            missing: needed - units.length,
            penalty: paidPenalty,
          },
        });
        if (contract.misses >= contract.maxMisses) {
          contract.status = "cancelled";
          world.events.push({
            tick: world.tick,
            kind: "pbh_cancelled",
            payload: { contractId: contract.id, misses: contract.misses },
          });
          break;
        }
        continue;
      }
      const logisticsCost = units.length * tat * LOGISTICS_COST_PER_UNIT_TICK;
      firm.accBalance -= logisticsCost;
      if (firm.id === "firm-0") pulse.logistics -= logisticsCost;
      const transferId = nextId(world);
      for (const unit of units) {
        unit.ownerFirmId = null;
        unit.ownerOrganizationId = airline.organizationId;
        unit.facilityId = null;
        unit.transferId = transferId;
        unit.listed = false;
      }
      const transfer: Transfer = {
        id: transferId,
        assetIds: units.map((unit) => unit.id),
        fromFacilityId: firm.warehouseFacilityId,
        toFacilityId: airline.facilityId,
        departTick: world.tick,
        arriveTick: world.tick + tat,
        purpose: "sale",
        relatedId: null,
        rfqId: rfq.id,
        cohortId:
          rfq.kind === "hardtime" || rfq.kind === "overhaul"
            ? rfq.sourceCohortId
            : null,
      };
      world.transfers.push(transfer);
      rfq.filled += units.length;
      firm.rfqsFilled += units.length;
      adjustRelationship(world, airline.organizationId, 3, true);
      world.events.push({
        tick: world.tick,
        kind: "pbh_fulfilled",
        payload: { contractId: contract.id, rfqId: rfq.id, qty: units.length, logisticsTat: tat },
      });
    }
  }
}

export function reservePbhDemand(world: World): void {
  for (const contract of world.pbhContracts) {
    if (contract.status !== "active") continue;
    for (const rfq of world.rfqs) {
      if (
        rfq.airlineId === contract.airlineId &&
        contract.partIds.includes(rfq.partId) &&
        rfq.filled < rfq.qty &&
        !rfq.pbhBreachRecorded
      ) {
        rfq.pbhContractId = contract.id;
      }
    }
  }
}
