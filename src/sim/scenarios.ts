import type { World } from "./types.ts";

export type ScenarioDefinition = {
  id: "prototype" | "full" | "shock";
  label: string;
  description: string;
  scripted: boolean;
};

export const SCENARIOS: Record<ScenarioDefinition["id"], ScenarioDefinition> = {
  prototype: {
    id: "prototype",
    label: "Founder’s First 24 Weeks",
    description: "Curated opening book, network introduction, AOG, AD and SB teaching beats.",
    scripted: true,
  },
  full: {
    id: "full",
    label: "Open Market",
    description: "One-hundred-week seeded aftermarket campaign.",
    scripted: false,
  },
  shock: {
    id: "shock",
    label: "Traffic Contraction",
    description: "Open market with an explicit early traffic shock and ten-week recovery.",
    scripted: true,
  },
};

export function injectScenarioWeek(world: World): void {
  if (world.scenario === "shock") {
    if (world.tick === 2) {
      world.economy.shockDepth = 0.2;
      world.economy.shockStart = world.tick;
      world.economy.shockUntil = world.tick + 20;
      world.events.push({
        tick: world.tick,
        kind: "traffic_shock",
        payload: { depth: world.economy.shockDepth, until: world.economy.shockUntil, scenario: true },
      });
    }
    return;
  }
  if (world.scenario !== "prototype") return;
  if (world.tick === 4) {
    const part = world.parts.find((candidate) => candidate.category === "rotable") ?? world.parts[0];
    const seriesId = part?.seriesIds[0];
    if (part && seriesId) {
      world.ads.push({
        kind: "ad",
        partId: part.id,
        seriesId,
        rumourUntil: 6,
        fireTick: 6,
        window: 12,
        severity: "minor",
        uptake: 1,
      });
      world.events.push({
        tick: world.tick,
        kind: "ad_rumour",
        payload: { partId: part.id, seriesId, fire: true, scenario: true },
      });
    }
  }
  if (world.tick === 8) {
    const part =
      world.parts.find((candidate) => candidate.removalMode === "conditionmonitored") ??
      world.parts[1];
    const seriesId = part?.seriesIds[0];
    if (part && seriesId) {
      world.ads.push({
        kind: "sb",
        partId: part.id,
        seriesId,
        rumourUntil: 10,
        fireTick: 10,
        window: 18,
        severity: "minor",
        uptake: 0.45,
      });
      world.events.push({
        tick: world.tick,
        kind: "sb_rumour",
        payload: { partId: part.id, seriesId, fire: true, scenario: true },
      });
    }
  }
  if (world.tick === 14) {
    world.economy.shockDepth = 0.12;
    world.economy.shockStart = world.tick;
    world.economy.shockUntil = world.tick + 10;
    world.events.push({
      tick: world.tick,
      kind: "traffic_shock",
      payload: { depth: world.economy.shockDepth, until: world.economy.shockUntil, scenario: true },
    });
  }
}
