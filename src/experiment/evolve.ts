import { defaultConfig, runCampaign, type CampaignResult } from "../sim/campaign.ts";
import { Rng } from "../sim/rng.ts";
import type { CampaignConfig, StandingPolicy } from "../sim/types.ts";
import { DEFAULT_WEIGHTS, scoreCampaign, type FitnessWeights, type Scorecard } from "./fitness.ts";
import {
  DEFAULT_GENOME,
  crossover,
  mutatePolicy,
  randomPolicy,
  type GenomeParams,
} from "./genome.ts";

export type GenerationParams = {
  populationSize: number;
  generations: number;
  eliteCount: number;
  crossoverRate: number;
};

export const DEFAULT_GENERATION: GenerationParams = {
  populationSize: 12,
  generations: 4,
  eliteCount: 2,
  crossoverRate: 0.5,
};

export type IndividualResult = {
  policy: StandingPolicy;
  score: Scorecard;
  campaign: Omit<CampaignResult, "world" | "state">;
  evaluationSeeds: number[];
};

export type GenerationReport = {
  generation: number;
  best: IndividualResult;
  meanFitness: number;
  population: IndividualResult[];
};

export type EvolveRequest = {
  seed: number;
  campaign: Partial<CampaignConfig>;
  generation: Partial<GenerationParams>;
  genome: Partial<GenomeParams>;
  fitness: Partial<FitnessWeights>;
};

export type EvolveResult = {
  seed: number;
  generations: GenerationReport[];
  best: IndividualResult;
};

export function evolve(req: EvolveRequest): EvolveResult {
  const campaign = defaultConfig({ seed: req.seed, ...req.campaign });
  const gen = { ...DEFAULT_GENERATION, ...req.generation };
  const genome = { ...DEFAULT_GENOME, ...req.genome };
  const weights = { ...DEFAULT_WEIGHTS, ...req.fitness };
  const rng = new Rng(req.seed ^ 0x51ed);

  let pop: StandingPolicy[] = [];
  for (let i = 0; i < gen.populationSize; i++) pop.push(randomPolicy(rng));

  const reports: GenerationReport[] = [];
  let best: IndividualResult | null = null;

  for (let g = 0; g < gen.generations; g++) {
    // Every candidate sees the same worlds. Different seeds per candidate make fitness incomparable.
    const evaluationSeeds = [campaign.seed, campaign.seed + 17, campaign.seed + 34];
    const scored: IndividualResult[] = pop.map((policy) => {
      const results = evaluationSeeds.map((seed) => runCampaign({ ...campaign, seed }, policy));
      const scores = results.map((result) => scoreCampaign(result, weights));
      const representative = results[0]!;
      const { world: _world, state: _state, ...campaignRest } = representative;
      const score: Scorecard = {
        nav: Math.round(scores.reduce((sum, item) => sum + item.nav, 0) / scores.length),
        irr: scores.reduce((sum, item) => sum + item.irr, 0) / scores.length,
        fillRate: scores.reduce((sum, item) => sum + item.fillRate, 0) / scores.length,
        insolvent: scores.some((item) => item.insolvent),
        fitness: scores.reduce((sum, item) => sum + item.fitness, 0) / scores.length,
      };
      return { policy, score, campaign: campaignRest, evaluationSeeds };
    });
    scored.sort((a, b) => b.score.fitness - a.score.fitness);
    const genBest = scored[0]!;
    if (!best || genBest.score.fitness > best.score.fitness) best = genBest;
    const meanFitness = scored.reduce((s, x) => s + x.score.fitness, 0) / scored.length;
    reports.push({ generation: g, best: genBest, meanFitness, population: scored });

    const next: StandingPolicy[] = scored.slice(0, gen.eliteCount).map((x) => ({ ...x.policy }));
    while (next.length < gen.populationSize) {
      const a = tournament(scored, rng);
      const b = tournament(scored, rng);
      let child = rng.chance(gen.crossoverRate) ? crossover(a.policy, b.policy, rng) : { ...a.policy };
      child = mutatePolicy(child, rng, genome);
      next.push(child);
    }
    pop = next;
  }

  return { seed: req.seed, generations: reports, best: best! };
}

function tournament(scored: IndividualResult[], rng: Rng): IndividualResult {
  const a = rng.pick(scored);
  const b = rng.pick(scored);
  return a.score.fitness >= b.score.fitness ? a : b;
}
