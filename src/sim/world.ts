import { STARTING_CAPITAL } from "./balance.ts";
import { ENGINE_ON, SERIES, buildCatalog } from "./catalog.ts";
import { coherentCounters } from "./counters.ts";
import { allowedListingConditions } from "./condition-rules.ts";
import { Rng } from "./rng.ts";
import type {
  Airline,
  CampaignConfig,
  Facility,
  FacilityKind,
  RegionCode,
  Firm,
  FleetGroup,
  InstalledCohort,
  MarketListing,
  NetworkNode,
  NetworkOpportunity,
  Organization,
  Shop,
  StandingPolicy,
  Unit,
  World,
} from "./types.ts";
import { anchorPrice, completeOpportunity, nextId } from "./util.ts";
import { calendarFor } from "./calendar.ts";
import { REGIONS } from "./geography.ts";
import { generateMap, nodeStateToReach } from "./bigmap.ts";
import { createGlobalMarket } from "./cohort-market.ts";
import { defaultIdentity, sanitizeIdentity } from "./identity.ts";
import { createBudget } from "./budgets.ts";

const AIRLINE_NAMES = [
  "Sakura Pacific",
  "Northline Air",
  "Meridian Jet",
  "Coastal Wings",
  "Summit Regional",
  "MetroLink",
  "Redwood Air",
  "Harbor Wings",
  "Granite Air",
  "Sun Corridor",
  "Blue Ridge",
  "Atlas Shuttle",
];

const AIRLINE_NODE_POSITIONS = [
  [17, 18],
  [16, 52],
  [84, 82],
  [83, 17],
  [8, 35],
  [93, 58],
  [62, 14],
  [41, 18],
  [8, 78],
  [91, 32],
  [67, 88],
  [35, 88],
] as const;

export const DEFAULT_POLICY: StandingPolicy = {
  cashFloor: 1_500_000,
  autoAcceptMargin: 0.22,
  replenishPriceCeil: 0.95,
  targetStockRotable: 2,
  targetStockExpendable: 8,
  autoRepairCeil: 0.55,
  aogAggressiveness: 0.55,
  exchangeBias: 0.55,
};

export function rivalPolicy(index: number): StandingPolicy {
  const variants: StandingPolicy[] = [
    { ...DEFAULT_POLICY, autoAcceptMargin: 0.12, aogAggressiveness: 0.8, targetStockRotable: 4 },
    { ...DEFAULT_POLICY, autoAcceptMargin: 0.3, cashFloor: 2_500_000, exchangeBias: 0.3 },
    { ...DEFAULT_POLICY, replenishPriceCeil: 0.78, targetStockExpendable: 14, autoRepairCeil: 0.42 },
    { ...DEFAULT_POLICY, autoRepairCeil: 0.3, aogAggressiveness: 0.2, targetStockRotable: 2 },
  ];
  return variants[index % variants.length]!;
}

/** The founder's home region. Tokyo HQ sits in Northeast Asia. */
const HQ_REGION: RegionCode = "NEASIA";

/**
 * ATA chapters a hand-authored core facility works in. The generated world map
 * derives its own from the facility archetypes in bigmap.ts; this only covers the
 * small set of nodes the opening scenario ships with.
 */
function coreAtaFor(kind: FacilityKind): number[] {
  switch (kind) {
    case "factory":
      return [21, 24, 27, 29, 32, 34, 49, 72, 73, 79, 80];
    case "repair_shop":
      return [21, 24, 27, 29, 32, 36, 49, 80];
    case "engine_shop":
      return [71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 83];
    case "component_shop":
      return [24, 29, 32];
    case "hangar":
      return [21, 24, 25, 27, 29, 32, 33, 34, 49];
    case "teardown":
      return [32, 52, 53, 54, 57, 71, 72];
    default:
      return [21, 24, 27, 29, 32, 34, 72, 73];
  }
}

type CoreFacility = Omit<Facility, "regionCode" | "ataCapabilities" | "scale"> &
  Partial<Pick<Facility, "regionCode" | "ataCapabilities" | "scale">>;
type CoreNode = Omit<NetworkNode, "regionCode" | "reach" | "ataFocus" | "scale" | "slots"> &
  Partial<Pick<NetworkNode, "regionCode" | "reach" | "ataFocus" | "scale" | "slots">>;

export function createWorld(config: CampaignConfig): World {
  const rng = new Rng(config.seed);
  const parts = buildCatalog(rng, config.partCount);
  const organizations: Organization[] = [];
  // The hand-authored core world is written with short literals; the v2 geography,
  // ATA capability and fog-of-war fields are filled in by normalizeCore below.
  const facilities: CoreFacility[] = [];
  const networkNodes: CoreNode[] = [];

  organizations.push({
    id: "org-player",
    name: "Aero Asset Partners",
    kind: "asset_manager",
    reputation: 45,
    description: "Founder-led aviation asset and component trading company.",
  });
  facilities.push({
    id: "fac-player-warehouse",
    organizationId: "org-player",
    nodeId: "node-hq",
    name: "Haneda Asset Warehouse",
    kind: "warehouse",
    capacity: 250,
    baseTatTicks: 0,
    logisticsTatTicks: 1,
  });
  networkNodes.push({
    id: "node-hq",
    organizationId: "org-player",
    facilityIds: ["fac-player-warehouse"],
    label: "Tokyo HQ",
    role: "hq",
    x: 50,
    y: 53,
    state: "partner",
    reputationRequired: 0,
    relationshipRequired: 0,
    logisticsTatTicks: 0,
    hiddenDetail: "",
  });

  organizations.push({
    id: "org-maker",
    name: "AeroWorks Manufacturing",
    kind: "manufacturer",
    reputation: 82,
    description: "Factory-new and surplus component supply.",
  });
  facilities.push({
    id: "fac-factory",
    organizationId: "org-maker",
    nodeId: "node-factory",
    name: "AeroWorks Factory",
    kind: "factory",
    capacity: 500,
    baseTatTicks: 8,
    logisticsTatTicks: 2,
  });
  networkNodes.push({
    id: "node-factory",
    organizationId: "org-maker",
    facilityIds: ["fac-factory"],
    label: "AeroWorks Factory",
    role: "supplier",
    x: 23,
    y: 25,
    state: "known",
    reputationRequired: 0,
    relationshipRequired: 0,
    logisticsTatTicks: 2,
    hiddenDetail: "Factory allocation and new-surplus packages",
  });

  const shopSpecs = [
    { id: "cheap", name: "Kanto Component Services", costMult: 0.78, turnMult: 1.35, failP: 0.07, state: "lead" as const, x: 34, y: 72, rep: 48 },
    { id: "mid", name: "Shinsei Aero MRO", costMult: 1, turnMult: 1, failP: 0.03, state: "known" as const, x: 64, y: 71, rep: 0 },
    { id: "fast", name: "Apex Component Response", costMult: 1.65, turnMult: 0.58, failP: 0.01, state: "locked" as const, x: 84, y: 48, rep: 62 },
  ];
  const shops: Shop[] = [];
  for (const spec of shopSpecs) {
    const organizationId = `org-mro-${spec.id}`;
    const facilityId = `fac-repair-${spec.id}`;
    const nodeId = `node-mro-${spec.id}`;
    organizations.push({
      id: organizationId,
      name: spec.name,
      kind: "mro",
      reputation: 65,
      description: "Independent component maintenance, repair and overhaul provider.",
    });
    facilities.push({
      id: facilityId,
      organizationId,
      nodeId,
      name: `${spec.name} Repair Shop`,
      kind: "repair_shop",
      capacity: spec.id === "fast" ? 5 : 8,
      baseTatTicks: spec.id === "fast" ? 3 : spec.id === "cheap" ? 7 : 5,
      logisticsTatTicks: spec.id === "fast" ? 2 : 1,
    });
    networkNodes.push({
      id: nodeId,
      organizationId,
      facilityIds: [facilityId],
      label: spec.id === "fast" ? "Apex MRO" : spec.id === "cheap" ? "Kanto MRO" : "Shinsei Aero MRO",
      role: "mro",
      x: spec.x,
      y: spec.y,
      state: spec.state,
      reputationRequired: spec.rep,
      relationshipRequired: 0,
      logisticsTatTicks: spec.id === "fast" ? 2 : 1,
      hiddenDetail: "Repair capacity and preferred TAT",
    });
    shops.push({
      id: `shop-${spec.id}`,
      organizationId,
      facilityId,
      name: spec.name,
      costMult: spec.costMult,
      turnMult: spec.turnMult,
      failP: spec.failP,
    });
  }

  const airlines: Airline[] = [];
  const airframes = SERIES.filter((series) => series.kind === "airframe");
  for (let i = 0; i < config.airlineCount; i++) {
    const organizationId = `org-airline-${i}`;
    const facilityId = `fac-hangar-${i}`;
    const nodeId = `node-airline-${i}`;
    const aircraft = airframes[i % airframes.length]!;
    const engineId = ENGINE_ON[aircraft.id]!;
    const count = rng.int(12, 42);
    const fleetGroup: FleetGroup = {
      id: `fleet-${i}-0`,
      airlineId: `al-${i}`,
      aircraftSeriesId: aircraft.id,
      engineSeriesId: engineId,
      enginesPerAircraft: 2,
      count,
      fhPerWeek: aircraft.fhPerDay * 7,
      fcPerWeek: aircraft.fcPerDay * 7,
    };
    organizations.push({
      id: organizationId,
      name: AIRLINE_NAMES[i % AIRLINE_NAMES.length]!,
      kind: "airline",
      reputation: rng.int(45, 90),
      description: `${aircraft.name} operator and aftermarket customer.`,
    });
    facilities.push({
      id: facilityId,
      organizationId,
      nodeId,
      name: `${AIRLINE_NAMES[i % AIRLINE_NAMES.length]!} Hangar`,
      kind: "hangar",
      capacity: count * 4,
      baseTatTicks: 0,
      logisticsTatTicks: 1 + (i % 3),
    });
    const state = i === 0 ? "known" : i === 1 ? "lead" : "locked";
    networkNodes.push({
      id: nodeId,
      organizationId,
      facilityIds: [facilityId],
      label: AIRLINE_NAMES[i % AIRLINE_NAMES.length]!,
      role: "customer",
      x: AIRLINE_NODE_POSITIONS[i % AIRLINE_NODE_POSITIONS.length]![0],
      y: AIRLINE_NODE_POSITIONS[i % AIRLINE_NODE_POSITIONS.length]![1],
      state,
      reputationRequired: i === 0 ? 0 : 48 + i * 3,
      relationshipRequired: 0,
      logisticsTatTicks: 1 + (i % 3),
      hiddenDetail: `${aircraft.name} demand and surplus AR packages`,
    });
    const fleet: Record<string, number> = { [aircraft.id]: count, [engineId]: count };
    airlines.push({
      id: `al-${i}`,
      organizationId,
      facilityId,
      name: AIRLINE_NAMES[i % AIRLINE_NAMES.length]!,
      health: rng.int(45, 95),
      procurement: rng.pick(["oem_loyal", "cost_driven", "balanced"] as const),
      sophistication: rng.int(45, 95),
      fleet,
      fleetGroups: [fleetGroup],
      planningHorizon: 6 + Math.floor(rng.int(45, 95) / 10),
    });
  }

  const firms: Firm[] = [];
  for (let i = 0; i <= config.rivalCount; i++) {
    const player = i === 0;
    const organizationId = player ? "org-player" : `org-rival-${i}`;
    const facilityId = player ? "fac-player-warehouse" : `fac-rival-${i}`;
    if (!player) {
      organizations.push({
        id: organizationId,
        name: `Rival Asset House ${i}`,
        kind: "asset_manager",
        reputation: 50 + i * 4,
        description: "Competing asset manager and component stockist.",
      });
      facilities.push({
        id: facilityId,
        organizationId,
        nodeId: `node-rival-${i}`,
        name: `Rival Warehouse ${i}`,
        kind: "warehouse",
        capacity: 220,
        baseTatTicks: 0,
        logisticsTatTicks: 2,
      });
      networkNodes.push({
        id: `node-rival-${i}`,
        organizationId,
        facilityIds: [facilityId],
        label: `Rival Asset House ${i}`,
        role: "rival",
        x: [47, 70, 25, 77, 12][(i - 1) % 5]!,
        y: [90, 14, 91, 91, 65][(i - 1) % 5]!,
        state: i === 1 ? "lead" : "locked",
        reputationRequired: 52 + i * 4,
        relationshipRequired: 0,
        logisticsTatTicks: 2,
        hiddenDetail: "Secondary-market inventory",
      });
    }
    firms.push({
      id: `firm-${i}`,
      organizationId,
      warehouseFacilityId: facilityId,
      name: player ? "Aero Asset Partners" : `Rival Asset House ${i}`,
      accBalance: STARTING_CAPITAL,
      debt: 0,
      insolvent: false,
      globalReputation: player ? 45 : 52 + i,
      rfqsSeen: 0,
      rfqsFilled: 0,
      manualAcquisitions: 0,
      repairsCompleted: 0,
      startingCapital: STARTING_CAPITAL,
      navHistory: [STARTING_CAPITAL],
      buyingStrategy: {
        enabled: !player,
        maxAccPerUnit: 140_000,
        minPackageDiscount: 0.12,
        targetStock: player ? 2 : 3,
        accFloor: player ? 1_500_000 : 2_000_000,
        maxInventoryUnits: player ? 80 : 100,
        maxPackageUnits: 8,
        conditions: ["NE", "NS", "OH", "SV", "RP", "AR"],
        category: "any",
      },
      salesStrategy: {
        minMargin: player ? 0.18 : 0.14 + i * 0.03,
        reserveStock: player ? 0 : 1,
        minCondition: "SV",
        exchangeBias: player ? 0.45 : rivalPolicy(i).exchangeBias,
        allocation: "lowest_value_first",
      },
      autoRepairEnabled: !player,
    });
  }

  // Fill the v2 fields the core world's short literals leave out.
  const coreFacilities: Facility[] = facilities.map((facility) => ({
    ...facility,
    regionCode: facility.regionCode ?? HQ_REGION,
    ataCapabilities: facility.ataCapabilities ?? coreAtaFor(facility.kind),
    scale: facility.scale ?? (facility.kind === "factory" ? 5 : 3),
  }));
  const coreNodes: NetworkNode[] = networkNodes.map((node) => {
    const facility = coreFacilities.find((candidate) => candidate.nodeId === node.id);
    return {
      ...node,
      regionCode: node.regionCode ?? HQ_REGION,
      reach: node.reach ?? nodeStateToReach(node.state),
      ataFocus: node.ataFocus ?? facility?.ataCapabilities ?? [],
      scale: node.scale ?? facility?.scale ?? 3,
      slots: node.slots ?? 3,
    };
  });

  // The large fogged world sits around the hand-authored core. Almost all of it starts
  // in TAM: present in the statistics, invisible on the map.
  const generated = generateMap(rng, {
    facilityCount: Math.max(0, config.facilityCount ?? (config.ticks <= 24 ? 120 : 420)),
    hqRegion: HQ_REGION,
  });

  const identity = sanitizeIdentity(
    {
      companyName: config.companyName,
      founderName: config.founderName,
      portraitId: config.portraitId,
    },
    rng,
  );
  const playerOrganization = organizations.find((organization) => organization.id === "org-player");
  if (playerOrganization) playerOrganization.name = identity.companyName;

  const world: World = {
    seed: config.seed,
    scenario: config.scenario ?? (config.ticks <= 24 ? "prototype" : "full"),
    tick: 0,
    nextId: 1,
    region: "GLOBAL",
    series: SERIES.map((series) => ({ ...series })),
    parts,
    organizations: [...organizations, ...generated.organizations],
    facilities: [...coreFacilities, ...generated.facilities],
    networkNodes: [...coreNodes, ...generated.nodes],
    relationships: organizations
      .filter((organization) => organization.id !== "org-player")
      .map((organization) => ({
        organizationId: organization.id,
        score: organization.id === "org-maker" || organization.id === "org-mro-mid" || organization.id === "org-airline-0" ? 25 : 0,
        onTimeDeliveries: 0,
        missedDeliveries: 0,
      })),
    agreements: [],
    opportunities: [],
    listings: [],
    transfers: [],
    cohorts: [],
    pbhContracts: [],
    shops,
    airlines,
    firms,
    units: [],
    jobs: [],
    exchanges: [],
    deals: [],
    rfqs: [],
    quotes: [],
    economy: {
      traffic: 1,
      growth: rng.float(0.035, 0.055) / 52,
      cyclePhase: rng.float(0, Math.PI * 2),
      cyclePeriod: rng.int(180, 320),
      shockStart: 0,
      shockUntil: 0,
      shockDepth: 0,
    },
    reliability: { factor: {} },
    ads: [],
    mrp: {},
    events: [],
    pulses: [],
    removalHistory: {},
    calendar: calendarFor(0),
    regions: REGIONS.map((entry) => ({ ...entry, countries: [...entry.countries] })),
    globalMarket: createGlobalMarket(rng, {
      assetCount: config.worldAssetCount ?? (config.ticks <= 24 ? 12_000 : 40_000),
    }),
    company: {
      identity,
      budget: createBudget([]),
      relationshipCapital: 0,
      knowledge: [],
      team: [],
      candidates: [],
      visitedThisTick: [],
    },
  };

  initializeReliabilityAndCohorts(world, rng);
  if (world.scenario === "prototype") {
    if (world.airlines[0]) world.airlines[0].procurement = "cost_driven";
    const nearDue = world.cohorts.find((cohort) => {
      const part = world.parts.find((candidate) => candidate.id === cohort.partId);
      return part?.removalMode === "hardtime";
    });
    if (nearDue) {
      const airline = world.airlines.find((candidate) => candidate.id === nearDue.airlineId);
      const fleet = airline?.fleetGroups.find((candidate) => candidate.id === nearDue.fleetGroupId);
      if (fleet) {
        if (nearDue.remainingFh !== null) nearDue.remainingFh = fleet.fhPerWeek * 3;
        if (nearDue.remainingFc !== null) nearDue.remainingFc = fleet.fcPerWeek * 3;
      }
    }
  }
  seedStarterStock(world, rng);
  seedListingsAndOpportunities(world, rng);
  seedPbhOffer(world);
  return world;
}

function initializeReliabilityAndCohorts(world: World, rng: Rng): void {
  for (const part of world.parts) {
    world.mrp[part.id] = part.listPrice;
    world.removalHistory[part.id] = [];
    for (const seriesId of part.seriesIds) {
      world.reliability.factor[`${part.id}|${seriesId}`] = 1;
    }
  }
  for (const airline of world.airlines) {
    for (const fleet of airline.fleetGroups) {
      for (const part of world.parts) {
        const applies =
          part.seriesIds.includes(fleet.aircraftSeriesId) ||
          part.seriesIds.includes(fleet.engineSeriesId);
        if (!applies) continue;
        const lifeFh = part.lifeLimitFh;
        const lifeFc = part.lifeLimitFc;
        const cohort: InstalledCohort = {
          id: `cohort-${airline.id}-${fleet.id}-${part.id}`,
          airlineId: airline.id,
          fleetGroupId: fleet.id,
          partId: part.id,
          quantity:
            fleet.count *
            part.positions *
            (part.seriesIds.includes(fleet.engineSeriesId) ? fleet.enginesPerAircraft : 1),
          remainingFh: lifeFh ? Math.round(lifeFh * rng.float(0.12, 0.92)) : null,
          remainingFc: lifeFc ? Math.round(lifeFc * rng.float(0.12, 0.92)) : null,
          remainingOverhaulFh: part.mtboFh
            ? Math.round(part.mtboFh * rng.float(0.55, 1.45))
            : null,
          forecasted: false,
          overdue: false,
          replacementRfqId: null,
          dueQuantity: 0,
          deliveredQuantity: 0,
        };
        world.cohorts.push(cohort);
      }
    }
  }
}

function seedStarterStock(world: World, rng: Rng): void {
  const starters = world.parts
    .filter((part) => part.repairable && part.listPrice < 150_000)
    .slice(0, 9);
  for (const firm of world.firms) {
    for (const [partIndex, part] of starters.entries()) {
      const quantity = firm.id === "firm-0" ? (partIndex < 4 ? 2 : 1) : rng.int(1, 2);
      for (let i = 0; i < quantity; i++) {
        const condition = rng.chance(0.55) ? "OH" : "SV";
        world.units.push(createUnit(world, {
          partId: part.id,
          firmId: firm.id,
          organizationId: firm.organizationId,
          facilityId: firm.warehouseFacilityId,
          condition,
          acquisitionCost: Math.round(part.listPrice * (condition === "OH" ? 0.58 : 0.4)),
          rng,
        }));
      }
    }
    if (firm.id === "firm-0" && starters[0]) {
      world.units.push(createUnit(world, {
        partId: starters[0].id,
        firmId: firm.id,
        organizationId: firm.organizationId,
        facilityId: firm.warehouseFacilityId,
        condition: "AR",
        acquisitionCost: Math.round(starters[0].listPrice * 0.16),
        rng,
      }));
    }
  }
}

function createUnit(
  world: World,
  input: {
    partId: string;
    firmId: string | null;
    organizationId: string;
    facilityId: string | null;
    condition: Unit["condition"];
    acquisitionCost: number;
    rng: Rng;
    tsn?: number;
    csn?: number;
    tsr?: number;
    csr?: number;
    tso?: number;
    cso?: number;
  },
): Unit {
  const part = world.parts.find((candidate) => candidate.id === input.partId);
  const counters = coherentCounters(input.rng, part?.serialized ?? true, input.condition, input);
  return {
    id: nextId(world),
    partId: input.partId,
    ownerFirmId: input.firmId,
    ownerOrganizationId: input.organizationId,
    facilityId: input.facilityId,
    transferId: null,
    condition: input.condition,
    trace: "none",
    ...counters,
    acquiredTick: world.tick,
    acquisitionCost: input.acquisitionCost,
    listed: true,
    reservedForRfq: null,
  };
}

function seedListingsAndOpportunities(world: World, rng: Rng): void {
  const sourceNodes = ["node-factory", "node-airline-0", "node-mro-mid"];
  for (let i = 0; i < Math.min(8, world.parts.length); i++) {
    const part = world.parts[i]!;
    const nodeId = sourceNodes[i % sourceNodes.length]!;
    const node = world.networkNodes.find((candidate) => candidate.id === nodeId)!;
    const sellerFacilityId = node.facilityIds[0]!;
    const sellerOrganizationId = node.organizationId;
    const seller = world.organizations.find(
      (organization) => organization.id === sellerOrganizationId,
    );
    const conditions = allowedListingConditions(seller?.kind ?? "asset_manager", part);
    const condition = conditions[i % conditions.length]!;
    const listing: MarketListing = {
      id: nextId(world),
      nodeId,
      sellerOrganizationId,
      sellerFacilityId,
      kind: "single_asset",
      title: `${part.name} · ${condition}`,
      items: [{
        partId: part.id,
        condition,
        quantity: 1,
        tsn: rng.int(1_000, 12_000),
        csn: rng.int(500, 7_000),
        tsr: rng.int(100, 4_000),
        csr: rng.int(50, 2_500),
      }],
      totalPrice: Math.round(anchorPrice(part, condition) * rng.float(0.88, 1.02)),
      expiresTick: 6 + i,
      status: "open",
      exclusive: false,
    };
    world.listings.push(listing);
    world.opportunities.push(completeOpportunity({
      id: nextId(world),
      nodeId,
      kind: "listing",
      title: listing.title,
      description: `Single ${condition} asset available for ${listing.totalPrice.toLocaleString()} ACC.`,
      referenceId: listing.id,
      agreementKind: null,
      expiresTick: listing.expiresTick,
      accepted: false,
    }));
  }

  const packageParts = world.parts.filter((part) => part.repairable).slice(0, 4);
  if (packageParts.length) {
    const items = packageParts.map((part, index) => ({
      partId: part.id,
      condition: (index % 2 === 0 ? "AR" : "SV") as Unit["condition"],
      quantity: index === 0 ? 2 : 1,
      tsn: rng.int(2_000, 13_000),
      csn: rng.int(800, 7_500),
      tsr: rng.int(200, 5_000),
      csr: rng.int(100, 3_000),
    }));
    const totalAnchor = items.reduce((sum, item) => {
      const part = world.parts.find((candidate) => candidate.id === item.partId)!;
      return sum + part.listPrice * item.quantity * (item.condition === "AR" ? 0.16 : 0.42);
    }, 0);
    const listing: MarketListing = {
      id: nextId(world),
      nodeId: "node-airline-0",
      sellerOrganizationId: "org-airline-0",
      sellerFacilityId: "fac-hangar-0",
      kind: "package",
      title: "Fleet-change mixed component package",
      items,
      totalPrice: Math.round(totalAnchor * 0.82),
      expiresTick: 8,
      status: "open",
      exclusive: true,
    };
    world.listings.push(listing);
    world.opportunities.push(completeOpportunity({
      id: nextId(world),
      nodeId: listing.nodeId,
      kind: "listing",
      title: listing.title,
      description: `${items.reduce((sum, item) => sum + item.quantity, 0)} assets; package is indivisible.`,
      referenceId: listing.id,
      agreementKind: null,
      expiresTick: listing.expiresTick,
      accepted: false,
    }));
  }

  const agreementSpecs = [
    {
      nodeId: "node-factory",
      kind: "supplier_allocation" as const,
      title: "Quarterly surplus allocation",
      description: "Every 4 weeks: one reserved listing at 12% below condition-adjusted anchor.",
    },
    {
      nodeId: "node-airline-0",
      kind: "preferred_vendor" as const,
      title: "Preferred rotable vendor",
      description: "Every 4 weeks: one direct buyer RFQ matched to a P/N in your book.",
    },
    {
      nodeId: "node-mro-mid",
      kind: "repair_capacity" as const,
      title: "Reserved repair capacity",
      description: "Continuous benefit: reduce quoted repair TAT by 1 week.",
    },
  ];
  for (const spec of agreementSpecs) {
    world.opportunities.push(completeOpportunity({
      id: nextId(world),
      nodeId: spec.nodeId,
      kind: "agreement",
      title: spec.title,
      description: `${spec.description} Requires relationship 35; one active slot until reputation 60.`,
      referenceId: null,
      agreementKind: spec.kind,
      expiresTick: 100,
      accepted: false,
    }));
  }
  for (const node of world.networkNodes.filter((candidate) => candidate.state === "lead")) {
    world.opportunities.push(completeOpportunity({
      id: nextId(world),
      nodeId: node.id,
      kind: "introduction",
      title: `Introduction to ${node.label}`,
      description: "Accept the introduction to establish a working relationship.",
      referenceId: null,
      agreementKind: null,
      expiresTick: 24,
      accepted: false,
    }));
  }
}

function seedPbhOffer(world: World): void {
  const airline = world.airlines[0];
  if (!airline) return;
  const fleet = airline.fleetGroups[0];
  if (!fleet) return;
  const covered = world.parts
    .filter(
      (part) =>
        part.repairable &&
        (
          part.seriesIds.includes(fleet.aircraftSeriesId) ||
          part.seriesIds.includes(fleet.engineSeriesId)
        ),
    )
    .slice(0, 3)
    .map((part) => part.id);
  if (covered.length < 2) return;
  world.pbhContracts.push({
    id: nextId(world),
    nodeId: "node-airline-0",
    airlineId: airline.id,
    firmId: "firm-0",
    seriesId: fleet.aircraftSeriesId,
    partIds: covered,
    ratePerFh: 20,
    minimumWeeklyRate: 25_000,
    startTick: 0,
    endTick: 52,
    slaTicks: 2,
    misses: 0,
    maxMisses: 3,
    status: "offered",
    penaltyPerMiss: 75_000,
  });
}
