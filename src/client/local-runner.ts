import { LiveCampaignManager, type LiveSnapshot } from "../live/runner.ts";
import type { LivePace } from "../sim/types.ts";
import { BrowserSaveStore } from "./browser-saves.ts";

const manager = new LiveCampaignManager(new BrowserSaveStore());

function campaignOrThrow(campaignId: string) {
  const campaign = manager.get(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  return campaign;
}

export function createCampaign(input: {
  seed: number;
  pace: LivePace;
  ticks: number;
  scenario: "prototype" | "full";
  /** Chosen on the new-game screen. Purely cosmetic apart from seeding the world. */
  companyName?: string;
  founderName?: string;
  portraitId?: string;
}): Promise<LiveSnapshot> {
  const campaign = manager.create(
    {
      seed: input.seed,
      ticks: input.ticks,
      scenario: input.scenario,
      companyName: input.companyName,
      founderName: input.founderName,
      portraitId: input.portraitId,
    },
    input.pace,
    false,
  );
  return Promise.resolve(campaign.snapshot());
}

export function campaignAction(
  campaignId: string,
  action: "pause" | "resume" | "step",
): Promise<LiveSnapshot> {
  const campaign = campaignOrThrow(campaignId);
  campaign[action]();
  return Promise.resolve(campaign.snapshot());
}

export function setCampaignPace(campaignId: string, pace: LivePace): Promise<LiveSnapshot> {
  campaignOrThrow(campaignId).setPace(pace);
  return Promise.resolve(campaignOrThrow(campaignId).snapshot());
}

export async function sendCommand(campaignId: string, command: unknown): Promise<void> {
  campaignOrThrow(campaignId).queue("firm-0", command);
}

export async function saveCampaign(campaignId: string): Promise<{ id: string }> {
  const saved = await manager.saveCampaign(campaignId, "founder-slot");
  return { id: saved.id };
}

export function listSaves(): Promise<{ id: string; savedAt: string; tick: number; seed: number }[]> {
  return manager.saves.list();
}

export async function loadCampaign(saveId: string, pace: LivePace): Promise<LiveSnapshot> {
  const campaign = await manager.load(saveId, pace, false);
  return campaign.snapshot();
}

export function subscribeCampaign(
  campaignId: string,
  onSnapshot: (snapshot: LiveSnapshot) => void,
  onError: () => void,
): () => void {
  const campaign = manager.get(campaignId);
  if (!campaign) {
    onError();
    return () => {};
  }
  return campaign.subscribe(onSnapshot);
}
