import { describe, expect, it } from "vitest";
import { defaultConfig, runCampaign } from "../src/sim/campaign.ts";
import { createWorld } from "../src/sim/world.ts";

describe("deterministic campaign", () => {
  it("replays the same seed to the same NAV and fill rate", () => {
    const cfg = defaultConfig({ seed: 42, ticks: 20, partCount: 40, airlineCount: 8 });
    const a = runCampaign(cfg);
    const b = runCampaign(cfg);
    expect(a.nav).toBe(b.nav);
    expect(a.cash).toBe(b.cash);
    expect(a.fillRate).toBe(b.fillRate);
    expect(a.events).toBe(b.events);
    expect(a.world.tick).toBe(20);
  });

  it("builds curated slice and 100-part full catalogs", () => {
    const slice = createWorld(defaultConfig({ seed: 7, ticks: 24 }));
    const full = createWorld(defaultConfig({ seed: 7, ticks: 100 }));
    expect(slice.parts).toHaveLength(18);
    expect(full.parts).toHaveLength(100);
    expect(full.series.filter((s) => s.kind === "airframe")).toHaveLength(3);
    expect(full.series.filter((s) => s.kind === "engine")).toHaveLength(3);
    expect(full.firms).toHaveLength(4);
  });
});
