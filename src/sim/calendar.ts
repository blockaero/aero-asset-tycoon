/**
 * Game calendar.
 *
 * One tick is one weekly pulse. Tick 0 is week 1 of START_YEAR. Everything in
 * here is a pure function of the tick, so the calendar never needs to live in
 * the save file and never diverges between the server and a replay.
 *
 * The seasonal curves model the real driver of aftermarket demand: northern
 * summer flying hours push utilisation up, which pushes unscheduled removals
 * and shop visits up a few weeks later. Prices follow demand but lag it and
 * swing less, because distributors quote off a trailing book. That lag is the
 * whole reason buying into the trough and holding into the peak is a strategy.
 */

import type { GameCalendar, Season } from "./types.ts";

/** Calendar year of tick 0. */
export const START_YEAR = 2027;

/** One tick is one week, so a year is 52 ticks. */
export const PERIODS_PER_YEAR = 52;

const TWO_PI = Math.PI * 2;

/** Periods per quarter: 52 / 4. */
const PERIODS_PER_QUARTER = PERIODS_PER_YEAR / 4;

/** Removals peak in late summer, a few weeks behind the flying-hour peak. */
const DEMAND_PEAK_PERIOD = 30;
const DEMAND_AMPLITUDE = 0.14;

/** Quoted prices trail demand by about six weeks. */
const PRICE_LAG_PERIODS = 6;
const PRICE_AMPLITUDE = 0.07;

/** Season boundaries, northern hemisphere, inclusive 1-based periods. */
const SPRING_START = 10;
const SUMMER_START = 23;
const AUTUMN_START = 36;
const WINTER_START = 49;

const SEASON_LABELS: Record<Season, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
};

/**
 * Hue anchors at season centres, as fractions through the year.
 *
 * The hues are deliberately unwrapped and monotonically decreasing so the
 * autumn-to-winter leg travels amber -> red -> crimson -> violet -> blue
 * instead of running backwards through spring green. The final anchor is the
 * first one minus a full turn, which makes the curve exactly periodic: the
 * value at period 52 steps into the value at period 1 with no seam.
 */
const HUE_ANCHORS: readonly { at: number; hue: number }[] = [
  { at: 2 / PERIODS_PER_YEAR, hue: 210 }, // winter centre, period 3, cool blue
  { at: 15 / PERIODS_PER_YEAR, hue: 160 }, // spring centre, period 16, green-cyan
  { at: 28 / PERIODS_PER_YEAR, hue: 45 }, // summer centre, period 29, warm
  { at: 41 / PERIODS_PER_YEAR, hue: 28 }, // autumn centre, period 42, gold-amber
  { at: 2 / PERIODS_PER_YEAR + 1, hue: 210 - 360 }, // winter again, one turn down
];

/** Deep night at 0, midday at 1. Progress 0 is dawn, on the way up. */
const DAWN_PHASE = Math.PI / 3;

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function safeTick(tick: number): number {
  return Number.isFinite(tick) ? Math.floor(tick) : 0;
}

/** Fractional part in [0, 1), correct for negatives. */
function wrap01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 1) + 1) % 1;
}

function mod360(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/** Hermite ease, exact at both endpoints, flat slope at each anchor. */
function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Season for a 1-based period. Northern hemisphere. */
export function seasonForPeriod(period: number): Season {
  if (period >= WINTER_START || period < SPRING_START) return "winter";
  if (period < SUMMER_START) return "spring";
  if (period < AUTUMN_START) return "summer";
  return "autumn";
}

/** Demand multiplier for a 1-based period. Cosine peaking at DEMAND_PEAK_PERIOD. */
function demandForPeriod(period: number): number {
  const phase = (TWO_PI * (period - DEMAND_PEAK_PERIOD)) / PERIODS_PER_YEAR;
  return round(1 + DEMAND_AMPLITUDE * Math.cos(phase), 6);
}

/** Price multiplier for a 1-based period. Same shape, lagged and damped. */
function priceForPeriod(period: number): number {
  const peak = DEMAND_PEAK_PERIOD + PRICE_LAG_PERIODS;
  const phase = (TWO_PI * (period - peak)) / PERIODS_PER_YEAR;
  return round(1 + PRICE_AMPLITUDE * Math.cos(phase), 6);
}

/**
 * The full calendar for a tick. Pure and exact: same tick, same object value,
 * forever.
 */
export function calendarFor(tick: number): GameCalendar {
  const t = safeTick(tick);
  const yearIndex = Math.floor(t / PERIODS_PER_YEAR);
  const period = t - yearIndex * PERIODS_PER_YEAR + 1;
  const quarter = Math.min(4, Math.floor((period - 1) / PERIODS_PER_QUARTER) + 1);

  return {
    year: START_YEAR + yearIndex,
    period,
    periodsPerYear: PERIODS_PER_YEAR,
    quarter,
    season: seasonForPeriod(period),
    yearFraction: round((period - 1) / PERIODS_PER_YEAR, 6),
    seasonalDemand: demandForPeriod(period),
    seasonalPrice: priceForPeriod(period),
  };
}

/** Display label for a season, e.g. "Summer". */
export function seasonLabel(season: Season): string {
  return SEASON_LABELS[season] ?? "Winter";
}

/** Display label for a quarter, e.g. "Q1". Clamps to 1..4. */
export function quarterLabel(quarter: number): string {
  const q = Number.isFinite(quarter) ? Math.round(quarter) : 1;
  const clamped = q < 1 ? 1 : q > 4 ? 4 : q;
  return `Q${clamped}`;
}

/**
 * Day/night value for a position inside one weekly pulse.
 *
 * 0 is deep night, 1 is midday. Progress 0 is dawn at 0.25 and climbing, so a
 * pulse opens with the sun coming up over the ramp, tops out a third of the way
 * through, and bottoms out in the small hours before the next pulse.
 * Out-of-range progress wraps rather than clamping, so the curve is seamless.
 */
export function daylightFraction(pulseProgress: number): number {
  const p = wrap01(pulseProgress);
  return round(0.5 - 0.5 * Math.cos(TWO_PI * p + DAWN_PHASE), 6);
}

/**
 * CSS hue, 0..360, for the seasonal palette. Continuous across the year
 * boundary: period 52 and period 1 are one ordinary step apart.
 */
export function seasonHue(calendar: GameCalendar): number {
  const first = HUE_ANCHORS[0]!;
  let f = wrap01(calendar.yearFraction);
  if (f < first.at) f += 1;

  for (let i = 0; i < HUE_ANCHORS.length - 1; i += 1) {
    const a = HUE_ANCHORS[i]!;
    const b = HUE_ANCHORS[i + 1]!;
    if (f <= b.at) {
      const t = smoothstep((f - a.at) / (b.at - a.at));
      return round(mod360(a.hue + (b.hue - a.hue) * t), 3);
    }
  }
  return round(mod360(first.hue), 3);
}

/** Fractional years since tick 0. Feeds compounding market growth. */
export function yearsElapsed(tick: number): number {
  if (!Number.isFinite(tick)) return 0;
  return tick / PERIODS_PER_YEAR;
}
