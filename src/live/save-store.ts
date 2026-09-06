import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createSnapshot, restoreSnapshot } from "../sim/save.ts";
import type { GameState } from "../sim/types.ts";

export type SaveSummary = {
  id: string;
  savedAt: string;
  tick: number;
  seed: number;
  engineVersion: string;
};

export class SaveStore {
  readonly directory: string;

  constructor(directory = resolve(process.cwd(), ".aat", "saves")) {
    this.directory = directory;
  }

  async save(id: string, state: GameState): Promise<SaveSummary> {
    const safeId = sanitizeSaveId(id);
    await mkdir(this.directory, { recursive: true });
    const snapshot = createSnapshot(state);
    await writeFile(join(this.directory, `${safeId}.json`), JSON.stringify(snapshot, null, 2), "utf8");
    return {
      id: safeId,
      savedAt: snapshot.savedAt,
      tick: state.world.tick,
      seed: state.world.seed,
      engineVersion: state.engineVersion,
    };
  }

  async load(id: string): Promise<GameState> {
    const safeId = sanitizeSaveId(id);
    const json = await readFile(join(this.directory, `${safeId}.json`), "utf8");
    return restoreSnapshot(json);
  }

  async list(): Promise<SaveSummary[]> {
    await mkdir(this.directory, { recursive: true });
    const files = (await readdir(this.directory)).filter((file) => file.endsWith(".json"));
    const summaries: SaveSummary[] = [];
    for (const file of files) {
      try {
        const json = await readFile(join(this.directory, file), "utf8");
        const state = restoreSnapshot(json);
        const parsed = JSON.parse(json) as { savedAt?: string };
        summaries.push({
          id: file.slice(0, -5),
          savedAt: parsed.savedAt ?? "",
          tick: state.world.tick,
          seed: state.world.seed,
          engineVersion: state.engineVersion,
        });
      } catch {
        // Ignore corrupt files in the listing; explicit load reports the error.
      }
    }
    return summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
}

function sanitizeSaveId(id: string): string {
  const safe = id.trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  if (!safe) throw new Error("Invalid save id");
  return safe;
}
