import { describe, expect, it } from "vitest";
import {
  PERIODS_PER_YEAR,
  START_YEAR,
  calendarFor,
  daylightFraction,
  quarterLabel,
  seasonForPeriod,
  seasonHue,
  seasonLabel,
  yearsElapsed,
} from "../src/sim/calendar.ts";
import type { Season } from "../src/sim/types.ts";

/** Every period of the first year, in order. */
const YEAR_ONE = Array.from({ length: PERIODS_PER_YEAR }, (_, i) => calendarFor(i));

/** Shortest way round the colour wheel between two hues. */
function hueGap(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

describe("calendarFor", () => {
  it("starts at week 1 of START_YEAR on tick 0", () => {
    expect(START_YEAR).toBe(2027);
    expect(PERIODS_PER_YEAR).toBe(52);
    const start = calendarFor(0);
    expect(start.year).toBe(2027);
    expect(start.period).toBe(1);
    expect(start.periodsPerYear).toBe(52);
    expect(start.quarter).toBe(1);
    expect(start.season).toBe("winter");
    expect(start.yearFraction).toBe(0);
    // Deep in the winter trough. Exact, not approximate: the curves are
    // rounded to 6dp so they serialise identically on every machine.
    expect(start.seasonalDemand).toBe(0.869098);
    expect(start.seasonalPrice).toBe(0.967469);
  });

  it("is exact at named ticks across several years", () => {
    const last = calendarFor(51);
    expect(last.year).toBe(2027);
    expect(last.period).toBe(52);
    expect(last.quarter).toBe(4);
    expect(last.season).toBe("winter");

    const rollover = calendarFor(52);
    expect(rollover.year).toBe(2028);
    expect(rollover.period).toBe(1);
    expect(rollover.quarter).toBe(1);

    const midSummer = calendarFor(29);
    expect(midSummer.year).toBe(2027);
    expect(midSummer.period).toBe(30);
    expect(midSummer.quarter).toBe(3);
    expect(midSummer.season).toBe("summer");

    const thirdSpring = calendarFor(2 * 52 + 9);
    expect(thirdSpring.year).toBe(2029);
    expect(thirdSpring.period).toBe(10);
    expect(thirdSpring.season).toBe("spring");

    expect(calendarFor(5 * 52).year).toBe(2032);
    expect(calendarFor(5 * 52).period).toBe(1);
  });

  it("puts 13 periods in each quarter", () => {
    const counts = new Map<number, number>();
    for (const cal of YEAR_ONE) counts.set(cal.quarter, (counts.get(cal.quarter) ?? 0) + 1);
    expect([...counts.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 13],
      [2, 13],
      [3, 13],
      [4, 13],
    ]);
    expect(calendarFor(12).quarter).toBe(1); // period 13
    expect(calendarFor(13).quarter).toBe(2); // period 14
    expect(calendarFor(38).quarter).toBe(3); // period 39
    expect(calendarFor(39).quarter).toBe(4); // period 40
  });

  it("walks yearFraction from 0 up to just under 1", () => {
    expect(YEAR_ONE[0]!.yearFraction).toBe(0);
    expect(YEAR_ONE[51]!.yearFraction).toBeCloseTo(51 / 52, 6);
    for (const cal of YEAR_ONE) {
      expect(cal.yearFraction).toBeGreaterThanOrEqual(0);
      expect(cal.yearFraction).toBeLessThan(1);
    }
  });

  it("is pure: repeated calls for a tick agree", () => {
    const first = calendarFor(777);
    daylightFraction(0.4);
    seasonHue(calendarFor(3));
    const second = calendarFor(777);
    expect(second).toEqual(first);
    expect(calendarFor(777.9)).toEqual(first);
  });
});

describe("season boundaries", () => {
  it("assigns the northern-hemisphere seasons by period", () => {
    const cases: [number, Season][] = [
      [1, "winter"],
      [9, "winter"],
      [10, "spring"],
      [22, "spring"],
      [23, "summer"],
      [35, "summer"],
      [36, "autumn"],
      [48, "autumn"],
      [49, "winter"],
      [52, "winter"],
    ];
    for (const [period, season] of cases) {
      expect(seasonForPeriod(period)).toBe(season);
      expect(calendarFor(period - 1).season).toBe(season);
    }
  });

  it("covers the year with no gaps and the right season lengths", () => {
    const counts: Record<Season, number> = { winter: 0, spring: 0, summer: 0, autumn: 0 };
    for (const cal of YEAR_ONE) counts[cal.season] += 1;
    expect(counts).toEqual({ winter: 13, spring: 13, summer: 13, autumn: 13 });
  });
});

describe("seasonal demand and price", () => {
  it("peaks demand in summer, because summer flying hours drive removals", () => {
    const peak = YEAR_ONE.reduce((a, b) => (b.seasonalDemand > a.seasonalDemand ? b : a));
    expect(peak.period).toBe(30);
    expect(peak.season).toBe("summer");
    expect(peak.seasonalDemand).toBe(1.14);
  });

  it("troughs demand in winter", () => {
    const trough = YEAR_ONE.reduce((a, b) => (b.seasonalDemand < a.seasonalDemand ? b : a));
    expect(trough.season).toBe("winter");
    expect(trough.seasonalDemand).toBe(0.86);
  });

  it("keeps both multipliers inside their bands", () => {
    for (const cal of YEAR_ONE) {
      expect(cal.seasonalDemand).toBeGreaterThanOrEqual(0.86);
      expect(cal.seasonalDemand).toBeLessThanOrEqual(1.14);
      expect(cal.seasonalPrice).toBeGreaterThanOrEqual(0.93);
      expect(cal.seasonalPrice).toBeLessThanOrEqual(1.07);
    }
  });

  it("lags price about six periods behind demand and swings less", () => {
    const demandPeak = YEAR_ONE.reduce((a, b) => (b.seasonalDemand > a.seasonalDemand ? b : a));
    const pricePeak = YEAR_ONE.reduce((a, b) => (b.seasonalPrice > a.seasonalPrice ? b : a));
    expect(pricePeak.period - demandPeak.period).toBe(6);
    expect(pricePeak.seasonalPrice).toBe(1.07);

    const demandSwing =
      Math.max(...YEAR_ONE.map((c) => c.seasonalDemand)) -
      Math.min(...YEAR_ONE.map((c) => c.seasonalDemand));
    const priceSwing =
      Math.max(...YEAR_ONE.map((c) => c.seasonalPrice)) -
      Math.min(...YEAR_ONE.map((c) => c.seasonalPrice));
    expect(demandSwing).toBeCloseTo(0.28, 6);
    expect(priceSwing).toBeCloseTo(0.14, 6);
    expect(priceSwing).toBeLessThan(demandSwing);
  });

  it("lets you buy in the price trough and sell into the price peak", () => {
    const trough = YEAR_ONE.reduce((a, b) => (b.seasonalPrice < a.seasonalPrice ? b : a));
    const peak = YEAR_ONE.reduce((a, b) => (b.seasonalPrice > a.seasonalPrice ? b : a));
    expect(trough.period).toBeLessThan(peak.period);
    expect(peak.seasonalPrice / trough.seasonalPrice).toBeGreaterThan(1.1);
  });

  it("moves smoothly, with no step change between adjacent periods", () => {
    for (let i = 0; i < YEAR_ONE.length; i += 1) {
      const here = YEAR_ONE[i]!;
      const next = YEAR_ONE[(i + 1) % YEAR_ONE.length]!;
      expect(Math.abs(next.seasonalDemand - here.seasonalDemand)).toBeLessThan(0.02);
      expect(Math.abs(next.seasonalPrice - here.seasonalPrice)).toBeLessThan(0.01);
    }
  });
});

describe("daylightFraction", () => {
  it("starts the pulse at dawn", () => {
    expect(daylightFraction(0)).toBeCloseTo(0.25, 6);
    expect(daylightFraction(0.02)).toBeGreaterThan(daylightFraction(0));
  });

  it("reaches midday and deep night once each", () => {
    expect(daylightFraction(1 / 3)).toBeCloseTo(1, 6);
    expect(daylightFraction(5 / 6)).toBeCloseTo(0, 6);

    const samples = Array.from({ length: 1000 }, (_, i) => daylightFraction(i / 1000));
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeGreaterThan(0.999);
    expect(Math.min(...samples)).toBeLessThan(0.001);
  });

  it("wraps seamlessly at the end of a pulse", () => {
    expect(daylightFraction(1)).toBeCloseTo(daylightFraction(0), 6);
    expect(daylightFraction(1.25)).toBeCloseTo(daylightFraction(0.25), 6);
    expect(daylightFraction(-0.25)).toBeCloseTo(daylightFraction(0.75), 6);
  });
});

describe("seasonHue", () => {
  it("hits the season anchors", () => {
    expect(seasonHue(calendarFor(2))).toBeCloseTo(210, 3); // period 3, winter
    expect(seasonHue(calendarFor(15))).toBeCloseTo(160, 3); // period 16, spring
    expect(seasonHue(calendarFor(28))).toBeCloseTo(45, 3); // period 29, summer
    expect(seasonHue(calendarFor(41))).toBeCloseTo(28, 3); // period 42, autumn
  });

  it("stays inside the CSS hue range all year", () => {
    for (const cal of YEAR_ONE) {
      const hue = seasonHue(cal);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("has no seam from period 52 to period 1", () => {
    const hues = YEAR_ONE.map((cal) => seasonHue(cal));
    const steps = hues.map((hue, i) => hueGap(hue, hues[(i + 1) % hues.length]!));
    const wrapStep = hueGap(hues[51]!, hues[0]!);
    const biggestInteriorStep = Math.max(...steps.slice(0, 51));
    expect(wrapStep).toBeLessThanOrEqual(biggestInteriorStep + 1e-6);
    expect(Math.max(...steps)).toBeLessThan(25);
  });

  it("repeats exactly one year later", () => {
    for (let period = 1; period <= 52; period += 1) {
      expect(seasonHue(calendarFor(period - 1))).toBe(seasonHue(calendarFor(period - 1 + 52)));
    }
  });
});

describe("labels", () => {
  it("names seasons and quarters", () => {
    expect(seasonLabel("winter")).toBe("Winter");
    expect(seasonLabel("spring")).toBe("Spring");
    expect(seasonLabel("summer")).toBe("Summer");
    expect(seasonLabel("autumn")).toBe("Autumn");
    expect(quarterLabel(1)).toBe("Q1");
    expect(quarterLabel(4)).toBe("Q4");
    expect(quarterLabel(calendarFor(29).quarter)).toBe("Q3");
    expect(quarterLabel(0)).toBe("Q1");
    expect(quarterLabel(9)).toBe("Q4");
  });
});

describe("yearsElapsed", () => {
  it("counts fractional years for compounding", () => {
    expect(yearsElapsed(0)).toBe(0);
    expect(yearsElapsed(52)).toBe(1);
    expect(yearsElapsed(26)).toBe(0.5);
    expect(yearsElapsed(5 * 52)).toBe(5);
    expect(yearsElapsed(13)).toBeCloseTo(0.25, 12);
  });

  it("agrees with the calendar year for whole years", () => {
    for (const tick of [0, 52, 104, 260]) {
      expect(calendarFor(tick).year).toBe(START_YEAR + yearsElapsed(tick));
    }
  });
});
