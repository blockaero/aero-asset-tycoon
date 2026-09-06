import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_NODES,
  KNOWLEDGE_TOTAL_ACC,
  NOT_FRAMED,
  assetRootId,
  assetSpecialistId,
  canInvest,
  completedEffects,
  investTick,
  isUnlocked,
  knowledgeNode,
  knowledgeWallSlots,
  missingPrerequisites,
  nodesInBranch,
  remainingAccCost,
} from "../src/sim/knowledge.ts";
import { ataLabel } from "../src/sim/ata.ts";
import type { KnowledgeBranch, KnowledgeNode, KnowledgeProgress } from "../src/sim/types.ts";

const BRANCHES: KnowledgeBranch[] = ["certification", "asset", "operations"];

/** Chapters the design brief requires a specialist for. */
const REQUIRED_SPECIALIST_CODES = [21, 24, 27, 29, 32, 34, 49, 72, 73, 79, 80];

const CERT_IDS = [
  "cert.asa100",
  "cert.iso9001",
  "cert.as9120",
  "cert.afra_bmp",
  "cert.iso27001",
  "cert.istat",
  "cert.acpc",
];

function done(nodeId: string, tick = 1): KnowledgeProgress {
  return { nodeId, investedTicks: knowledgeNode(nodeId)!.ticksToComplete, completedTick: tick };
}

/** Drive a node to completion the way the kernel would: one pulse at a time. */
function completeNode(nodeId: string, start: KnowledgeProgress[] = [], firstTick = 1): KnowledgeProgress[] {
  const node = knowledgeNode(nodeId)!;
  let progress = start;
  for (let i = 0; i < node.ticksToComplete; i += 1) {
    progress = investTick(nodeId, progress, firstTick + i);
  }
  return progress;
}

describe("knowledge tree shape", () => {
  it("has unique ids and only known branches", () => {
    const ids = KNOWLEDGE_NODES.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const node of KNOWLEDGE_NODES) {
      expect(BRANCHES).toContain(node.branch);
      expect(node.title.length).toBeGreaterThan(0);
      expect(node.shortTitle.length).toBeGreaterThan(0);
      expect(node.blurb.length).toBeGreaterThan(40);
    }
  });

  it("fills all three branches", () => {
    for (const branch of BRANCHES) {
      expect(nodesInBranch(branch).length).toBeGreaterThan(0);
      for (const node of nodesInBranch(branch)) expect(node.branch).toBe(branch);
    }
    expect(nodesInBranch("certification")).toHaveLength(7);
  });

  it("points every requires id at a real node, with no self-reference or cycle", () => {
    const ids = new Set(KNOWLEDGE_NODES.map((node) => node.id));
    for (const node of KNOWLEDGE_NODES) {
      for (const requiredId of node.requires) {
        expect(ids.has(requiredId)).toBe(true);
        expect(requiredId).not.toBe(node.id);
      }
    }
    // Every node must be reachable by resolving prerequisites, which is only true
    // when the graph is acyclic.
    const resolved = new Set<string>();
    for (let pass = 0; pass < KNOWLEDGE_NODES.length; pass += 1) {
      for (const node of KNOWLEDGE_NODES) {
        if (node.requires.every((requiredId) => resolved.has(requiredId))) resolved.add(node.id);
      }
    }
    expect(resolved.size).toBe(KNOWLEDGE_NODES.length);
  });

  it("keeps every node investable: real durations and founder hours in range", () => {
    for (const node of KNOWLEDGE_NODES) {
      expect(node.ticksToComplete).toBeGreaterThanOrEqual(2);
      expect(node.timeCost).toBeGreaterThanOrEqual(2);
      expect(node.timeCost).toBeLessThanOrEqual(10);
      expect(node.accCost).toBeGreaterThan(0);
      expect(node.effects.length).toBeGreaterThan(0);
    }
  });

  it("sums every accCost into KNOWLEDGE_TOTAL_ACC", () => {
    const sum = KNOWLEDGE_NODES.reduce((total, node) => total + node.accCost, 0);
    expect(KNOWLEDGE_TOTAL_ACC).toBe(sum);
    expect(KNOWLEDGE_TOTAL_ACC).toBeGreaterThan(0);
  });

  it("scales cost: roots are cheap, specialists and late nodes are not", () => {
    const roots = KNOWLEDGE_NODES.filter((node) => node.branch === "asset" && node.requires.length === 0);
    const specialists = KNOWLEDGE_NODES.filter(
      (node) => node.branch === "asset" && node.requires.length > 0,
    );
    for (const root of roots) {
      expect(root.accCost).toBeLessThanOrEqual(400_000);
      expect(root.ticksToComplete).toBeGreaterThanOrEqual(2);
      expect(root.ticksToComplete).toBeLessThanOrEqual(4);
    }
    const cheapestSpecialist = Math.min(...specialists.map((node) => node.accCost));
    const dearestRoot = Math.max(...roots.map((node) => node.accCost));
    expect(cheapestSpecialist).toBeGreaterThan(dearestRoot * 2);
    // The engine chapter is the most expensive thing on the tree.
    const engine = knowledgeNode(assetSpecialistId(72))!;
    expect(Math.max(...KNOWLEDGE_NODES.map((node) => node.accCost))).toBe(engine.accCost);
  });
});

describe("certification branch", () => {
  it("frames exactly the seven real accreditations and memberships", () => {
    const ids = nodesInBranch("certification").map((node) => node.id);
    expect([...ids].sort()).toEqual([...CERT_IDS].sort());
  });

  it("uses unique frame slots 0..6 and frames nothing from the other branches", () => {
    const slots = nodesInBranch("certification").map((node) => node.frameSlot);
    expect(new Set(slots).size).toBe(slots.length);
    expect([...slots].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const node of KNOWLEDGE_NODES) {
      if (node.branch !== "certification") expect(node.frameSlot).toBe(NOT_FRAMED);
    }
  });

  it("gates AS9120 behind ISO 9001 and nothing else", () => {
    expect(knowledgeNode("cert.as9120")!.requires).toEqual(["cert.iso9001"]);
    expect(knowledgeNode("cert.iso9001")!.requires).toEqual([]);
    for (const id of CERT_IDS) {
      if (id === "cert.as9120") continue;
      expect(knowledgeNode(id)!.requires).toEqual([]);
    }
  });

  it("grants the mechanics each certification is supposed to open", () => {
    const kinds = (id: string) => knowledgeNode(id)!.effects.map((effect) => effect.kind);

    expect(kinds("cert.asa100")).toContain("buyer_ceiling");
    expect(kinds("cert.asa100")).toContain("quote_quality");
    expect(kinds("cert.as9120")).toContain("buyer_ceiling");
    expect(kinds("cert.as9120")).toContain("quote_quality");

    expect(knowledgeNode("cert.afra_bmp")!.effects).toContainEqual({
      kind: "unlock_facility",
      facilityKind: "teardown",
    });
    expect(kinds("cert.afra_bmp")).toContain("buy_discount");

    expect(knowledgeNode("cert.iso27001")!.effects).toContainEqual({
      kind: "unlock_facility",
      facilityKind: "lessor",
    });
    expect(kinds("cert.iso27001")).toContain("intel");

    expect(kinds("cert.istat")).toContain("event_access");
    expect(kinds("cert.istat")).toContain("rc_income");

    expect(kinds("cert.acpc")).toContain("event_access");
    expect(knowledgeNode("cert.acpc")!.effects).toContainEqual({
      kind: "sell_premium",
      value: 0.04,
      assetClass: "component",
    });
  });

  it("raises the buyer ceiling more with AS9120 than with ISO 9001 alone", () => {
    const ceiling = (node: KnowledgeNode) =>
      node.effects.reduce(
        (total, effect) => (effect.kind === "buyer_ceiling" ? total + effect.value : total),
        0,
      );
    expect(ceiling(knowledgeNode("cert.as9120")!)).toBeGreaterThan(
      ceiling(knowledgeNode("cert.iso9001")!),
    );
  });
});

describe("asset branch", () => {
  const roots = KNOWLEDGE_NODES.filter((node) => node.branch === "asset" && node.requires.length === 0);
  const specialists = KNOWLEDGE_NODES.filter(
    (node) => node.branch === "asset" && node.requires.length > 0,
  );

  it("builds a fundamentals root per ATA group with the group's chapters on it", () => {
    const rootIds = roots.map((node) => node.id).sort();
    expect(rootIds).toEqual(
      [
        assetRootId("airframe_systems"),
        assetRootId("avionics"),
        assetRootId("propulsion"),
        assetRootId("structures"),
        assetRootId("utilities"),
      ].sort(),
    );
    for (const root of roots) {
      expect(root.ataCodes.length).toBeGreaterThan(1);
      expect(new Set(root.ataCodes).size).toBe(root.ataCodes.length);
    }
    expect(knowledgeNode(assetRootId("propulsion"))!.ataCodes).toContain(72);
    expect(knowledgeNode(assetRootId("airframe_systems"))!.ataCodes).toContain(32);
  });

  it("covers every high-value chapter with a specialist", () => {
    for (const code of REQUIRED_SPECIALIST_CODES) {
      const node = knowledgeNode(assetSpecialistId(code));
      expect(node, `missing specialist for ATA ${code}`).toBeDefined();
      expect(node!.branch).toBe("asset");
    }
  });

  it("gives every specialist non-empty ataCodes and its group root as prerequisite", () => {
    expect(specialists.length).toBeGreaterThanOrEqual(REQUIRED_SPECIALIST_CODES.length);
    const rootIds = new Set(roots.map((node) => node.id));
    for (const node of specialists) {
      expect(node.ataCodes.length).toBeGreaterThan(0);
      expect(node.requires).toHaveLength(1);
      expect(rootIds.has(node.requires[0]!)).toBe(true);
      // the root it hangs off must actually cover the chapter it teaches
      const root = knowledgeNode(node.requires[0]!)!;
      for (const code of node.ataCodes) expect(root.ataCodes).toContain(code);
    }
  });

  it("scopes specialist trading effects to the chapter and shows the ATA code in the title", () => {
    const engine = knowledgeNode(assetSpecialistId(72))!;
    expect(engine.title).toContain(ataLabel(72));
    expect(engine.title).toContain("ATA 72");
    expect(engine.ataCodes).toEqual([72]);

    for (const node of specialists) {
      const code = node.ataCodes[0]!;
      const kinds = node.effects.map((effect) => effect.kind);
      expect(kinds).toContain("buy_discount");
      expect(kinds).toContain("sell_premium");
      expect(kinds).toContain("repair_tat");
      expect(kinds).toContain("ber_accuracy");
      for (const effect of node.effects) {
        if (effect.kind === "buy_discount" || effect.kind === "sell_premium" || effect.kind === "repair_tat") {
          expect(effect.ata).toBe(code);
          expect(effect.value).toBeGreaterThan(0);
        }
      }
      expect(node.title).toContain(ataLabel(code));
    }
  });

  it("every root has at least one specialist hanging off it", () => {
    for (const root of roots) {
      const children = specialists.filter((node) => node.requires.includes(root.id));
      expect(children.length, `${root.id} has no specialist`).toBeGreaterThan(0);
    }
  });
});

describe("operations branch", () => {
  it("chains each sub-branch so there is a real progression", () => {
    expect(knowledgeNode("ops.sales.trade_show")!.requires).toEqual([]);
    expect(knowledgeNode("ops.sales.customer_days")!.requires).toEqual(["ops.sales.trade_show"]);
    expect(knowledgeNode("ops.sales.sponsored_sessions")!.requires).toEqual([
      "ops.sales.customer_days",
    ]);

    expect(knowledgeNode("ops.ops.logistics_desk")!.requires).toEqual([]);
    expect(knowledgeNode("ops.ops.receiving")!.requires).toEqual(["ops.ops.logistics_desk"]);
    expect(knowledgeNode("ops.ops.warehouse_expansion")!.requires).toEqual(["ops.ops.receiving"]);
    expect(knowledgeNode("ops.ops.regional_desk")!.requires).toEqual([
      "ops.ops.warehouse_expansion",
    ]);

    expect(knowledgeNode("ops.ai.auto_quote")!.requires).toEqual([]);
    expect(knowledgeNode("ops.ai.demand_forecasting")!.requires).toEqual(["ops.ai.auto_quote"]);
    expect(knowledgeNode("ops.ai.records_review")!.requires).toEqual([
      "ops.ai.demand_forecasting",
    ]);
  });

  it("gets more expensive down each chain", () => {
    const chains = [
      ["ops.sales.trade_show", "ops.sales.customer_days", "ops.sales.sponsored_sessions"],
      [
        "ops.ops.logistics_desk",
        "ops.ops.receiving",
        "ops.ops.warehouse_expansion",
        "ops.ops.regional_desk",
      ],
      ["ops.ai.auto_quote", "ops.ai.demand_forecasting", "ops.ai.records_review"],
    ];
    for (const chain of chains) {
      for (let i = 1; i < chain.length; i += 1) {
        expect(knowledgeNode(chain[i]!)!.accCost).toBeGreaterThan(knowledgeNode(chain[i - 1]!)!.accCost);
      }
    }
  });

  it("grants the sub-branch effects the design calls for", () => {
    const allKinds = (ids: string[]) =>
      ids.flatMap((id) => knowledgeNode(id)!.effects.map((effect) => effect.kind));

    const sales = allKinds([
      "ops.sales.trade_show",
      "ops.sales.customer_days",
      "ops.sales.sponsored_sessions",
    ]);
    expect(sales).toEqual(expect.arrayContaining(["event_access", "rc_income", "sell_premium"]));

    const ops = allKinds([
      "ops.ops.logistics_desk",
      "ops.ops.receiving",
      "ops.ops.warehouse_expansion",
      "ops.ops.regional_desk",
    ]);
    expect(ops).toEqual(
      expect.arrayContaining(["logistics_cost", "warehouse_capacity", "team_cap", "reach_region"]),
    );

    const ai = allKinds([
      "ops.ai.auto_quote",
      "ops.ai.demand_forecasting",
      "ops.ai.records_review",
    ]);
    expect(ai).toEqual(expect.arrayContaining(["quote_quality", "intel", "repair_tat", "time_income"]));
  });

  it("extends reach with real region codes", () => {
    const regions = knowledgeNode("ops.ops.regional_desk")!.effects.filter(
      (effect) => effect.kind === "reach_region",
    );
    expect(regions.length).toBeGreaterThan(0);
    const codes = new Set(["NA", "CARIB", "LATAM", "EUW", "EUE", "CIS", "MEA", "AFR", "SASIA", "SEA", "GCHINA", "NEASIA", "OCE", "CASIA"]);
    for (const effect of regions) {
      if (effect.kind !== "reach_region") continue;
      expect(codes.has(effect.regionCode)).toBe(true);
    }
  });
});

describe("knowledgeNode and isUnlocked", () => {
  it("looks nodes up and refuses unknown ids", () => {
    expect(knowledgeNode("cert.iso9001")!.shortTitle).toBe("ISO 9001");
    expect(knowledgeNode("cert.nope")).toBeUndefined();
    expect(isUnlocked("cert.nope", [{ nodeId: "cert.nope", investedTicks: 9, completedTick: 3 }])).toBe(
      false,
    );
  });

  it("counts a node as unlocked only once it is complete", () => {
    expect(isUnlocked("cert.iso9001", [])).toBe(false);
    expect(isUnlocked("cert.iso9001", [{ nodeId: "cert.iso9001", investedTicks: 2, completedTick: null }])).toBe(
      false,
    );
    expect(isUnlocked("cert.iso9001", [done("cert.iso9001", 7)])).toBe(true);
  });
});

describe("canInvest", () => {
  it("rejects an unknown node", () => {
    const check = canInvest("cert.does_not_exist", [], 10_000_000);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/unknown/i);
  });

  it("rejects a node that is already earned", () => {
    const check = canInvest("cert.iso9001", [done("cert.iso9001", 4)], 10_000_000);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/already earned/i);
  });

  it("rejects an unmet prerequisite and names it", () => {
    const check = canInvest("cert.as9120", [], 10_000_000);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("ISO 9001");
    expect(missingPrerequisites("cert.as9120", [])).toEqual(["cert.iso9001"]);
  });

  it("accepts the same node once the prerequisite is complete", () => {
    const progress = [done("cert.iso9001", 4)];
    expect(missingPrerequisites("cert.as9120", progress)).toEqual([]);
    expect(canInvest("cert.as9120", progress, 10_000_000)).toEqual({ ok: true });
  });

  it("rejects an ACC balance below the up-front cost", () => {
    const cost = knowledgeNode("cert.asa100")!.accCost;
    const check = canInvest("cert.asa100", [], cost - 1);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/ACC/);
    expect(canInvest("cert.asa100", [], cost).ok).toBe(true);
  });

  it("does not ask for the money twice once a node is in progress", () => {
    const started = investTick("cert.asa100", [], 1);
    expect(remainingAccCost("cert.asa100", [])).toBe(knowledgeNode("cert.asa100")!.accCost);
    expect(remainingAccCost("cert.asa100", started)).toBe(0);
    expect(canInvest("cert.asa100", started, 0).ok).toBe(true);

    // The kernel charges the ACC and opens the entry at zero ticks in the same
    // command, so that entry must not be billed again on the next pulse.
    const opened: KnowledgeProgress[] = [
      { nodeId: "cert.asa100", investedTicks: 0, completedTick: null },
    ];
    expect(remainingAccCost("cert.asa100", opened)).toBe(0);
    expect(canInvest("cert.asa100", opened, 0).ok).toBe(true);
    expect(investTick("cert.asa100", opened, 6)[0]!.investedTicks).toBe(1);
  });

  it("gates a specialist behind its group root", () => {
    expect(canInvest(assetSpecialistId(72), [], 100_000_000).ok).toBe(false);
    const withRoot = completeNode(assetRootId("propulsion"));
    expect(canInvest(assetSpecialistId(72), withRoot, 100_000_000).ok).toBe(true);
  });
});

describe("investTick", () => {
  it("is pure: it never mutates the array or the entries it is handed", () => {
    const entry: KnowledgeProgress = { nodeId: "cert.istat", investedTicks: 1, completedTick: null };
    const progress: KnowledgeProgress[] = [entry];
    const snapshot = JSON.stringify(progress);

    const next = investTick("cert.istat", progress, 12);

    expect(next).not.toBe(progress);
    expect(JSON.stringify(progress)).toBe(snapshot);
    expect(entry.investedTicks).toBe(1);
    expect(entry.completedTick).toBeNull();
    expect(next[0]).not.toBe(entry);
    expect(next[0]!.investedTicks).toBe(2);
  });

  it("appends a new entry for a node with no progress yet, leaving others alone", () => {
    const other = done("cert.iso9001", 3);
    const next = investTick("cert.istat", [other], 5);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(other);
    expect(next[1]).toEqual({ nodeId: "cert.istat", investedTicks: 1, completedTick: null });
  });

  it("completes exactly at the threshold and records the tick it was passed", () => {
    const node = knowledgeNode("cert.istat")!;
    expect(node.ticksToComplete).toBeGreaterThan(1);

    let progress: KnowledgeProgress[] = [];
    for (let i = 1; i < node.ticksToComplete; i += 1) {
      progress = investTick("cert.istat", progress, 100 + i);
      expect(progress[0]!.investedTicks).toBe(i);
      expect(progress[0]!.completedTick).toBeNull();
      expect(isUnlocked("cert.istat", progress)).toBe(false);
    }

    const completingTick = 100 + node.ticksToComplete;
    progress = investTick("cert.istat", progress, completingTick);
    expect(progress[0]!.investedTicks).toBe(node.ticksToComplete);
    expect(progress[0]!.completedTick).toBe(completingTick);
    expect(isUnlocked("cert.istat", progress)).toBe(true);
  });

  it("is a no-op on a completed node, so a replayed command cannot overshoot", () => {
    const node = knowledgeNode("cert.istat")!;
    const complete = completeNode("cert.istat", [], 20);
    const completedTick = complete[0]!.completedTick;

    const again = investTick("cert.istat", complete, 99);
    expect(again).not.toBe(complete);
    expect(again).toEqual(complete);
    expect(again[0]!.investedTicks).toBe(node.ticksToComplete);
    expect(again[0]!.completedTick).toBe(completedTick);
  });

  it("copies the array unchanged for an unknown node", () => {
    const progress = [done("cert.istat", 2)];
    const next = investTick("cert.mystery", progress, 4);
    expect(next).not.toBe(progress);
    expect(next).toEqual(progress);
  });

  it("is deterministic: the same call sequence always yields the same progress", () => {
    const a = completeNode("cert.iso9001", [], 1);
    const b = completeNode("cert.iso9001", [], 1);
    expect(a).toEqual(b);
  });
});

describe("completedEffects", () => {
  it("returns nothing when nothing is complete", () => {
    expect(completedEffects([])).toEqual([]);
    expect(completedEffects([{ nodeId: "cert.istat", investedTicks: 2, completedTick: null }])).toEqual([]);
  });

  it("includes only completed nodes", () => {
    const progress: KnowledgeProgress[] = [
      done("cert.istat", 3),
      { nodeId: "cert.acpc", investedTicks: 1, completedTick: null },
    ];
    const effects = completedEffects(progress);
    expect(effects).toEqual(knowledgeNode("cert.istat")!.effects);
    // ACPC's component premium must not leak in while it is still in progress.
    expect(effects).not.toContainEqual({
      kind: "sell_premium",
      value: 0.04,
      assetClass: "component",
    });
  });

  it("collects every effect of every completed node, in tree order", () => {
    const progress: KnowledgeProgress[] = [
      done("cert.acpc", 9),
      done("cert.iso9001", 2),
      done("cert.afra_bmp", 5),
    ];
    const effects = completedEffects(progress);
    const expected = [
      ...knowledgeNode("cert.iso9001")!.effects,
      ...knowledgeNode("cert.afra_bmp")!.effects,
      ...knowledgeNode("cert.acpc")!.effects,
    ];
    expect(effects).toEqual(expected);
    expect(effects).toContainEqual({ kind: "unlock_facility", facilityKind: "teardown" });
  });

  it("ignores progress entries for nodes that are not in the tree", () => {
    expect(completedEffects([{ nodeId: "cert.ghost", investedTicks: 5, completedTick: 5 }])).toEqual([]);
  });
});

describe("knowledgeWallSlots", () => {
  it("returns the certification branch only, ordered by frame slot", () => {
    const slots = knowledgeWallSlots([]);
    expect(slots).toHaveLength(7);
    expect(slots.map((slot) => slot.node.frameSlot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const slot of slots) expect(slot.node.branch).toBe("certification");
  });

  it("marks an empty wall available except where a prerequisite is missing", () => {
    const slots = knowledgeWallSlots([]);
    const byId = new Map(slots.map((slot) => [slot.node.id, slot.state]));
    expect(byId.get("cert.as9120")).toBe("locked");
    for (const id of CERT_IDS) {
      if (id === "cert.as9120") continue;
      expect(byId.get(id)).toBe("available");
    }
  });

  it("moves a frame through in_progress to earned, and unlocks what it gates", () => {
    const started = investTick("cert.iso9001", [], 1);
    const startedById = new Map(knowledgeWallSlots(started).map((slot) => [slot.node.id, slot.state]));
    expect(startedById.get("cert.iso9001")).toBe("in_progress");
    expect(startedById.get("cert.as9120")).toBe("locked");

    const earned = completeNode("cert.iso9001", [], 1);
    const earnedById = new Map(knowledgeWallSlots(earned).map((slot) => [slot.node.id, slot.state]));
    expect(earnedById.get("cert.iso9001")).toBe("earned");
    expect(earnedById.get("cert.as9120")).toBe("available");
  });

  it("does not mutate the progress it is given", () => {
    const progress = [done("cert.istat", 4)];
    const snapshot = JSON.stringify(progress);
    knowledgeWallSlots(progress);
    expect(JSON.stringify(progress)).toBe(snapshot);
  });
});
