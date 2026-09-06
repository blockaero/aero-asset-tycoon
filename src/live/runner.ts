import { tickDurationMs } from "../sim/balance.ts";
import { createCampaign, defaultConfig } from "../sim/campaign.ts";
import { openWeek, queueCommand, resolveWeek } from "../sim/kernel.ts";
import { projectObservation, type GameObservation } from "../sim/observation.ts";
import type {
  CampaignConfig,
  CommandEnvelope,
  GameState,
  LivePace,
  StandingPolicy,
} from "../sim/types.ts";
import { DEFAULT_POLICY } from "../sim/world.ts";
import { SaveStore } from "./save-store.ts";

export type LiveStatus = "running" | "paused" | "finished";
export type LiveSnapshot = {
  id: string;
  status: LiveStatus;
  pace: LivePace;
  remainingMs: number;
  observation: GameObservation;
};
type Listener = (snapshot: LiveSnapshot) => void;

export class LiveCampaign {
  readonly id: string;
  readonly state: GameState;
  pace: LivePace;
  status: LiveStatus = "paused";
  private timer: NodeJS.Timeout | null = null;
  private deadline = 0;
  private remainingMs: number;
  private listeners = new Set<Listener>();
  private readonly onPulse?: (campaign: LiveCampaign) => void | Promise<void>;

  constructor(
    id: string,
    state: GameState,
    pace: LivePace,
    onPulse?: (campaign: LiveCampaign) => void | Promise<void>,
  ) {
    this.id = id;
    this.state = state;
    this.pace = pace;
    this.remainingMs = tickDurationMs(pace);
    this.onPulse = onPulse;
    if (
      state.phase === "resolved" &&
      !state.world.firms[0]?.insolvent &&
      state.world.tick < state.maxTicks
    ) {
      openWeek(state);
    } else if (state.world.tick >= state.maxTicks || state.world.firms[0]?.insolvent) {
      this.status = "finished";
      this.remainingMs = 0;
    }
  }

  start(): void {
    this.resume();
  }

  pause(): void {
    if (this.status !== "running") return;
    this.remainingMs = Math.max(0, this.deadline - Date.now());
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.status = "paused";
    this.emit();
  }

  resume(): void {
    if (this.status === "finished" || this.status === "running") return;
    if (this.state.world.firms[0]?.insolvent) {
      this.status = "finished";
      this.emit();
      return;
    }
    if (this.state.world.tick >= this.state.maxTicks) {
      this.status = "finished";
      this.remainingMs = 0;
      this.emit();
      return;
    }
    this.status = "running";
    this.schedule(Math.max(1, this.remainingMs || tickDurationMs(this.pace)));
    this.emit();
  }

  step(): void {
    if (this.status === "running" || this.status === "finished") return;
    this.performPulse();
  }

  setPace(pace: LivePace): void {
    this.pace = pace;
    this.remainingMs = tickDurationMs(pace);
    if (this.status === "running") this.schedule(this.remainingMs);
    this.emit();
  }

  queue(firmId: string, command: unknown): CommandEnvelope {
    if (this.status === "finished") throw new Error("Campaign is finished");
    const envelope = queueCommand(this.state, firmId, command);
    this.emit();
    return envelope;
  }

  cancelCommand(commandId: number, firmId = "firm-0"): boolean {
    const index = this.state.pendingCommands.findIndex(
      (envelope) => envelope.id === commandId && envelope.firmId === firmId,
    );
    if (index < 0) return false;
    this.state.pendingCommands.splice(index, 1);
    this.emit();
    return true;
  }

  snapshot(): LiveSnapshot {
    return {
      id: this.id,
      status: this.status,
      pace: this.pace,
      remainingMs:
        this.status === "running"
          ? Math.max(0, this.deadline - Date.now())
          : this.remainingMs,
      observation: projectObservation(this.state),
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
    this.status = "finished";
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.remainingMs = ms;
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => this.performPulse(), ms);
    this.timer.unref?.();
  }

  private performPulse(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    resolveWeek(this.state);
    try {
      void Promise.resolve(this.onPulse?.(this)).catch((error: unknown) => {
        this.recordPersistenceFailure(error);
      });
    } catch (error) {
      this.recordPersistenceFailure(error);
    }
    if (
      this.state.world.firms[0]?.insolvent ||
      this.state.world.tick >= this.state.maxTicks
    ) {
      this.status = "finished";
      this.remainingMs = 0;
      this.emit();
      return;
    }
    openWeek(this.state);
    this.remainingMs = tickDurationMs(this.pace);
    this.emit();
    if (this.status === "running") this.schedule(this.remainingMs);
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private recordPersistenceFailure(error: unknown): void {
    this.state.world.events.push({
      tick: this.state.world.tick,
      kind: "autosave_failed",
      payload: { message: error instanceof Error ? error.message : "autosave_failed" },
    });
    this.emit();
  }
}

export class LiveCampaignManager {
  readonly saves: SaveStore;
  private sessions = new Map<string, LiveCampaign>();
  private nextSession = 1;

  constructor(saveStore = new SaveStore()) {
    this.saves = saveStore;
  }

  create(
    config: Partial<CampaignConfig> = {},
    pace: LivePace = "fast",
    autoStart = true,
    policy: StandingPolicy = DEFAULT_POLICY,
  ): LiveCampaign {
    const resolved = defaultConfig(config);
    const state = createCampaign(resolved, policy);
    return this.addState(state, pace, autoStart);
  }

  async load(saveId: string, pace: LivePace = "fast", autoStart = false): Promise<LiveCampaign> {
    const state = await this.saves.load(saveId);
    return this.addState(state, pace, autoStart);
  }

  get(id: string): LiveCampaign | undefined {
    return this.sessions.get(id);
  }

  list(): LiveSnapshot[] {
    return [...this.sessions.values()].map((campaign) => campaign.snapshot());
  }

  async saveCampaign(campaignId: string, saveId?: string): Promise<Awaited<ReturnType<SaveStore["save"]>>> {
    const campaign = this.sessions.get(campaignId);
    if (!campaign) throw new Error("Campaign not found");
    return this.saves.save(saveId ?? `save-${campaignId}`, campaign.state);
  }

  dispose(): void {
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
  }

  private addState(state: GameState, pace: LivePace, autoStart: boolean): LiveCampaign {
    const id = `campaign-${this.nextSession++}`;
    const campaign = new LiveCampaign(id, state, pace, async (current) => {
      const tick = current.state.world.tick;
      const recent = current.state.world.events.filter((event) => event.tick === tick);
      const critical = recent.some((event) =>
        ["pbh_sla_miss", "insolvent", "ad_rumour", "core_lost"].includes(event.kind),
      );
      if (tick % 4 === 0 || critical) {
        await this.saves.save(`autosave-${current.id}`, current.state);
      }
    });
    this.sessions.set(id, campaign);
    if (autoStart) campaign.start();
    return campaign;
  }
}
