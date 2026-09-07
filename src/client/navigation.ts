/**
 * Client camera / location stack. Not part of the sim kernel.
 * See docs/ARCHITECTURE.md — P0 view contract.
 */
import type { Facility, NetworkNode } from "../sim/types.ts";

export type DeskWindow =
  | "market"
  | "sales"
  | "strategy"
  | "assets"
  | "pbh"
  | "kpis";

export type Navigation =
  | { layer: "world" }
  | { layer: "region"; regionId: string }
  | { layer: "place"; regionId: string; nodeId: string; window?: DeskWindow };

export const WORLD_NAV: Navigation = { layer: "world" };

export const HQ_NODE_ID = "node-hq";

export type RegionDefinition = {
  id: string;
  label: string;
  code: string;
  blurb: string;
  /** Closed polygon in the 0–100 map space used by NetworkNode x/y. Visual only. */
  hull: readonly (readonly [number, number])[];
  /** Nodes that always belong here regardless of x. */
  homeNodeIds: readonly string[];
};

export const REGION_HULLS: readonly RegionDefinition[] = [
  {
    id: "kanto",
    label: "Kanto",
    code: "KANTO / HOME",
    blurb: "Tokyo HQ and the home aftermarket desk. Facilities here are the first places you can enter.",
    hull: [
      [28, 42],
      [72, 42],
      [78, 86],
      [26, 86],
    ],
    homeNodeIds: ["node-hq", "node-mro-cheap", "node-mro-mid"],
  },
  {
    id: "pacific",
    label: "Pacific",
    code: "PAC / WEST",
    blurb: "Factory allocation and western operators. Survey the region to find interactable facilities.",
    hull: [
      [2, 8],
      [42, 8],
      [42, 40],
      [30, 68],
      [2, 92],
    ],
    homeNodeIds: ["node-factory"],
  },
  {
    id: "atlantic",
    label: "Atlantic",
    code: "ATL / EAST",
    blurb: "Fast-response shops and transocean customers. Locked facilities stay fogged until the relationship ladder opens them.",
    hull: [
      [72, 8],
      [98, 8],
      [98, 92],
      [68, 92],
      [68, 40],
    ],
    homeNodeIds: ["node-mro-fast"],
  },
];

export const DESK_WINDOWS: readonly { id: DeskWindow; label: string }[] = [
  { id: "market", label: "Marketplace" },
  { id: "sales", label: "Sales Office" },
  { id: "strategy", label: "Buying Strategy" },
  { id: "assets", label: "Asset Control" },
  { id: "kpis", label: "KPI Index" },
  { id: "pbh", label: "PBH" },
];

export function regionById(regionId: string): RegionDefinition {
  return REGION_HULLS.find((region) => region.id === regionId) ?? REGION_HULLS[0]!;
}

export function regionIdForNode(node: Pick<NetworkNode, "id" | "x">): string {
  for (const region of REGION_HULLS) {
    if (region.homeNodeIds.includes(node.id)) return region.id;
  }
  return node.x < 45 ? "pacific" : "atlantic";
}

export function nodesInRegion(nodes: readonly NetworkNode[], regionId: string): NetworkNode[] {
  return nodes.filter((node) => regionIdForNode(node) === regionId);
}

export function enterRegion(regionId: string): Navigation {
  return { layer: "region", regionId };
}

export function enterPlace(regionId: string, nodeId: string): Navigation {
  return { layer: "place", regionId, nodeId };
}

export function openWindowOnPlace(
  regionId: string,
  nodeId: string,
  window: DeskWindow,
): Navigation {
  return { layer: "place", regionId, nodeId, window };
}

/** Open a desk window on the current place, or on HQ if the player is not in a place. */
export function openWindow(nav: Navigation, window: DeskWindow): Navigation {
  if (nav.layer === "place") return { ...nav, window };
  if (nav.layer === "region") {
    const hqHere = regionIdForNode({ id: HQ_NODE_ID, x: 50 }) === nav.regionId;
    return openWindowOnPlace(hqHere ? nav.regionId : regionIdForNode({ id: HQ_NODE_ID, x: 50 }), HQ_NODE_ID, window);
  }
  return openWindowOnPlace(regionIdForNode({ id: HQ_NODE_ID, x: 50 }), HQ_NODE_ID, window);
}

export function popNavigation(nav: Navigation): Navigation {
  if (nav.layer === "place" && nav.window) {
    return { layer: "place", regionId: nav.regionId, nodeId: nav.nodeId };
  }
  if (nav.layer === "place") return { layer: "region", regionId: nav.regionId };
  if (nav.layer === "region") return WORLD_NAV;
  return WORLD_NAV;
}

export function canGoBack(nav: Navigation): boolean {
  return nav.layer !== "world";
}

export function windowLabel(window: DeskWindow): string {
  return DESK_WINDOWS.find((desk) => desk.id === window)?.label ?? window;
}

export function facilityForNode(
  facilities: readonly Facility[],
  node: NetworkNode,
): Facility | undefined {
  return facilities.find((facility) => facility.nodeId === node.id || node.facilityIds.includes(facility.id));
}

export type NavCrumb = { label: string; target: Navigation; current: boolean };

export function navigationCrumbs(
  nav: Navigation,
  placeLabel: string,
): NavCrumb[] {
  const crumbs: NavCrumb[] = [
    { label: "World", target: WORLD_NAV, current: nav.layer === "world" },
  ];
  if (nav.layer === "world") return crumbs;
  crumbs.push({
    label: regionById(nav.regionId).label,
    target: enterRegion(nav.regionId),
    current: nav.layer === "region",
  });
  if (nav.layer !== "place") return crumbs;
  crumbs.push({
    label: placeLabel,
    target: enterPlace(nav.regionId, nav.nodeId),
    current: nav.window === undefined,
  });
  if (nav.window) {
    crumbs.push({
      label: windowLabel(nav.window),
      target: nav,
      current: true,
    });
  }
  return crumbs;
}
