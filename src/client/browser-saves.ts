import { createSnapshot, restoreSnapshot } from "../sim/save.ts";
import type { GameState } from "../sim/types.ts";
import {
  sanitizeSaveId,
  saveSummary,
  type SaveBackend,
  type SaveSummary,
} from "../live/save-backend.ts";

const PREFIX = "aat-save:";

function readStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Browser save backend for GitHub Pages and `vite` — no Node filesystem. */
export class BrowserSaveStore implements SaveBackend {
  constructor(private readonly storage: Storage | null = readStorage()) {}

  async save(id: string, state: GameState): Promise<SaveSummary> {
    const store = this.requireStorage();
    const safeId = sanitizeSaveId(id);
    const snapshot = createSnapshot(state);
    store.setItem(PREFIX + safeId, JSON.stringify(snapshot));
    return saveSummary(safeId, state, snapshot.savedAt);
  }

  async load(id: string): Promise<GameState> {
    const store = this.requireStorage();
    const safeId = sanitizeSaveId(id);
    const json = store.getItem(PREFIX + safeId);
    if (!json) throw new Error(`Save not found: ${safeId}`);
    return restoreSnapshot(json);
  }

  async list(): Promise<SaveSummary[]> {
    const store = this.storage;
    if (!store) return [];
    const summaries: SaveSummary[] = [];
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (!key?.startsWith(PREFIX)) continue;
      const json = store.getItem(key);
      if (!json) continue;
      try {
        const state = restoreSnapshot(json);
        const parsed = JSON.parse(json) as { savedAt?: string };
        summaries.push(saveSummary(key.slice(PREFIX.length), state, parsed.savedAt ?? ""));
      } catch {
        // Ignore corrupt slots; explicit load reports the error.
      }
    }
    return summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  private requireStorage(): Storage {
    if (!this.storage) throw new Error("Browser storage is not available");
    return this.storage;
  }
}
