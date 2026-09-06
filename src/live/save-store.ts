import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createSnapshot, restoreSnapshot } from "../sim/save.ts";
import type { GameState } from "../sim/types.ts";
import {
  sanitizeSaveId,
  saveSummary,
  type SaveBackend,
  type SaveSummary,
} from "./save-backend.ts";

export type { SaveBackend, SaveSummary } from "./save-backend.ts";
export { sanitizeSaveId } from "./save-backend.ts";

export class SaveStore implements SaveBackend {
  readonly directory: string;

  constructor(directory = resolve(process.cwd(), ".aat", "saves")) {
    this.directory = directory;
  }

  async save(id: string, state: GameState): Promise<SaveSummary> {
    const safeId = sanitizeSaveId(id);
    await mkdir(this.directory, { recursive: true });
    const snapshot = createSnapshot(state);
    await writeFile(join(this.directory, `${safeId}.json`), JSON.stringify(snapshot, null, 2), "utf8");
    return saveSummary(safeId, state, snapshot.savedAt);
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
        summaries.push(saveSummary(file.slice(0, -5), state, parsed.savedAt ?? ""));
      } catch {
        // Ignore corrupt files in the listing; explicit load reports the error.
      }
    }
    return summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
}
