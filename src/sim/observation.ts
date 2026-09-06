import { projectNetworkNode } from "./network.ts";
import type {
  AccPulse,
  Airline,
  CompanyState,
  GameCalendar,
  MarketReach,
  MarketShock,
  Region,
  RegionCode,
  Deal,
  EventLog,
  Facility,
  Firm,
  GameState,
  MarketListing,
  NetworkAgreement,
  NetworkNode,
  NetworkOpportunity,
  PartMaster,
  PbhContract,
  Rfq,
  Series,
  Shop,
  ShopJob,
  Transfer,
  Unit,
} from "./types.ts";
import { navOf } from "./util.ts";

export type GameObservation = {
  engineVersion: string;
  seed: number;
  tick: number;
  phase: GameState["phase"];
  firm: Firm & { nav: number; fillRate: number; inventoryAtMark: number };
  pulses: AccPulse[];
  series: Series[];
  parts: PartMaster[];
  mrp: Record<string, number>;
  organizations: { id: string; name: string; kind: string; reputation: number; description: string }[];
  facilities: Facility[];
  nodes: NetworkNode[];
  relationships: GameState["world"]["relationships"];
  opportunities: NetworkOpportunity[];
  agreements: NetworkAgreement[];
  listings: MarketListing[];
  rfqs: Rfq[];
  deals: Deal[];
  inventory: Unit[];
  jobs: ShopJob[];
  transfers: Transfer[];
  shops: Shop[];
  airlines: Airline[];
  pbhContracts: PbhContract[];
  events: EventLog[];
  economy: { traffic: number; shockUntil: number; shockDepth: number };
  pendingCommands: GameState["pendingCommands"];
  /* ---- v2 ---- */
  calendar: GameCalendar;
  regions: Region[];
  company: CompanyState;
  /** Fog-of-war funnel across the whole map, including nodes the player cannot see. */
  funnel: { tam: number; sam: number; som: number };
  /** What the global statistical market looks like from here. Detail is gated by intel. */
  market: {
    priceIndex: number;
    demandIndex: number;
    /** Serialized assets the engine tracks. */
    trackedAssets: number;
    /** The narrative global figure the tracked count stands in for. */
    worldAssets: number;
    growthRate: number;
    retireRate: number;
    history: { tick: number; count: number; priceIndex: number; demandIndex: number }[];
    /** Only shocks the player has the intel to see. */
    knownShocks: MarketShock[];
    byRegion: { code: RegionCode; name: string; count: number }[];
  };
  /** ATA chapter rollup over the player's own inventory. Drives the fleet chips. */
  ataInventory: { code: number; count: number; value: number }[];
  /** ATA chapter rollup over visible opportunities. Drives the map filter bar. */
  ataOpportunities: { code: number; count: number }[];
  /** Per-node reach, so the client never has to infer fog from node state. */
  reachByNode: Record<string, MarketReach>;
};

export function projectObservation(state: GameState, firmId = "firm-0"): GameObservation {
  const world = state.world;
  const firm = world.firms.find((candidate) => candidate.id === firmId);
  if (!firm) throw new Error(`Unknown firm ${firmId}`);
  const nav = navOf(world, firm.id);
  const nodes = world.networkNodes.map((node) => projectNetworkNode(world, node));
  const accessibleNodeIds = new Set(
    world.networkNodes.filter((node) => node.state !== "locked").map((node) => node.id),
  );
  const accessibleOrganizationIds = new Set(
    world.networkNodes
      .filter((node) => node.state !== "locked")
      .map((node) => node.organizationId)
      .concat(firm.organizationId),
  );
  const ownAssetIds = new Set(
    world.units.filter((unit) => unit.ownerFirmId === firm.id).map((unit) => unit.id),
  );
  return {
    engineVersion: state.engineVersion,
    seed: world.seed,
    tick: world.tick,
    phase: state.phase,
    firm: {
      ...structuredClone(firm),
      nav,
      fillRate: firm.rfqsSeen ? firm.rfqsFilled / firm.rfqsSeen : 0,
      inventoryAtMark: nav - firm.accBalance + firm.debt,
    },
    pulses: structuredClone(world.pulses),
    series: structuredClone(world.series),
    parts: structuredClone(world.parts),
    mrp: structuredClone(world.mrp),
    organizations: structuredClone(
      world.organizations
        .filter((organization) => accessibleOrganizationIds.has(organization.id))
        .map(({ id, name, kind, reputation, description }) => ({
          id,
          name,
          kind,
          reputation,
          description,
        })),
    ),
    facilities: structuredClone(
      world.facilities.filter((facility) => accessibleOrganizationIds.has(facility.organizationId)),
    ),
    nodes: structuredClone(nodes),
    relationships: structuredClone(
      world.relationships.filter((relationship) => accessibleOrganizationIds.has(relationship.organizationId)),
    ),
    opportunities: structuredClone(
      world.opportunities.filter(
        (opportunity) =>
          accessibleNodeIds.has(opportunity.nodeId) &&
          opportunity.expiresTick >= world.tick &&
          !opportunity.accepted &&
          (
            opportunity.kind !== "listing" ||
            world.listings.some(
              (listing) =>
                listing.id === opportunity.referenceId &&
                listing.status === "open" &&
                listing.expiresTick >= world.tick,
            )
          ),
      ),
    ),
    agreements: structuredClone(
      world.agreements.filter((agreement) => agreement.active && accessibleNodeIds.has(agreement.nodeId)),
    ),
    listings: structuredClone(
      world.listings.filter(
        (listing) =>
          listing.status === "open" &&
          listing.expiresTick >= world.tick &&
          accessibleNodeIds.has(listing.nodeId),
      ),
    ),
    rfqs: structuredClone(
      world.rfqs.filter(
        (rfq) =>
          accessibleOrganizationIds.has(rfq.buyerOrganizationId) &&
          rfq.pbhContractId === null &&
          rfq.expireTick >= world.tick &&
          rfq.filled < rfq.qty,
      ),
    ),
    deals: structuredClone(world.deals.filter((deal) => deal.sellerFirmId === firm.id)),
    inventory: structuredClone(world.units.filter((unit) => unit.ownerFirmId === firm.id)),
    jobs: structuredClone(world.jobs.filter((job) => job.firmId === firm.id)),
    transfers: structuredClone(
      world.transfers.filter((transfer) => {
        if (transfer.assetIds.some((assetId) => ownAssetIds.has(assetId))) return true;
        if (transfer.purpose === "sale" && transfer.relatedId !== null) {
          return world.deals.some(
            (deal) => deal.id === transfer.relatedId && deal.sellerFirmId === firm.id,
          );
        }
        if (transfer.purpose === "sale" && transfer.fromFacilityId === firm.warehouseFacilityId) {
          return true;
        }
        return false;
      }),
    ),
    shops: structuredClone(
      world.shops.filter((shop) => accessibleOrganizationIds.has(shop.organizationId)),
    ),
    airlines: structuredClone(
      world.airlines.filter((airline) => accessibleOrganizationIds.has(airline.organizationId)),
    ),
    pbhContracts: structuredClone(
      world.pbhContracts.filter((contract) => contract.firmId === firm.id),
    ),
    events: structuredClone(
      world.events
        .filter((event) => {
          if (event.tick < Math.max(0, world.tick - 6)) return false;
          const airlineId = typeof event.payload.airlineId === "string" ? event.payload.airlineId : null;
          if (!airlineId) return true;
          const airline = world.airlines.find((candidate) => candidate.id === airlineId);
          return !airline || accessibleOrganizationIds.has(airline.organizationId);
        })
        .slice(-80),
    ),
    economy: {
      traffic: world.economy.traffic,
      shockUntil: world.economy.shockUntil,
      shockDepth: world.economy.shockDepth,
    },
    pendingCommands: structuredClone(
      state.pendingCommands.filter((envelope) => envelope.firmId === firm.id),
    ),
    calendar: structuredClone(world.calendar),
    regions: structuredClone(world.regions),
    company: structuredClone(world.company),
    funnel: funnelOf(world),
    market: marketView(world),
    ataInventory: ataInventoryOf(world, firm.id),
    ataOpportunities: ataOpportunitiesOf(world),
    reachByNode: Object.fromEntries(world.networkNodes.map((node) => [node.id, node.reach])),
  };
}

function funnelOf(world: GameState["world"]): { tam: number; sam: number; som: number } {
  const funnel = { tam: 0, sam: 0, som: 0 };
  for (const node of world.networkNodes) funnel[node.reach] += 1;
  return funnel;
}

/**
 * The intelligence monitor's view. Shock detail is withheld until the player has
 * earned the intel to see it, so the fog covers the economy as well as the map.
 */
function marketView(world: GameState["world"]): GameObservation["market"] {
  const market = world.globalMarket;
  const tracked = market.cohorts.reduce((sum, cohort) => sum + cohort.count, 0);
  const byRegionCounts = new Map<RegionCode, number>();
  for (const cohort of market.cohorts) {
    byRegionCounts.set(cohort.regionCode, (byRegionCounts.get(cohort.regionCode) ?? 0) + cohort.count);
  }
  return {
    priceIndex: market.priceIndex,
    demandIndex: market.demandIndex,
    trackedAssets: tracked,
    worldAssets: Math.round(tracked * WORLD_SCALE),
    growthRate: market.growthRate,
    retireRate: market.retireRate,
    history: structuredClone(market.history),
    knownShocks: structuredClone(market.shocks.filter((shock) => shock.known)),
    byRegion: [...byRegionCounts.entries()]
      .map(([code, count]) => ({
        code,
        name: world.regions.find((candidate) => candidate.code === code)?.name ?? code,
        count,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * The engine tracks a scaled slice of the world fleet. This is the multiplier that
 * turns a tracked count back into the narrative global figure the UI quotes.
 */
const WORLD_SCALE = 2_500;

function ataInventoryOf(
  world: GameState["world"],
  firmId: string,
): { code: number; count: number; value: number }[] {
  const rollup = new Map<number, { count: number; value: number }>();
  for (const unit of world.units) {
    if (unit.ownerFirmId !== firmId) continue;
    const part = world.parts.find((candidate) => candidate.id === unit.partId);
    if (!part) continue;
    const entry = rollup.get(part.ata) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += world.mrp[part.id] ?? part.listPrice;
    rollup.set(part.ata, entry);
  }
  return [...rollup.entries()]
    .map(([code, entry]) => ({ code, count: entry.count, value: Math.round(entry.value) }))
    .sort((a, b) => b.value - a.value);
}

function ataOpportunitiesOf(world: GameState["world"]): { code: number; count: number }[] {
  const rollup = new Map<number, number>();
  for (const opportunity of world.opportunities) {
    if (opportunity.accepted || opportunity.expiresTick < world.tick) continue;
    for (const code of opportunity.ataFocus) {
      rollup.set(code, (rollup.get(code) ?? 0) + 1);
    }
  }
  return [...rollup.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
}
