/**
 * The large procedural world map and its fog of war.
 *
 * Three rings:
 *   TAM — exists in the cohort statistics, invisible on the map
 *   SAM — visible, known, but no business established yet
 *   SOM — ready to trade
 *
 * The legacy locked/lead/known/partner node states stay the source of truth for the
 * older systems, so reach and state are kept in lockstep by the two mapping functions
 * at the bottom of this file.
 */

import { ATA_CHAPTERS, chaptersInGroup } from "./ata.ts";
import { allocateFacilities, distanceWeeks, regionPoint, region } from "./geography.ts";
import type { Rng } from "./rng.ts";
import type {
  Facility,
  FacilityKind,
  MarketReach,
  NetworkNode,
  NodeState,
  Organization,
  OrganizationKind,
  RegionCode,
} from "./types.ts";

export type FacilityArchetype = {
  kind: FacilityKind;
  label: string;
  orgKind: OrganizationKind;
  role: NetworkNode["role"];
  minScale: number;
  maxScale: number;
  /** How many ATA chapters this kind covers. */
  ataBreadth: number;
  baseTat: number;
  capacity: number;
  weight: number;
};

export const FACILITY_ARCHETYPES: FacilityArchetype[] = [
  { kind: "component_shop", label: "Component Services", orgKind: "mro", role: "mro", minScale: 1, maxScale: 2, ataBreadth: 2, baseTat: 6, capacity: 6, weight: 26 },
  { kind: "repair_shop", label: "Repair Station", orgKind: "mro", role: "mro", minScale: 2, maxScale: 3, ataBreadth: 5, baseTat: 5, capacity: 10, weight: 18 },
  { kind: "engine_shop", label: "Engine Overhaul", orgKind: "mro", role: "mro", minScale: 4, maxScale: 5, ataBreadth: 11, baseTat: 9, capacity: 5, weight: 6 },
  { kind: "hangar", label: "Line Maintenance", orgKind: "airline", role: "customer", minScale: 2, maxScale: 4, ataBreadth: 8, baseTat: 0, capacity: 40, weight: 16 },
  { kind: "warehouse", label: "Rotables Warehouse", orgKind: "broker", role: "supplier", minScale: 2, maxScale: 4, ataBreadth: 9, baseTat: 0, capacity: 180, weight: 10 },
  { kind: "distribution", label: "Distribution Hub", orgKind: "broker", role: "supplier", minScale: 3, maxScale: 5, ataBreadth: 14, baseTat: 0, capacity: 320, weight: 6 },
  { kind: "factory", label: "Manufacturing", orgKind: "manufacturer", role: "supplier", minScale: 4, maxScale: 5, ataBreadth: 6, baseTat: 8, capacity: 400, weight: 5 },
  { kind: "teardown", label: "Teardown Yard", orgKind: "broker", role: "supplier", minScale: 2, maxScale: 4, ataBreadth: 7, baseTat: 4, capacity: 90, weight: 5 },
  { kind: "lessor", label: "Leasing Office", orgKind: "lessor", role: "supplier", minScale: 3, maxScale: 5, ataBreadth: 4, baseTat: 0, capacity: 0, weight: 4 },
  { kind: "broker", label: "Brokerage", orgKind: "broker", role: "supplier", minScale: 1, maxScale: 3, ataBreadth: 6, baseTat: 0, capacity: 40, weight: 3 },
  { kind: "conference", label: "Industry Forum", orgKind: "association", role: "supplier", minScale: 2, maxScale: 4, ataBreadth: 3, baseTat: 0, capacity: 0, weight: 1 },
];

const ORG_PREFIX = [
  "Meridian", "Northstar", "Kestrel", "Halcyon", "Cardinal", "Vantage", "Argent", "Beacon",
  "Corvus", "Delta Ridge", "Everline", "Fairmount", "Granite", "Harrier", "Ironwood", "Juniper",
  "Lattice", "Marlin", "Nimbus", "Orchid", "Pinnacle", "Quarry", "Redstone", "Sable",
  "Talon", "Umbra", "Verdant Bay", "Westgate", "Yarrow", "Zenith",
];
const ORG_SUFFIX = [
  "Aviation", "Aerospace", "Technic", "Components", "Aero Services", "Air Support",
  "Rotables", "Industries", "Partners", "Group", "Holdings", "Works",
];

/** Minimum separation between nodes in 0..100 map space. */
const MIN_SEPARATION = 0.9;
const PLACEMENT_TRIES = 12;

function pickArchetype(rng: Rng): FacilityArchetype {
  const total = FACILITY_ARCHETYPES.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.float(0, total);
  for (const entry of FACILITY_ARCHETYPES) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return FACILITY_ARCHETYPES[0]!;
}

/** ATA chapters a facility of this kind and scale can work or trade. */
function ataForKind(rng: Rng, archetype: FacilityArchetype, scale: number): number[] {
  const breadth = Math.max(1, Math.round(archetype.ataBreadth * (0.6 + scale / 10)));
  let pool: number[];
  switch (archetype.kind) {
    case "engine_shop":
      pool = chaptersInGroup("propulsion").map((chapter) => chapter.code);
      break;
    case "teardown":
      pool = [
        ...chaptersInGroup("structures").map((chapter) => chapter.code),
        32, 71, 72,
      ];
      break;
    case "lessor":
      pool = [32, 49, 71, 72, 73];
      break;
    default:
      pool = ATA_CHAPTERS.filter((chapter) => chapter.valueWeight >= 0.01).map(
        (chapter) => chapter.code,
      );
      break;
  }
  const chosen = new Set<number>();
  let guard = 0;
  while (chosen.size < Math.min(breadth, pool.length) && guard < breadth * 8) {
    chosen.add(rng.pick(pool));
    guard += 1;
  }
  return [...chosen].sort((a, b) => a - b);
}

export function generateMap(
  rng: Rng,
  opts: { facilityCount: number; hqRegion: RegionCode },
): { organizations: Organization[]; facilities: Facility[]; nodes: NetworkNode[] } {
  const organizations: Organization[] = [];
  const facilities: Facility[] = [];
  const nodes: NetworkNode[] = [];
  if (opts.facilityCount <= 0) return { organizations, facilities, nodes };

  const allocation = allocateFacilities(opts.facilityCount);
  // Spatial hash on a MIN_SEPARATION grid. Placing 800 facilities with a linear scan
  // is quadratic and dominates world creation; this keeps it linear.
  const cells = new Map<string, { x: number; y: number }[]>();
  const cellKey = (x: number, y: number) =>
    `${Math.floor(x / MIN_SEPARATION)}:${Math.floor(y / MIN_SEPARATION)}`;
  const tooClose = (x: number, y: number): boolean => {
    const cx = Math.floor(x / MIN_SEPARATION);
    const cy = Math.floor(y / MIN_SEPARATION);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = cells.get(`${cx + dx}:${cy + dy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (Math.hypot(other.x - x, other.y - y) < MIN_SEPARATION) return true;
        }
      }
    }
    return false;
  };
  const remember = (point: { x: number; y: number }) => {
    const key = cellKey(point.x, point.y);
    const bucket = cells.get(key);
    if (bucket) bucket.push(point);
    else cells.set(key, [point]);
  };
  let index = 0;

  for (const [code, count] of Object.entries(allocation) as [RegionCode, number][]) {
    const entry = region(code);
    const hops = distanceWeeks(opts.hqRegion, code);
    for (let i = 0; i < count; i++) {
      const archetype = pickArchetype(rng);
      const scale = rng.int(archetype.minScale, archetype.maxScale);

      // Deterministic placement with a bounded retry, then a deterministic nudge.
      let point = regionPoint(rng, code);
      for (let attempt = 0; attempt < PLACEMENT_TRIES && tooClose(point.x, point.y); attempt++) {
        point = regionPoint(rng, code);
      }
      let guard = 0;
      while (tooClose(point.x, point.y) && guard < 40) {
        point = {
          x: Math.min(entry.x + entry.width - 0.5, point.x + MIN_SEPARATION),
          y: Math.min(entry.y + entry.height - 0.5, point.y + MIN_SEPARATION * 0.6),
        };
        guard += 1;
      }
      remember(point);

      const id = `gen-${index}`;
      const organizationId = `org-${id}`;
      const facilityId = `fac-${id}`;
      const nodeId = `node-${id}`;
      const name = `${rng.pick(ORG_PREFIX)} ${rng.pick(ORG_SUFFIX)}`;
      const ata = ataForKind(rng, archetype, scale);

      organizations.push({
        id: organizationId,
        name,
        kind: archetype.orgKind,
        reputation: rng.int(35, 92),
        description: `${archetype.label} in ${entry.name}.`,
      });
      facilities.push({
        id: facilityId,
        organizationId,
        nodeId,
        name: `${name} ${archetype.label}`,
        kind: archetype.kind,
        capacity: Math.max(0, Math.round(archetype.capacity * (0.6 + scale / 5))),
        baseTatTicks: Math.max(0, Math.round(archetype.baseTat * (1.3 - scale / 8))),
        logisticsTatTicks: hops,
        regionCode: code,
        ataCapabilities: ata,
        scale,
      });

      // Bigger, further, better-regarded counterparties are harder to reach.
      const reputationRequired = Math.min(95, 30 + scale * 8 + hops * 5 + rng.int(0, 10));
      const relationshipRequired = Math.min(90, 18 + scale * 6 + hops * 4);

      nodes.push({
        id: nodeId,
        organizationId,
        facilityIds: [facilityId],
        label: name,
        role: archetype.role,
        x: Number(point.x.toFixed(2)),
        y: Number(point.y.toFixed(2)),
        state: "locked",
        reputationRequired,
        relationshipRequired,
        logisticsTatTicks: hops,
        hiddenDetail: `${archetype.label} capability and available stock`,
        regionCode: code,
        reach: "tam",
        ataFocus: ata,
        scale,
        slots: Math.min(5, Math.max(2, Math.round(scale * 0.9) + 1)),
      });
      index += 1;
    }
  }

  // Open a small window near home: the player starts with something to work with,
  // but the overwhelming majority of the world stays fogged.
  const homeNodes = nodes.filter((node) => node.regionCode === opts.hqRegion);
  const nearNodes = nodes
    .filter((node) => node.regionCode !== opts.hqRegion)
    .sort(
      (a, b) => distanceWeeks(opts.hqRegion, a.regionCode) - distanceWeeks(opts.hqRegion, b.regionCode),
    );
  const samTarget = Math.round(nodes.length * 0.11);
  const somTarget = Math.max(1, Math.round(nodes.length * 0.02));
  const candidates = [...homeNodes, ...nearNodes];
  for (const [position, node] of candidates.entries()) {
    if (position < somTarget) {
      node.reach = "som";
      node.state = "partner";
    } else if (position < samTarget) {
      node.reach = "sam";
      node.state = position % 2 === 0 ? "lead" : "known";
    }
  }

  return { organizations, facilities, nodes };
}

export type ReachContext = {
  reputation: number;
  relationship: number;
  regionUnlocked: boolean;
  knowledgeIntel: number;
};

/** Fog rules. Reach never goes backwards. */
export function promoteReach(node: NetworkNode, ctx: ReachContext): MarketReach {
  let reach = node.reach;
  if (reach === "tam") {
    // Intel widens what the player can see even without the reputation for it.
    const effectiveReputation = ctx.reputation + ctx.knowledgeIntel * 20;
    if (ctx.regionUnlocked || effectiveReputation >= node.reputationRequired) reach = "sam";
  }
  if (reach === "sam" && ctx.relationship >= node.relationshipRequired) reach = "som";
  return reach;
}

export function reachToNodeState(reach: MarketReach): NodeState {
  if (reach === "som") return "partner";
  if (reach === "sam") return "known";
  return "locked";
}

export function nodeStateToReach(state: NodeState): MarketReach {
  if (state === "partner") return "som";
  if (state === "locked") return "tam";
  return "sam";
}

export function mapFunnel(nodes: NetworkNode[]): { tam: number; sam: number; som: number } {
  const funnel = { tam: 0, sam: 0, som: 0 };
  for (const node of nodes) funnel[node.reach] += 1;
  return funnel;
}

export function ataCoverage(
  nodes: NetworkNode[],
): { code: number; title: string; nodes: number }[] {
  const rollup = new Map<number, number>();
  for (const node of nodes) {
    for (const code of node.ataFocus) rollup.set(code, (rollup.get(code) ?? 0) + 1);
  }
  return [...rollup.entries()]
    .map(([code, count]) => ({
      code,
      title: ATA_CHAPTERS.find((chapter) => chapter.code === code)?.title ?? `ATA ${code}`,
      nodes: count,
    }))
    .sort((a, b) => b.nodes - a.nodes || a.code - b.code);
}

const REACH_RANK: Record<MarketReach, number> = { som: 0, sam: 1, tam: 2 };

/** Cull to what is on screen and cap the count, so a 600-node map still pans smoothly. */
export function nodesInViewport(
  nodes: NetworkNode[],
  viewport: { x: number; y: number; w: number; h: number },
  maxNodes: number,
): NetworkNode[] {
  const visible = nodes.filter(
    (node) =>
      node.x >= viewport.x &&
      node.x <= viewport.x + viewport.w &&
      node.y >= viewport.y &&
      node.y <= viewport.y + viewport.h,
  );
  if (visible.length <= maxNodes) return visible;
  return [...visible]
    .sort(
      (a, b) =>
        REACH_RANK[a.reach] - REACH_RANK[b.reach] || b.scale - a.scale || a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, maxNodes));
}
