import type { GameState } from "../sim/types.ts";

export type SaveSummary = {
  id: string;
  savedAt: string;
  tick: number;
  seed: number;
  engineVersion: string;
};

/** Persistence used by the live runner. Node uses the filesystem; the browser uses localStorage. */
export type SaveBackend = {
  save(id: string, state: GameState): Promise<SaveSummary>;
  load(id: string): Promise<GameState>;
  list(): Promise<SaveSummary[]>;
};

export function sanitizeSaveId(id: string): string {
  const safe = id.trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  if (!safe) throw new Error("Invalid save id");
  return safe;
}

export function saveSummary(id: string, state: GameState, savedAt: string): SaveSummary {
  return {
    id,
    savedAt,
    tick: state.world.tick,
    seed: state.world.seed,
    engineVersion: state.engineVersion,
  };
}
