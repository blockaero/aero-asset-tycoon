import { describe, expect, it } from "vitest";
import {
  EAST_EDGE,
  EAST_MERIDIAN,
  WEST_EDGE,
  WEST_MERIDIAN,
  meridianXAt,
  regionFillPoints,
  regionIdForPoint,
  regionLabelAnchor,
} from "../src/client/chart-geometry.ts";

describe("aviation chart tessellation", () => {
  it("keeps west meridian west of east meridian at every latitude", () => {
    for (let y = 2; y <= 98; y += 2) {
      expect(meridianXAt(WEST_MERIDIAN, y)).toBeLessThan(meridianXAt(EAST_MERIDIAN, y) - 8);
    }
  });

  it("assigns every sample point to exactly one theater", () => {
    const seen = new Set<string>();
    for (let x = 0; x <= 100; x += 5) {
      for (let y = 0; y <= 100; y += 5) {
        const id = regionIdForPoint(x, y);
        expect(["pacific", "kanto", "atlantic"]).toContain(id);
        seen.add(id);
      }
    }
    expect([...seen].sort()).toEqual(["atlantic", "kanto", "pacific"]);
  });

  it("reuses the same shared-edge vertices on adjacent fills", () => {
    const pacific = regionFillPoints("pacific");
    const kanto = regionFillPoints("kanto");
    const atlantic = regionFillPoints("atlantic");
    expect(pacific.slice(1, 1 + WEST_EDGE.length)).toEqual(WEST_EDGE);
    expect(kanto.slice(0, WEST_EDGE.length)).toEqual(WEST_EDGE);
    expect(kanto.slice(WEST_EDGE.length)).toEqual(EAST_EDGE.slice().reverse());
    expect(atlantic.slice(2)).toEqual(EAST_EDGE.slice().reverse());
  });

  it("puts the home belt and the two oceans in the expected cells", () => {
    expect(regionIdForPoint(50, 53)).toBe("kanto");
    expect(regionIdForPoint(23, 25)).toBe("pacific");
    expect(regionIdForPoint(84, 48)).toBe("atlantic");
  });

  it("keeps charted aerodromes off the shared meridians", () => {
    const fields = [
      { x: 50, y: 53, region: "kanto" },
      { x: 23, y: 25, region: "pacific" },
      { x: 34, y: 72, region: "kanto" },
      { x: 64, y: 71, region: "kanto" },
      { x: 84, y: 48, region: "atlantic" },
    ] as const;
    for (const field of fields) {
      expect(regionIdForPoint(field.x, field.y)).toBe(field.region);
      expect(Math.abs(field.x - meridianXAt(WEST_MERIDIAN, field.y))).toBeGreaterThan(3);
      expect(Math.abs(field.x - meridianXAt(EAST_MERIDIAN, field.y))).toBeGreaterThan(3);
    }
  });

  it("anchors Roman-numeral labels inside their own theater", () => {
    for (const id of ["pacific", "kanto", "atlantic"] as const) {
      const [x, y] = regionLabelAnchor(id);
      expect(regionIdForPoint(x, y)).toBe(id);
    }
  });
});
