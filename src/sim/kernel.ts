import { parseGameCommand } from "../contracts/commands.ts";
import { generateAndPostDemand, advanceDemandEnvironment, updateMarketReferencePrices } from "./demand.ts";
import {
  acceptNetworkOpportunity,
  signNetworkAgreement,
  tickNetworkAgreements,
  updateNetworkReach,
} from "./network.ts";
import {
  applyWeeklyCosts,
  autoRepairAssets,
  createAutomaticQuotes,
  emptyPulseAccumulator,
  generateMarketListings,
  processArrivalsAndJobs,
  purchaseListing,
  queueAutomaticPurchases,
  resolveQuotes,
  settleExchanges,
  sendAssetToShop,
  submitQuote,
  type PulseAccumulator,
} from "./market.ts";
import {
  hireTeamMember,
  investKnowledge,
  openCompanyWeek,
  openOpportunity,
  releaseTeamMember,
  setIdentity,
  settleCompanyWeek,
  visitNode,
} from "./company.ts";
import { reservePbhDemand, settlePbhContracts, signPbhContract } from "./pbh.ts";
import { Rng } from "./rng.ts";
import type {
  CommandEnvelope,
  GameCommand,
  GameState,
  StandingPolicy,
  World,
} from "./types.ts";
import { createWorld } from "./world.ts";

export const ENGINE_VERSION = "0.2.0-prototype";

export function createGameState(
  config: Parameters<typeof createWorld>[0],
  policies: Record<string, StandingPolicy>,
): GameState {
  return {
    saveFormat: 2,
    engineVersion: ENGINE_VERSION,
    maxTicks: config.ticks,
    rngState: (config.seed ^ 0x9e3779b9) >>> 0,
    phase: "resolved",
    submissionSequence: 1,
    pendingCommands: [],
    policies: structuredClone(policies),
    world: createWorld(config),
  };
}

export function queueCommand(
  state: GameState,
  firmId: string,
  value: unknown,
): CommandEnvelope {
  const command = parseGameCommand(value);
  const envelope: CommandEnvelope = {
    id: state.submissionSequence,
    firmId,
    submittedSequence: state.submissionSequence,
    command,
  };
  state.submissionSequence += 1;
  state.pendingCommands.push(envelope);
  return envelope;
}

export function openWeek(state: GameState): GameState {
  if (state.phase === "open") return state;
  const rng = Rng.fromState(state.rngState);
  const world = state.world;
  world.tick += 1;
  openCompanyWeek(world, rng);
  processArrivalsAndJobs(world, rng);
  advanceDemandEnvironment(world, rng);
  tickNetworkAgreements(world, rng);
  generateMarketListings(world, rng);
  generateAndPostDemand(world, rng);
  reservePbhDemand(world);
  updateNetworkReach(world);
  state.rngState = rng.getState();
  state.phase = "open";
  return state;
}

export function resolveWeek(state: GameState): GameState {
  if (state.phase !== "open") return state;
  const rng = Rng.fromState(state.rngState);
  const world = state.world;
  const player = world.firms.find((firm) => firm.id === "firm-0");
  const opening = player?.accBalance ?? 0;
  const pulse = emptyPulseAccumulator();
  reservePbhDemand(world);

  const commands = [...state.pendingCommands].sort(
    (a, b) => a.submittedSequence - b.submittedSequence,
  );
  for (const envelope of commands) {
    applyCommand(world, rng, envelope, pulse);
  }
  // Signing takes effect at this boundary; covered RFQs cannot fall through to spot settlement.
  reservePbhDemand(world);

  for (const firm of world.firms) {
    queueAutomaticPurchases(
      world,
      rng,
      firm,
      pulseForFirm(firm.id, pulse),
      state.policies[firm.id] ?? state.policies["firm-0"],
    );
  }
  autoRepairAssets(world, state.policies, pulse);
  settlePbhContracts(world, pulse);
  state.submissionSequence = createAutomaticQuotes(
    world,
    state.policies,
    state.submissionSequence,
  );
  resolveQuotes(world, pulse);
  settleExchanges(world, rng, pulse);
  updateMarketReferencePrices(
    world,
    world.rfqs.filter((rfq) => rfq.expireTick >= world.tick),
  );
  applyWeeklyCosts(world, pulse);
  settleCompanyWeek(world, pulse);
  updateNetworkReach(world);

  const closing = player?.accBalance ?? 0;
  world.pulses.push({
    tick: world.tick,
    opening,
    closing,
    delta: closing - opening,
    ...pulse,
  });
  if (world.pulses.length > 260) world.pulses.shift();
  world.events.push({
    tick: world.tick,
    kind: "acc_pulse",
    payload: { opening, closing, delta: closing - opening },
  });

  state.pendingCommands = [];
  state.rngState = rng.getState();
  state.phase = "resolved";
  return state;
}

function pulseForFirm(firmId: string, pulse: PulseAccumulator): PulseAccumulator {
  return firmId === "firm-0" ? pulse : emptyPulseAccumulator();
}

function applyCommand(
  world: World,
  rng: Rng,
  envelope: CommandEnvelope,
  pulse: PulseAccumulator,
): void {
  const firm = world.firms.find((candidate) => candidate.id === envelope.firmId);
  if (!firm || firm.insolvent) {
    rejectCommand(world, envelope, "firm_unavailable");
    return;
  }
  const command: GameCommand = envelope.command;
  let result: { ok: boolean; reason?: string } = { ok: true };
  switch (command.type) {
    case "purchase_listing":
      result = purchaseListing(
        world,
        rng,
        firm.id,
        command.listingId,
        command.destinationFacilityId,
        pulseForFirm(firm.id, pulse),
        true,
      );
      break;
    case "send_to_shop":
      result = sendAssetToShop(
        world,
        firm.id,
        command.assetId,
        command.shopId,
        command.workscope,
        pulseForFirm(firm.id, pulse),
      );
      break;
    case "submit_quote":
      result = submitQuote(
        world,
        firm.id,
        command.rfqId,
        command.unitIds,
        command.price,
        command.tx,
        envelope.submittedSequence,
      );
      break;
    case "set_buying_strategy":
      if (
        command.patch.enabled === true &&
        firm.manualAcquisitions < 1
      ) {
        result = { ok: false, reason: "manual_acquisition_milestone_required" };
      } else {
        firm.buyingStrategy = { ...firm.buyingStrategy, ...command.patch };
      }
      break;
    case "set_sales_strategy":
      firm.salesStrategy = { ...firm.salesStrategy, ...command.patch };
      break;
    case "accept_network_opportunity":
      result = acceptNetworkOpportunity(world, command.opportunityId);
      break;
    case "sign_network_agreement":
      result = signNetworkAgreement(world, command.opportunityId);
      break;
    case "sign_pbh":
      result = signPbhContract(world, firm.id, command.contractId);
      break;
    case "open_opportunity":
      result =
        firm.id === "firm-0"
          ? openOpportunity(world, command.opportunityId, pulse)
          : { ok: false, reason: "player_only" };
      break;
    case "visit_node":
      result =
        firm.id === "firm-0" ? visitNode(world, command.nodeId) : { ok: false, reason: "player_only" };
      break;
    case "invest_knowledge":
      result =
        firm.id === "firm-0"
          ? investKnowledge(world, command.nodeId, pulse)
          : { ok: false, reason: "player_only" };
      break;
    case "hire_team_member":
      result =
        firm.id === "firm-0"
          ? hireTeamMember(world, command.candidateId)
          : { ok: false, reason: "player_only" };
      break;
    case "release_team_member":
      result =
        firm.id === "firm-0"
          ? releaseTeamMember(world, command.memberId)
          : { ok: false, reason: "player_only" };
      break;
    case "set_identity":
      result =
        firm.id === "firm-0"
          ? setIdentity(world, command.companyName, command.founderName, command.portraitId)
          : { ok: false, reason: "player_only" };
      break;
  }
  if (!result.ok) rejectCommand(world, envelope, result.reason ?? "command_rejected");
  else {
    world.events.push({
      tick: world.tick,
      kind: "command_accepted",
      payload: {
        commandId: envelope.id,
        firmId: envelope.firmId,
        commandType: envelope.command.type,
      },
    });
  }
}

function rejectCommand(world: World, envelope: CommandEnvelope, reason: string): void {
  world.events.push({
    tick: world.tick,
    kind: "command_rejected",
    payload: {
      commandId: envelope.id,
      firmId: envelope.firmId,
      commandType: envelope.command.type,
      reason,
    },
  });
}

export function advanceWeek(state: GameState): GameState {
  openWeek(state);
  resolveWeek(state);
  return state;
}
