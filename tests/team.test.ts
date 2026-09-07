import { describe, expect, it } from "vitest";
import { ATA_CHAPTERS, ataChapter, ataTitle } from "../src/sim/ata.ts";
import { REGION_CODES, region } from "../src/sim/geography.ts";
import { TEAM_PORTRAITS } from "../src/sim/identity.ts";
import { Rng } from "../src/sim/rng.ts";
import {
  BASE_TEAM_CAP,
  HIRE_RUNWAY_WEEKS,
  MAX_CANDIDATE_SKILL,
  MAX_CANDIDATE_SLOTS,
  MAX_CANDIDATE_TICKS,
  MIN_CANDIDATE_SKILL,
  MIN_CANDIDATE_TICKS,
  TEAM_ROLES,
  TEAM_ROLE_DEFS,
  canHire,
  candidateExpired,
  coversStandingOrders,
  hireMember,
  hireSeats,
  portraitCoversRoles,
  refreshCandidates,
  rollCandidate,
  roleLabel,
  salaryForSkill,
  standingOrderTimeCost,
  teamCapFrom,
  teamEffects,
  weeklySalaryCost,
} from "../src/sim/team.ts";
import type { KnowledgeEffect, TeamCandidate, TeamMember, TeamRole } from "../src/sim/types.ts";

const ALL_ROLES: TeamRole[] = ["buyer", "sales", "records", "repair", "regional", "analyst"];

function member(candidate: TeamCandidate, patch: Partial<TeamMember> = {}): TeamMember {
  return { ...hireMember(candidate, 0), ...patch };
}

function memberOf(role: TeamRole, patch: Partial<TeamMember> = {}): TeamMember {
  return member(rollCandidate(new Rng(4242), 0, role), patch);
}

function kinds(effects: KnowledgeEffect[]): string[] {
  return effects.map((effect) => effect.kind);
}

function valueOf(effects: KnowledgeEffect[], kind: string): number {
  const found = effects.find((effect) => effect.kind === kind);
  if (!found || !("value" in found)) throw new Error(`no ${kind} effect`);
  return found.value;
}

// ---------------------------------------------------------------------------

describe("TEAM_ROLE_DEFS", () => {
  it("covers every role exactly once, in board order", () => {
    expect(TEAM_ROLES).toEqual(ALL_ROLES);
    expect(Object.keys(TEAM_ROLE_DEFS).sort()).toEqual([...ALL_ROLES].sort());
  });

  it("prices the roles apart inside the 3k-9k weekly band", () => {
    const salaries = ALL_ROLES.map((role) => TEAM_ROLE_DEFS[role].baseSalary);
    for (const salary of salaries) {
      expect(salary).toBeGreaterThanOrEqual(3000);
      expect(salary).toBeLessThanOrEqual(9000);
    }
    expect(new Set(salaries).size).toBe(ALL_ROLES.length);
    // "Meaningfully different" — the spread is more than a rounding error.
    expect(Math.max(...salaries) - Math.min(...salaries)).toBeGreaterThan(3000);
  });

  it("gives each role the effects its job description promises", () => {
    expect(kinds(TEAM_ROLE_DEFS.buyer.effects)).toContain("time_income");

    expect(kinds(TEAM_ROLE_DEFS.sales.effects)).toEqual(
      expect.arrayContaining(["rc_income", "quote_quality"]),
    );

    expect(kinds(TEAM_ROLE_DEFS.records.effects)).toEqual(
      expect.arrayContaining(["repair_tat", "quote_quality"]),
    );

    expect(kinds(TEAM_ROLE_DEFS.repair.effects)).toEqual(
      expect.arrayContaining(["repair_tat", "ber_accuracy"]),
    );

    expect(kinds(TEAM_ROLE_DEFS.regional.effects)).toEqual(["reach_region"]);
    expect(kinds(TEAM_ROLE_DEFS.analyst.effects)).toEqual(["intel"]);
  });

  it("quotes every numeric effect as a positive strength", () => {
    for (const role of ALL_ROLES) {
      for (const effect of TEAM_ROLE_DEFS[role].effects) {
        if ("value" in effect) expect(effect.value).toBeGreaterThan(0);
      }
    }
  });

  it("labels every role with a real trade job title backed by a portrait", () => {
    expect(portraitCoversRoles()).toBe(true);
    for (const role of ALL_ROLES) {
      expect(roleLabel(role).length).toBeGreaterThan(3);
      expect(TEAM_ROLE_DEFS[role].blurb.length).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------------

describe("salaryForSkill", () => {
  it("rises strictly with skill for every role", () => {
    for (const role of ALL_ROLES) {
      const base = TEAM_ROLE_DEFS[role].baseSalary;
      for (let skill = MIN_CANDIDATE_SKILL; skill < MAX_CANDIDATE_SKILL; skill += 1) {
        expect(salaryForSkill(base, skill + 1)).toBeGreaterThan(salaryForSkill(base, skill));
      }
    }
  });

  it("scales the base rather than replacing it", () => {
    const base = TEAM_ROLE_DEFS.repair.baseSalary;
    const low = salaryForSkill(base, MIN_CANDIDATE_SKILL);
    const high = salaryForSkill(base, MAX_CANDIDATE_SKILL);
    expect(low).toBeLessThan(base);
    expect(high).toBeGreaterThan(base);
    expect(high / low).toBeGreaterThan(1.3);
  });
});

describe("weeklySalaryCost", () => {
  it("sums the roster and is zero for an empty team", () => {
    expect(weeklySalaryCost([])).toBe(0);
    const team = [memberOf("records"), memberOf("analyst")];
    expect(weeklySalaryCost(team)).toBe(team[0]!.salary + team[1]!.salary);
  });
});

// ---------------------------------------------------------------------------

describe("rollCandidate", () => {
  it("is deterministic for a seed, tick and role", () => {
    const a = rollCandidate(new Rng(90210), 12, "repair");
    const b = rollCandidate(new Rng(90210), 12, "repair");
    expect(a).toEqual(b);
  });

  it("is deterministic across a sequence drawn from one stream", () => {
    const streamA = new Rng(777);
    const streamB = new Rng(777);
    const runA = Array.from({ length: 20 }, () => rollCandidate(streamA, 5));
    const runB = Array.from({ length: 20 }, () => rollCandidate(streamB, 5));
    expect(runA).toEqual(runB);
  });

  it("produces different people from different seeds", () => {
    const names = new Set(
      Array.from({ length: 40 }, (_, i) => rollCandidate(new Rng(i * 613 + 7), 0, "sales").name),
    );
    expect(names.size).toBeGreaterThan(5);
  });

  it("honours the requested role and stays inside every declared range", () => {
    for (const role of ALL_ROLES) {
      for (let seed = 1; seed <= 60; seed += 1) {
        const candidate = rollCandidate(new Rng(seed * 31 + 5), 40, role);

        expect(candidate.role).toBe(role);
        expect(candidate.id).toContain(role);
        expect(candidate.name.split(" ").length).toBeGreaterThanOrEqual(2);

        expect(candidate.skill).toBeGreaterThanOrEqual(MIN_CANDIDATE_SKILL);
        expect(candidate.skill).toBeLessThanOrEqual(MAX_CANDIDATE_SKILL);
        expect(Number.isInteger(candidate.skill)).toBe(true);

        expect(candidate.salary).toBe(
          salaryForSkill(TEAM_ROLE_DEFS[role].baseSalary, candidate.skill),
        );

        expect(candidate.availableUntilTick).toBeGreaterThanOrEqual(40 + MIN_CANDIDATE_TICKS);
        expect(candidate.availableUntilTick).toBeLessThanOrEqual(40 + MAX_CANDIDATE_TICKS);

        expect(candidate.ataAffinity.length).toBeGreaterThanOrEqual(1);
        expect(candidate.ataAffinity.length).toBeLessThanOrEqual(3);
        expect(new Set(candidate.ataAffinity).size).toBe(candidate.ataAffinity.length);
        for (const code of candidate.ataAffinity) {
          expect(ataChapter(code)).toBeDefined();
        }

        expect(TEAM_PORTRAITS.some((portrait) => portrait.id === candidate.portraitId)).toBe(true);
      }
    }
  });

  it("sets regionCode only for the regional manager", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const role of ALL_ROLES) {
        const candidate = rollCandidate(new Rng(seed * 101 + 3), 0, role);
        if (role === "regional") {
          expect(candidate.regionCode).not.toBeNull();
          expect(REGION_CODES).toContain(candidate.regionCode);
        } else {
          expect(candidate.regionCode).toBeNull();
        }
      }
    }
  });

  it("names the ATA chapters, or the region, in words in the blurb", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const analyst = rollCandidate(new Rng(seed * 17 + 11), 0, "analyst");
      expect(analyst.blurb).toContain(ataTitle(analyst.ataAffinity[0]!));
      expect(analyst.blurb).not.toContain("undefined");
      expect(analyst.blurb.split("\n").length).toBe(1);

      const regional = rollCandidate(new Rng(seed * 17 + 11), 0, "regional");
      expect(regional.blurb).toContain(region(regional.regionCode!).name);
      expect(regional.blurb).toContain(ataTitle(regional.ataAffinity[0]!));
    }
  });

  it("weights ATA affinity toward high-value chapters", () => {
    const tableMean =
      ATA_CHAPTERS.reduce((sum, chapter) => sum + chapter.valueWeight, 0) / ATA_CHAPTERS.length;

    const rng = new Rng(2024);
    let picked = 0;
    let weight = 0;
    for (let i = 0; i < 400; i += 1) {
      for (const code of rollCandidate(rng, 0, "repair").ataAffinity) {
        weight += ataChapter(code)!.valueWeight;
        picked += 1;
      }
    }
    expect(picked).toBeGreaterThan(400);
    expect(weight / picked).toBeGreaterThan(tableMean * 2);
  });
});

// ---------------------------------------------------------------------------

describe("refreshCandidates", () => {
  it("is deterministic for the same seed and board", () => {
    const a = refreshCandidates(new Rng(31337), 3, [], 4);
    const b = refreshCandidates(new Rng(31337), 3, [], 4);
    expect(a).toEqual(b);
  });

  it("fills an empty board to exactly the slot count", () => {
    for (let slots = 0; slots <= 6; slots += 1) {
      const board = refreshCandidates(new Rng(11 + slots), 0, [], slots);
      expect(board.length).toBe(slots);
      expect(new Set(board.map((entry) => entry.id)).size).toBe(slots);
    }
  });

  it("never exceeds the slot count, even from an oversized board", () => {
    const overfull = refreshCandidates(new Rng(5), 0, [], 6);
    expect(overfull.length).toBe(6);

    const shrunk = refreshCandidates(new Rng(6), 0, overfull, 2);
    expect(shrunk.length).toBe(2);
    // Survivors keep their place rather than being re-rolled.
    expect(shrunk.map((entry) => entry.id)).toEqual(
      overfull.slice(0, 2).map((entry) => entry.id),
    );

    expect(refreshCandidates(new Rng(7), 0, overfull, 0)).toEqual([]);
    expect(refreshCandidates(new Rng(7), 0, overfull, -3)).toEqual([]);
    expect(refreshCandidates(new Rng(7), 0, overfull, Number.POSITIVE_INFINITY)).toEqual([]);
    expect(refreshCandidates(new Rng(7), 0, [], 999).length).toBe(MAX_CANDIDATE_SLOTS);
  });

  it("drops expired candidates and tops the board back up", () => {
    const board = refreshCandidates(new Rng(808), 0, [], 4);
    const expired = board.map((entry, index) =>
      index < 2 ? { ...entry, availableUntilTick: 3 } : { ...entry, availableUntilTick: 30 },
    );

    const next = refreshCandidates(new Rng(909), 10, expired, 4);
    expect(next.length).toBe(4);

    const survivorIds = expired
      .filter((entry) => entry.availableUntilTick >= 10)
      .map((entry) => entry.id);
    for (const id of survivorIds) {
      expect(next.map((entry) => entry.id)).toContain(id);
    }
    for (const id of expired.slice(0, 2).map((entry) => entry.id)) {
      expect(next.map((entry) => entry.id)).not.toContain(id);
    }
    for (const entry of next) {
      expect(candidateExpired(entry, 10)).toBe(false);
    }
    expect(new Set(next.map((entry) => entry.id)).size).toBe(4);
  });

  it("keeps a candidate available on the tick it expires and drops it the pulse after", () => {
    const [only] = refreshCandidates(new Rng(1234), 0, [], 1);
    const pinned = { ...only!, availableUntilTick: 9 };

    expect(candidateExpired(pinned, 9)).toBe(false);
    expect(refreshCandidates(new Rng(1), 9, [pinned], 1).map((c) => c.id)).toEqual([pinned.id]);

    expect(candidateExpired(pinned, 10)).toBe(true);
    expect(refreshCandidates(new Rng(1), 10, [pinned], 1).map((c) => c.id)).not.toEqual([
      pinned.id,
    ]);
  });

  it("spreads the roles across a fresh board", () => {
    const board = refreshCandidates(new Rng(4711), 0, [], 6);
    expect(new Set(board.map((entry) => entry.role)).size).toBe(6);
  });
});

// ---------------------------------------------------------------------------

describe("canHire", () => {
  const rich = 10_000_000;

  it("rejects an unknown candidate", () => {
    expect(canHire(null, [], 4, rich)).toEqual({ ok: false, reason: "unknown_candidate" });
    expect(canHire(undefined, [], 4, rich).ok).toBe(false);
  });

  it("rejects an expired candidate once a tick is supplied", () => {
    const candidate = { ...rollCandidate(new Rng(64), 0, "analyst"), availableUntilTick: 5 };
    expect(canHire(candidate, [], 4, rich, 5).ok).toBe(true);
    expect(canHire(candidate, [], 4, rich, 6)).toEqual({
      ok: false,
      reason: "candidate_expired",
    });
  });

  it("rejects a hire once the team is at cap", () => {
    const first = memberOf("records");
    const candidate = rollCandidate(new Rng(99), 0, "analyst");

    // BASE_TEAM_CAP counts the founder, so the base cap allows exactly one hire.
    expect(hireSeats(BASE_TEAM_CAP)).toBe(1);
    expect(canHire(candidate, [], BASE_TEAM_CAP, rich).ok).toBe(true);
    expect(canHire(candidate, [first], BASE_TEAM_CAP, rich)).toEqual({
      ok: false,
      reason: "team_at_cap",
    });
    // A team_cap effect from Tribal Knowledge opens the next seat.
    expect(canHire(candidate, [first], BASE_TEAM_CAP + 1, rich).ok).toBe(true);
  });

  it("rejects a salary the founder cannot cover for four weeks", () => {
    const candidate = rollCandidate(new Rng(1500), 0, "regional");
    const need = candidate.salary * HIRE_RUNWAY_WEEKS;

    expect(canHire(candidate, [], 4, need).ok).toBe(true);
    expect(canHire(candidate, [], 4, need - 1)).toEqual({
      ok: false,
      reason: "salary_unaffordable",
    });
  });

  it("judges the runway on the whole payroll, not just the new salary", () => {
    const sitting = memberOf("records");
    const candidate = rollCandidate(new Rng(1500), 0, "regional");
    const combined = (sitting.salary + candidate.salary) * HIRE_RUNWAY_WEEKS;

    expect(canHire(candidate, [sitting], 6, combined).ok).toBe(true);
    expect(canHire(candidate, [sitting], 6, combined - 1).ok).toBe(false);
    // The same balance would have been fine had the records desk been empty.
    expect(canHire(candidate, [], 6, combined - 1).ok).toBe(true);
  });

  it("rejects someone already on the payroll", () => {
    const candidate = rollCandidate(new Rng(2), 0, "sales");
    const hired = hireMember(candidate, 4);
    expect(hired.hiredTick).toBe(4);
    expect(canHire(candidate, [hired], 8, rich)).toEqual({ ok: false, reason: "already_hired" });
  });
});

describe("team cap", () => {
  it("starts at the founder plus one and rises with knowledge team_cap effects", () => {
    expect(BASE_TEAM_CAP).toBe(2);
    expect(teamCapFrom([])).toBe(2);
    expect(teamCapFrom([{ kind: "team_cap", value: 2 }])).toBe(4);
    expect(
      teamCapFrom([
        { kind: "team_cap", value: 1 },
        { kind: "intel", value: 5 },
        { kind: "team_cap", value: 1 },
      ]),
    ).toBe(4);
  });
});

// ---------------------------------------------------------------------------

describe("teamEffects", () => {
  it("returns nothing for an empty team", () => {
    expect(teamEffects([])).toEqual([]);
  });

  it("scales every numeric effect by skill over 100", () => {
    const full = memberOf("analyst", { skill: 100 });
    const half = memberOf("analyst", { skill: 50 });

    const quoted = valueOf(TEAM_ROLE_DEFS.analyst.effects, "intel");
    expect(valueOf(teamEffects([full]), "intel")).toBeCloseTo(quoted, 10);
    expect(valueOf(teamEffects([half]), "intel")).toBeCloseTo(quoted / 2, 10);

    const sales100 = teamEffects([memberOf("sales", { skill: 100 })]);
    const sales40 = teamEffects([memberOf("sales", { skill: 40 })]);
    expect(valueOf(sales40, "rc_income")).toBeCloseTo(valueOf(sales100, "rc_income") * 0.4, 10);
    expect(valueOf(sales40, "quote_quality")).toBeCloseTo(
      valueOf(sales100, "quote_quality") * 0.4,
      10,
    );
  });

  it("scopes the repair coordinator's turn-time effect to their ATA affinity", () => {
    const coordinator = memberOf("repair", { skill: 50, ataAffinity: [32, 72] });
    const effects = teamEffects([coordinator]);

    const tat = effects.filter((effect) => effect.kind === "repair_tat");
    expect(tat.length).toBe(2);
    expect(tat.map((effect) => (effect.kind === "repair_tat" ? effect.ata : null))).toEqual([
      32, 72,
    ]);
    const quoted = valueOf(TEAM_ROLE_DEFS.repair.effects, "repair_tat");
    for (const effect of tat) {
      if (effect.kind !== "repair_tat") throw new Error("unreachable");
      expect(effect.value).toBeCloseTo(quoted / 2, 10);
    }

    // ber_accuracy carries no ATA field, so it stays a single global effect.
    const ber = effects.filter((effect) => effect.kind === "ber_accuracy");
    expect(ber.length).toBe(1);
  });

  it("rewrites the regional manager's reach to their own region", () => {
    const manager = memberOf("regional", { regionCode: "SEA", skill: 61 });
    const effects = teamEffects([manager]);
    expect(effects).toEqual([{ kind: "reach_region", regionCode: "SEA" }]);
    // Reach is binary: skill never dilutes it.
    expect(teamEffects([memberOf("regional", { regionCode: "SEA", skill: 35 })])).toEqual(effects);
  });

  it("folds the whole roster into one list and stays deterministic", () => {
    const team = [
      memberOf("repair", { skill: 80, ataAffinity: [24, 32, 72] }),
      memberOf("regional", { regionCode: "GCHINA" }),
      memberOf("buyer", { skill: 90 }),
    ];
    const first = teamEffects(team);
    expect(teamEffects(team)).toEqual(first);
    expect(kinds(first)).toEqual([
      "repair_tat",
      "repair_tat",
      "repair_tat",
      "ber_accuracy",
      "reach_region",
      "time_income",
    ]);
    expect(valueOf(first, "time_income")).toBeCloseTo(
      valueOf(TEAM_ROLE_DEFS.buyer.effects, "time_income") * 0.9,
      10,
    );
  });

  it("keeps an ATA-scoped effect global when the member has no affinity", () => {
    const coordinator = memberOf("repair", { skill: 100, ataAffinity: [] });
    const tat = teamEffects([coordinator]).filter((effect) => effect.kind === "repair_tat");
    expect(tat.length).toBe(1);
    if (tat[0]!.kind !== "repair_tat") throw new Error("unreachable");
    expect(tat[0]!.ata).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe("standing orders", () => {
  it("costs founder time until a buyer is on the payroll", () => {
    const withoutBuyer = [memberOf("sales"), memberOf("analyst")];
    expect(coversStandingOrders(withoutBuyer)).toBe(false);
    expect(standingOrderTimeCost(withoutBuyer, 6)).toBe(6);

    const withBuyer = [...withoutBuyer, memberOf("buyer")];
    expect(coversStandingOrders(withBuyer)).toBe(true);
    expect(standingOrderTimeCost(withBuyer, 6)).toBe(0);
    expect(standingOrderTimeCost([], 6)).toBe(6);
  });
});
