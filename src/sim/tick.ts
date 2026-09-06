import { openWeek, resolveWeek } from "./kernel.ts";
import type { Rng } from "./rng.ts";
import type { GameState, StandingPolicy, World } from "./types.ts";
import { navOf, serviceable } from "./util.ts";

/** Compatibility wrapper used by headless experiments. Live sessions use openWeek/resolveWeek. */
export function tick(
  world: World,
  rng: Rng,
  policies: Record<string, StandingPolicy>,
): void {
  const state: GameState = {
    saveFormat: 2,
    engineVersion: "0.2.0-prototype",
    maxTicks: world.tick + 1,
    rngState: rng.getState(),
    phase: "resolved",
    submissionSequence: world.nextId,
    pendingCommands: [],
    policies,
    world,
  };
  openWeek(state);
  resolveWeek(state);
  rng.setState(state.rngState);
}

export function inspectSnippet(
  world: World,
  target:
    | { kind: "part" | "airline" | "firm" | "facility" | "node" | "asset"; id: string },
): Record<string, unknown> {
  if (target.kind === "part") {
    const part = world.parts.find((candidate) => candidate.id === target.id);
    if (!part) return { error: "not_found" };
    const stock = world.units.filter((unit) => unit.partId === part.id);
    return {
      part: part.id,
      name: part.name,
      ata: part.ata,
      category: part.category,
      removalMode: part.removalMode,
      mtbrFh: part.mtbrFh,
      mtburFh: part.mtburFh,
      mtboFh: part.mtboFh,
      mrp: world.mrp[part.id],
      list: part.listPrice,
      removals: (world.removalHistory[part.id] ?? []).slice(-12),
      conditionSupply: Object.fromEntries(
        ["NE", "NS", "OH", "SV", "RP", "AR", "BER", "SCRAP"].map((condition) => [
          condition,
          stock.filter((unit) => unit.condition === condition).length,
        ]),
      ),
      applicableSeries: world.series
        .filter((series) => part.seriesIds.includes(series.id))
        .map((series) => series.name),
      regulatory: world.ads.filter((event) => event.partId === part.id),
    };
  }
  if (target.kind === "airline") {
    const airline = world.airlines.find((candidate) => candidate.id === target.id);
    if (!airline) return { error: "not_found" };
    return {
      airline: airline.name,
      health: airline.health,
      procurement: airline.procurement,
      fleetGroups: airline.fleetGroups,
      openRfqs: world.rfqs.filter((rfq) => rfq.airlineId === airline.id && rfq.filled < rfq.qty).length,
    };
  }
  if (target.kind === "facility") {
    const facility = world.facilities.find((candidate) => candidate.id === target.id);
    if (!facility) return { error: "not_found" };
    return {
      ...facility,
      assets: world.units.filter((unit) => unit.facilityId === facility.id).length,
      jobs: world.jobs.filter((job) => {
        const shop = world.shops.find((candidate) => candidate.id === job.shopId);
        return shop?.facilityId === facility.id;
      }),
    };
  }
  if (target.kind === "node") {
    const node = world.networkNodes.find((candidate) => candidate.id === target.id);
    if (!node) return { error: "not_found" };
    const relationship = world.relationships.find(
      (candidate) => candidate.organizationId === node.organizationId,
    );
    return {
      ...node,
      relationship,
      opportunities: world.opportunities.filter(
        (opportunity) => opportunity.nodeId === node.id && !opportunity.accepted,
      ),
      agreements: world.agreements.filter((agreement) => agreement.nodeId === node.id && agreement.active),
    };
  }
  if (target.kind === "asset") {
    const asset = world.units.find((candidate) => String(candidate.id) === target.id);
    if (!asset) return { error: "not_found" };
    const part = world.parts.find((candidate) => candidate.id === asset.partId);
    return {
      ...asset,
      partName: part?.name,
      mtbrFh: part?.mtbrFh,
      mtburFh: part?.mtburFh,
      mtboFh: part?.mtboFh,
      serviceable: serviceable(asset.condition),
    };
  }
  const firm = world.firms.find((candidate) => candidate.id === target.id);
  if (!firm) return { error: "not_found" };
  return {
    firm: firm.name,
    accBalance: firm.accBalance,
    nav: navOf(world, firm.id),
    fillRate: firm.rfqsSeen ? firm.rfqsFilled / firm.rfqsSeen : 0,
    units: world.units.filter((unit) => unit.ownerFirmId === firm.id).length,
    serviceableUnits: world.units.filter(
      (unit) => unit.ownerFirmId === firm.id && serviceable(unit.condition),
    ).length,
    globalReputation: firm.globalReputation,
    insolvent: firm.insolvent,
  };
}
