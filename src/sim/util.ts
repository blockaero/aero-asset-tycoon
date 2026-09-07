import { CONDITION_MULT } from "./balance.ts";
import type { Condition, NetworkOpportunity, PartMaster, Trace, World } from "./types.ts";

export function nextId(world: World): number {
  const id = world.nextId;
  world.nextId += 1;
  return id;
}

export function reliabilityKey(partId: string, seriesId: string): string {
  return `${partId}|${seriesId}`;
}

export function anchorPrice(part: PartMaster, condition: Condition, _trace: Trace = "none"): number {
  return Math.round(part.listPrice * CONDITION_MULT[condition]);
}

export function mrpFor(world: World, partId: string): number {
  return world.mrp[partId] ?? world.parts.find((part) => part.id === partId)?.listPrice ?? 0;
}

export function navOf(world: World, firmId: string): number {
  const firm = world.firms.find((candidate) => candidate.id === firmId);
  if (!firm) return 0;
  let inventory = 0;
  for (const unit of world.units) {
    if (unit.ownerFirmId !== firmId) continue;
    const part = world.parts.find((candidate) => candidate.id === unit.partId);
    if (!part) continue;
    const age = Math.max(0, world.tick - unit.acquiredTick);
    const recentDemand = (world.removalHistory[part.id] ?? [])
      .slice(-12)
      .reduce((sum, quantity) => sum + quantity, 0);
    let liquidityHaircut = 1;
    if (recentDemand === 0 && age > 12) liquidityHaircut = 0.8;
    if (age > 26) liquidityHaircut = Math.min(liquidityHaircut, 0.75);
    if (age > 52) liquidityHaircut = Math.min(liquidityHaircut, 0.55);
    inventory += anchorPrice(part, unit.condition) * liquidityHaircut;
  }
  return firm.accBalance + inventory - firm.debt;
}

export function conditionRank(condition: Condition): number {
  const rank: Record<Condition, number> = {
    NE: 0,
    NS: 0,
    OH: 1,
    SV: 2,
    RP: 2,
    AR: 3,
    BER: 4,
    SCRAP: 5,
  };
  return rank[condition];
}

export function meetsCondition(have: Condition, minimum: Condition): boolean {
  return conditionRank(have) <= conditionRank(minimum);
}

export function serviceable(condition: Condition): boolean {
  return ["NE", "NS", "OH", "SV", "RP"].includes(condition);
}

export function formatAcc(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 1_000_000) return `${(rounded / 1_000_000).toFixed(1)}M`;
  if (Math.abs(rounded) >= 10_000) return `${Math.round(rounded / 1000)}K`;
  return rounded.toLocaleString("en-US");
}

export function relationshipScore(world: World, organizationId: string): number {
  return world.relationships.find((relationship) => relationship.organizationId === organizationId)?.score ?? 0;
}

export function logisticsTat(world: World, fromFacilityId: string, toFacilityId: string): number {
  const from = world.facilities.find((facility) => facility.id === fromFacilityId);
  const to = world.facilities.find((facility) => facility.id === toFacilityId);
  return Math.max(1, Math.round(((from?.logisticsTatTicks ?? 1) + (to?.logisticsTatTicks ?? 1)) / 2));
}

type OpportunityCore = Omit<
  NetworkOpportunity,
  "timeCost" | "rcCost" | "accCost" | "ataFocus" | "easterEgg" | "reward"
> &
  Partial<
    Pick<NetworkOpportunity, "timeCost" | "rcCost" | "accCost" | "ataFocus" | "easterEgg" | "reward">
  >;

/**
 * Fills the v2 opportunity fields so the hand-authored core world can keep using
 * short literals. Defaults are free: an opportunity costs nothing until the code
 * that creates it says otherwise.
 */
export function completeOpportunity(partial: OpportunityCore): NetworkOpportunity {
  return {
    ...partial,
    timeCost: partial.timeCost ?? 0,
    rcCost: partial.rcCost ?? 0,
    accCost: partial.accCost ?? 0,
    ataFocus: partial.ataFocus ?? [],
    easterEgg: partial.easterEgg ?? false,
    reward: partial.reward ?? "",
  };
}
