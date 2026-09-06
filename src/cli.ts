import { evolve } from "./experiment/evolve.ts";
import { runBalanceSuite } from "./experiment/balance-suite.ts";
import { scoreCampaign } from "./experiment/fitness.ts";
import { runSequence } from "./experiment/sequence.ts";
import { defaultConfig, runCampaign } from "./sim/campaign.ts";
import { formatAcc } from "./sim/util.ts";
import { startServer } from "./server/http.ts";
import { DEFAULT_POLICY } from "./sim/world.ts";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  return fallback;
}

function num(name: string, fallback: number): number {
  const v = arg(name);
  return v ? Number(v) : fallback;
}

const cmd = process.argv[2] ?? "help";

if (cmd === "run") {
  const seed = num("seed", 1);
  const ticks = num("ticks", 100);
  const result = runCampaign(defaultConfig({ seed, ticks }), DEFAULT_POLICY);
  const score = scoreCampaign(result);
  process.stdout.write(
    JSON.stringify(
      {
        seed,
        ticks: result.ticks,
        nav: result.nav,
        navDisplay: formatAcc(result.nav),
        cash: result.cash,
        fillRate: Number(result.fillRate.toFixed(3)),
        insolvent: result.insolvent,
        fitness: Number(score.fitness.toFixed(4)),
        irr: Number(score.irr.toFixed(4)),
        events: result.events,
      },
      null,
      2,
    ) + "\n",
  );
} else if (cmd === "evolve") {
  const result = evolve({
    seed: num("seed", 1),
    campaign: { ticks: num("ticks", 40), partCount: num("parts", 40), airlineCount: num("airlines", 8) },
    generation: { generations: num("generations", 3), populationSize: num("population", 8) },
    genome: {},
    fitness: {},
  });
  process.stdout.write(
    JSON.stringify(
      {
        seed: result.seed,
        generations: result.generations.map((g) => ({
          generation: g.generation,
          meanFitness: Number(g.meanFitness.toFixed(4)),
          bestFitness: Number(g.best.score.fitness.toFixed(4)),
          bestNav: g.best.score.nav,
          bestFill: Number(g.best.score.fillRate.toFixed(3)),
        })),
        bestPolicy: result.best.policy,
      },
      null,
      2,
    ) + "\n",
  );
} else if (cmd === "sequence") {
  const report = runSequence(num("seed", 1));
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else if (cmd === "balance") {
  const seed = num("seed", 101);
  const seeds = Array.from({ length: num("seeds", 5) }, (_, index) => seed + index);
  process.stdout.write(JSON.stringify(runBalanceSuite(seeds, num("ticks", 24)), null, 2) + "\n");
} else if (cmd === "serve") {
  startServer(num("port", 8787));
} else {
  process.stdout.write(`Aero Asset Tycoon headless sim

  npm run sim -- run --seed 1 --ticks 100
  npm run sim -- evolve --seed 1 --generations 3 --population 8 --ticks 40
  npm run sim -- sequence --seed 1
  npm run sim -- balance --seed 101 --seeds 5 --ticks 24
  npm run sim -- serve --port 8787
`);
}
