import { DEFAULT_CAMPAIGN_TICKS } from "./balance.ts";
import { advanceWeek, createGameState } from "./kernel.ts";
import type { CampaignConfig, GameState, StandingPolicy, World } from "./types.ts";
import { navOf } from "./util.ts";
import { DEFAULT_POLICY, rivalPolicy } from "./world.ts";

export type CampaignResult = {
  seed: number;
  ticks: number;
  nav: number;
  cash: number;
  accBalance: number;
  fillRate: number;
  insolvent: boolean;
  events: number;
  world: World;
  state: GameState;
};

export function defaultConfig(overrides: Partial<CampaignConfig> = {}): CampaignConfig {
  const ticks = overrides.ticks ?? DEFAULT_CAMPAIGN_TICKS;
  return {
    seed: 1,
    ticks,
    rivalCount: ticks <= 24 ? 2 : 3,
    airlineCount: ticks <= 24 ? 3 : 12,
    partCount: ticks <= 24 ? 18 : 100,
    scenario: ticks <= 24 ? "prototype" : "full",
    ...overrides,
  };
}

export function policiesFor(
  subject: StandingPolicy,
  rivalCount: number,
): Record<string, StandingPolicy> {
  const map: Record<string, StandingPolicy> = { "firm-0": { ...subject } };
  for (let i = 1; i <= rivalCount; i++) map[`firm-${i}`] = rivalPolicy(i - 1);
  return map;
}

export function createCampaign(
  config: CampaignConfig,
  subject: StandingPolicy = DEFAULT_POLICY,
  playerControlled = true,
): GameState {
  const state = createGameState(config, policiesFor(subject, config.rivalCount));
  if (!playerControlled) {
    const firm = state.world.firms[0]!;
    firm.buyingStrategy.enabled = true;
    firm.buyingStrategy.targetStock = Math.max(2, subject.targetStockRotable);
    firm.buyingStrategy.maxAccPerUnit = 350_000;
    firm.buyingStrategy.accFloor = subject.cashFloor;
    firm.salesStrategy.minMargin = subject.autoAcceptMargin;
    firm.salesStrategy.exchangeBias = subject.exchangeBias;
    firm.autoRepairEnabled = true;
  }
  return state;
}

export function runCampaign(
  config: CampaignConfig,
  subject: StandingPolicy = DEFAULT_POLICY,
): CampaignResult {
  const state = createCampaign(config, subject, false);
  for (let week = 0; week < config.ticks; week++) {
    advanceWeek(state);
    if (state.world.firms[0]?.insolvent) break;
  }
  const firm = state.world.firms[0]!;
  const nav = navOf(state.world, firm.id);
  return {
    seed: config.seed,
    ticks: state.world.tick,
    nav,
    cash: firm.accBalance,
    accBalance: firm.accBalance,
    fillRate: firm.rfqsSeen ? firm.rfqsFilled / firm.rfqsSeen : 0,
    insolvent: firm.insolvent,
    events: state.world.events.length,
    world: state.world,
    state,
  };
}
