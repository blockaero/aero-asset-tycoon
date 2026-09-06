import { projectNetworkNode } from "./network.ts";
import type {
  AccPulse,
  Airline,
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
  };
}
