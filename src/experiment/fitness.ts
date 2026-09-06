import { TICKS_PER_YEAR } from "../sim/balance.ts";
import type { CampaignResult } from "../sim/campaign.ts";
import { FITNESS } from "../sim/balance.ts";
import { STARTING_CAPITAL } from "../sim/balance.ts";

export type FitnessWeights = {
  nav: number;
  irr: number;
  fillRate: number;
};

export const DEFAULT_WEIGHTS: FitnessWeights = { ...FITNESS };

export type Scorecard = {
  nav: number;
  irr: number;
  fillRate: number;
  insolvent: boolean;
  fitness: number;
};

export function scoreCampaign(result: CampaignResult, weights: FitnessWeights = DEFAULT_WEIGHTS): Scorecard {
  const start = STARTING_CAPITAL;
  const years = Math.max(1 / 52, result.ticks / TICKS_PER_YEAR);
  const irr = result.nav <= 0 || start <= 0 ? -1 : (result.nav / start) ** (1 / years) - 1;
  const navScore = clamp(result.nav / (start * 2), 0, 1.5);
  const irrScore = clamp((irr + 0.2) / 0.8, 0, 1.5);
  const fillScore = clamp(result.fillRate / 0.5, 0, 1.5);
  let fitness = weights.nav * navScore + weights.irr * irrScore + weights.fillRate * fillScore;
  if (result.insolvent) fitness *= 0.15;
  return { nav: result.nav, irr, fillRate: result.fillRate, insolvent: result.insolvent, fitness };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
