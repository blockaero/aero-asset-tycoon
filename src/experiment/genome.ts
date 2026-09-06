import { Rng } from "../sim/rng.ts";
import type { StandingPolicy } from "../sim/types.ts";
import { DEFAULT_POLICY } from "../sim/world.ts";

export type GenomeParams = {
  mutationRate: number;
  mutationScale: number;
};

export const DEFAULT_GENOME: GenomeParams = {
  mutationRate: 0.25,
  mutationScale: 0.2,
};

export function randomPolicy(rng: Rng): StandingPolicy {
  return {
    cashFloor: rng.int(400_000, 3_500_000),
    autoAcceptMargin: rng.float(0.08, 0.4),
    replenishPriceCeil: rng.float(0.7, 1.15),
    targetStockRotable: rng.int(1, 8),
    targetStockExpendable: rng.int(4, 24),
    autoRepairCeil: rng.float(0.2, 0.7),
    aogAggressiveness: rng.float(0.1, 0.95),
    exchangeBias: rng.float(0.2, 0.9),
  };
}

export function mutatePolicy(parent: StandingPolicy, rng: Rng, params: GenomeParams): StandingPolicy {
  const child = { ...parent };
  const s = params.mutationScale;
  if (rng.chance(params.mutationRate)) child.cashFloor = clampInt(child.cashFloor * (1 + rng.float(-s, s)), 200_000, 5_000_000);
  if (rng.chance(params.mutationRate)) child.autoAcceptMargin = clamp(child.autoAcceptMargin + rng.float(-s, s), 0.05, 0.5);
  if (rng.chance(params.mutationRate)) child.replenishPriceCeil = clamp(child.replenishPriceCeil + rng.float(-s, s), 0.5, 1.3);
  if (rng.chance(params.mutationRate)) child.targetStockRotable = clampInt(child.targetStockRotable + rng.int(-2, 2), 0, 12);
  if (rng.chance(params.mutationRate)) child.targetStockExpendable = clampInt(child.targetStockExpendable + rng.int(-4, 4), 0, 40);
  if (rng.chance(params.mutationRate)) child.autoRepairCeil = clamp(child.autoRepairCeil + rng.float(-s, s), 0.1, 0.9);
  if (rng.chance(params.mutationRate)) child.aogAggressiveness = clamp(child.aogAggressiveness + rng.float(-s, s), 0, 1);
  if (rng.chance(params.mutationRate)) child.exchangeBias = clamp(child.exchangeBias + rng.float(-s, s), 0, 1);
  return child;
}

export function crossover(a: StandingPolicy, b: StandingPolicy, rng: Rng): StandingPolicy {
  const pick = <K extends keyof StandingPolicy>(k: K): StandingPolicy[K] => (rng.chance(0.5) ? a[k] : b[k]);
  return {
    cashFloor: pick("cashFloor"),
    autoAcceptMargin: pick("autoAcceptMargin"),
    replenishPriceCeil: pick("replenishPriceCeil"),
    targetStockRotable: pick("targetStockRotable"),
    targetStockExpendable: pick("targetStockExpendable"),
    autoRepairCeil: pick("autoRepairCeil"),
    aogAggressiveness: pick("aogAggressiveness"),
    exchangeBias: pick("exchangeBias"),
  };
}

export function baselinePolicy(): StandingPolicy {
  return { ...DEFAULT_POLICY };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.round(clamp(n, lo, hi));
}
