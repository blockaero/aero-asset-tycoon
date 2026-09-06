import type { LivePace } from "../sim/types.ts";
import type { LiveSnapshot } from "../live/runner.ts";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed: ${response.status}`);
  return body as T;
}

export function createCampaign(input: {
  seed: number;
  pace: LivePace;
  ticks: number;
  scenario: "prototype" | "full";
}): Promise<LiveSnapshot> {
  return request("/v1/campaigns", {
    method: "POST",
    body: JSON.stringify({ ...input, autoStart: false }),
  });
}

export function campaignAction(
  campaignId: string,
  action: "pause" | "resume" | "step",
): Promise<LiveSnapshot> {
  return request(`/v1/campaigns/${campaignId}/${action}`, { method: "POST" });
}

export function setCampaignPace(campaignId: string, pace: LivePace): Promise<LiveSnapshot> {
  return request(`/v1/campaigns/${campaignId}/pace`, {
    method: "POST",
    body: JSON.stringify({ pace }),
  });
}

export async function sendCommand(
  campaignId: string,
  command: unknown,
): Promise<void> {
  await request(`/v1/campaigns/${campaignId}/commands`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}

export function saveCampaign(campaignId: string): Promise<{ id: string }> {
  return request(`/v1/campaigns/${campaignId}/save`, {
    method: "POST",
    body: JSON.stringify({ id: "founder-slot" }),
  });
}

export function listSaves(): Promise<{ id: string; savedAt: string; tick: number; seed: number }[]> {
  return request("/v1/saves");
}

export function loadCampaign(saveId: string, pace: LivePace): Promise<LiveSnapshot> {
  return request(`/v1/saves/${encodeURIComponent(saveId)}/load`, {
    method: "POST",
    body: JSON.stringify({ pace, autoStart: false }),
  });
}

export function subscribeCampaign(
  campaignId: string,
  onSnapshot: (snapshot: LiveSnapshot) => void,
  onError: () => void,
): () => void {
  const stream = new EventSource(`/v1/campaigns/${campaignId}/events`);
  stream.addEventListener("snapshot", (event) => {
    onSnapshot(JSON.parse((event as MessageEvent<string>).data) as LiveSnapshot);
  });
  stream.onerror = onError;
  return () => stream.close();
}
