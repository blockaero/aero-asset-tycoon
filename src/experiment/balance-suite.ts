import { defaultConfig, runCampaign } from "../sim/campaign.ts";
import type { StandingPolicy } from "../sim/types.ts";
import { DEFAULT_POLICY } from "../sim/world.ts";

export type ArchetypeReport = {
  id: string;
  label: string;
  averageAcc: number;
  averageNav: number;
  averageFillRate: number;
  insolvencies: number;
  seeds: number[];
};

const ARCHETYPES: { id: string; label: string; policy: StandingPolicy }[] = [
  { id: "balanced", label: "Balanced founder", policy: { ...DEFAULT_POLICY } },
  {
    id: "conservative",
    label: "Liquidity-first broker",
    policy: { ...DEFAULT_POLICY, cashFloor: 4_000_000, targetStockRotable: 1, autoAcceptMargin: 0.16, exchangeBias: 0.2 },
  },
  {
    id: "stockist",
    label: "Deep stockist",
    policy: { ...DEFAULT_POLICY, cashFloor: 900_000, targetStockRotable: 5, targetStockExpendable: 16, autoAcceptMargin: 0.1 },
  },
  {
    id: "aog",
    label: "AOG specialist",
    policy: { ...DEFAULT_POLICY, aogAggressiveness: 0.95, autoAcceptMargin: 0.35, targetStockRotable: 4 },
  },
  {
    id: "exchange",
    label: "Exchange pool operator",
    policy: { ...DEFAULT_POLICY, exchangeBias: 0.95, autoRepairCeil: 0.7, autoAcceptMargin: 0.18, targetStockRotable: 4 },
  },
];

export function runBalanceSuite(
  seeds = [101, 102, 103, 104, 105],
  ticks = 24,
): ArchetypeReport[] {
  return ARCHETYPES.map((archetype) => {
    const results = seeds.map((seed) =>
      runCampaign(defaultConfig({ seed, ticks }), archetype.policy),
    );
    return {
      id: archetype.id,
      label: archetype.label,
      averageAcc: Math.round(results.reduce((sum, result) => sum + result.accBalance, 0) / results.length),
      averageNav: Math.round(results.reduce((sum, result) => sum + result.nav, 0) / results.length),
      averageFillRate: results.reduce((sum, result) => sum + result.fillRate, 0) / results.length,
      insolvencies: results.filter((result) => result.insolvent).length,
      seeds: [...seeds],
    };
  });
}
