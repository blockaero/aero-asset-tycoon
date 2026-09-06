import type { LivePace } from "./types.ts";

export const STARTING_CAPITAL = 10_000_000;
export const TICKS_PER_YEAR = 52;
/** Four weekly ticks make one calendar month. */
export const TICKS_PER_MONTH = 4;
export const DEFAULT_CAMPAIGN_TICKS = 100;

/** Wall-clock seconds for one weekly pulse. Headless runs ignore this. */
export const LIVE_TICK_SECONDS = {
  fast: 25,
  medium: 50,
  slow: 75,
} as const;

export function tickDurationMs(pace: LivePace): number {
  return LIVE_TICK_SECONDS[pace] * 1000;
}

export const REGION_ID = "NA";

export const MRP_K = 0.18;
export const MRP_THETA = 0.05;
export const MRP_FLOOR = 0.4;
export const MRP_CEIL = 3.5;

export const EXCHANGE_FEE_MIN = 0.55;
export const EXCHANGE_FEE_MAX = 0.7;
export const EXCHANGE_CORE_TICKS = 12;
export const CORE_NO_RETURN_P = 0.04;
export const CORE_BER_P_EXTRA = 0.08;

export const AOG_PREMIUM_MIN = 1.5;
export const AOG_PREMIUM_MAX = 4.0;

export const SHOCK_P = 0.012;
export const AD_RUMOUR_BECOMES_AD = 0.4;

export const CONDITION_MULT = {
  NE: 0.92,
  NS: 0.86,
  OH: 0.65,
  SV: 0.45,
  RP: 0.42,
  AR: 0.18,
  BER: 0.06,
  SCRAP: 0.05,
} as const;

/** Paperwork value is deferred; all trace grades are economically neutral. */
export const TRACE_MULT = {
  dual: 1.0,
  single: 1.0,
  partial: 1.0,
  none: 1.0,
} as const;

export const WEEKLY_OVERHEAD = 6_000;
export const STORAGE_COST_PER_UNIT = 60;
export const LOGISTICS_COST_PER_UNIT_TICK = 180;

export const CATEGORIES = [
  "llp",
  "rotable",
  "repairable",
  "expendable",
  "consumable",
  "standard",
] as const;

export const FITNESS = {
  nav: 0.5,
  irr: 0.3,
  fillRate: 0.2,
} as const;
