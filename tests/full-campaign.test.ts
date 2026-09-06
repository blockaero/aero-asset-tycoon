import { describe, expect, it } from "vitest";
import { defaultConfig, runCampaign } from "../src/sim/campaign.ts";

describe("100-week first playable scale", () => {
  it("runs the full catalog, organization network, rivals, and pulses", () => {
    const result = runCampaign(defaultConfig({ seed: 97, ticks: 100 }));
    expect(result.ticks).toBe(100);
    expect(result.world.parts).toHaveLength(100);
    expect(result.world.airlines).toHaveLength(12);
    expect(result.world.firms).toHaveLength(4);
    expect(result.world.pulses).toHaveLength(100);
    expect(result.world.networkNodes.length).toBeGreaterThan(12);
    expect(result.world.networkNodes.filter((node) => node.state !== "locked").length).toBeGreaterThan(3);
    expect(result.world.units.every((unit) => !(unit.facilityId && unit.transferId))).toBe(true);
    expect(result.world.units.every((unit) => unit.tsn >= 0 && unit.csn >= 0 && unit.tsr >= 0 && unit.csr >= 0)).toBe(true);
    expect(result.world.units.every((unit) => unit.tsr <= unit.tsn && unit.csr <= unit.csn && unit.tso <= unit.tsn && unit.cso <= unit.csn)).toBe(true);
    // A base part applies to every series its archetype covers; jittered variants narrow
    // to one. The invariant that matters is that applicability is non-empty and real.
    const seriesIds = new Set(result.world.series.map((series) => series.id));
    expect(result.world.parts.every((part) => part.seriesIds.length >= 1)).toBe(true);
    expect(
      result.world.parts.every((part) => part.seriesIds.every((id) => seriesIds.has(id))),
    ).toBe(true);
    expect(result.world.parts.some((part) => part.seriesIds.length > 1)).toBe(true);
    expect(result.world.units.every((unit) => {
      const part = result.world.parts.find((candidate) => candidate.id === unit.partId);
      return part?.serialized || (unit.tsn === 0 && unit.csn === 0 && unit.tsr === 0 && unit.csr === 0);
    })).toBe(true);
    expect(result.world.firms[0]!.accBalance).toBeGreaterThanOrEqual(0);
  });
});
