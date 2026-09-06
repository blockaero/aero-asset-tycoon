import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { LiveCampaign, LiveCampaignManager } from "../src/live/runner.ts";
import { SaveStore } from "../src/live/save-store.ts";
import { startServer } from "../src/server/http.ts";
import { createCampaign, defaultConfig } from "../src/sim/campaign.ts";

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function temporaryStore(): Promise<SaveStore> {
  const directory = await mkdtemp(join(tmpdir(), "aat-save-"));
  cleanup.push(directory);
  return new SaveStore(directory);
}

describe("live campaign runtime", () => {
  it("finishes at the configured campaign length", async () => {
    const manager = new LiveCampaignManager(await temporaryStore());
    const campaign = manager.create({ seed: 81, ticks: 1 }, "fast", false);
    campaign.step();
    expect(campaign.status).toBe("finished");
    expect(campaign.state.world.tick).toBe(1);
    manager.dispose();
  });

  it("records autosave failures without an unhandled rejection", async () => {
    const state = createCampaign(defaultConfig({ seed: 82, ticks: 2 }));
    const campaign = new LiveCampaign("failing-save", state, "fast", async () => {
      throw new Error("disk unavailable");
    });
    campaign.step();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.world.events.some(
      (event) => event.kind === "autosave_failed" && event.payload.message === "disk unavailable",
    )).toBe(true);
    campaign.dispose();
  });

  it("fully pauses, steps one pulse, and restores a versioned disk save", async () => {
    const manager = new LiveCampaignManager(await temporaryStore());
    const campaign = manager.create({ seed: 83, ticks: 24 }, "fast", false);
    expect(campaign.status).toBe("paused");
    const openTick = campaign.state.world.tick;
    campaign.step();
    expect(campaign.status).toBe("paused");
    expect(campaign.state.world.pulses).toHaveLength(1);
    expect(campaign.state.world.tick).toBe(openTick + 1);

    const summary = await manager.saveCampaign(campaign.id, "slot-one");
    expect(summary.id).toBe("slot-one");
    const loaded = await manager.load("slot-one", "slow", false);
    expect(loaded.state).toEqual(campaign.state);
    expect(loaded.status).toBe("paused");
    manager.dispose();
  });

  it("serves campaign create, command, step, observation, and saves over HTTP", async () => {
    const manager = new LiveCampaignManager(await temporaryStore());
    const server = startServer(0, manager);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    const base = `http://127.0.0.1:${address.port}`;

    const createdResponse = await fetch(`${base}/v1/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seed: 89, autoStart: false }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: string; observation: { listings: { id: number }[] } };
    const listing = created.observation.listings[0]!;

    const commandResponse = await fetch(`${base}/v1/campaigns/${created.id}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: {
          type: "purchase_listing",
          listingId: listing.id,
          destinationFacilityId: "fac-player-warehouse",
        },
      }),
    });
    expect(commandResponse.status).toBe(202);
    const stepResponse = await fetch(`${base}/v1/campaigns/${created.id}/step`, { method: "POST" });
    expect(stepResponse.status).toBe(200);
    const stepped = await stepResponse.json() as { observation: { pulses: unknown[] } };
    expect(stepped.observation.pulses).toHaveLength(1);

    const saveResponse = await fetch(`${base}/v1/campaigns/${created.id}/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "http-slot" }),
    });
    expect(saveResponse.status).toBe(201);
    const saves = await (await fetch(`${base}/v1/saves`)).json() as { id: string }[];
    expect(saves.some((save) => save.id === "http-slot")).toBe(true);

    const fullResponse = await fetch(`${base}/v1/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seed: 90, ticks: 100, scenario: "full", autoStart: false }),
    });
    const full = await fullResponse.json() as {
      observation: { parts: unknown[]; airlines: unknown[] };
    };
    expect(full.observation.parts).toHaveLength(100);
    expect(full.observation.airlines.length).toBeGreaterThanOrEqual(1);

    const invalidResponse = await fetch(`${base}/v1/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rivalCount: -1 }),
    });
    expect(invalidResponse.status).toBe(400);
    const listingResponse = await fetch(`${base}/v1/campaigns`);
    expect(listingResponse.status).toBe(200);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
