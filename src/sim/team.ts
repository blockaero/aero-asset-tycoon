/**
 * The Team: the six people a founder can hire, and the maths behind hiring them.
 *
 * The Team screen is the portrait video-call monitor standing beside the founder's
 * three-monitor desk. Each tile is a candidate on the market; hiring one turns the
 * tile into a permanent caller who works a slice of the business the founder can no
 * longer reach alone.
 *
 * Team members and Tribal Knowledge both express themselves as KnowledgeEffect, so
 * the rest of the sim resolves one list and never asks where a bonus came from.
 * A knowledge node is a fixed effect the founder owns forever; a team member is the
 * same shape of effect scaled by how good that person actually is, scoped to the
 * ATA chapters or the region they know, and paid for every single week.
 *
 * Pure module: only const lookup tables are built at load. Every roll goes through
 * the seeded Rng, so the same seed and the same call order always produce the same
 * board of candidates.
 */

import { ATA_CHAPTERS, ataTitle } from "./ata.ts";
import { REGION_CODES, region } from "./geography.ts";
import { TEAM_PORTRAITS, rollFounderName, teamPortraitId } from "./identity.ts";
import type { Rng } from "./rng.ts";
import type {
  AtaChapter,
  KnowledgeEffect,
  RegionCode,
  TeamCandidate,
  TeamMember,
  TeamRole,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** Display order for the candidate board and the hired roster. */
export const TEAM_ROLES: readonly TeamRole[] = [
  "buyer",
  "sales",
  "records",
  "repair",
  "regional",
  "analyst",
];

export type TeamRoleDef = {
  /** Real trade job title. */
  label: string;
  /** One line on what this person takes off the founder's desk. */
  blurb: string;
  /** Weekly ACC salary at skill 100 before the skill scaling in salaryForSkill. */
  baseSalary: number;
  /**
   * What the role does, in the shared effect vocabulary.
   *
   * Values are quoted at full strength; teamEffects scales them by the member's
   * skill and scopes the ATA-scoped ones to that member's affinity. Effects that
   * carry no number (reach_region) are not scaled — a regional manager either has
   * the region or does not.
   */
  effects: KnowledgeEffect[];
};

/**
 * The region stamped on the regional manager's template effect.
 *
 * It is a placeholder only: teamEffects always rewrites reach_region to the
 * member's own regionCode, which rollCandidate sets for every regional hire.
 */
const REGIONAL_TEMPLATE_REGION: RegionCode = "NA";

/**
 * The six hireable roles.
 *
 * Salaries are weekly ACC and are deliberately far apart. A technical records
 * specialist is the cheapest desk in the building and a regional manager running a
 * foreign market is the most expensive, which is what makes the second hire an
 * actual decision rather than a formality.
 */
export const TEAM_ROLE_DEFS: Record<TeamRole, TeamRoleDef> = {
  buyer: {
    label: "Asset Buyer",
    blurb:
      "Works the teardown, surplus and lessor-return channel so the founder stops spending pulses on sourcing calls.",
    baseSalary: 7500,
    // Hours handed back to the founder every pulse. The buyer also absorbs the time
    // cost of standing-order replenishment entirely — see standingOrderTimeCost.
    effects: [{ kind: "time_income", value: 4 }],
  },
  sales: {
    label: "Sales Lead",
    blurb:
      "Keeps a standing customer book warm and turns a bare price into a quote an airline buyer can actually approve.",
    baseSalary: 5400,
    effects: [
      { kind: "rc_income", value: 3 },
      { kind: "quote_quality", value: 0.08 },
    ],
  },
  records: {
    label: "Technical Records Specialist",
    blurb:
      "Clears back-to-birth trace, 8130-3 tags and dirty-core paperwork before it can stall a shop visit or a sale.",
    baseSalary: 3200,
    effects: [
      // Paperwork chased ahead of induction is turn time the shop never loses.
      { kind: "repair_tat", value: 0.06 },
      // Receiving side: a complete file means the quote survives the buyer's audit.
      { kind: "quote_quality", value: 0.05 },
    ],
  },
  repair: {
    label: "Repair Coordinator",
    blurb:
      "Chases workscopes and shop findings on the bench, and calls beyond-economic-repair before good money follows bad.",
    baseSalary: 6300,
    effects: [
      // ATA-scoped: teamEffects fans this out across the member's affinity.
      { kind: "repair_tat", value: 0.12 },
      { kind: "ber_accuracy", value: 0.15 },
    ],
  },
  regional: {
    label: "Regional Manager",
    blurb:
      "Lives in the market, so its operators, MROs and brokers become reachable instead of statistical.",
    baseSalary: 8800,
    effects: [{ kind: "reach_region", regionCode: REGIONAL_TEMPLATE_REGION }],
  },
  analyst: {
    label: "Market Analyst",
    blurb:
      "Tracks fleet retirements, shop rates and shock rumours, and says which way the cohort indices are about to move.",
    baseSalary: 4200,
    effects: [{ kind: "intel", value: 0.2 }],
  },
};

/** Real trade job title for a role. */
export function roleLabel(role: TeamRole): string {
  return TEAM_ROLE_DEFS[role].label;
}

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

/** Skill 35 pays 0.88x the base; skill 95 pays 1.36x. */
const SALARY_FLOOR = 0.6;
const SALARY_SPAN = 0.8;
/** Salaries are quoted to the nearest ten ACC so the UI never shows loose change. */
const SALARY_STEP = 10;

export const MIN_CANDIDATE_SKILL = 35;
export const MAX_CANDIDATE_SKILL = 95;

/**
 * Weekly ACC a candidate of this skill asks for in this role.
 *
 * Strictly increasing in skill for every role in the table: the smallest base
 * salary still moves more than one rounding step per skill point.
 */
export function salaryForSkill(baseSalary: number, skill: number): number {
  const clamped = clamp(skill, 1, 100);
  const raw = baseSalary * (SALARY_FLOOR + SALARY_SPAN * (clamped / 100));
  return Math.round(raw / SALARY_STEP) * SALARY_STEP;
}

/** Total weekly ACC payroll for the hired team. */
export function weeklySalaryCost(team: TeamMember[]): number {
  let total = 0;
  for (const member of team) total += member.salary;
  return total;
}

// ---------------------------------------------------------------------------
// Rolling candidates
// ---------------------------------------------------------------------------

/** Shortest and longest a candidate stays on the board, in pulses. */
export const MIN_CANDIDATE_TICKS = 6;
export const MAX_CANDIDATE_TICKS = 14;

/** Most chapters one person can claim to know well. */
const MAX_AFFINITY = 3;

/** Hard ceiling on board size, so a nonsense slot count cannot spin the top-up loop. */
export const MAX_CANDIDATE_SLOTS = 12;

/** Base-36 id token width. 36^4 keeps collisions rare on a board of a dozen. */
const ID_TOKEN_MAX = 36 ** 4 - 1;

/**
 * Pick one chapter, weighted by aftermarket value.
 *
 * ATA 72 Engine carries far more of the aftermarket than ATA 6 Dimensions and Areas,
 * so the people on the market skew the same way. Consumes exactly one Rng draw.
 */
function pickWeightedChapter(rng: Rng, pool: AtaChapter[]): AtaChapter {
  let total = 0;
  for (const chapter of pool) total += chapter.valueWeight;
  let roll = rng.next() * total;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= pool[i]!.valueWeight;
    if (roll <= 0) return pool.splice(i, 1)[0]!;
  }
  return pool.splice(pool.length - 1, 1)[0]!;
}

/** One to three distinct chapters, value-weighted, in ascending code order. */
function rollAffinity(rng: Rng): number[] {
  const wanted = rng.int(1, MAX_AFFINITY);
  const pool = ATA_CHAPTERS.slice();
  const codes: number[] = [];
  for (let i = 0; i < wanted && pool.length > 0; i += 1) {
    codes.push(pickWeightedChapter(rng, pool).code);
  }
  codes.sort((a, b) => a - b);
  return codes;
}

/** "Landing Gear", "Landing Gear and Engine", "Landing Gear, Engine and Oil". */
function joinWords(words: string[]): string {
  if (words.length === 0) return "general airframe work";
  if (words.length === 1) return words[0]!;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]!}`;
}

function candidateBlurb(role: TeamRole, ataAffinity: number[], regionCode: RegionCode | null): string {
  const chapters = joinWords(ataAffinity.map((code) => ataTitle(code)));
  switch (role) {
    case "buyer":
      return `Asset buyer who works the teardown and surplus channel for ${chapters}.`;
    case "sales":
      return `Sales lead with a standing customer book in ${chapters}.`;
    case "records":
      return `Technical records specialist who closes back-to-birth files on ${chapters}.`;
    case "repair":
      return `Repair coordinator who runs shop visits and BER calls on ${chapters}.`;
    case "regional":
      return `Regional manager based in ${regionCode ? region(regionCode).name : "the home market"}, strongest on ${chapters}.`;
    case "analyst":
      return `Market analyst tracking retirements and shop rates across ${chapters}.`;
  }
}

/**
 * Roll one candidate for the board.
 *
 * Deterministic: the same Rng state, tick and role always produce the same person.
 * The Rng is consumed in a fixed order — role (only when not supplied), id token,
 * name, skill, ATA affinity, region, availability — and the region draw happens for
 * every role so the trailing draws do not shift depending on the role rolled.
 */
export function rollCandidate(rng: Rng, tick: number, role?: TeamRole): TeamCandidate {
  const chosen: TeamRole = role ?? rng.pick(TEAM_ROLES);
  const token = rng.int(0, ID_TOKEN_MAX).toString(36).padStart(4, "0");
  const name = rollFounderName(rng);
  const skill = rng.int(MIN_CANDIDATE_SKILL, MAX_CANDIDATE_SKILL);
  const ataAffinity = rollAffinity(rng);
  const rolledRegion = rng.pick(REGION_CODES);
  const regionCode = chosen === "regional" ? rolledRegion : null;
  const availableUntilTick = tick + rng.int(MIN_CANDIDATE_TICKS, MAX_CANDIDATE_TICKS);

  return {
    id: `cand-${tick}-${chosen}-${token}`,
    name,
    role: chosen,
    portraitId: teamPortraitId(chosen),
    salary: salaryForSkill(TEAM_ROLE_DEFS[chosen].baseSalary, skill),
    skill,
    ataAffinity,
    regionCode,
    availableUntilTick,
    blurb: candidateBlurb(chosen, ataAffinity, regionCode),
  };
}

/** A candidate is hireable on the tick they expire, and gone the pulse after. */
export function candidateExpired(candidate: TeamCandidate, tick: number): boolean {
  return candidate.availableUntilTick < tick;
}

/**
 * Age the candidate board and top it back up.
 *
 * Expired tiles drop off, survivors keep their place (so a candidate the player was
 * considering does not jump around the monitor), and new faces fill the rest. The
 * result never exceeds `slots`, and the top-up prefers roles that are not already on
 * the board so the founder sees a spread rather than four buyers.
 */
export function refreshCandidates(
  rng: Rng,
  tick: number,
  existing: TeamCandidate[],
  slots: number,
): TeamCandidate[] {
  const cap = Number.isFinite(slots)
    ? Math.min(MAX_CANDIDATE_SLOTS, Math.max(0, Math.floor(slots)))
    : 0;
  if (cap === 0) return [];

  const used = new Set<string>();
  const board: TeamCandidate[] = [];
  for (const candidate of existing) {
    if (board.length >= cap) break;
    if (candidateExpired(candidate, tick)) continue;
    if (used.has(candidate.id)) continue;
    used.add(candidate.id);
    board.push(candidate);
  }

  while (board.length < cap) {
    const present = new Set(board.map((entry) => entry.role));
    const missing = TEAM_ROLES.filter((entry) => !present.has(entry));
    const role = rng.pick(missing.length > 0 ? missing : TEAM_ROLES);
    let candidate = rollCandidate(rng, tick, role);
    for (let attempt = 0; attempt < 4 && used.has(candidate.id); attempt += 1) {
      candidate = rollCandidate(rng, tick, role);
    }
    if (used.has(candidate.id)) {
      candidate = { ...candidate, id: `${candidate.id}-${board.length}` };
    }
    used.add(candidate.id);
    board.push(candidate);
  }

  return board;
}

// ---------------------------------------------------------------------------
// Hiring
// ---------------------------------------------------------------------------

/** The founder plus one. Tribal Knowledge team_cap effects raise it from here. */
export const BASE_TEAM_CAP = 2;

/** Payroll weeks of ACC a founder must be able to cover before taking someone on. */
export const HIRE_RUNWAY_WEEKS = 4;

/** Team cap once knowledge and team effects are folded in. */
export function teamCapFrom(effects: KnowledgeEffect[]): number {
  let extra = 0;
  for (const effect of effects) {
    if (effect.kind === "team_cap") extra += effect.value;
  }
  return Math.max(1, BASE_TEAM_CAP + Math.round(extra));
}

/**
 * Hireable seats for a given cap.
 *
 * The cap counts the founder, so BASE_TEAM_CAP of 2 is the founder plus one hire.
 */
export function hireSeats(teamCap: number): number {
  if (!Number.isFinite(teamCap)) return 0;
  return Math.max(0, Math.floor(teamCap) - 1);
}

export type HireCheck = { ok: boolean; reason?: string };

/**
 * Can the founder take this person on right now?
 *
 * Pass `tick` to also reject a candidate whose window has closed; without it the
 * expiry check is skipped, because expiry is a property of the calendar and not of
 * the candidate alone. Affordability is judged on the whole payroll after the hire,
 * not just this salary: four weeks of the new total must sit in ACC.
 */
export function canHire(
  candidate: TeamCandidate | null | undefined,
  team: TeamMember[],
  teamCap: number,
  accBalance: number,
  tick?: number,
): HireCheck {
  if (!candidate) return { ok: false, reason: "unknown_candidate" };
  if (!TEAM_ROLE_DEFS[candidate.role]) return { ok: false, reason: "unknown_role" };
  if (tick !== undefined && candidateExpired(candidate, tick)) {
    return { ok: false, reason: "candidate_expired" };
  }
  if (team.some((member) => member.id === candidate.id)) {
    return { ok: false, reason: "already_hired" };
  }
  if (team.length >= hireSeats(teamCap)) return { ok: false, reason: "team_at_cap" };
  const payroll = weeklySalaryCost(team) + candidate.salary;
  if (payroll * HIRE_RUNWAY_WEEKS > accBalance) {
    return { ok: false, reason: "salary_unaffordable" };
  }
  return { ok: true };
}

/** Turn an accepted candidate into a member. Pure; the caller owns the roster. */
export function hireMember(candidate: TeamCandidate, tick: number): TeamMember {
  return { ...candidate, hiredTick: tick };
}

// ---------------------------------------------------------------------------
// Standing orders
// ---------------------------------------------------------------------------

/** The role that absorbs the founder's replenishment busywork. */
export const STANDING_ORDER_ROLE: TeamRole = "buyer";

/** True once a buyer is on the payroll. */
export function coversStandingOrders(team: TeamMember[]): boolean {
  return team.some((member) => member.role === STANDING_ORDER_ROLE);
}

/**
 * Founder hours a pulse of standing-order purchasing costs.
 *
 * With a buyer on the team the founder never touches replenishment, so it is free.
 */
export function standingOrderTimeCost(team: TeamMember[], baseTimeCost: number): number {
  if (coversStandingOrders(team)) return 0;
  return Math.max(0, baseTimeCost);
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** A member at skill 100 delivers the role's quoted effect in full. */
function skillFactor(skill: number): number {
  return clamp(skill, 0, 100) / 100;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Everything the hired team contributes, in the same vocabulary as Tribal Knowledge.
 *
 * Numeric effects are scaled by skill/100. ATA-scoped kinds are fanned out across the
 * member's affinity, one copy per chapter, so a repair coordinator who knows ATA 32
 * and ATA 72 shortens turn time on those chapters and nothing else. reach_region is
 * rewritten to the member's own region and is never scaled: reach is binary.
 */
export function teamEffects(team: TeamMember[]): KnowledgeEffect[] {
  const out: KnowledgeEffect[] = [];
  for (const member of team) {
    const def = TEAM_ROLE_DEFS[member.role];
    if (!def) continue;
    const factor = skillFactor(member.skill);
    for (const effect of def.effects) {
      switch (effect.kind) {
        case "buy_discount":
        case "sell_premium":
        case "repair_tat": {
          const value = round6(effect.value * factor);
          if (member.ataAffinity.length === 0) {
            out.push({ ...effect, value });
            break;
          }
          for (const ata of member.ataAffinity) out.push({ ...effect, value, ata });
          break;
        }
        case "reach_region":
          out.push({ kind: "reach_region", regionCode: member.regionCode ?? effect.regionCode });
          break;
        case "unlock_facility":
          out.push({ ...effect });
          break;
        default:
          out.push({ ...effect, value: round6(effect.value * factor) });
          break;
      }
    }
  }
  return out;
}

/** Every portrait the team screen can show, in role order. */
export const TEAM_ROLE_PORTRAITS: readonly string[] = TEAM_ROLES.map((role) => teamPortraitId(role));

/** Guard against the portrait table and the role list drifting apart. */
export function portraitCoversRoles(): boolean {
  const known = new Set(TEAM_PORTRAITS.map((portrait) => portrait.id));
  return TEAM_ROLE_PORTRAITS.every((id) => known.has(id));
}
