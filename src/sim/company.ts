/**
 * The company layer: everything the player earns, spends, and knows that is not
 * on the balance sheet.
 *
 * This is the seam between the v2 systems (Tribal Knowledge, Team, turn budgets,
 * the statistical market, and the fog of war) and the weekly kernel. The kernel
 * calls three functions from here and nothing else, so the existing tick order
 * stays readable.
 */

import { advanceGlobalMarket } from "./cohort-market.ts";
import { calendarFor } from "./calendar.ts";
import { promoteReach, reachToNodeState } from "./bigmap.ts";
import { canOpen, expireOpportunities, rollOpportunities } from "./opportunities.ts";
import { canInvest, investTick, knowledgeNode } from "./knowledge.ts";
import { BASE_TEAM_CAP, canHire, refreshCandidates, weeklySalaryCost } from "./team.ts";
import { resolveModifiers, type CompanyModifiers } from "./effects.ts";
import {
  decayRelationshipCapital,
  earnRelationshipCapital,
  resetBudget,
  spend,
} from "./budgets.ts";
import type { PulseAccumulator } from "./market.ts";
import type { Rng } from "./rng.ts";
import type { NetworkOpportunity, World } from "./types.ts";
import { relationshipScore } from "./util.ts";

export type CommandResult = { ok: boolean; reason?: string };

/** Resolve the player's current knowledge and team into numeric modifiers. */
export function modifiersFor(world: World): CompanyModifiers {
  return resolveModifiers(world.company.knowledge, world.company.team);
}

/**
 * Start-of-pulse company work. Runs inside openWeek, before demand is posted, so
 * the player opens the turn with a fresh budget and a refreshed board.
 */
export function openCompanyWeek(world: World, rng: Rng): void {
  const company = world.company;
  world.calendar = calendarFor(world.tick);

  const modifiers = modifiersFor(world);
  const effects = [...knowledgeAndTeamEffects(world)];

  // Time never rolls over. Relationship capital carries, but decays.
  company.budget = resetBudget(company.budget, effects);
  company.relationshipCapital = decayRelationshipCapital(company.relationshipCapital);
  company.visitedThisTick = [];

  advanceGlobalMarket(world.globalMarket, rng, world.tick);
  advanceKnowledge(world);
  refreshTeamBoard(world, rng, modifiers);
  refreshFog(world, modifiers);
  refreshOpportunities(world, rng, modifiers);

  world.opportunities = expireOpportunities(world.opportunities, world.tick);
}

/** End-of-pulse company work. Runs inside resolveWeek, alongside the other weekly costs. */
export function settleCompanyWeek(world: World, pulse: PulseAccumulator): void {
  const player = world.firms.find((firm) => firm.id === "firm-0");
  if (!player) return;
  const payroll = weeklySalaryCost(world.company.team);
  if (payroll > 0) {
    player.accBalance -= payroll;
    pulse.overhead -= payroll;
    world.events.push({
      tick: world.tick,
      kind: "team_payroll",
      payload: { amount: payroll, headcount: world.company.team.length },
    });
  }

  // Relationship capital tracks delivery performance across every counterparty.
  const deliveries = world.relationships.map((relationship) => ({
    onTime: relationship.onTimeDeliveries >= relationship.missedDeliveries,
    value: 1,
  }));
  world.company.relationshipCapital = earnRelationshipCapital(
    world.company.relationshipCapital,
    deliveries,
  );
}

function knowledgeAndTeamEffects(world: World) {
  const modifiers = modifiersFor(world);
  // resolveModifiers already folds both sources; budgets only need the income totals.
  return [
    { kind: "time_income" as const, value: modifiers.timeIncome },
    { kind: "rc_income" as const, value: modifiers.rcIncome },
  ];
}

/** Advance any Tribal Knowledge node the founder is currently studying. */
function advanceKnowledge(world: World): void {
  const company = world.company;
  for (const entry of [...company.knowledge]) {
    if (entry.completedTick !== null) continue;
    const node = knowledgeNode(entry.nodeId);
    if (!node) continue;
    const attempt = spend(company.budget, { time: node.timeCost });
    if (!attempt.ok) continue;
    company.budget = attempt.budget;
    company.knowledge = investTick(entry.nodeId, company.knowledge, world.tick);
    const after = company.knowledge.find((candidate) => candidate.nodeId === entry.nodeId);
    if (after?.completedTick === world.tick) {
      world.events.push({
        tick: world.tick,
        kind: "knowledge_earned",
        payload: { nodeId: node.id, title: node.title, branch: node.branch },
      });
    }
  }
}

function refreshTeamBoard(world: World, rng: Rng, modifiers: CompanyModifiers): void {
  const slots = 3 + Math.round(modifiers.eventAccess * 3);
  world.company.candidates = refreshCandidates(
    rng,
    world.tick,
    world.company.candidates,
    slots,
  );
}

/**
 * Move nodes inward through the fog. TAM is statistical only, SAM is visible but not
 * established, SOM is ready to trade. Reach never goes backwards.
 */
function refreshFog(world: World, modifiers: CompanyModifiers): void {
  const player = world.firms.find((firm) => firm.id === "firm-0");
  if (!player) return;
  for (const node of world.networkNodes) {
    if (node.role === "hq") continue;
    const before = node.reach;
    node.reach = promoteReach(node, {
      reputation: player.globalReputation,
      relationship: relationshipScore(world, node.organizationId),
      regionUnlocked: modifiers.unlockedRegions.has(node.regionCode),
      knowledgeIntel: modifiers.intel,
    });
    if (node.reach !== before) {
      // The legacy node state stays the source of truth for the older systems.
      node.state = reachToNodeState(node.reach);
      world.events.push({
        tick: world.tick,
        kind: "reach_changed",
        payload: { nodeId: node.id, from: before, to: node.reach },
      });
    }
  }
}

/** Top up opportunity slots at every node the player can actually see. */
function refreshOpportunities(world: World, rng: Rng, modifiers: CompanyModifiers): void {
  const easterEggChance = 0.02 + modifiers.eventAccess * 0.03;
  for (const node of world.networkNodes) {
    if (node.reach === "tam" || node.role === "hq") continue;
    const facility = world.facilities.find((candidate) => candidate.nodeId === node.id);
    if (!facility) continue;
    const existing = world.opportunities.filter(
      (opportunity) => opportunity.nodeId === node.id && !opportunity.accepted,
    );
    if (existing.length >= node.slots) continue;
    const rolled = rollOpportunities(rng, {
      tick: world.tick,
      node,
      facility,
      existing,
      nextId: () => {
        const id = world.nextId;
        world.nextId += 1;
        return id;
      },
      easterEggChance,
    });
    world.opportunities.push(...rolled);
  }
}

/* ------------------------------------------------------------------ *
 * Command handlers
 * ------------------------------------------------------------------ */

/** Spend a turn's time and relationship capital to open an opportunity. */
export function openOpportunity(
  world: World,
  opportunityId: number,
  pulse: PulseAccumulator,
): CommandResult {
  const player = world.firms.find((firm) => firm.id === "firm-0");
  if (!player) return { ok: false, reason: "no_player" };
  const opportunity = world.opportunities.find((candidate) => candidate.id === opportunityId);
  if (!opportunity) return { ok: false, reason: "unknown_opportunity" };
  if (opportunity.accepted) return { ok: false, reason: "already_open" };

  const gate = canOpen(
    opportunity,
    world.company.budget,
    world.company.relationshipCapital,
    player.accBalance,
  );
  if (!gate.ok) return gate;

  const attempt = spend(world.company.budget, {
    time: opportunity.timeCost,
    rc: opportunity.rcCost,
  });
  if (!attempt.ok) return { ok: false, reason: attempt.reason ?? "budget_exhausted" };
  world.company.budget = attempt.budget;
  world.company.relationshipCapital = Math.max(
    0,
    world.company.relationshipCapital - opportunity.rcCost,
  );
  if (opportunity.accCost > 0) {
    player.accBalance -= opportunity.accCost;
    pulse.overhead -= opportunity.accCost;
  }
  opportunity.accepted = true;

  applyOpportunityReward(world, opportunity, pulse);
  world.events.push({
    tick: world.tick,
    kind: opportunity.easterEgg ? "easter_egg_opened" : "opportunity_opened",
    payload: {
      opportunityId: opportunity.id,
      nodeId: opportunity.nodeId,
      kind: opportunity.kind,
      reward: opportunity.reward,
    },
  });
  return { ok: true };
}

/**
 * Rewards are deliberately modest and legible. An easter egg is a real boost, but it
 * arrives as reputation, relationship, or cash rather than as a hidden multiplier.
 */
function applyOpportunityReward(
  world: World,
  opportunity: NetworkOpportunity,
  pulse: PulseAccumulator,
): void {
  const player = world.firms.find((firm) => firm.id === "firm-0");
  if (!player) return;
  const relationship = world.relationships.find(
    (candidate) =>
      candidate.organizationId ===
      world.networkNodes.find((node) => node.id === opportunity.nodeId)?.organizationId,
  );
  switch (opportunity.kind) {
    case "introduction":
      if (relationship) relationship.score = Math.min(100, relationship.score + 8);
      break;
    case "conference":
      player.globalReputation = Math.min(100, player.globalReputation + 2);
      world.company.relationshipCapital += 6;
      break;
    case "intel":
      for (const shock of world.globalMarket.shocks) {
        if (shock.endTick >= world.tick) shock.known = true;
      }
      break;
    case "candidate":
      // The candidate board already refreshed; opening simply keeps them available longer.
      for (const candidate of world.company.candidates) {
        candidate.availableUntilTick = Math.max(candidate.availableUntilTick, world.tick + 8);
      }
      break;
    default:
      break;
  }
  if (opportunity.easterEgg) {
    const grant = 120_000;
    player.accBalance += grant;
    pulse.contracts += grant;
    player.globalReputation = Math.min(100, player.globalReputation + 1);
  }
}

/** Spend founder time to visit a node, which builds the relationship directly. */
export function visitNode(world: World, nodeId: string): CommandResult {
  const node = world.networkNodes.find((candidate) => candidate.id === nodeId);
  if (!node) return { ok: false, reason: "unknown_node" };
  if (node.reach === "tam") return { ok: false, reason: "node_not_visible" };
  if (world.company.visitedThisTick.includes(nodeId)) {
    return { ok: false, reason: "already_visited_this_pulse" };
  }
  const cost = 4 + node.scale;
  const attempt = spend(world.company.budget, { time: cost });
  if (!attempt.ok) return { ok: false, reason: attempt.reason ?? "no_time" };
  world.company.budget = attempt.budget;
  world.company.visitedThisTick.push(nodeId);

  let relationship = world.relationships.find(
    (candidate) => candidate.organizationId === node.organizationId,
  );
  if (!relationship) {
    relationship = {
      organizationId: node.organizationId,
      score: 0,
      onTimeDeliveries: 0,
      missedDeliveries: 0,
    };
    world.relationships.push(relationship);
  }
  relationship.score = Math.min(100, relationship.score + 5);
  world.events.push({
    tick: world.tick,
    kind: "node_visited",
    payload: { nodeId, timeCost: cost, relationship: relationship.score },
  });
  return { ok: true };
}

/** Begin studying a Tribal Knowledge node. The ACC cost is paid up front. */
export function investKnowledge(
  world: World,
  nodeId: string,
  pulse: PulseAccumulator,
): CommandResult {
  const player = world.firms.find((firm) => firm.id === "firm-0");
  if (!player) return { ok: false, reason: "no_player" };
  const gate = canInvest(nodeId, world.company.knowledge, player.accBalance);
  if (!gate.ok) return gate;
  const node = knowledgeNode(nodeId);
  if (!node) return { ok: false, reason: "unknown_node" };
  if (world.company.knowledge.some((entry) => entry.nodeId === nodeId)) {
    return { ok: false, reason: "already_in_progress" };
  }
  player.accBalance -= node.accCost;
  pulse.overhead -= node.accCost;
  world.company.knowledge = [
    ...world.company.knowledge,
    { nodeId, investedTicks: 0, completedTick: null },
  ];
  world.events.push({
    tick: world.tick,
    kind: "knowledge_started",
    payload: { nodeId, title: node.title, accCost: node.accCost },
  });
  return { ok: true };
}

export function hireTeamMember(world: World, candidateId: string): CommandResult {
  const player = world.firms.find((firm) => firm.id === "firm-0");
  if (!player) return { ok: false, reason: "no_player" };
  const candidate = world.company.candidates.find((entry) => entry.id === candidateId);
  if (!candidate) return { ok: false, reason: "unknown_candidate" };
  const teamCap = BASE_TEAM_CAP + modifiersFor(world).teamCap;
  const gate = canHire(candidate, world.company.team, teamCap, player.accBalance);
  if (!gate.ok) return gate;
  world.company.team = [...world.company.team, { ...candidate, hiredTick: world.tick }];
  world.company.candidates = world.company.candidates.filter((entry) => entry.id !== candidateId);
  world.events.push({
    tick: world.tick,
    kind: "team_hired",
    payload: { memberId: candidate.id, role: candidate.role, salary: candidate.salary },
  });
  return { ok: true };
}

export function releaseTeamMember(world: World, memberId: string): CommandResult {
  const member = world.company.team.find((entry) => entry.id === memberId);
  if (!member) return { ok: false, reason: "unknown_member" };
  world.company.team = world.company.team.filter((entry) => entry.id !== memberId);
  world.events.push({
    tick: world.tick,
    kind: "team_released",
    payload: { memberId, role: member.role },
  });
  return { ok: true };
}

export function setIdentity(
  world: World,
  companyName: string,
  founderName: string,
  portraitId: string,
): CommandResult {
  const trimmedCompany = companyName.trim().slice(0, 48);
  const trimmedFounder = founderName.trim().slice(0, 48);
  if (!trimmedCompany || !trimmedFounder) return { ok: false, reason: "name_required" };
  world.company.identity = {
    companyName: trimmedCompany,
    founderName: trimmedFounder,
    portraitId,
  };
  const player = world.firms.find((firm) => firm.id === "firm-0");
  if (player) player.name = trimmedCompany;
  const organization = world.organizations.find((entry) => entry.id === "org-player");
  if (organization) organization.name = trimmedCompany;
  return { ok: true };
}
