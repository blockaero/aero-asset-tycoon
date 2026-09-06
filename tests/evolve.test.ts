import { describe, expect, it } from "vitest";
import { evolve } from "../src/experiment/evolve.ts";
import { runSequence } from "../src/experiment/sequence.ts";

describe("experiment runner", () => {
  it("evolves a population and reports generation fitness", () => {
    const result = evolve({
      seed: 3,
      campaign: { ticks: 12, partCount: 30, airlineCount: 6, rivalCount: 2 },
      generation: { generations: 2, populationSize: 4, eliteCount: 1, crossoverRate: 0.5 },
      genome: { mutationRate: 0.4, mutationScale: 0.2 },
      fitness: {},
    });
    expect(result.generations).toHaveLength(2);
    expect(result.best.score.fitness).toBeGreaterThan(0);
    expect(result.generations[0]!.population).toHaveLength(4);
    const seedSuites = result.generations[0]!.population.map((individual) => individual.evaluationSeeds);
    expect(seedSuites.every((suite) => JSON.stringify(suite) === JSON.stringify(seedSuites[0]))).toBe(true);
    expect(result.generations[1]!.population[0]!.evaluationSeeds).toEqual(seedSuites[0]);
  });

  it("runs a scenario sequence", () => {
    const report = runSequence(
      5,
      undefined,
      [
        { id: "a", label: "A", ticks: 8, seedOffset: 0 },
        { id: "b", label: "B", ticks: 8, seedOffset: 11 },
      ],
      { partCount: 30, airlineCount: 6, rivalCount: 2 },
    );
    expect(report.results).toHaveLength(2);
    expect(Number.isFinite(report.fitness)).toBe(true);
  });
});
