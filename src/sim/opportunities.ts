/**
 * Opportunities: the small, numerous things a turn is spent on.
 *
 * Each one costs some combination of founder Time, Relationship Capital and ACC, which
 * is what turns a pulse into a decision rather than a click. A rare few are easter eggs
 * with a real aviation premise and a concrete payoff.
 */

import { ataLabel, ataTitle } from "./ata.ts";
import type { Rng } from "./rng.ts";
import type {
  Facility,
  FacilityKind,
  NetworkNode,
  NetworkOpportunity,
  TurnBudget,
} from "./types.ts";

type OpportunityKind = NetworkOpportunity["kind"];

export type OpportunityTemplate = {
  kind: OpportunityKind;
  title: (context: { node: NetworkNode; ata: number }) => string;
  description: (context: { node: NetworkNode; ata: number }) => string;
  timeCost: number;
  rcCost: number;
  accCost: number;
  weight: number;
  facilityKinds: FacilityKind[];
};

const ALL_KINDS: FacilityKind[] = [
  "warehouse", "hangar", "repair_shop", "factory", "engine_shop",
  "component_shop", "teardown", "lessor", "broker", "distribution", "conference",
];

export const OPPORTUNITY_TEMPLATES: OpportunityTemplate[] = [
  {
    kind: "listing",
    title: ({ ata }) => `Stock available: ${ataTitle(ata)}`,
    description: ({ node, ata }) => `${node.label} is releasing ${ataLabel(ata)} inventory to the market.`,
    timeCost: 2, rcCost: 0, accCost: 0, weight: 26,
    facilityKinds: ["warehouse", "distribution", "broker", "teardown", "factory", "lessor"],
  },
  {
    kind: "buyer_need",
    title: ({ ata }) => `Requirement: ${ataTitle(ata)}`,
    description: ({ node, ata }) => `${node.label} needs ${ataLabel(ata)} cover and is taking offers.`,
    timeCost: 3, rcCost: 1, accCost: 0, weight: 22,
    facilityKinds: ["hangar", "repair_shop", "engine_shop", "component_shop"],
  },
  {
    kind: "introduction",
    title: ({ node }) => `Introduction to ${node.label}`,
    description: ({ node }) => `A mutual contact will introduce you to ${node.label}.`,
    timeCost: 2, rcCost: 4, accCost: 0, weight: 14, facilityKinds: ALL_KINDS,
  },
  {
    kind: "agreement",
    title: ({ node }) => `Framework terms with ${node.label}`,
    description: ({ node }) => `${node.label} will discuss standing terms rather than deal by deal.`,
    timeCost: 6, rcCost: 6, accCost: 0, weight: 8,
    facilityKinds: ["warehouse", "distribution", "repair_shop", "engine_shop", "factory", "lessor"],
  },
  {
    kind: "teardown",
    title: ({ ata }) => `Teardown survey: ${ataTitle(ata)}`,
    description: ({ node, ata }) => `Walk the ${node.label} yard and assess recoverable ${ataLabel(ata)} hardware.`,
    timeCost: 10, rcCost: 2, accCost: 0, weight: 9, facilityKinds: ["teardown"],
  },
  {
    kind: "conference",
    title: ({ node }) => `Industry forum at ${node.label}`,
    description: () => "Two days of meetings. Slow, expensive, and where relationships actually start.",
    timeCost: 12, rcCost: 0, accCost: 35_000, weight: 10, facilityKinds: ["conference"],
  },
  {
    kind: "candidate",
    title: () => "Hiring conversation",
    description: ({ node }) => `Someone worth meeting is leaving ${node.label}.`,
    timeCost: 4, rcCost: 2, accCost: 0, weight: 8,
    facilityKinds: ["hangar", "repair_shop", "engine_shop", "conference", "lessor", "distribution"],
  },
  {
    kind: "intel",
    title: ({ ata }) => `Market read: ${ataTitle(ata)}`,
    description: ({ ata }) => `Buy a position paper on where ${ataLabel(ata)} pricing is heading.`,
    timeCost: 1, rcCost: 0, accCost: 60_000, weight: 7,
    facilityKinds: ["broker", "lessor", "distribution", "conference"],
  },
];

export type EasterEggEffect =
  | { kind: "acc_grant"; value: number }
  | { kind: "discount_window"; value: number; ticks: number }
  | { kind: "free_repair_slot"; value: number }
  | { kind: "knowledge_boost"; value: number }
  | { kind: "relationship_boost"; value: number }
  | { kind: "listing_preview"; ticks: number }
  | { kind: "trace_upgrade"; value: number }
  | { kind: "capacity_grant"; value: number };

export type EasterEgg = {
  id: string;
  title: string;
  description: string;
  ataFocus: number[];
  reward: string;
  effect: EasterEggEffect;
  facilityKinds: FacilityKind[];
};

export const EASTER_EGGS: EasterEgg[] = [
  {
    id: "misfiled-llp-consignment",
    title: "Misfiled LLP consignment",
    description:
      "A pallet of serviceable life-limited parts has been sitting under the wrong bin location for two years, with complete back-to-birth trace still attached.",
    ataFocus: [72, 73],
    reward: "Serviceable LLPs with full trace, well under anchor price.",
    effect: { kind: "discount_window", value: 0.35, ticks: 4 },
    facilityKinds: ["warehouse", "distribution", "teardown"],
  },
  {
    id: "idle-overhaul-capacity",
    title: "Idle overhaul capacity",
    description:
      "A cancelled induction has left an engine test cell empty for the rest of the quarter. The shop would rather run it at cost than let it sit.",
    ataFocus: [72, 73, 79, 80],
    reward: "Free shop slots this quarter.",
    effect: { kind: "free_repair_slot", value: 3 },
    facilityKinds: ["engine_shop", "repair_shop"],
  },
  {
    id: "broker-favour",
    title: "A favour called in",
    description:
      "A broker you delivered for on time last year is in a position to return it, and would rather do that than owe you.",
    ataFocus: [24, 32],
    reward: "A large relationship step with this counterparty.",
    effect: { kind: "relationship_boost", value: 25 },
    facilityKinds: ["broker", "distribution", "warehouse"],
  },
  {
    id: "restructuring-package",
    title: "Restructuring disposal",
    description:
      "An operator restructuring its balance sheet is clearing rotable stock quickly and quietly, ahead of the auction.",
    ataFocus: [21, 27, 29, 32],
    reward: "A package priced to move before it reaches the open market.",
    effect: { kind: "discount_window", value: 0.28, ticks: 6 },
    facilityKinds: ["hangar", "lessor", "broker"],
  },
  {
    id: "records-archive",
    title: "Recovered records archive",
    description:
      "A shop closing its paper archive found the original release documents for hardware you already own.",
    ataFocus: [24, 29, 32, 49],
    reward: "Trace upgraded on stock already on your shelves.",
    effect: { kind: "trace_upgrade", value: 1 },
    facilityKinds: ["repair_shop", "component_shop", "warehouse"],
  },
  {
    id: "unlisted-qec",
    title: "Unlisted QEC kit",
    description:
      "A quick engine change kit came off a teardown complete and never made it onto the disposal list.",
    ataFocus: [71, 72],
    reward: "A complete QEC kit before anyone else sees it.",
    effect: { kind: "listing_preview", ticks: 5 },
    facilityKinds: ["teardown", "engine_shop"],
  },
  {
    id: "portfolio-rebalance",
    title: "Portfolio rebalance",
    description:
      "A lessor is rotating out of a type and will move a tranche of assets to whoever can close this month.",
    ataFocus: [32, 49, 72],
    reward: "A cash settlement for taking the tranche off their book.",
    effect: { kind: "acc_grant", value: 240_000 },
    facilityKinds: ["lessor"],
  },
  {
    id: "chapter-specialist",
    title: "A specialist willing to teach",
    description:
      "A retiring chapter specialist will spend a fortnight walking your people through the failure modes they actually see.",
    ataFocus: [21, 36, 49],
    reward: "A jump in chapter knowledge.",
    effect: { kind: "knowledge_boost", value: 2 },
    facilityKinds: ["repair_shop", "component_shop", "engine_shop", "conference"],
  },
  {
    id: "bonded-store-release",
    title: "Bonded store release",
    description:
      "A customs-bonded store is releasing surplus new-old-stock that has been held since a fleet programme was cancelled.",
    ataFocus: [23, 31, 34],
    reward: "New surplus avionics at teardown prices.",
    effect: { kind: "discount_window", value: 0.4, ticks: 3 },
    facilityKinds: ["warehouse", "distribution", "factory"],
  },
  {
    id: "spare-capacity-lease",
    title: "Spare rack capacity",
    description:
      "A distribution hub has racking it cannot fill this year and will lease it to you rather than heat empty space.",
    ataFocus: [25, 38],
    reward: "Extra warehouse capacity.",
    effect: { kind: "capacity_grant", value: 60 },
    facilityKinds: ["distribution", "warehouse"],
  },
];

function templatesFor(kind: FacilityKind): OpportunityTemplate[] {
  return OPPORTUNITY_TEMPLATES.filter((template) => template.facilityKinds.includes(kind));
}

function pickWeighted(rng: Rng, templates: OpportunityTemplate[]): OpportunityTemplate | null {
  if (templates.length === 0) return null;
  const total = templates.reduce((sum, template) => sum + template.weight, 0);
  let roll = rng.float(0, total);
  for (const template of templates) {
    roll -= template.weight;
    if (roll <= 0) return template;
  }
  return templates[templates.length - 1]!;
}

export type RollContext = {
  tick: number;
  node: NetworkNode;
  facility: Facility;
  existing: NetworkOpportunity[];
  nextId: () => number;
  easterEggChance?: number;
};

export function rollOpportunities(rng: Rng, ctx: RollContext): NetworkOpportunity[] {
  const { node, facility, tick } = ctx;
  if (node.reach === "tam") return [];
  const room = Math.max(0, node.slots - ctx.existing.length);
  if (room <= 0) return [];

  const templates = templatesFor(facility.kind);
  if (templates.length === 0) return [];
  const chapters =
    facility.ataCapabilities.length > 0 ? facility.ataCapabilities : node.ataFocus;
  if (chapters.length === 0) return [];

  const eggChance = ctx.easterEggChance ?? 0.02;
  const out: NetworkOpportunity[] = [];

  for (let i = 0; i < room; i++) {
    // A node only fills a slot some of the time, so the board breathes.
    if (!rng.chance(0.45)) continue;
    const ata = rng.pick(chapters);

    const eggs = EASTER_EGGS.filter((egg) => egg.facilityKinds.includes(facility.kind));
    if (eggs.length > 0 && rng.chance(eggChance)) {
      const egg = rng.pick(eggs);
      out.push({
        id: ctx.nextId(),
        nodeId: node.id,
        kind: "easter_egg",
        title: egg.title,
        description: egg.description,
        referenceId: null,
        agreementKind: null,
        expiresTick: tick + rng.int(4, 16),
        accepted: false,
        timeCost: 6,
        rcCost: 3,
        accCost: 0,
        ataFocus: egg.ataFocus,
        easterEgg: true,
        reward: egg.reward,
      });
      continue;
    }

    const template = pickWeighted(rng, templates);
    if (!template) continue;
    out.push({
      id: ctx.nextId(),
      nodeId: node.id,
      kind: template.kind,
      title: template.title({ node, ata }),
      description: template.description({ node, ata }),
      referenceId: null,
      agreementKind: null,
      expiresTick: tick + rng.int(4, 16),
      accepted: false,
      // Bigger counterparties take more of the founder's week.
      timeCost: Math.max(1, Math.round(template.timeCost * (0.7 + node.scale / 6))),
      rcCost: template.rcCost,
      accCost: template.accCost,
      ataFocus: [ata],
      easterEgg: false,
      reward: "",
    });
  }
  return out;
}

export function canOpen(
  opportunity: NetworkOpportunity,
  budget: TurnBudget,
  rc: number,
  acc: number,
): { ok: boolean; reason?: string } {
  if (opportunity.accepted) return { ok: false, reason: "already_open" };
  if (budget.timeSpent + opportunity.timeCost > budget.timeTotal) {
    return { ok: false, reason: "insufficient_time" };
  }
  if (opportunity.rcCost > rc || budget.rcSpent + opportunity.rcCost > budget.rcTotal) {
    return { ok: false, reason: "insufficient_relationship_capital" };
  }
  if (opportunity.accCost > acc) return { ok: false, reason: "insufficient_acc" };
  return { ok: true };
}

/** Pure. Drops expired and accepted entries. */
export function expireOpportunities(
  list: NetworkOpportunity[],
  tick: number,
): NetworkOpportunity[] {
  return list.filter((opportunity) => !opportunity.accepted && opportunity.expiresTick >= tick);
}

export function opportunityAtaSummary(
  list: NetworkOpportunity[],
): { code: number; title: string; count: number }[] {
  const rollup = new Map<number, number>();
  for (const opportunity of list) {
    for (const code of opportunity.ataFocus) {
      rollup.set(code, (rollup.get(code) ?? 0) + 1);
    }
  }
  return [...rollup.entries()]
    .map(([code, count]) => ({ code, title: ataTitle(code), count }))
    .sort((a, b) => b.count - a.count || a.code - b.code);
}
