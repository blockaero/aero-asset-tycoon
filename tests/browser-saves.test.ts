import { describe, expect, it } from "vitest";
import { BrowserSaveStore } from "../src/client/browser-saves.ts";
import { LiveCampaignManager } from "../src/live/runner.ts";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("in-browser live runner", () => {
  it("pauses, steps, and restores a campaign from Storage", async () => {
    const manager = new LiveCampaignManager(new BrowserSaveStore(new MemoryStorage()));
    const campaign = manager.create({ seed: 91, ticks: 24 }, "fast", false);
    expect(campaign.status).toBe("paused");
    campaign.step();
    expect(campaign.state.world.pulses).toHaveLength(1);

    await manager.saveCampaign(campaign.id, "founder-slot");
    const listed = await manager.saves.list();
    expect(listed.some((save) => save.id === "founder-slot" && save.tick === campaign.state.world.tick)).toBe(true);

    const loaded = await manager.load("founder-slot", "slow", false);
    expect(loaded.status).toBe("paused");
    expect(loaded.state.world.tick).toBe(campaign.state.world.tick);
    expect(loaded.pace).toBe("slow");
    manager.dispose();
  });
});
