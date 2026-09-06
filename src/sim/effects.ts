/**
 * The one place Tribal Knowledge and Team turn into numbers.
 *
 * Both sources speak the same KnowledgeEffect vocabulary, so they are unioned and
 * resolved together. Effects of the same kind compound with diminishing returns rather
 * than stacking linearly, so no combination of certifications and hires runs away.
 */

import { ataAffinityBonus } from "./ata.ts";
import { completedEffects } from "./knowledge.ts";
import { teamEffects } from "./team.ts";
import type {
  AssetClass,
  FacilityKind,
  KnowledgeEffect,
  KnowledgeProgress,
  RegionCode,
  TeamMember,
} from "./types.ts";

export type CompanyModifiers = {
  /** 0..0.35 off the anchor price when buying in this chapter. */
  buyDiscount: (ata: number, assetClass?: AssetClass) => number;
  /** 0..0.35 above the anchor price when selling in this chapter. */
  sellPremium: (ata: number, assetClass?: AssetClass) => number;
  /** 0.55..1 multiplier on shop turn time in this chapter. Lower is faster. */
  repairTat: (ata: number) => number;
  berAccuracy: number;
  /** 0.6..1 multiplier on logistics cost. */
  logisticsCost: number;
  warehouseCapacity: number;
  quoteQuality: number;
  buyerCeiling: number;
  intel: number;
  eventAccess: number;
  teamCap: number;
  timeIncome: number;
  rcIncome: number;
  unlockedRegions: Set<RegionCode>;
  unlockedFacilityKinds: Set<FacilityKind>;
};

const CAPS = {
  buyDiscount: 0.35,
  sellPremium: 0.35,
  repairTat: 0.45, // maximum reduction, so the multiplier floors at 0.55
  berAccuracy: 1,
  logisticsCost: 0.4, // maximum reduction, so the multiplier floors at 0.6
  quoteQuality: 1,
  buyerCeiling: 1,
  intel: 1,
  eventAccess: 1,
} as const;

/**
 * Diminishing returns. Two 20% effects give 36%, not 40%, and no number of effects
 * can exceed the cap.
 */
function compound(values: number[], cap: number): number {
  let remaining = 1;
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) continue;
    remaining *= 1 - Math.min(1, value);
  }
  return Math.min(cap, 1 - remaining);
}

type Scoped = { value: number; ata?: number; assetClass?: AssetClass };

function scopedLookup(
  entries: Scoped[],
  cap: number,
): (ata: number, assetClass?: AssetClass) => number {
  // Precompute the unscoped baseline once; per-chapter work stays small.
  const global = entries.filter((entry) => entry.ata === undefined);
  return (ata: number, assetClass?: AssetClass) => {
    const values: number[] = [];
    for (const entry of global) {
      if (entry.assetClass && assetClass && entry.assetClass !== assetClass) continue;
      values.push(entry.value);
    }
    for (const entry of entries) {
      if (entry.ata === undefined) continue;
      if (entry.assetClass && assetClass && entry.assetClass !== assetClass) continue;
      // A neighbouring chapter in the same ATA group still helps, just less.
      const affinity = ataAffinityBonus([entry.ata], ata);
      if (affinity > 0) values.push(entry.value * affinity);
    }
    return compound(values, cap);
  };
}

export function resolveModifiers(
  knowledge: KnowledgeProgress[],
  team: TeamMember[],
): CompanyModifiers {
  const effects: KnowledgeEffect[] = [...completedEffects(knowledge), ...teamEffects(team)];

  const buy: Scoped[] = [];
  const sell: Scoped[] = [];
  const tat: Scoped[] = [];
  const ber: number[] = [];
  const logistics: number[] = [];
  const quote: number[] = [];
  const ceiling: number[] = [];
  const intel: number[] = [];
  const events: number[] = [];
  let warehouseCapacity = 0;
  let teamCap = 0;
  let timeIncome = 0;
  let rcIncome = 0;
  const unlockedRegions = new Set<RegionCode>();
  const unlockedFacilityKinds = new Set<FacilityKind>();

  for (const effect of effects) {
    switch (effect.kind) {
      case "buy_discount":
        buy.push({ value: effect.value, ata: effect.ata, assetClass: effect.assetClass });
        break;
      case "sell_premium":
        sell.push({ value: effect.value, ata: effect.ata, assetClass: effect.assetClass });
        break;
      case "repair_tat":
        tat.push({ value: effect.value, ata: effect.ata });
        break;
      case "ber_accuracy":
        ber.push(effect.value);
        break;
      case "logistics_cost":
        logistics.push(effect.value);
        break;
      case "quote_quality":
        quote.push(effect.value);
        break;
      case "buyer_ceiling":
        ceiling.push(effect.value);
        break;
      case "intel":
        intel.push(effect.value);
        break;
      case "event_access":
        events.push(effect.value);
        break;
      case "warehouse_capacity":
        warehouseCapacity += effect.value;
        break;
      case "team_cap":
        teamCap += effect.value;
        break;
      case "time_income":
        timeIncome += effect.value;
        break;
      case "rc_income":
        rcIncome += effect.value;
        break;
      case "reach_region":
        unlockedRegions.add(effect.regionCode);
        break;
      case "unlock_facility":
        unlockedFacilityKinds.add(effect.facilityKind);
        break;
    }
  }

  const tatLookup = scopedLookup(tat, CAPS.repairTat);

  return {
    buyDiscount: scopedLookup(buy, CAPS.buyDiscount),
    sellPremium: scopedLookup(sell, CAPS.sellPremium),
    repairTat: (ata: number) => 1 - tatLookup(ata),
    berAccuracy: compound(ber, CAPS.berAccuracy),
    logisticsCost: 1 - compound(logistics, CAPS.logisticsCost),
    warehouseCapacity: Math.max(0, Math.round(warehouseCapacity)),
    quoteQuality: compound(quote, CAPS.quoteQuality),
    buyerCeiling: compound(ceiling, CAPS.buyerCeiling),
    intel: compound(intel, CAPS.intel),
    eventAccess: compound(events, CAPS.eventAccess),
    teamCap: Math.max(0, Math.round(teamCap)),
    timeIncome,
    rcIncome,
    unlockedRegions,
    unlockedFacilityKinds,
  };
}

/** The no-knowledge, no-team baseline. Every function here is a true no-op. */
export const EMPTY_MODIFIERS: CompanyModifiers = {
  buyDiscount: () => 0,
  sellPremium: () => 0,
  repairTat: () => 1,
  berAccuracy: 0,
  logisticsCost: 1,
  warehouseCapacity: 0,
  quoteQuality: 0,
  buyerCeiling: 0,
  intel: 0,
  eventAccess: 0,
  teamCap: 0,
  timeIncome: 0,
  rcIncome: 0,
  unlockedRegions: new Set<RegionCode>(),
  unlockedFacilityKinds: new Set<FacilityKind>(),
};

/** Only the modifiers that actually differ from baseline, ready for the UI. */
export function describeModifiers(
  mods: CompanyModifiers,
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  if (mods.berAccuracy > 0) out.push({ label: "BER call accuracy", value: `+${percent(mods.berAccuracy)}` });
  if (mods.logisticsCost < 1) {
    out.push({ label: "Logistics cost", value: `-${percent(1 - mods.logisticsCost)}` });
  }
  if (mods.warehouseCapacity > 0) {
    out.push({ label: "Warehouse capacity", value: `+${mods.warehouseCapacity} units` });
  }
  if (mods.quoteQuality > 0) out.push({ label: "Quote quality", value: `+${percent(mods.quoteQuality)}` });
  if (mods.buyerCeiling > 0) out.push({ label: "Buyers reachable", value: `+${percent(mods.buyerCeiling)}` });
  if (mods.intel > 0) out.push({ label: "Market intelligence", value: percent(mods.intel) });
  if (mods.eventAccess > 0) out.push({ label: "Event access", value: percent(mods.eventAccess) });
  if (mods.teamCap > 0) out.push({ label: "Extra team seats", value: `+${mods.teamCap}` });
  if (mods.timeIncome > 0) out.push({ label: "Founder hours", value: `+${Math.round(mods.timeIncome)}/wk` });
  if (mods.rcIncome > 0) {
    out.push({ label: "Relationship capital", value: `+${Math.round(mods.rcIncome)}/wk` });
  }
  if (mods.unlockedRegions.size > 0) {
    out.push({ label: "Regions opened", value: [...mods.unlockedRegions].join(", ") });
  }
  if (mods.unlockedFacilityKinds.size > 0) {
    out.push({ label: "Facility types opened", value: [...mods.unlockedFacilityKinds].join(", ") });
  }
  return out;
}
