/**
 * The statistical global market.
 *
 * There are roughly 100,000,000 high-value serialized assets in the world fleet. The
 * engine does not simulate them. It holds COHORTS — one slice per region, ATA chapter,
 * asset class and owner type — and only materialises serialized units where the player
 * can actually trade. That is what makes the fog of war affordable.
 *
 * The baseline trend is +6% growth and -2% retirement a year. Shocks push the price and
 * demand indices off that baseline and then decay, and seasonality rides on top, so
 * buying into a trough and holding into a peak is a real strategy.
 */

import { ATA_CHAPTERS, ataAssetClass } from "./ata.ts";
import { calendarFor } from "./calendar.ts";
import { REGION_CODES, region } from "./geography.ts";
import type { Rng } from "./rng.ts";
import type {
  Condition,
  GlobalMarket,
  MarketCohort,
  MarketShock,
  MarketShockKind,
  OrganizationKind,
  RegionCode,
} from "./types.ts";

/** The narrative world total the game talks about. */
export const GLOBAL_ASSET_BASELINE = 100_000_000;
/** The scaled serialized universe the engine actually tracks. */
export const VISIBLE_ASSET_TARGET = 40_000;
export const SCALE_FACTOR = GLOBAL_ASSET_BASELINE / VISIBLE_ASSET_TARGET;

/** Turn a tracked count into the narrative global figure it stands in for. */
export function toWorldScale(count: number): number {
  return Math.round(count * SCALE_FACTOR);
}

const OWNER_KINDS: OrganizationKind[] = ["airline", "mro", "lessor", "manufacturer", "broker"];
const OWNER_WEIGHT: Record<string, number> = {
  airline: 0.52,
  mro: 0.18,
  lessor: 0.17,
  manufacturer: 0.08,
  broker: 0.05,
};

/** Only chapters that carry real aftermarket value get a cohort. */
const COHORT_CHAPTERS = ATA_CHAPTERS.filter((chapter) => chapter.valueWeight >= 0.01);

const INDEX_FLOOR = 0.45;
const INDEX_CEIL = 2.2;
/** How hard both indices are pulled back toward 1.0 each week. */
const REVERSION = 0.045;
const SHOCK_WEEKLY_P = 0.014;
const HISTORY_CAP = 520;

const SHOCK_LIBRARY: {
  kind: MarketShockKind;
  label: string;
  price: [number, number];
  demand: [number, number];
  regional: boolean;
  chapterFocused: boolean;
}[] = [
  { kind: "fuel_spike", label: "Fuel price spike", price: [-0.12, -0.04], demand: [-0.18, -0.07], regional: false, chapterFocused: false },
  { kind: "type_grounding", label: "Fleet type grounding", price: [-0.22, -0.09], demand: [0.08, 0.26], regional: false, chapterFocused: true },
  { kind: "lessor_default", label: "Lessor portfolio default", price: [-0.26, -0.11], demand: [-0.06, 0.04], regional: true, chapterFocused: false },
  { kind: "variant_launch", label: "New engine variant launch", price: [-0.14, -0.05], demand: [-0.12, -0.03], regional: false, chapterFocused: true },
  { kind: "supply_squeeze", label: "Component supply squeeze", price: [0.12, 0.34], demand: [0.06, 0.2], regional: false, chapterFocused: true },
  { kind: "traffic_boom", label: "Regional traffic boom", price: [0.07, 0.19], demand: [0.12, 0.32], regional: true, chapterFocused: false },
  { kind: "credit_crunch", label: "Credit tightening", price: [-0.17, -0.06], demand: [-0.22, -0.09], regional: false, chapterFocused: false },
];

function clampIndex(value: number): number {
  return Math.min(INDEX_CEIL, Math.max(INDEX_FLOOR, value));
}

export function createGlobalMarket(rng: Rng, config: { assetCount: number }): GlobalMarket {
  const target = Math.max(0, Math.round(config.assetCount));
  const cohorts: MarketCohort[] = [];

  // Build the weight grid first so counts can be apportioned exactly.
  const specs: { regionCode: RegionCode; ata: number; ownerKind: OrganizationKind; weight: number }[] = [];
  let totalWeight = 0;
  for (const code of REGION_CODES) {
    const entry = region(code);
    const regionWeight = entry.facilityDensity * entry.demandBase;
    for (const chapter of COHORT_CHAPTERS) {
      for (const ownerKind of OWNER_KINDS) {
        const weight = regionWeight * chapter.valueWeight * (OWNER_WEIGHT[ownerKind] ?? 0.1);
        specs.push({ regionCode: code, ata: chapter.code, ownerKind, weight });
        totalWeight += weight;
      }
    }
  }

  // Largest-remainder apportionment so the counts sum to the target exactly.
  const exact = specs.map((spec) => (totalWeight > 0 ? (spec.weight / totalWeight) * target : 0));
  const floors = exact.map((value) => Math.floor(value));
  let assigned = floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  let cursor = 0;
  while (assigned < target && order.length > 0) {
    floors[order[cursor % order.length]!.index]! += 1;
    assigned += 1;
    cursor += 1;
  }

  for (const [index, spec] of specs.entries()) {
    cohorts.push({
      id: `cohort-${spec.regionCode}-${spec.ata}-${spec.ownerKind}`,
      regionCode: spec.regionCode,
      ata: spec.ata,
      assetClass: ataAssetClass(spec.ata),
      ownerKind: spec.ownerKind,
      count: floors[index] ?? 0,
      meanAgeYears: rng.float(4, 16),
      priceIndex: 1,
      demandIndex: 1,
      materialized: 0,
    });
  }

  return {
    cohorts,
    baselineCount: target,
    growthRate: 0.06,
    retireRate: 0.02,
    priceIndex: 1,
    demandIndex: 1,
    shocks: [],
    history: [],
  };
}

/** Weekly factor for an annual rate, so 52 ticks compound to the annual figure. */
function weeklyFactor(annual: number): number {
  return Math.pow(1 + annual, 1 / 52);
}

function shockIntensity(shock: MarketShock, tick: number): number {
  if (tick < shock.startTick || tick > shock.endTick) return 0;
  // Ramp to the peak, then decay away. Triangular, which is enough shape to feel real.
  if (tick <= shock.peakTick) {
    const span = Math.max(1, shock.peakTick - shock.startTick);
    return (tick - shock.startTick) / span;
  }
  const span = Math.max(1, shock.endTick - shock.peakTick);
  return Math.max(0, 1 - (tick - shock.peakTick) / span);
}

function spawnShock(rng: Rng, tick: number, nextId: number): MarketShock {
  const template = rng.pick(SHOCK_LIBRARY);
  const duration = rng.int(26, 104);
  const peakOffset = Math.max(4, Math.round(duration * rng.float(0.25, 0.5)));
  return {
    id: nextId,
    kind: template.kind,
    label: template.label,
    startTick: tick,
    peakTick: tick + peakOffset,
    endTick: tick + duration,
    priceImpact: rng.float(template.price[0], template.price[1]),
    demandImpact: rng.float(template.demand[0], template.demand[1]),
    regionCode: template.regional ? rng.pick(REGION_CODES) : null,
    ata: template.chapterFocused ? rng.pick(COHORT_CHAPTERS).code : null,
    known: false,
  };
}

export function advanceGlobalMarket(market: GlobalMarket, rng: Rng, tick: number): void {
  const growth = weeklyFactor(market.growthRate);
  const retire = weeklyFactor(-market.retireRate);

  // retire is within 1e-3 of 1, so a first-order expansion of retire**ageBias is exact
  // to about 1e-7 here and avoids a Math.pow per cohort per tick. With ~2,000 cohorts
  // over a 100-week headless run that is millions of calls saved.
  const retireSlope = retire - 1;
  const ageStep = 1 / 52;
  const renewal = (market.growthRate / 52) * 6;
  for (const cohort of market.cohorts) {
    if (cohort.count <= 0) {
      cohort.meanAgeYears += ageStep;
      continue;
    }
    // Older cohorts retire faster; the fleet renews from the young end.
    const ageBias = 1 + Math.max(0, cohort.meanAgeYears - 12) * 0.02;
    const variance = 0.9985 + rng.next() * 0.003;
    const next = cohort.count * growth * (1 + retireSlope * ageBias) * variance;
    cohort.count = Math.max(0, Math.round(next));
    // Growth arrives as new assets, which pulls the mean age down a little.
    cohort.meanAgeYears = Math.max(0, cohort.meanAgeYears + ageStep - renewal);
  }

  if (rng.chance(SHOCK_WEEKLY_P)) {
    const nextId = market.shocks.reduce((max, shock) => Math.max(max, shock.id), 0) + 1;
    market.shocks.push(spawnShock(rng, tick, nextId));
  }

  let priceImpact = 0;
  let demandImpact = 0;
  for (const shock of market.shocks) {
    const intensity = shockIntensity(shock, tick);
    if (intensity <= 0) continue;
    priceImpact += shock.priceImpact * intensity;
    demandImpact += shock.demandImpact * intensity;
  }

  const calendar = calendarFor(tick);
  const priceTarget = (1 + priceImpact) * calendar.seasonalPrice;
  const demandTarget = (1 + demandImpact) * calendar.seasonalDemand;

  // Move toward the shocked target, then always pull back toward 1.0. Without the
  // second term a long shock would permanently reset the baseline.
  market.priceIndex = clampIndex(
    market.priceIndex + (priceTarget - market.priceIndex) * 0.25 + (1 - market.priceIndex) * REVERSION,
  );
  market.demandIndex = clampIndex(
    market.demandIndex + (demandTarget - market.demandIndex) * 0.25 + (1 - market.demandIndex) * REVERSION,
  );

  market.shocks = market.shocks.filter((shock) => shock.endTick >= tick);

  const count = market.cohorts.reduce((sum, cohort) => sum + cohort.count, 0);
  market.history.push({
    tick,
    count,
    priceIndex: market.priceIndex,
    demandIndex: market.demandIndex,
  });
  if (market.history.length > HISTORY_CAP) market.history.shift();
}

/** Global index plus any shock aimed specifically at this cohort's region or chapter. */
export function cohortPriceMultiplier(market: GlobalMarket, cohort: MarketCohort): number {
  let multiplier = market.priceIndex;
  for (const shock of market.shocks) {
    if (shock.regionCode && shock.regionCode !== cohort.regionCode) continue;
    if (shock.ata !== null && shock.ata !== cohort.ata) continue;
    if (shock.regionCode === null && shock.ata === null) continue;
    multiplier *= 1 + shock.priceImpact * 0.5;
  }
  return clampIndex(multiplier);
}

export function regionDemandMultiplier(market: GlobalMarket, regionCode: RegionCode): number {
  let multiplier = market.demandIndex * region(regionCode).demandBase;
  for (const shock of market.shocks) {
    if (shock.regionCode !== regionCode) continue;
    multiplier *= 1 + shock.demandImpact * 0.5;
  }
  return clampIndex(multiplier);
}

/**
 * What to spawn when a facility enters SOM and its cohort has to become real units.
 * Pure: returns a plan for the integration layer to apply, and never touches World.
 */
export function planMaterialization(
  cohort: MarketCohort,
  rng: Rng,
  quantity: number,
): { partAta: number; condition: Condition; count: number }[] {
  const wanted = Math.max(0, Math.min(Math.round(quantity), cohort.count - cohort.materialized));
  if (wanted <= 0) return [];

  // Older cohorts and engine hardware skew toward as-removed and overhauled stock.
  const aged = Math.min(1, Math.max(0, (cohort.meanAgeYears - 4) / 18));
  const engineish = cohort.assetClass === "engine" || cohort.assetClass === "llp";
  const weights: [Condition, number][] = [
    ["NE", 0.1 * (1 - aged)],
    ["NS", 0.12 * (1 - aged)],
    ["OH", 0.24 + (engineish ? 0.06 : 0)],
    ["SV", 0.3 - aged * 0.08],
    ["RP", 0.1],
    ["AR", 0.14 + aged * 0.16],
  ];
  const total = weights.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);

  const plan: { partAta: number; condition: Condition; count: number }[] = [];
  let assigned = 0;
  for (const [index, [condition, weight]] of weights.entries()) {
    const share = total > 0 ? Math.max(0, weight) / total : 0;
    const count =
      index === weights.length - 1 ? wanted - assigned : Math.floor(wanted * share);
    if (count <= 0) continue;
    assigned += count;
    plan.push({ partAta: cohort.ata, condition, count });
  }
  // Nudge one unit around so two identical calls with different streams still differ.
  if (plan.length > 1 && rng.chance(0.5)) {
    plan[0]!.count = Math.max(0, plan[0]!.count - 1);
    plan[plan.length - 1]!.count += 1;
  }
  return plan.filter((entry) => entry.count > 0);
}

export function marketSummary(market: GlobalMarket): {
  totalCount: number;
  worldScaleCount: number;
  priceIndex: number;
  demandIndex: number;
  activeShocks: MarketShock[];
  byRegion: Record<string, number>;
  byAta: Record<number, number>;
} {
  const byRegion: Record<string, number> = {};
  const byAta: Record<number, number> = {};
  let totalCount = 0;
  for (const cohort of market.cohorts) {
    totalCount += cohort.count;
    byRegion[cohort.regionCode] = (byRegion[cohort.regionCode] ?? 0) + cohort.count;
    byAta[cohort.ata] = (byAta[cohort.ata] ?? 0) + cohort.count;
  }
  return {
    totalCount,
    worldScaleCount: toWorldScale(totalCount),
    priceIndex: market.priceIndex,
    demandIndex: market.demandIndex,
    activeShocks: market.shocks,
    byRegion,
    byAta,
  };
}
