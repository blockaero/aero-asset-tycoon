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
export type OrganizationKind = "asset_manager" | "airline" | "mro" | "manufacturer";
export type FacilityKind = "warehouse" | "hangar" | "repair_shop" | "factory";
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
};

export type NetworkOpportunity = {
  id: number;
  nodeId: string;
  kind: "listing" | "buyer_need" | "introduction" | "agreement";
  title: string;
  description: string;
  referenceId: number | null;
  agreementKind: AgreementKind | null;
  expiresTick: number;
  accepted: boolean;
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

export type GameCommand =
  | { type: "purchase_listing"; listingId: number; destinationFacilityId: string }
  | { type: "send_to_shop"; assetId: number; shopId: string; workscope: "min" | "oh" }
  | { type: "submit_quote"; rfqId: number; unitIds: number[]; price: number; tx: TxKind }
  | { type: "set_buying_strategy"; patch: Partial<BuyingStrategy> }
  | { type: "set_sales_strategy"; patch: Partial<SalesStrategy> }
  | { type: "accept_network_opportunity"; opportunityId: number }
  | { type: "sign_network_agreement"; opportunityId: number }
  | { type: "sign_pbh"; contractId: number };

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
};
