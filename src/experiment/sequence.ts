import { defaultConfig, runCampaign } from "../sim/campaign.ts";
import type { CampaignConfig, StandingPolicy } from "../sim/types.ts";
import { DEFAULT_POLICY } from "../sim/world.ts";
import { DEFAULT_WEIGHTS, scoreCampaign, type FitnessWeights, type Scorecard } from "./fitness.ts";

export type Scenario = {
  id: string;
  label: string;
  ticks: number;
  seedOffset: number;
  rivalCount?: number;
  mode?: CampaignConfig["scenario"];
};

export const DEFAULT_SEQUENCE: Scenario[] = [
  { id: "baseline", label: "Baseline 2y", ticks: 100, seedOffset: 0, mode: "full" },
  { id: "traffic_shock", label: "Explicit traffic shock", ticks: 100, seedOffset: 0, mode: "shock" },
  { id: "crowded", label: "Crowded desk", ticks: 100, seedOffset: 0, rivalCount: 5, mode: "full" },
];

export type SequenceResult = {
  scenario: Scenario;
  score: Scorecard;
  nav: number;
  fillRate: number;
  insolvent: boolean;
};

export type SequenceReport = {
  seed: number;
  fitness: number;
  results: SequenceResult[];
};

export function runSequence(
  seed: number,
  policy: StandingPolicy = DEFAULT_POLICY,
  scenarios: Scenario[] = DEFAULT_SEQUENCE,
  campaign: Partial<CampaignConfig> = {},
  weights: FitnessWeights = DEFAULT_WEIGHTS,
): SequenceReport {
  const results: SequenceResult[] = [];
  for (const scenario of scenarios) {
    const cfg = defaultConfig({
      ...campaign,
      seed: seed + scenario.seedOffset,
      ticks: scenario.ticks,
      rivalCount: scenario.rivalCount ?? campaign.rivalCount ?? 3,
      scenario: scenario.mode ?? campaign.scenario ?? "full",
    });
    const campaignResult = runCampaign(cfg, policy);
    const score = scoreCampaign(campaignResult, weights);
    results.push({
      scenario,
      score,
      nav: campaignResult.nav,
      fillRate: campaignResult.fillRate,
      insolvent: campaignResult.insolvent,
    });
  }
  const fitness = results.reduce((s, r) => s + r.score.fitness, 0) / results.length;
  return { seed, fitness, results };
}
