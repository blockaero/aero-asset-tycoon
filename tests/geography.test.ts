import { describe, expect, it } from "vitest";
import {
  MAX_DISTANCE_WEEKS,
  MIN_DISTANCE_WEEKS,
  REGIONS,
  REGION_CODES,
  allCountries,
  allocateFacilities,
  countryCount,
  distanceWeeks,
  region,
  regionCentre,
  regionOfCountry,
  regionPoint,
  totalFacilityDensity,
} from "../src/sim/geography.ts";
import { Rng } from "../src/sim/rng.ts";
import type { Region, RegionCode } from "../src/sim/types.ts";

const EXPECTED_CODES: RegionCode[] = [
  "NA",
  "CARIB",
  "LATAM",
  "EUW",
  "EUE",
  "CIS",
  "MEA",
  "AFR",
  "SASIA",
  "SEA",
  "GCHINA",
  "NEASIA",
  "OCE",
  "CASIA",
];

function normalize(country: string): string {
  return country
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function overlaps(a: Region, b: Region): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

describe("region table", () => {
  it("covers all fourteen region codes exactly once, in declaration order", () => {
    expect(REGIONS).toHaveLength(14);
    expect(REGION_CODES).toEqual(EXPECTED_CODES);
    expect(new Set(REGION_CODES).size).toBe(14);
  });

  it("resolves a region record for every code", () => {
    for (const code of REGION_CODES) {
      const found = region(code);
      expect(found.code).toBe(code);
      expect(found.name.length).toBeGreaterThan(3);
      expect(found.countries.length).toBeGreaterThan(0);
    }
    expect(region("SEA").name).toBe("Southeast Asia");
    expect(region("GCHINA").countries).toContain("China");
    expect(() => region("ATLANTIS" as RegionCode)).toThrow();
  });
});

describe("country coverage", () => {
  it("lists at least 190 distinct countries", () => {
    const distinct = new Set(REGIONS.flatMap((entry) => entry.countries.map(normalize)));
    expect(distinct.size).toBeGreaterThanOrEqual(190);
    expect(countryCount()).toBe(distinct.size);
    expect(allCountries()).toHaveLength(distinct.size);
  });

  it("never assigns a country to two regions", () => {
    const owner = new Map<string, RegionCode>();
    const duplicates: string[] = [];
    for (const entry of REGIONS) {
      for (const country of entry.countries) {
        const key = normalize(country);
        const seen = owner.get(key);
        if (seen) duplicates.push(`${country}: ${seen} and ${entry.code}`);
        else owner.set(key, entry.code);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it("maps countries to the region that actually trades them", () => {
    expect(regionOfCountry("United States")).toBe("NA");
    expect(regionOfCountry("Mexico")).toBe("NA");
    expect(regionOfCountry("Jamaica")).toBe("CARIB");
    expect(regionOfCountry("Brazil")).toBe("LATAM");
    expect(regionOfCountry("Germany")).toBe("EUW");
    expect(regionOfCountry("Poland")).toBe("EUE");
    expect(regionOfCountry("Russia")).toBe("CIS");
    expect(regionOfCountry("United Arab Emirates")).toBe("MEA");
    expect(regionOfCountry("Kenya")).toBe("AFR");
    expect(regionOfCountry("India")).toBe("SASIA");
    expect(regionOfCountry("Singapore")).toBe("SEA");
    expect(regionOfCountry("Taiwan")).toBe("GCHINA");
    expect(regionOfCountry("Japan")).toBe("NEASIA");
    expect(regionOfCountry("Australia")).toBe("OCE");
    expect(regionOfCountry("Kazakhstan")).toBe("CASIA");
  });

  it("is tolerant of case, padding, accents and common aliases", () => {
    expect(regionOfCountry("  fRaNcE ")).toBe("EUW");
    expect(regionOfCountry("Cote d'Ivoire")).toBe("AFR");
    expect(regionOfCountry("Côte d'Ivoire")).toBe("AFR");
    expect(regionOfCountry("Ivory Coast")).toBe("AFR");
    expect(regionOfCountry("USA")).toBe("NA");
    expect(regionOfCountry("UK")).toBe("EUW");
    expect(regionOfCountry("Czech Republic")).toBe("EUE");
    expect(regionOfCountry("Burma")).toBe("SEA");
    expect(regionOfCountry("Hong Kong")).toBe("GCHINA");
  });

  it("returns null for a country that is not on the map", () => {
    expect(regionOfCountry("Wakanda")).toBeNull();
    expect(regionOfCountry("")).toBeNull();
  });

  it("resolves every alias target back to a real region", () => {
    for (const entry of REGIONS) {
      for (const country of entry.countries) {
        expect(regionOfCountry(country)).toBe(entry.code);
      }
    }
  });
});

describe("map rectangles", () => {
  it("keeps every rectangle inside the 0..100 map space", () => {
    for (const entry of REGIONS) {
      expect(entry.width).toBeGreaterThan(0);
      expect(entry.height).toBeGreaterThan(0);
      expect(entry.x).toBeGreaterThanOrEqual(0);
      expect(entry.y).toBeGreaterThanOrEqual(0);
      expect(entry.x + entry.width).toBeLessThanOrEqual(100);
      expect(entry.y + entry.height).toBeLessThanOrEqual(100);
    }
  });

  it("never overlaps two regions", () => {
    const collisions: string[] = [];
    for (let i = 0; i < REGIONS.length; i += 1) {
      for (let j = i + 1; j < REGIONS.length; j += 1) {
        const a = REGIONS[i]!;
        const b = REGIONS[j]!;
        if (overlaps(a, b)) collisions.push(`${a.code}/${b.code}`);
      }
    }
    expect(collisions).toEqual([]);
  });

  it("lays the world out west to east and north to south", () => {
    expect(regionCentre("NA").x).toBeLessThan(regionCentre("EUW").x);
    expect(regionCentre("EUW").x).toBeLessThan(regionCentre("SASIA").x);
    expect(regionCentre("SASIA").x).toBeLessThan(regionCentre("NEASIA").x);
    expect(regionCentre("CIS").y).toBeLessThan(regionCentre("MEA").y);
    expect(regionCentre("MEA").y).toBeLessThan(regionCentre("AFR").y);
    expect(regionCentre("SEA").y).toBeLessThan(regionCentre("OCE").y);
  });
});

describe("market indices", () => {
  it("puts demand and labour cost in the mature markets", () => {
    for (const code of ["SEA", "EUE", "SASIA", "AFR", "CASIA"] as RegionCode[]) {
      expect(region("NA").labourIndex).toBeGreaterThan(region(code).labourIndex);
      expect(region("EUW").labourIndex).toBeGreaterThan(region(code).labourIndex);
    }
    expect(region("NA").demandBase).toBeGreaterThan(1);
    expect(region("EUW").demandBase).toBeGreaterThan(1);
  });

  it("makes Africa and Central Asia thin demand at the end of a long tail", () => {
    for (const code of ["AFR", "CASIA"] as RegionCode[]) {
      expect(region(code).demandBase).toBeLessThan(region("NA").demandBase);
      expect(region(code).demandBase).toBeLessThan(region("EUW").demandBase);
      expect(region(code).logisticsPenalty).toBeGreaterThan(region("NA").logisticsPenalty);
      expect(region(code).logisticsPenalty).toBeGreaterThan(region("EUW").logisticsPenalty);
    }
  });

  it("keeps every index positive and in a sane band", () => {
    for (const entry of REGIONS) {
      expect(entry.facilityDensity).toBeGreaterThan(0);
      expect(entry.demandBase).toBeGreaterThan(0);
      expect(entry.demandBase).toBeLessThan(3);
      expect(entry.labourIndex).toBeGreaterThan(0);
      expect(entry.labourIndex).toBeLessThan(3);
      expect(entry.logisticsPenalty).toBeGreaterThanOrEqual(0);
      expect(entry.logisticsPenalty).toBeLessThanOrEqual(3);
    }
    expect(totalFacilityDensity()).toBe(
      REGIONS.reduce((sum, entry) => sum + entry.facilityDensity, 0),
    );
  });
});

describe("allocateFacilities", () => {
  const totals = [0, 1, 2, 13, 14, 15, 99, 420, 1000, 4321, 40000];

  it("sums to exactly the requested budget", () => {
    for (const total of totals) {
      const split = allocateFacilities(total);
      const sum = REGION_CODES.reduce((acc, code) => acc + split[code], 0);
      expect(sum).toBe(total);
      for (const code of REGION_CODES) {
        expect(Number.isInteger(split[code])).toBe(true);
        expect(split[code]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is deterministic and floors a fractional or negative budget", () => {
    expect(allocateFacilities(420)).toEqual(allocateFacilities(420));
    expect(allocateFacilities(420.9)).toEqual(allocateFacilities(420));
    const empty = allocateFacilities(-5);
    expect(REGION_CODES.reduce((acc, code) => acc + empty[code], 0)).toBe(0);
  });

  it("tracks facilityDensity share", () => {
    const split = allocateFacilities(1120);
    const denominator = totalFacilityDensity();
    for (const entry of REGIONS) {
      const exact = (1120 * entry.facilityDensity) / denominator;
      expect(Math.abs(split[entry.code] - exact)).toBeLessThan(1);
    }
    expect(split.NA).toBeGreaterThan(split.CASIA);
    expect(split.EUW).toBeGreaterThan(split.AFR);
  });

  it("hands the rounding remainder to the largest fractions first", () => {
    const total = 100;
    const denominator = totalFacilityDensity();
    const rows = REGIONS.map((entry, index) => {
      const exact = (total * entry.facilityDensity) / denominator;
      return { code: entry.code, index, base: Math.floor(exact), fraction: exact - Math.floor(exact) };
    });
    const remainder = total - rows.reduce((acc, row) => acc + row.base, 0);
    expect(remainder).toBeGreaterThan(0);

    const winners = [...rows]
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
      .slice(0, remainder)
      .map((row) => row.code);

    const split = allocateFacilities(total);
    for (const row of rows) {
      const bonus = winners.includes(row.code) ? 1 : 0;
      expect(split[row.code]).toBe(row.base + bonus);
    }
  });
});

describe("regionPoint", () => {
  it("lands inside the region rectangle, inset from every edge", () => {
    for (const seed of [1, 2, 7, 99, 123456]) {
      const rng = new Rng(seed);
      for (const entry of REGIONS) {
        for (let draw = 0; draw < 40; draw += 1) {
          const point = regionPoint(rng, entry.code);
          expect(point.x).toBeGreaterThan(entry.x);
          expect(point.x).toBeLessThan(entry.x + entry.width);
          expect(point.y).toBeGreaterThan(entry.y);
          expect(point.y).toBeLessThan(entry.y + entry.height);
          expect(point.x).toBeGreaterThan(entry.x + entry.width * 0.05);
          expect(point.x).toBeLessThan(entry.x + entry.width * 0.95);
          expect(point.y).toBeGreaterThan(entry.y + entry.height * 0.05);
          expect(point.y).toBeLessThan(entry.y + entry.height * 0.95);
        }
      }
    }
  });

  it("is a pure function of the rng state", () => {
    const a = new Rng(4242);
    const b = new Rng(4242);
    for (const code of REGION_CODES) {
      expect(regionPoint(a, code)).toEqual(regionPoint(b, code));
    }
    const c = new Rng(4242);
    const d = new Rng(4243);
    expect(regionPoint(c, "NA")).not.toEqual(regionPoint(d, "NA"));
  });

  it("spreads points rather than pinning them to the centre", () => {
    const rng = new Rng(2027);
    const xs = new Set<number>();
    for (let draw = 0; draw < 50; draw += 1) xs.add(regionPoint(rng, "OCE").x);
    expect(xs.size).toBeGreaterThan(20);
  });
});

describe("distanceWeeks", () => {
  it("costs nothing inside a region", () => {
    for (const code of REGION_CODES) {
      expect(distanceWeeks(code, code)).toBe(0);
    }
  });

  it("is symmetric and stays in the 1..4 week band", () => {
    for (const from of REGION_CODES) {
      for (const to of REGION_CODES) {
        const weeks = distanceWeeks(from, to);
        expect(weeks).toBe(distanceWeeks(to, from));
        expect(Number.isInteger(weeks)).toBe(true);
        if (from === to) continue;
        expect(weeks).toBeGreaterThanOrEqual(MIN_DISTANCE_WEEKS);
        expect(weeks).toBeLessThanOrEqual(MAX_DISTANCE_WEEKS);
      }
    }
  });

  it("charges more for long hauls into hard regions than for neighbours", () => {
    expect(distanceWeeks("EUW", "EUE")).toBeLessThan(distanceWeeks("EUW", "OCE"));
    expect(distanceWeeks("NA", "EUW")).toBeLessThan(distanceWeeks("NA", "SEA"));
    expect(distanceWeeks("NA", "CARIB")).toBeLessThan(distanceWeeks("NA", "OCE"));
    expect(distanceWeeks("GCHINA", "NEASIA")).toBeLessThan(distanceWeeks("GCHINA", "LATAM"));
  });

  it("uses the whole 1..4 band across the world", () => {
    const seen = new Set<number>();
    for (const from of REGION_CODES) {
      for (const to of REGION_CODES) {
        if (from !== to) seen.add(distanceWeeks(from, to));
      }
    }
    expect(seen.has(MIN_DISTANCE_WEEKS)).toBe(true);
    expect(seen.has(MAX_DISTANCE_WEEKS)).toBe(true);
  });
});
