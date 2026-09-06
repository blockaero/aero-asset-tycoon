import {
  AD_RUMOUR_BECOMES_AD,
  AOG_PREMIUM_MAX,
  AOG_PREMIUM_MIN,
  MRP_CEIL,
  MRP_FLOOR,
  MRP_K,
  MRP_THETA,
  SHOCK_P,
} from "./balance.ts";
import type { Rng } from "./rng.ts";
import { injectScenarioWeek } from "./scenarios.ts";
import type { DemandKind, RegulatoryEvent, Rfq, World } from "./types.ts";
import { mrpFor, nextId, serviceable } from "./util.ts";

type DemandHit = {
  airlineId: string;
  partId: string;
  kind: DemandKind;
  qty: number;
  aog: boolean;
  sourceCohortId: string | null;
  preferredFirmId?: string | null;
};

/** Catalog P/Ns represent a playable sample of the installed configuration. */
const CATALOG_EXPOSURE_SCALE = 0.035;

export function advanceDemandEnvironment(world: World, rng: Rng): void {
  injectScenarioWeek(world);
  stepEconomy(world, rng);
  driftReliability(world, rng);
  maybeRegulatoryEvent(world, rng);
}

function stepEconomy(world: World, rng: Rng): void {
  const economy = world.economy;
  economy.cyclePhase += (Math.PI * 2) / economy.cyclePeriod;
  const cycle = 0.02 * Math.sin(economy.cyclePhase);
  if (world.tick >= economy.shockUntil && rng.chance(SHOCK_P)) {
    economy.shockDepth = rng.float(0.05, 0.25);
    economy.shockStart = world.tick;
    economy.shockUntil = world.tick + rng.int(30, 90);
    world.events.push({
      tick: world.tick,
      kind: "traffic_shock",
      payload: { depth: economy.shockDepth, until: economy.shockUntil },
    });
  }
  let shock = 0;
  if (world.tick < economy.shockUntil) {
    const duration = Math.max(1, economy.shockUntil - economy.shockStart);
    const remaining = economy.shockUntil - world.tick;
    shock = -economy.shockDepth * (remaining / duration);
  }
  economy.traffic = Math.max(
    0.5,
    economy.traffic * (1 + economy.growth + cycle / 52 + shock / 52),
  );
}

function driftReliability(world: World, rng: Rng): void {
  for (const key of Object.keys(world.reliability.factor)) {
    const partId = key.split("|")[0]!;
    const part = world.parts.find((candidate) => candidate.id === partId);
    const step = part?.removalMode === "conditionmonitored" ? 0.06 : 0.03;
    const current = world.reliability.factor[key] ?? 1;
    world.reliability.factor[key] = Math.min(1.8, Math.max(0.4, current + rng.float(-step, step)));
  }
}

function maybeRegulatoryEvent(world: World, rng: Rng): void {
  world.ads = world.ads.filter(
    (event) =>
      event.rumourUntil >= world.tick ||
      (event.fireTick !== null && event.fireTick + event.window >= world.tick),
  );
  if (!rng.chance(0.02)) return;
  const candidates = world.parts.filter(
    (part) => part.category === "rotable" || part.category === "llp" || part.category === "repairable",
  );
  if (!candidates.length) return;
  const part = rng.pick(candidates);
  const seriesId = rng.pick(part.seriesIds);
  const kind = rng.chance(0.68) ? "ad" : "sb";
  const rumourUntil = world.tick + rng.int(3, 8);
  const fireTick =
    kind === "sb" || rng.chance(AD_RUMOUR_BECOMES_AD)
      ? rumourUntil
      : null;
  const event: RegulatoryEvent = {
    kind,
    partId: part.id,
    seriesId,
    rumourUntil,
    fireTick,
    window: kind === "ad" ? rng.int(8, 24) : rng.int(12, 36),
    severity: kind === "ad" && rng.chance(0.2) ? "terminating" : "minor",
    uptake: kind === "sb" ? rng.float(0.3, 0.6) : 1,
  };
  world.ads.push(event);
  world.events.push({
    tick: world.tick,
    kind: `${kind}_rumour`,
    payload: { partId: part.id, seriesId, fire: fireTick !== null },
  });
}

export function generateAndPostDemand(world: World, rng: Rng): Rfq[] {
  world.rfqs = world.rfqs.filter((rfq) => rfq.expireTick >= world.tick && rfq.filled < rfq.qty);
  const activeRfqIds = new Set(world.rfqs.map((rfq) => rfq.id));
  for (const cohort of world.cohorts) {
    const replacementInTransit =
      cohort.replacementRfqId !== null &&
      world.transfers.some((transfer) => transfer.rfqId === cohort.replacementRfqId);
    if (
      cohort.replacementRfqId !== null &&
      !activeRfqIds.has(cohort.replacementRfqId) &&
      !replacementInTransit
    ) {
      cohort.replacementRfqId = null;
      cohort.forecasted = false;
      cohort.dueQuantity = Math.max(0, cohort.dueQuantity - cohort.deliveredQuantity);
      cohort.deliveredQuantity = 0;
    }
  }
  const hits: DemandHit[] = [];

  for (const cohort of world.cohorts) {
    const airline = world.airlines.find((candidate) => candidate.id === cohort.airlineId);
    const fleet = airline?.fleetGroups.find((candidate) => candidate.id === cohort.fleetGroupId);
    const part = world.parts.find((candidate) => candidate.id === cohort.partId);
    if (!airline || !fleet || !part) continue;
    const utilization = world.economy.traffic;
    const fhWeek = fleet.fhPerWeek * utilization;
    const fcWeek = fleet.fcPerWeek * utilization;

    if (part.removalMode === "hardtime") {
      if (!cohort.overdue) {
        if (cohort.remainingFh !== null) cohort.remainingFh -= fhWeek;
        if (cohort.remainingFc !== null) cohort.remainingFc -= fcWeek;
      }
      const weeksFh = cohort.remainingFh === null ? Number.POSITIVE_INFINITY : cohort.remainingFh / Math.max(1, fhWeek);
      const weeksFc = cohort.remainingFc === null ? Number.POSITIVE_INFINITY : cohort.remainingFc / Math.max(1, fcWeek);
      const weeksRemaining = Math.min(weeksFh, weeksFc);
      if (!cohort.forecasted && weeksRemaining <= airline.planningHorizon) {
        const qty =
          cohort.dueQuantity ||
          Math.max(1, Math.min(4, Math.ceil(cohort.quantity * 0.025)));
        hits.push({
          airlineId: airline.id,
          partId: part.id,
          kind: "hardtime",
          qty,
          aog: weeksRemaining <= 0,
          sourceCohortId: cohort.id,
        });
        cohort.forecasted = true;
        cohort.dueQuantity = qty;
        cohort.deliveredQuantity = 0;
      }
      if (weeksRemaining <= 0) {
        if (!cohort.overdue) {
          world.events.push({
            tick: world.tick,
            kind: "hardtime_overdue",
            payload: { cohortId: cohort.id, partId: part.id, airlineId: airline.id },
          });
        }
        cohort.overdue = true;
        if (cohort.remainingFh !== null) cohort.remainingFh = 0;
        if (cohort.remainingFc !== null) cohort.remainingFc = 0;
      }
      continue;
    }

    if (cohort.remainingOverhaulFh !== null && part.mtboFh) {
      cohort.remainingOverhaulFh -= fhWeek;
      const weeksToOverhaul = cohort.remainingOverhaulFh / Math.max(1, fhWeek);
      if (!cohort.forecasted && weeksToOverhaul <= airline.planningHorizon) {
        const dueQuantity =
          cohort.dueQuantity ||
          Math.max(1, Math.min(3, Math.ceil(cohort.quantity * 0.02)));
        hits.push({
          airlineId: airline.id,
          partId: part.id,
          kind: "overhaul",
          qty: dueQuantity,
          aog: false,
          sourceCohortId: cohort.id,
        });
        cohort.forecasted = true;
        cohort.dueQuantity = dueQuantity;
        cohort.deliveredQuantity = 0;
      }
      if (weeksToOverhaul <= 0) {
        cohort.remainingOverhaulFh = 0;
      }
    }

    const applicableSeries = part.seriesIds.includes(fleet.aircraftSeriesId)
      ? fleet.aircraftSeriesId
      : fleet.engineSeriesId;
    const reliability = world.reliability.factor[`${part.id}|${applicableSeries}`] ?? 1;
    const lambda = Math.min(
      3,
      ((cohort.quantity * fhWeek) / ((part.mtburFh ?? part.mtbrFh) * reliability)) *
        CATALOG_EXPOSURE_SCALE,
    );
    const qty = rng.poisson(lambda);
    if (qty > 0) {
      const available = world.units.filter(
        (unit) => unit.partId === part.id && isMarketAvailable(world, unit),
      ).length;
      const thin = available < qty + 2;
      hits.push({
        airlineId: airline.id,
        partId: part.id,
        kind: part.removalMode,
        qty: Math.min(6, qty),
        aog: thin ? rng.chance(0.28) : rng.chance(0.06),
        sourceCohortId: cohort.id,
      });
    }
  }

  for (const event of world.ads) {
    if (event.fireTick === null || world.tick !== event.fireTick) continue;
    for (const airline of world.airlines) {
      const applies = airline.fleetGroups.some(
        (fleet) =>
          fleet.aircraftSeriesId === event.seriesId ||
          fleet.engineSeriesId === event.seriesId,
      );
      if (!applies) continue;
      const fleetSize = airline.fleetGroups.reduce((sum, fleet) => sum + fleet.count, 0);
      const base = event.severity === "terminating" ? Math.max(1, Math.ceil(fleetSize * 0.08)) : 1;
      const qty = Math.min(6, Math.max(1, Math.round(base * event.uptake)));
      hits.push({
        airlineId: airline.id,
        partId: event.partId,
        kind: event.kind,
        qty,
        aog: event.kind === "ad" && rng.chance(event.severity === "terminating" ? 0.55 : 0.25),
        sourceCohortId: null,
      });
    }
  }

  // Authored opening pulse: starter stock demonstrates automatic fulfillment immediately.
  if (world.tick === 1) {
    const starter = world.units.find(
      (unit) => unit.ownerFirmId === "firm-0" && serviceable(unit.condition),
    );
    const airline = world.airlines[0];
    if (starter && airline) {
      hits.unshift({
        airlineId: airline.id,
        partId: starter.partId,
        kind: "oncondition",
        qty: 1,
        aog: false,
        sourceCohortId: null,
        preferredFirmId: "firm-0",
      });
    }
  }
  if (world.scenario === "prototype" && world.tick === 2) {
    const part = world.parts.find((candidate) => candidate.removalMode === "conditionmonitored");
    const airline = world.airlines[0];
    if (part && airline) {
      hits.unshift({
        airlineId: airline.id,
        partId: part.id,
        kind: "conditionmonitored",
        qty: 1,
        aog: true,
        sourceCohortId: null,
      });
    }
  }

  const posted: Rfq[] = [];
  for (const hit of coalesceHits(hits)) {
    const airline = world.airlines.find((candidate) => candidate.id === hit.airlineId);
    const part = world.parts.find((candidate) => candidate.id === hit.partId);
    if (!airline || !part) continue;
    const minimum = airline.procurement === "cost_driven" ? "SV" : "OH";
    const aogPremium = hit.aog ? rng.float(AOG_PREMIUM_MIN, AOG_PREMIUM_MAX) : 1;
    const posture = airline.procurement === "oem_loyal" ? 1.08 : airline.procurement === "cost_driven" ? 0.94 : 1;
    const rfq: Rfq = {
      id: nextId(world),
      createdTick: world.tick,
      airlineId: airline.id,
      buyerOrganizationId: airline.organizationId,
      destinationFacilityId: airline.facilityId,
      partId: part.id,
      kind: hit.kind,
      minCondition: minimum,
      qty: hit.qty,
      maxPrice: Math.round(mrpFor(world, part.id) * posture * aogPremium),
      aog: hit.aog,
      expireTick:
        world.tick +
        (hit.aog
          ? 2
          : hit.kind === "hardtime" || hit.kind === "overhaul"
            ? airline.planningHorizon
            : 4),
      filled: 0,
      sourceCohortId: hit.sourceCohortId,
      pbhContractId: null,
      pbhBreachRecorded: false,
      preferredFirmId: hit.preferredFirmId ?? null,
    };
    world.rfqs.push(rfq);
    if ((hit.kind === "hardtime" || hit.kind === "overhaul") && hit.sourceCohortId) {
      const cohort = world.cohorts.find((candidate) => candidate.id === hit.sourceCohortId);
      if (cohort) cohort.replacementRfqId = rfq.id;
    }
    posted.push(rfq);
    for (const firm of world.firms) {
      const node = world.networkNodes.find(
        (candidate) => candidate.organizationId === airline.organizationId,
      );
      if (firm.id !== "firm-0" || node?.state !== "locked") firm.rfqsSeen += rfq.qty;
    }
    const history = world.removalHistory[part.id] ?? [];
    history.push(hit.qty);
    if (history.length > 52) history.shift();
    world.removalHistory[part.id] = history;
    world.events.push({
      tick: world.tick,
      kind: "demand_posted",
      payload: {
        rfqId: rfq.id,
        partId: part.id,
        airlineId: airline.id,
        demandKind: hit.kind,
        aog: hit.aog,
        qty: hit.qty,
      },
    });
  }
  return posted;
}

export function completeScheduledReplacement(
  world: World,
  cohortId: string,
  rfqId: number | null,
  deliveredQuantity: number,
): void {
  const cohort = world.cohorts.find((candidate) => candidate.id === cohortId);
  const part = cohort ? world.parts.find((candidate) => candidate.id === cohort.partId) : undefined;
  if (!cohort || !part) return;
  cohort.deliveredQuantity += deliveredQuantity;
  if (cohort.deliveredQuantity < cohort.dueQuantity) return;
  if (part.removalMode === "hardtime") {
    const batches = Math.max(1, Math.ceil(cohort.quantity / Math.max(1, cohort.dueQuantity)));
    cohort.remainingFh = part.lifeLimitFh === null ? null : part.lifeLimitFh / batches;
    cohort.remainingFc = part.lifeLimitFc === null ? null : part.lifeLimitFc / batches;
  } else if (part.mtboFh) {
    const batches = Math.max(1, Math.ceil(cohort.quantity / Math.max(1, cohort.dueQuantity)));
    cohort.remainingOverhaulFh = part.mtboFh / batches;
  }
  cohort.forecasted = false;
  cohort.overdue = false;
  cohort.replacementRfqId = null;
  cohort.dueQuantity = 0;
  cohort.deliveredQuantity = 0;
  world.events.push({
    tick: world.tick,
    kind: "scheduled_replacement_complete",
    payload: { cohortId: cohort.id, partId: part.id, rfqId },
  });
}

function coalesceHits(hits: DemandHit[]): DemandHit[] {
  const map = new Map<string, DemandHit>();
  for (const hit of hits) {
    const key = `${hit.airlineId}|${hit.partId}|${hit.kind}|${hit.aog}|${hit.preferredFirmId ?? ""}`;
    const current = map.get(key);
    if (current) current.qty = Math.min(8, current.qty + hit.qty);
    else map.set(key, { ...hit });
  }
  return [...map.values()];
}

export function updateMarketReferencePrices(world: World, rfqs: Rfq[]): void {
  const demandByPart: Record<string, number> = {};
  for (const rfq of rfqs) {
    demandByPart[rfq.partId] = (demandByPart[rfq.partId] ?? 0) + rfq.qty;
  }
  for (const part of world.parts) {
    const demand = demandByPart[part.id] ?? 0;
    const supply = world.units.filter(
      (unit) => unit.partId === part.id && isMarketAvailable(world, unit),
    ).length;
    const previous = world.mrp[part.id] ?? part.listPrice;
    const flow = 1 + MRP_K * ((demand - supply) / (supply + 1));
    const raw = previous * flow * (1 - MRP_THETA) + part.listPrice * MRP_THETA;
    world.mrp[part.id] = Math.round(
      Math.min(part.listPrice * MRP_CEIL, Math.max(part.listPrice * MRP_FLOOR, raw)),
    );
  }
}

function isMarketAvailable(world: World, unit: World["units"][number]): boolean {
  if (
    unit.ownerFirmId === null ||
    unit.facilityId === null ||
    unit.transferId !== null ||
    !unit.listed ||
    !serviceable(unit.condition)
  ) {
    return false;
  }
  return world.facilities.some(
    (facility) => facility.id === unit.facilityId && facility.kind === "warehouse",
  );
}
