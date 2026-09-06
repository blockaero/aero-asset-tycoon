import { describe, expect, it } from "vitest";
import {
  COMPANY_FIRST_WORDS,
  COMPANY_MIDDLE_WORDS,
  COMPANY_SUFFIXES,
  FOUNDER_PORTRAITS,
  GIVEN_NAMES,
  MAX_IDENTITY_LENGTH,
  SURNAMES,
  TEAM_PORTRAITS,
  defaultIdentity,
  portraitById,
  rollCompanyName,
  rollFounderName,
  sanitizeIdentity,
  seedFromCompanyName,
  teamPortraitId,
} from "../src/sim/identity.ts";
import { Rng } from "../src/sim/rng.ts";
import type { TeamRole } from "../src/sim/types.ts";

const ALL_ROLES: TeamRole[] = ["buyer", "sales", "records", "repair", "regional", "analyst"];

/** Seeds used wherever a test wants a spread of rolls rather than one sample. */
const SAMPLE_SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 13);

function rollMany(roll: (rng: Rng) => string): string[] {
  return SAMPLE_SEEDS.map((seed) => roll(new Rng(seed)));
}

describe("rollCompanyName", () => {
  it("is deterministic for a given seed", () => {
    expect(rollCompanyName(new Rng(12345))).toBe(rollCompanyName(new Rng(12345)));

    const first = Array.from({ length: 12 }, () => rollCompanyName(new Rng(99)));
    expect(new Set(first).size).toBe(1);
  });

  it("is deterministic across a sequence of rolls from one stream", () => {
    const streamA = new Rng(4242);
    const streamB = new Rng(4242);
    const runA = Array.from({ length: 20 }, () => rollCompanyName(streamA));
    const runB = Array.from({ length: 20 }, () => rollCompanyName(streamB));
    expect(runA).toEqual(runB);
    // A single stream must not repeat itself immediately either.
    expect(new Set(runA).size).toBeGreaterThan(10);
  });

  it("consumes exactly three values from the rng", () => {
    const measured = new Rng(31337);
    rollCompanyName(measured);
    const afterRoll = measured.getState();

    const control = new Rng(31337);
    control.next();
    control.next();
    control.next();
    expect(afterRoll).toBe(control.getState());
  });

  it("has a large enough word space", () => {
    expect(COMPANY_FIRST_WORDS.length).toBeGreaterThanOrEqual(24);
    expect(COMPANY_MIDDLE_WORDS.length).toBeGreaterThanOrEqual(12);
    expect(COMPANY_SUFFIXES.length).toBeGreaterThanOrEqual(6);

    expect(new Set(COMPANY_FIRST_WORDS).size).toBe(COMPANY_FIRST_WORDS.length);
    expect(new Set(COMPANY_MIDDLE_WORDS).size).toBe(COMPANY_MIDDLE_WORDS.length);
    expect(new Set(COMPANY_SUFFIXES).size).toBe(COMPANY_SUFFIXES.length);

    const space = COMPANY_FIRST_WORDS.length * COMPANY_MIDDLE_WORDS.length * COMPANY_SUFFIXES.length;
    expect(space).toBeGreaterThanOrEqual(24 * 12 * 6);
  });

  it("always ends in a corporate suffix and draws all three parts from the tables", () => {
    // Longest match wins: "Pte. Ltd." also ends with "Ltd.".
    const byLengthDesc = (a: string, b: string) => b.length - a.length;
    const firstWords = [...COMPANY_FIRST_WORDS].sort(byLengthDesc);
    const suffixes = [...COMPANY_SUFFIXES].sort(byLengthDesc);

    for (const name of rollMany(rollCompanyName)) {
      const first = firstWords.find((word) => name.startsWith(`${word} `));
      expect(first, name).toBeDefined();

      const suffix = suffixes.find((word) => name.endsWith(` ${word}`));
      expect(suffix, name).toBeDefined();

      const middle = name.slice(first!.length + 1, name.length - suffix!.length - 1);
      expect(COMPANY_MIDDLE_WORDS, name).toContain(middle);
    }
  });

  it("varies with the seed", () => {
    const names = rollMany(rollCompanyName);
    expect(new Set(names).size).toBeGreaterThan(100);
    expect(new Set(names.map((n) => n.split(" ")[0])).size).toBeGreaterThan(20);
  });

  it("can never exceed the identity length cap, for any combination", () => {
    for (const first of COMPANY_FIRST_WORDS) {
      for (const middle of COMPANY_MIDDLE_WORDS) {
        for (const suffix of COMPANY_SUFFIXES) {
          const name = `${first} ${middle} ${suffix}`;
          expect(name.length, name).toBeLessThanOrEqual(MAX_IDENTITY_LENGTH);
        }
      }
    }
  });

  it("never doubles a corporate suffix", () => {
    for (const middle of COMPANY_MIDDLE_WORDS) {
      for (const suffix of COMPANY_SUFFIXES) {
        expect(middle.split(" "), middle).not.toContain(suffix);
      }
    }
  });
});

describe("rollFounderName", () => {
  it("is deterministic for a given seed", () => {
    expect(rollFounderName(new Rng(777))).toBe(rollFounderName(new Rng(777)));

    const streamA = new Rng(2026);
    const streamB = new Rng(2026);
    const runA = Array.from({ length: 20 }, () => rollFounderName(streamA));
    const runB = Array.from({ length: 20 }, () => rollFounderName(streamB));
    expect(runA).toEqual(runB);
  });

  it("draws from broad, internationally diverse lists", () => {
    expect(GIVEN_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(SURNAMES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(GIVEN_NAMES).size).toBe(GIVEN_NAMES.length);
    expect(new Set(SURNAMES).size).toBe(SURNAMES.length);
  });

  it("is a given name plus a surname, both from the tables", () => {
    for (const name of rollMany(rollFounderName)) {
      const parts = name.split(" ");
      expect(parts, name).toHaveLength(2);
      expect(GIVEN_NAMES, name).toContain(parts[0]);
      expect(SURNAMES, name).toContain(parts[1]);
      expect(name.length).toBeLessThanOrEqual(MAX_IDENTITY_LENGTH);
    }
  });

  it("varies with the seed across both halves", () => {
    const names = rollMany(rollFounderName);
    expect(new Set(names).size).toBeGreaterThan(150);
    expect(new Set(names.map((n) => n.split(" ")[0])).size).toBeGreaterThan(30);
    expect(new Set(names.map((n) => n.split(" ")[1])).size).toBeGreaterThan(30);
  });

  it("ties no name to any portrait", () => {
    // A name list that leaked portrait vocabulary would be a correlation bug.
    const portraitWords = new Set(["white", "black", "asian", "mixed", "woman", "man"]);
    for (const name of [...GIVEN_NAMES, ...SURNAMES]) {
      expect(portraitWords.has(name.toLowerCase()), name).toBe(false);
    }
  });
});

describe("FOUNDER_PORTRAITS", () => {
  it("has exactly eight entries, four feminine and four masculine", () => {
    expect(FOUNDER_PORTRAITS).toHaveLength(8);
    const feminine = FOUNDER_PORTRAITS.filter((p) => p.presentation === "feminine");
    const masculine = FOUNDER_PORTRAITS.filter((p) => p.presentation === "masculine");
    expect(feminine).toHaveLength(4);
    expect(masculine).toHaveLength(4);
  });

  it("covers each heritage exactly once within each presentation set", () => {
    const heritages = ["asian", "black", "mixed", "white"];
    for (const presentation of ["feminine", "masculine"] as const) {
      const set = FOUNDER_PORTRAITS.filter((p) => p.presentation === presentation);
      expect(set.map((p) => p.heritage).sort()).toEqual(heritages);
    }
  });

  it("uses stable kebab-case ids and matching generated-asset paths", () => {
    const ids = FOUNDER_PORTRAITS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const portrait of FOUNDER_PORTRAITS) {
      expect(portrait.id).toMatch(/^founder-[a-z]+(-[a-z]+)+$/);
      expect(portrait.file).toBe(`assets/gen/${portrait.id}.svg`);
      expect(portrait.label.length).toBeGreaterThan(0);
    }
    expect(ids).toContain("founder-asian-woman");
    expect(ids).toContain("founder-mixed-woman");
  });

  it("is purely cosmetic: no portrait carries a stat of any kind", () => {
    const allowed = ["file", "heritage", "id", "label", "presentation"];
    for (const portrait of [...FOUNDER_PORTRAITS, ...TEAM_PORTRAITS]) {
      expect(Object.keys(portrait).sort(), portrait.id).toEqual(allowed);
      for (const value of Object.values(portrait)) {
        expect(typeof value, portrait.id).toBe("string");
      }
    }
  });
});

describe("TEAM_PORTRAITS", () => {
  it("has one portrait per hireable role", () => {
    expect(TEAM_PORTRAITS).toHaveLength(6);
    expect(TEAM_PORTRAITS.map((p) => p.id).sort()).toEqual(
      ALL_ROLES.map((role) => `team-${role}`).sort(),
    );
  });

  it("matches teamPortraitId and the generated-asset path", () => {
    for (const role of ALL_ROLES) {
      const id = teamPortraitId(role);
      const portrait = TEAM_PORTRAITS.find((p) => p.id === id);
      expect(portrait, id).toBeDefined();
      expect(portrait!.file).toBe(`assets/gen/${id}.svg`);
      expect(portrait!.label.length).toBeGreaterThan(0);
    }
  });

  it("varies presentation and covers every heritage", () => {
    const presentations = new Set(TEAM_PORTRAITS.map((p) => p.presentation));
    expect(presentations.size).toBe(2);
    const heritages = new Set(TEAM_PORTRAITS.map((p) => p.heritage));
    expect([...heritages].sort()).toEqual(["asian", "black", "mixed", "white"]);
  });
});

describe("portraitById", () => {
  it("resolves every founder and team id, and nothing else", () => {
    for (const portrait of [...FOUNDER_PORTRAITS, ...TEAM_PORTRAITS]) {
      expect(portraitById(portrait.id)).toEqual(portrait);
    }
    expect(portraitById("founder-does-not-exist")).toBeNull();
    expect(portraitById("")).toBeNull();
  });
});

describe("defaultIdentity", () => {
  it("is deterministic for a given seed", () => {
    expect(defaultIdentity(new Rng(5150))).toEqual(defaultIdentity(new Rng(5150)));
  });

  it("rolls a valid company name, founder name and portrait id", () => {
    const portraitIds = new Set(FOUNDER_PORTRAITS.map((p) => p.id));
    for (const seed of SAMPLE_SEEDS) {
      const identity = defaultIdentity(new Rng(seed));
      expect(COMPANY_SUFFIXES.some((s) => identity.companyName.endsWith(` ${s}`))).toBe(true);
      expect(identity.companyName.length).toBeLessThanOrEqual(MAX_IDENTITY_LENGTH);
      expect(identity.founderName.split(" ")).toHaveLength(2);
      expect(identity.founderName.length).toBeLessThanOrEqual(MAX_IDENTITY_LENGTH);
      expect(portraitIds.has(identity.portraitId), identity.portraitId).toBe(true);
    }
  });

  it("reaches every portrait and many names across seeds", () => {
    const identities = SAMPLE_SEEDS.map((seed) => defaultIdentity(new Rng(seed)));
    expect(new Set(identities.map((i) => i.portraitId)).size).toBe(FOUNDER_PORTRAITS.length);
    expect(new Set(identities.map((i) => i.companyName)).size).toBeGreaterThan(100);
    expect(new Set(identities.map((i) => i.founderName)).size).toBeGreaterThan(100);
  });

  it("survives sanitizeIdentity unchanged", () => {
    for (const seed of SAMPLE_SEEDS.slice(0, 50)) {
      const identity = defaultIdentity(new Rng(seed));
      expect(sanitizeIdentity(identity, new Rng(1))).toEqual(identity);
    }
  });
});

describe("seedFromCompanyName", () => {
  it("is stable: the same name always produces the same seed", () => {
    const name = "Meridian Rotables Inc.";
    const first = seedFromCompanyName(name);
    for (let i = 0; i < 25; i += 1) {
      expect(seedFromCompanyName(name)).toBe(first);
    }
  });

  it("is always a positive, non-zero 32-bit integer", () => {
    const names = [
      "",
      " ",
      "a",
      "Meridian Rotables Inc.",
      "Northstar Aero Asset Management Inc.",
      "Kestrel Component Partners Inc.",
      ...rollMany(rollCompanyName),
    ];
    for (const name of names) {
      const seed = seedFromCompanyName(name);
      expect(Number.isInteger(seed), name).toBe(true);
      expect(seed, name).toBeGreaterThan(0);
      expect(seed, name).toBeLessThan(2 ** 32);
    }
  });

  it("normalizes case and whitespace so near-identical typing opens one world", () => {
    const canonical = seedFromCompanyName("Meridian Rotables Inc.");
    expect(seedFromCompanyName("  Meridian Rotables Inc.  ")).toBe(canonical);
    expect(seedFromCompanyName("Meridian   Rotables    Inc.")).toBe(canonical);
    expect(seedFromCompanyName("meridian rotables inc.")).toBe(canonical);
    expect(seedFromCompanyName("MERIDIAN ROTABLES INC.")).toBe(canonical);
  });

  it("separates names that differ at all", () => {
    expect(seedFromCompanyName("Kestrel Rotables Inc.")).not.toBe(
      seedFromCompanyName("Kestrel Rotables Ltd."),
    );
    expect(seedFromCompanyName("Meridian Rotables Inc")).not.toBe(
      seedFromCompanyName("Meridian Rotables Inc."),
    );

    const seeds = new Set<number>();
    let count = 0;
    for (const first of COMPANY_FIRST_WORDS) {
      for (const middle of COMPANY_MIDDLE_WORDS) {
        for (const suffix of COMPANY_SUFFIXES) {
          seeds.add(seedFromCompanyName(`${first} ${middle} ${suffix}`));
          count += 1;
        }
      }
    }
    expect(seeds.size).toBe(count);
  });

  it("drives the same world from the same name", () => {
    const name = "Kestrel Component Partners Inc.";
    const runA = Array.from({ length: 10 }, () => 0);
    const rngA = new Rng(seedFromCompanyName(name));
    const rngB = new Rng(seedFromCompanyName("  kestrel   component partners inc. "));
    const drawA = runA.map(() => rngA.next());
    const drawB = runA.map(() => rngB.next());
    expect(drawA).toEqual(drawB);

    const other = new Rng(seedFromCompanyName("Osprey Surplus Trading LLC"));
    expect(runA.map(() => other.next())).not.toEqual(drawA);
  });
});

describe("sanitizeIdentity", () => {
  const portraitIds = new Set(FOUNDER_PORTRAITS.map((p) => p.id));

  it("rolls a replacement for blank or whitespace-only fields", () => {
    const blank = sanitizeIdentity({ companyName: "", founderName: "   " }, new Rng(808));
    expect(COMPANY_SUFFIXES.some((s) => blank.companyName.endsWith(` ${s}`))).toBe(true);
    expect(blank.founderName.split(" ")).toHaveLength(2);
    expect(GIVEN_NAMES).toContain(blank.founderName.split(" ")[0]);
    expect(portraitIds.has(blank.portraitId)).toBe(true);
  });

  it("rolls a replacement for missing fields", () => {
    const empty = sanitizeIdentity({}, new Rng(909));
    expect(empty.companyName.length).toBeGreaterThan(0);
    expect(empty.founderName.length).toBeGreaterThan(0);
    expect(empty.portraitId).toBe(FOUNDER_PORTRAITS[0]!.id);
    expect(sanitizeIdentity({}, new Rng(909))).toEqual(empty);
  });

  it("uses the same roll as defaultIdentity for a fully blank form", () => {
    const rolled = defaultIdentity(new Rng(4711));
    const sanitized = sanitizeIdentity({ companyName: "", founderName: "" }, new Rng(4711));
    expect(sanitized.companyName).toBe(rolled.companyName);
    expect(sanitized.founderName).toBe(rolled.founderName);
  });

  it("caps overlong input at 48 characters", () => {
    const long = sanitizeIdentity(
      { companyName: "Q".repeat(100), founderName: "Z".repeat(60), portraitId: "founder-black-man" },
      new Rng(1),
    );
    expect(long.companyName).toHaveLength(MAX_IDENTITY_LENGTH);
    expect(long.companyName).toBe("Q".repeat(MAX_IDENTITY_LENGTH));
    expect(long.founderName).toHaveLength(MAX_IDENTITY_LENGTH);
    expect(long.portraitId).toBe("founder-black-man");
  });

  it("leaves no trailing space when the cap lands on one", () => {
    const input = `${"A".repeat(47)} ${"B".repeat(20)}`;
    const capped = sanitizeIdentity({ companyName: input, founderName: "Mei Tanaka" }, new Rng(1));
    expect(capped.companyName).toBe("A".repeat(47));
    expect(capped.companyName).not.toMatch(/\s$/);
  });

  it("trims, collapses inner whitespace and strips control characters", () => {
    const messy = sanitizeIdentity(
      {
        companyName: "  Meridian\tRotables\nInc.  ",
        founderName: " Amara\u0007 Okafor ",
        portraitId: " founder-asian-woman ",
      },
      new Rng(1),
    );
    expect(messy.companyName).toBe("Meridian Rotables Inc.");
    expect(messy.founderName).toBe("Amara Okafor");
    expect(messy.portraitId).toBe("founder-asian-woman");
  });

  it("falls back to the first portrait on an unknown portrait id", () => {
    const bogus = ["nope", "founder-purple-alien", "team-buyer", "", "   ", "FOUNDER-ASIAN-WOMAN"];
    for (const portraitId of bogus) {
      const result = sanitizeIdentity(
        { companyName: "Kestrel Rotables Inc.", founderName: "Mei Tanaka", portraitId },
        new Rng(1),
      );
      expect(result.portraitId, portraitId).toBe(FOUNDER_PORTRAITS[0]!.id);
    }
  });

  it("keeps every valid portrait id", () => {
    for (const portrait of FOUNDER_PORTRAITS) {
      const result = sanitizeIdentity(
        { companyName: "Vantage Rotables LLC", founderName: "Ravi Iyer", portraitId: portrait.id },
        new Rng(1),
      );
      expect(result.portraitId).toBe(portrait.id);
    }
  });

  it("does not touch the rng when nothing needs rolling", () => {
    const rng = new Rng(6060);
    const before = rng.getState();
    sanitizeIdentity(
      {
        companyName: "Northstar Aero Asset Management Inc.",
        founderName: "Thandiwe Mensah",
        portraitId: "founder-mixed-man",
      },
      rng,
    );
    expect(rng.getState()).toBe(before);
  });

  it("is deterministic for the same input and seed", () => {
    const input = { companyName: "   ", founderName: "", portraitId: "bogus" };
    expect(sanitizeIdentity(input, new Rng(31))).toEqual(sanitizeIdentity(input, new Rng(31)));
    expect(sanitizeIdentity(input, new Rng(31))).not.toEqual(sanitizeIdentity(input, new Rng(32)));
  });

  it("always returns something the set_identity contract accepts", () => {
    const inputs: Partial<{ companyName: string; founderName: string; portraitId: string }>[] = [
      {},
      { companyName: "" },
      { founderName: "\t\n " },
      { companyName: "x".repeat(500), founderName: "y".repeat(500), portraitId: "z".repeat(500) },
      { companyName: "Ok Co Inc.", founderName: "Wei Zhang", portraitId: "founder-white-man" },
    ];
    for (const [index, input] of inputs.entries()) {
      const result = sanitizeIdentity(input, new Rng(index + 1));
      expect(result.companyName.length, `${index}`).toBeGreaterThan(0);
      expect(result.companyName.length, `${index}`).toBeLessThanOrEqual(MAX_IDENTITY_LENGTH);
      expect(result.founderName.length, `${index}`).toBeGreaterThan(0);
      expect(result.founderName.length, `${index}`).toBeLessThanOrEqual(MAX_IDENTITY_LENGTH);
      expect(portraitIds.has(result.portraitId), `${index}`).toBe(true);
      expect(result.portraitId.length).toBeLessThanOrEqual(64);
    }
  });
});
