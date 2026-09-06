import { describe, expect, it } from "vitest";
import {
  ATA_CHAPTERS,
  ATA_GROUPS,
  ATA_GROUP_AFFINITY,
  ATA_GROUP_LABELS,
  ataAffinityBonus,
  ataAssetClass,
  ataChapter,
  ataGroupOf,
  ataLabel,
  ataTitle,
  chaptersInGroup,
  groupAtaCounts,
  partNumberAta,
} from "../src/sim/ata.ts";
import type { AtaGroup } from "../src/sim/types.ts";

const REQUIRED_CODES = [
  5, 6, 7, 10, 11, 12, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 45,
  46, 49, 51, 52, 53, 54, 55, 56, 57, 61, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 82, 83,
];

describe("ATA chapter table", () => {
  it("covers every aftermarket chapter exactly once, in code order", () => {
    const codes = ATA_CHAPTERS.map((chapter) => chapter.code);
    for (const code of REQUIRED_CODES) {
      expect(codes).toContain(code);
    }
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
  });

  it("uses the real iSpec 2200 titles", () => {
    expect(ataTitle(5)).toBe("Time Limits/Maintenance Checks");
    expect(ataTitle(21)).toBe("Air Conditioning");
    expect(ataTitle(24)).toBe("Electrical Power");
    expect(ataTitle(29)).toBe("Hydraulic Power");
    expect(ataTitle(32)).toBe("Landing Gear");
    expect(ataTitle(34)).toBe("Navigation");
    expect(ataTitle(49)).toBe("Airborne Auxiliary Power");
    expect(ataTitle(54)).toBe("Nacelles/Pylons");
    expect(ataTitle(72)).toBe("Engine");
    expect(ataTitle(73)).toBe("Engine Fuel and Control");
    expect(ataTitle(79)).toBe("Oil");
    expect(ataTitle(83)).toBe("Accessory Gearboxes");
  });

  it("falls back to a bare chapter number for chapters outside the taxonomy", () => {
    expect(ataChapter(99)).toBeUndefined();
    expect(ataTitle(99)).toBe("ATA 99");
    expect(ataLabel(99)).toBe("ATA 99");
    expect(ataGroupOf(99)).toBe("general");
  });

  it("labels chapters with a middot separator", () => {
    expect(ataLabel(32)).toBe("ATA 32 · Landing Gear");
    expect(ataLabel(72)).toBe("ATA 72 · Engine");
    expect(ataLabel(5)).toBe("ATA 5 · Time Limits/Maintenance Checks");
  });

  it("gives every chapter a real one-sentence blurb and a positive weight", () => {
    for (const chapter of ATA_CHAPTERS) {
      expect(chapter.blurb.length).toBeGreaterThan(30);
      expect(chapter.valueWeight).toBeGreaterThan(0);
      expect(chapter.valueWeight).toBeLessThan(1);
      expect(ATA_GROUPS).toContain(chapter.group);
    }
  });

  it("weights engine, landing gear and navigation chapters above everything else", () => {
    const heavy = [72, 32, 34, 73, 79];
    const top = [...ATA_CHAPTERS]
      .sort((a, b) => b.valueWeight - a.valueWeight)
      .slice(0, heavy.length)
      .map((chapter) => chapter.code);
    expect([...top].sort((a, b) => a - b)).toEqual([...heavy].sort((a, b) => a - b));

    const engine = ataChapter(72)!;
    for (const chapter of ATA_CHAPTERS) {
      if (chapter.code === 72) continue;
      expect(engine.valueWeight).toBeGreaterThan(chapter.valueWeight);
    }
  });
});

describe("ATA groups", () => {
  it("labels every group in the union", () => {
    for (const group of ATA_GROUPS) {
      expect(ATA_GROUP_LABELS[group].length).toBeGreaterThan(3);
    }
    expect(Object.keys(ATA_GROUP_LABELS).sort()).toEqual([...ATA_GROUPS].sort());
  });

  it("puts each chapter in the group a maintenance planner would expect", () => {
    expect(ataGroupOf(12)).toBe("general");
    expect(ataGroupOf(20)).toBe("general");
    expect(ataGroupOf(32)).toBe("airframe_systems");
    expect(ataGroupOf(27)).toBe("airframe_systems");
    expect(ataGroupOf(29)).toBe("airframe_systems");
    expect(ataGroupOf(53)).toBe("structures");
    expect(ataGroupOf(57)).toBe("structures");
    expect(ataGroupOf(72)).toBe("propulsion");
    expect(ataGroupOf(49)).toBe("propulsion");
    expect(ataGroupOf(61)).toBe("propulsion");
    expect(ataGroupOf(34)).toBe("avionics");
    expect(ataGroupOf(45)).toBe("avionics");
    expect(ataGroupOf(25)).toBe("utilities");
    expect(ataGroupOf(35)).toBe("utilities");
  });

  it("partitions the table: every chapter appears in exactly one group", () => {
    let total = 0;
    const seen = new Set<number>();
    for (const group of ATA_GROUPS) {
      const chapters = chaptersInGroup(group);
      total += chapters.length;
      for (const chapter of chapters) {
        expect(chapter.group).toBe(group);
        expect(seen.has(chapter.code)).toBe(false);
        seen.add(chapter.code);
      }
    }
    expect(total).toBe(ATA_CHAPTERS.length);
  });

  it("returns structures chapters 51 through 57 in code order", () => {
    expect(chaptersInGroup("structures").map((chapter) => chapter.code)).toEqual([
      51, 52, 53, 54, 55, 56, 57,
    ]);
  });

  it("returns an empty list for a group with no chapters", () => {
    const empty = chaptersInGroup("nonexistent" as AtaGroup);
    expect(empty).toEqual([]);
  });
});

describe("ataAffinityBonus", () => {
  it("pays full credit for an exact chapter match", () => {
    expect(ataAffinityBonus([24, 32, 72], 32)).toBe(1);
    expect(ataAffinityBonus([72], 72)).toBe(1);
  });

  it("pays partial credit inside the same group", () => {
    expect(ataAffinityBonus([73], 72)).toBeCloseTo(ATA_GROUP_AFFINITY, 10);
    expect(ATA_GROUP_AFFINITY).toBeGreaterThan(0.3);
    expect(ATA_GROUP_AFFINITY).toBeLessThan(0.4);
    // 34 Navigation and 23 Communications are both avionics.
    expect(ataAffinityBonus([23], 34)).toBeCloseTo(ATA_GROUP_AFFINITY, 10);
  });

  it("pays nothing across groups or for an empty knowledge set", () => {
    // 72 Engine is propulsion, 32 Landing Gear is airframe systems.
    expect(ataAffinityBonus([72], 32)).toBe(0);
    expect(ataAffinityBonus([], 32)).toBe(0);
    expect(ataAffinityBonus([53], 34)).toBe(0);
  });

  it("takes the best available match, not the first or the sum", () => {
    // 73 is a group match for 72, 72 is exact: the exact one wins regardless of order.
    expect(ataAffinityBonus([73, 72], 72)).toBe(1);
    expect(ataAffinityBonus([72, 73], 72)).toBe(1);
    // Two group matches still cap at the group rate.
    expect(ataAffinityBonus([73, 79, 80], 72)).toBeCloseTo(ATA_GROUP_AFFINITY, 10);
  });

  it("stays a 0..1 factor for every pair in the table", () => {
    for (const a of ATA_CHAPTERS) {
      for (const b of ATA_CHAPTERS) {
        const bonus = ataAffinityBonus([a.code], b.code);
        expect(bonus).toBeGreaterThanOrEqual(0);
        expect(bonus).toBeLessThanOrEqual(1);
      }
    }
  });

  it("gives an unknown target chapter only an exact match, never group credit", () => {
    expect(ataAffinityBonus([99], 99)).toBe(1);
    expect(ataAffinityBonus([5], 99)).toBe(0);
  });
});

describe("groupAtaCounts", () => {
  const rows = [
    { ata: 72 },
    { ata: 32 },
    { ata: 72 },
    { ata: 34 },
    { ata: 72 },
    { ata: 32 },
    { ata: 25 },
  ];

  it("rolls up counts sorted descending", () => {
    const rollup = groupAtaCounts(rows, (row) => row.ata);
    expect(rollup.map((entry) => entry.code)).toEqual([72, 32, 34, 25]);
    expect(rollup.map((entry) => entry.count)).toEqual([3, 2, 1, 1]);
  });

  it("carries the title and group onto each row", () => {
    const rollup = groupAtaCounts(rows, (row) => row.ata);
    expect(rollup[0]).toEqual({ code: 72, title: "Engine", group: "propulsion", count: 3 });
    expect(rollup[1]!.title).toBe("Landing Gear");
    expect(rollup[1]!.group).toBe("airframe_systems");
  });

  it("breaks count ties by aftermarket weight so ordering is stable", () => {
    // 34 Navigation outweighs 25 Equipment/Furnishings, so it sorts first at equal counts.
    const a = groupAtaCounts([{ ata: 25 }, { ata: 34 }], (row) => row.ata);
    const b = groupAtaCounts([{ ata: 34 }, { ata: 25 }], (row) => row.ata);
    expect(a.map((entry) => entry.code)).toEqual([34, 25]);
    expect(b.map((entry) => entry.code)).toEqual([34, 25]);
  });

  it("handles unknown chapters and empty input", () => {
    expect(groupAtaCounts([], (row: { ata: number }) => row.ata)).toEqual([]);
    const rollup = groupAtaCounts([{ ata: 99 }], (row) => row.ata);
    expect(rollup).toEqual([{ code: 99, title: "ATA 99", group: "general", count: 1 }]);
  });
});

describe("partNumberAta", () => {
  it("parses catalog style part numbers back to a chapter", () => {
    expect(partNumberAta("AAT-24-0001")).toBe(24);
    expect(partNumberAta("AAT-72-0148")).toBe(72);
    expect(partNumberAta("AAT-05-0003")).toBe(5);
  });

  it("round-trips the catalog's own padded format", () => {
    for (const code of [5, 24, 32, 72, 83]) {
      const id = `AAT-${String(code).padStart(2, "0")}-${String(7).padStart(4, "0")}`;
      expect(partNumberAta(id)).toBe(code);
    }
  });

  it("returns null for anything that is not a part number", () => {
    expect(partNumberAta("")).toBeNull();
    expect(partNumberAta("AAT-24")).toBeNull();
    expect(partNumberAta("unit-14")).toBeNull();
    expect(partNumberAta("AAT-AB-0001")).toBeNull();
    expect(partNumberAta("AAT-240-0001")).toBeNull();
    expect(partNumberAta("AAT-00-0001")).toBeNull();
  });
});

describe("ataAssetClass", () => {
  it("maps 71 and 72 through 83 to engine", () => {
    for (const code of [71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 82, 83]) {
      expect(ataAssetClass(code)).toBe("engine");
    }
  });

  it("maps 51 through 57 to airframe", () => {
    for (const code of [51, 52, 53, 54, 55, 56, 57]) {
      expect(ataAssetClass(code)).toBe("airframe");
    }
  });

  it("maps everything else to component", () => {
    for (const code of [5, 21, 24, 32, 34, 49, 61, 99]) {
      expect(ataAssetClass(code)).toBe("component");
    }
  });

  it("never claims a chapter is llp: that is a category, not a chapter", () => {
    for (const chapter of ATA_CHAPTERS) {
      expect(ataAssetClass(chapter.code)).not.toBe("llp");
    }
  });
});
