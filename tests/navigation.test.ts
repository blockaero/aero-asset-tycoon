import { describe, expect, it } from "vitest";
import {
  HQ_NODE_ID,
  REGION_HULLS,
  WORLD_NAV,
  canGoBack,
  enterPlace,
  enterRegion,
  navigationCrumbs,
  nodesInRegion,
  openWindow,
  openWindowOnPlace,
  popNavigation,
  regionIdForNode,
} from "../src/client/navigation.ts";
import type { NetworkNode } from "../src/sim/types.ts";

function node(partial: Partial<NetworkNode> & Pick<NetworkNode, "id" | "x">): NetworkNode {
  return {
    organizationId: "org",
    facilityIds: [],
    label: partial.id,
    role: "customer",
    y: 50,
    state: "known",
    reputationRequired: 0,
    relationshipRequired: 0,
    logisticsTatTicks: 1,
    hiddenDetail: "",
    ...partial,
  };
}

describe("client navigation stack", () => {
  it("assigns HQ and Kanto shops to the home hull", () => {
    expect(regionIdForNode({ id: HQ_NODE_ID, x: 50 })).toBe("kanto");
    expect(regionIdForNode({ id: "node-mro-cheap", x: 34 })).toBe("kanto");
    expect(regionIdForNode({ id: "node-mro-mid", x: 64 })).toBe("kanto");
    expect(regionIdForNode({ id: "node-factory", x: 23 })).toBe("pacific");
    expect(regionIdForNode({ id: "node-mro-fast", x: 84 })).toBe("atlantic");
    expect(regionIdForNode({ id: "node-airline-0", x: 17 })).toBe("pacific");
    expect(regionIdForNode({ id: "node-airline-2", x: 84 })).toBe("atlantic");
  });

  it("keeps three hard-coded region hulls", () => {
    expect(REGION_HULLS.map((region) => region.id)).toEqual(["kanto", "pacific", "atlantic"]);
    for (const region of REGION_HULLS) {
      expect(region.hull.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("groups nodes without putting zoom state in the kernel", () => {
    const nodes = [
      node({ id: HQ_NODE_ID, x: 50, role: "hq" }),
      node({ id: "node-factory", x: 23, role: "supplier" }),
      node({ id: "node-airline-2", x: 84 }),
    ];
    expect(nodesInRegion(nodes, "kanto").map((item) => item.id)).toEqual([HQ_NODE_ID]);
    expect(nodesInRegion(nodes, "pacific").map((item) => item.id)).toEqual(["node-factory"]);
    expect(nodesInRegion(nodes, "atlantic").map((item) => item.id)).toEqual(["node-airline-2"]);
  });

  it("pops window → place → region → world", () => {
    const market = openWindowOnPlace("kanto", HQ_NODE_ID, "market");
    expect(market).toEqual({
      layer: "place",
      regionId: "kanto",
      nodeId: HQ_NODE_ID,
      window: "market",
    });
    const place = popNavigation(market);
    expect(place).toEqual({ layer: "place", regionId: "kanto", nodeId: HQ_NODE_ID });
    const region = popNavigation(place);
    expect(region).toEqual({ layer: "region", regionId: "kanto" });
    const world = popNavigation(region);
    expect(world).toEqual(WORLD_NAV);
    expect(popNavigation(world)).toEqual(WORLD_NAV);
    expect(canGoBack(market)).toBe(true);
    expect(canGoBack(WORLD_NAV)).toBe(false);
  });

  it("opens a desk as a window on the current place, not a peer teleport", () => {
    const place = enterPlace("atlantic", "node-mro-fast");
    expect(openWindow(place, "market")).toEqual({
      layer: "place",
      regionId: "atlantic",
      nodeId: "node-mro-fast",
      window: "market",
    });
    expect(openWindow(enterRegion("pacific"), "sales")).toEqual({
      layer: "place",
      regionId: "kanto",
      nodeId: HQ_NODE_ID,
      window: "sales",
    });
    const fromWorld = openWindow(WORLD_NAV, "market");
    expect(fromWorld).toEqual({
      layer: "place",
      regionId: "kanto",
      nodeId: HQ_NODE_ID,
      window: "market",
    });
  });

  it("builds a world → region → place → window crumb trail", () => {
    const crumbs = navigationCrumbs(
      openWindowOnPlace("kanto", HQ_NODE_ID, "market"),
      "Tokyo HQ",
    );
    expect(crumbs.map((crumb) => crumb.label)).toEqual([
      "World",
      "Kanto",
      "Tokyo HQ",
      "Marketplace",
    ]);
    expect(crumbs[0]?.target).toEqual(WORLD_NAV);
    expect(crumbs[1]?.target).toEqual(enterRegion("kanto"));
    expect(crumbs[2]?.current).toBe(false);
    expect(crumbs[3]?.current).toBe(true);
  });
});
