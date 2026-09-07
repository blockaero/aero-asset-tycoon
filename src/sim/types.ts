export type RegionId = "GLOBAL";
export type Category =
  | "llp"
  | "rotable"
  | "repairable"
  | "expendable"
  | "consumable"
  | "standard";
export type Condition = "NE" | "NS" | "OH" | "SV" | "RP" | "AR" | "BER" | "SCRAP";
/** Retained as inert migration metadata; trace does not affect prototype economics. */
export type Trace = "dual" | "single" | "partial" | "none";
export type DemandKind = "hardtime" | "overhaul" | "oncondition" | "conditionmonitored" | "ad" | "sb";
export type Procurement = "oem_loyal" | "cost_driven" | "balanced";
export type TxKind = "outright" | "exchange";
export type LivePace = "fast" | "medium" | "slow";
export type OrganizationKind = "asset_manager" | "airline" | "mro" | "manufacturer" | "lessor" | "broker" | "association";
export type FacilityKind =
  | "warehouse"
  | "hangar"
  | "repair_shop"
  | "factory"
  | "engine_shop"
  | "component_shop"
  | "teardown"
  | "lessor"
  | "broker"
  | "distribution"
  | "conference";
export type NodeState = "locked" | "lead" | "known" | "partner";
export type AgreementKind = "supplier_allocation" | "preferred_vendor" | "repair_capacity";

export type Series = {
  id: string;
  name: string;
  family: string;
  kind: "airframe" | "engine";
  class: "regional" | "narrowbody" | "widebody";
  fhPerDay: number;
  fcPerDay: number;
};

export type PartMaster = {
  id: string;
  name: string;
  ata: number;
  category: Category;
  seriesIds: string[];
  positions: number;
  removalMode: "hardtime" | "oncondition" | "conditionmonitored";
  lifeLimitFh: number | null;
  lifeLimitFc: number | null;
  mtbrFh: number;
  mtburFh: number | null;
  mtboFh: number | null;
  listPrice: number;
  berBase: number;
  shopTurnMin: number;
  shopTurnMax: number;
  repairable: boolean;
  serialized: boolean;
};

export type Organization = {
  id: string;
  name: string;
  kind: OrganizationKind;
  reputation: number;
  description: string;
};

export type Facility = {
  id: string;
  organizationId: string;
  nodeId: string;
  name: string;
  kind: FacilityKind;
  capacity: number;
  baseTatTicks: number;
  logisticsTatTicks: number;
  /** v2 */
  regionCode: RegionCode;
  /** ATA chapters this facility can work or trade. */
  ataCapabilities: number[];
  scale: number;
};

export type FleetGroup = {
  id: string;
  airlineId: string;
  aircraftSeriesId: string;
  engineSeriesId: string;
  enginesPerAircraft: number;
  count: number;
  fhPerWeek: number;
  fcPerWeek: number;
};

export type InstalledCohort = {
  id: string;
  airlineId: string;
  fleetGroupId: string;
  partId: string;
  quantity: number;
  remainingFh: number | null;
  remainingFc: number | null;
  remainingOverhaulFh: number | null;
  forecasted: boolean;
  overdue: boolean;
  replacementRfqId: number | null;
  dueQuantity: number;
  deliveredQuantity: number;
};

export type Airline = {
  id: string;
  organizationId: string;
  facilityId: string;
  name: string;
  health: number;
  procurement: Procurement;
  sophistication: number;
  fleet: Record<string, number>;
  fleetGroups: FleetGroup[];
  planningHorizon: number;
};

export type Unit = {
  id: number;
  partId: string;
  ownerFirmId: string | null;
  ownerOrganizationId: string;
  facilityId: string | null;
  transferId: number | null;
  condition: Condition;
  trace: Trace;
  tsn: number;
  csn: number;
  tsr: number;
  csr: number;
  tso: number;
  cso: number;
  acquiredTick: number;
  acquisitionCost: number;
  listed: boolean;
  reservedForRfq: number | null;
};
export type Asset = Unit;

export type Shop = {
  id: string;
  organizationId: string;
  facilityId: string;
  name: string;
  costMult: number;
  turnMult: number;
  failP: number;
};

export type ShopJob = {
  id: number;
  firmId: string;
  unitId: number;
  shopId: string;
  orderedTick: number;
  arriveTick: number;
  doneTick: number;
  repairTatTicks: number;
  logisticsTatTicks: number;
  workscope: "min" | "oh";
  fee: number;
  status: "queued" | "working";
};

export type Transfer = {
  id: number;
  assetIds: number[];
  fromFacilityId: string;
  toFacilityId: string;
  departTick: number;
  arriveTick: number;
  purpose: "purchase" | "sale" | "repair_out" | "repair_return" | "core_return";
  relatedId: number | null;
  rfqId: number | null;
  cohortId: string | null;
};

export type ExchangeOpen = {
  id: number;
  firmId: string;
  airlineId: string;
  partId: string;
  dueTick: number;
  coreExpected: boolean;
  coreCharge: number;
};

export type Rfq = {
  id: number;
  createdTick: number;
  airlineId: string;
  buyerOrganizationId: string;
  destinationFacilityId: string;
  partId: string;
  kind: DemandKind;
  minCondition: Condition;
  qty: number;
  maxPrice: number;
  aog: boolean;
  expireTick: number;
  filled: number;
  sourceCohortId: string | null;
  pbhContractId: number | null;
  pbhBreachRecorded: boolean;
  preferredFirmId: string | null;
};

export type Quote = {
  id: number;
  rfqId: number;
  firmId: string;
  price: number;
  tx: TxKind;
  submitted: number;
  unitIds: number[];
};

export type Deal = {
  id: number;
  rfqId: number;
  buyerOrganizationId: string;
  sellerFirmId: string;
  unitIds: number[];
  priceEach: number;
  tx: TxKind;
  status: "offered" | "accepted" | "fulfilled" | "expired" | "cancelled";
  expireTick: number;
};

export type ListingItem = {
  partId: string;
  condition: Condition;
  quantity: number;
  tsn: number;
  csn: number;
  tsr: number;
  csr: number;
};

export type MarketListing = {
  id: number;
  nodeId: string;
  sellerOrganizationId: string;
  sellerFacilityId: string;
  kind: "single_asset" | "package";
  title: string;
  items: ListingItem[];
  totalPrice: number;
  expiresTick: number;
  status: "open" | "sold" | "expired";
  exclusive: boolean;
};

export type Relationship = {
  organizationId: string;
  score: number;
  onTimeDeliveries: number;
  missedDeliveries: number;
};

export type NetworkNode = {
  id: string;
  organizationId: string;
  facilityIds: string[];
  label: string;
  role: "hq" | "customer" | "supplier" | "mro" | "rival";
  x: number;
  y: number;
  state: NodeState;
  reputationRequired: number;
  relationshipRequired: number;
  logisticsTatTicks: number;
  hiddenDetail: string;
  /** v2 */
  regionCode: RegionCode;
  reach: MarketReach;
  /** ATA chapters this node deals in. Drives map filters. */
  ataFocus: number[];
  /** 1 (single component bench) .. 5 (mega overhaul / OEM). */
  scale: number;
  /** How many opportunity slots this node can hold at once. */
  slots: number;
};

export type NetworkOpportunity = {
  id: number;
  nodeId: string;
  kind:
    | "listing"
    | "buyer_need"
    | "introduction"
    | "agreement"
    | "easter_egg"
    | "conference"
    | "candidate"
    | "teardown"
    | "intel"
    | "warehouse_rotables"
    | "warehouse_questionable"
    | "warehouse_as_removed";
  title: string;
  description: string;
  referenceId: number | null;
  agreementKind: AgreementKind | null;
  expiresTick: number;
  accepted: boolean;
  /** v2 costs paid from the turn budget when the player opens it. */
  timeCost: number;
  rcCost: number;
  accCost: number;
  /** ATA chapters involved, for filters and knowledge bonuses. */
  ataFocus: number[];
  /** Seeded rare finds that meaningfully boost the company. */
  easterEgg: boolean;
  /** Free-text reward summary shown on the card. */
  reward: string;
};

export type NetworkAgreement = {
  id: number;
  nodeId: string;
  organizationId: string;
  kind: AgreementKind;
  startTick: number;
  endTick: number;
  active: boolean;
  cadenceTicks: number;
  nextTick: number;
  benefit: number;
};

export type RegulatoryEvent = {
  kind: "ad" | "sb";
  partId: string;
  seriesId: string;
  rumourUntil: number;
  fireTick: number | null;
  window: number;
  severity: "minor" | "terminating";
  uptake: number;
};
export type AdEvent = RegulatoryEvent;

export type EventLog = {
  tick: number;
  kind: string;
  payload: Record<string, number | string | boolean | null>;
};

export type Economy = {
  traffic: number;
  growth: number;
  cyclePhase: number;
  cyclePeriod: number;
  shockStart: number;
  shockUntil: number;
  shockDepth: number;
};

export type Reliability = {
  /** partId|seriesId → factor */
  factor: Record<string, number>;
};

export type AccPulse = {
  tick: number;
  opening: number;
  closing: number;
  delta: number;
  sales: number;
  purchases: number;
  repair: number;
  logistics: number;
  overhead: number;
  penalties: number;
  contracts: number;
};

export type BuyingStrategy = {
  enabled: boolean;
  maxAccPerUnit: number;
  minPackageDiscount: number;
  targetStock: number;
  accFloor: number;
  maxInventoryUnits: number;
  maxPackageUnits: number;
  conditions: Condition[];
  category: Category | "any";
};

export type SalesStrategy = {
  minMargin: number;
  reserveStock: number;
  minCondition: Condition;
  exchangeBias: number;
  allocation: "lowest_value_first" | "highest_value_first";
};

export type Firm = {
  id: string;
  organizationId: string;
  warehouseFacilityId: string;
  name: string;
  accBalance: number;
  debt: number;
  insolvent: boolean;
  globalReputation: number;
  rfqsSeen: number;
  rfqsFilled: number;
  manualAcquisitions: number;
  repairsCompleted: number;
  startingCapital: number;
  navHistory: number[];
  buyingStrategy: BuyingStrategy;
  salesStrategy: SalesStrategy;
  autoRepairEnabled: boolean;
};

export type PbhContract = {
  id: number;
  nodeId: string;
  airlineId: string;
  firmId: string;
  seriesId: string;
  partIds: string[];
  ratePerFh: number;
  minimumWeeklyRate: number;
  startTick: number;
  endTick: number;
  slaTicks: number;
  misses: number;
  maxMisses: number;
  status: "offered" | "active" | "cancelled" | "completed";
  penaltyPerMiss: number;
};

export type World = {
  seed: number;
  scenario: "prototype" | "full" | "shock";
  tick: number;
  nextId: number;
  region: RegionId;
  series: Series[];
  parts: PartMaster[];
  organizations: Organization[];
  facilities: Facility[];
  networkNodes: NetworkNode[];
  relationships: Relationship[];
  agreements: NetworkAgreement[];
  opportunities: NetworkOpportunity[];
  listings: MarketListing[];
  transfers: Transfer[];
  cohorts: InstalledCohort[];
  pbhContracts: PbhContract[];
  shops: Shop[];
  airlines: Airline[];
  firms: Firm[];
  units: Unit[];
  jobs: ShopJob[];
  exchanges: ExchangeOpen[];
  deals: Deal[];
  rfqs: Rfq[];
  quotes: Quote[];
  economy: Economy;
  reliability: Reliability;
  ads: RegulatoryEvent[];
  mrp: Record<string, number>;
  events: EventLog[];
  pulses: AccPulse[];
  removalHistory: Record<string, number[]>;
  /** v2 */
  calendar: GameCalendar;
  regions: Region[];
  globalMarket: GlobalMarket;
  company: CompanyState;
};

export type StandingPolicy = {
  cashFloor: number;
  autoAcceptMargin: number;
  replenishPriceCeil: number;
  targetStockRotable: number;
  targetStockExpendable: number;
  autoRepairCeil: number;
  aogAggressiveness: number;
  exchangeBias: number;
};

/* ------------------------------------------------------------------ *
 * v2 contract — calendar, ATA, geography, cohort market, fog of war,
 * turn budgets, Tribal Knowledge, Team, and founder identity.
 * ------------------------------------------------------------------ */

export type Season = "winter" | "spring" | "summer" | "autumn";

export type GameCalendar = {
  /** Calendar year, e.g. 2027. */
  year: number;
  /** 1-based period inside the year. */
  period: number;
  /** Periods in a year. One tick is one week, so 52. */
  periodsPerYear: number;
  /** 1..4 */
  quarter: number;
  season: Season;
  /** 0..1 through the year. Drives the seasonal palette. */
  yearFraction: number;
  /** Seasonal demand multiplier applied on top of the economic baseline. */
  seasonalDemand: number;
  /** Seasonal price multiplier. Inventory held into a strong season is worth more. */
  seasonalPrice: number;
};

/** ATA 100 chapter grouping used for map filters, knowledge, and chip rollups. */
export type AtaGroup =
  | "general"
  | "airframe_systems"
  | "structures"
  | "propulsion"
  | "avionics"
  | "utilities";

export type AtaChapter = {
  code: number;
  title: string;
  group: AtaGroup;
  /** One-line plain description shown in the UI. */
  blurb: string;
  /** Rough share of aftermarket value. Used to weight cohorts and demand. */
  valueWeight: number;
};

export type RegionCode =
  | "NA"
  | "CARIB"
  | "LATAM"
  | "EUW"
  | "EUE"
  | "CIS"
  | "MEA"
  | "AFR"
  | "SASIA"
  | "SEA"
  | "GCHINA"
  | "NEASIA"
  | "OCE"
  | "CASIA";

export type Region = {
  code: RegionCode;
  name: string;
  /** ISO-ish country names. The union across regions is 190+. */
  countries: string[];
  /** Map rectangle in 0..100 space. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Relative number of facilities placed here. */
  facilityDensity: number;
  /** Baseline demand index, 1.0 is world average. */
  demandBase: number;
  /** Shop labour cost index, 1.0 is world average. */
  labourIndex: number;
  /** Weeks of extra logistics from the player HQ. */
  logisticsPenalty: number;
};

/** Fog-of-war ring. TAM is statistical only; SAM is visible; SOM is tradeable. */
export type MarketReach = "tam" | "sam" | "som";

export type AssetClass = "airframe" | "engine" | "component" | "llp";

/**
 * A statistical slice of the global fleet. Everything outside the player's SOM
 * lives here as counts, never as serialized units.
 */
export type MarketCohort = {
  id: string;
  regionCode: RegionCode;
  ata: number;
  assetClass: AssetClass;
  ownerKind: OrganizationKind;
  /** Serialized high-value assets in this slice. */
  count: number;
  meanAgeYears: number;
  /** 1.0 baseline. */
  priceIndex: number;
  demandIndex: number;
  /** How many units of this cohort have been materialized into world.units. */
  materialized: number;
};

export type MarketShockKind =
  | "fuel_spike"
  | "type_grounding"
  | "lessor_default"
  | "variant_launch"
  | "supply_squeeze"
  | "traffic_boom"
  | "credit_crunch";

export type MarketShock = {
  id: number;
  kind: MarketShockKind;
  label: string;
  startTick: number;
  peakTick: number;
  endTick: number;
  /** Signed multiplicative impact at peak, e.g. -0.18. */
  priceImpact: number;
  demandImpact: number;
  regionCode: RegionCode | null;
  ata: number | null;
  /** Revealed to the player by intel capability. */
  known: boolean;
};

export type MarketHistoryPoint = {
  tick: number;
  count: number;
  priceIndex: number;
  demandIndex: number;
};

export type GlobalMarket = {
  cohorts: MarketCohort[];
  /** Serialized high-value asset count at world creation. */
  baselineCount: number;
  /** Annual growth, 0.06. */
  growthRate: number;
  /** Annual retirement, 0.02. */
  retireRate: number;
  priceIndex: number;
  demandIndex: number;
  shocks: MarketShock[];
  history: MarketHistoryPoint[];
};

/** Per-pulse founder budgets. Time does not roll over; RC decays. */
export type TurnBudget = {
  timeTotal: number;
  timeSpent: number;
  rcTotal: number;
  rcSpent: number;
};

export type KnowledgeBranch = "certification" | "asset" | "operations";

export type KnowledgeEffect =
  | { kind: "buy_discount"; value: number; ata?: number; assetClass?: AssetClass }
  | { kind: "sell_premium"; value: number; ata?: number; assetClass?: AssetClass }
  | { kind: "repair_tat"; value: number; ata?: number }
  | { kind: "ber_accuracy"; value: number }
  | { kind: "reach_region"; regionCode: RegionCode }
  | { kind: "unlock_facility"; facilityKind: FacilityKind }
  | { kind: "rc_income"; value: number }
  | { kind: "time_income"; value: number }
  | { kind: "team_cap"; value: number }
  | { kind: "intel"; value: number }
  | { kind: "event_access"; value: number }
  | { kind: "logistics_cost"; value: number }
  | { kind: "warehouse_capacity"; value: number }
  | { kind: "quote_quality"; value: number }
  | { kind: "buyer_ceiling"; value: number };

export type KnowledgeNode = {
  id: string;
  branch: KnowledgeBranch;
  title: string;
  /** Short label for the frame on the wall, e.g. "ISO 9001". */
  shortTitle: string;
  blurb: string;
  requires: string[];
  accCost: number;
  /** Founder hours consumed each pulse while in progress. */
  timeCost: number;
  ticksToComplete: number;
  /** ATA chapters this node covers. Empty for non-asset branches. */
  ataCodes: number[];
  effects: KnowledgeEffect[];
  /** Position on the certificate wall, 0-based. */
  frameSlot: number;
};

export type KnowledgeProgress = {
  nodeId: string;
  investedTicks: number;
  completedTick: number | null;
};

export type TeamRole = "buyer" | "sales" | "records" | "repair" | "regional" | "analyst";

export type TeamCandidate = {
  id: string;
  name: string;
  role: TeamRole;
  portraitId: string;
  /** Weekly ACC salary. */
  salary: number;
  /** 1..100 */
  skill: number;
  /** ATA chapters this person knows well. */
  ataAffinity: number[];
  regionCode: RegionCode | null;
  availableUntilTick: number;
  blurb: string;
};

export type TeamMember = TeamCandidate & { hiredTick: number };

export type FounderIdentity = {
  companyName: string;
  founderName: string;
  portraitId: string;
};

/** Everything the player earns, spends, and knows outside the balance sheet. */
export type CompanyState = {
  identity: FounderIdentity;
  budget: TurnBudget;
  /** Carried relationship capital, decays each pulse. */
  relationshipCapital: number;
  knowledge: KnowledgeProgress[];
  team: TeamMember[];
  candidates: TeamCandidate[];
  /** Node ids the player has personally visited this pulse. */
  visitedThisTick: string[];
};

export type GameCommand =
  | { type: "purchase_listing"; listingId: number; destinationFacilityId: string }
  | { type: "send_to_shop"; assetId: number; shopId: string; workscope: "min" | "oh" }
  | { type: "submit_quote"; rfqId: number; unitIds: number[]; price: number; tx: TxKind }
  | { type: "set_buying_strategy"; patch: Partial<BuyingStrategy> }
  | { type: "set_sales_strategy"; patch: Partial<SalesStrategy> }
  | { type: "accept_network_opportunity"; opportunityId: number }
  | { type: "sign_network_agreement"; opportunityId: number }
  | { type: "sign_pbh"; contractId: number }
  | { type: "open_opportunity"; opportunityId: number }
  | { type: "visit_node"; nodeId: string }
  | { type: "invest_knowledge"; nodeId: string }
  | { type: "hire_team_member"; candidateId: string }
  | { type: "release_team_member"; memberId: string }
  | { type: "set_identity"; companyName: string; founderName: string; portraitId: string };

export type CommandEnvelope = {
  id: number;
  firmId: string;
  submittedSequence: number;
  command: GameCommand;
};

export type GameState = {
  saveFormat: 2;
  engineVersion: string;
  maxTicks: number;
  rngState: number;
  phase: "open" | "resolved";
  submissionSequence: number;
  pendingCommands: CommandEnvelope[];
  policies: Record<string, StandingPolicy>;
  world: World;
};

export type CampaignConfig = {
  seed: number;
  ticks: number;
  rivalCount: number;
  airlineCount: number;
  partCount: number;
  scenario?: "prototype" | "full" | "shock";
  /** Only for live clients. Headless runs tick as fast as the CPU. */
  livePace?: LivePace;
  /** v2 identity. Defaults are rolled from the seed when omitted. */
  companyName?: string;
  founderName?: string;
  portraitId?: string;
  /** Facilities placed on the large map. Defaults to 420. */
  facilityCount?: number;
  /** Serialized high-value assets in the visible universe. Defaults to 40000. */
  worldAssetCount?: number;
};
