import type { GameState } from "./types.ts";
import { ENGINE_VERSION } from "./kernel.ts";

export type SaveEnvelope = {
  saveFormat: 2;
  savedAt: string;
  checksum: string;
  state: GameState;
};

export function createSnapshot(state: GameState, savedAt = new Date().toISOString()): SaveEnvelope {
  const cloned = structuredClone(state);
  return {
    saveFormat: 2,
    savedAt,
    checksum: checksum(JSON.stringify(cloned)),
    state: cloned,
  };
}

export function serializeSnapshot(state: GameState, savedAt?: string): string {
  return JSON.stringify(createSnapshot(state, savedAt));
}

export function restoreSnapshot(json: string): GameState {
  const parsed = JSON.parse(json) as unknown;
  if (
    !isRecord(parsed) ||
    (parsed.saveFormat !== 1 && parsed.saveFormat !== 2) ||
    !isRecord(parsed.state)
  ) {
    throw new Error("Unsupported or invalid save format");
  }
  const rawState = parsed.state;
  if (
    parsed.saveFormat === 2 &&
    (typeof parsed.checksum !== "string" ||
      checksum(JSON.stringify(rawState)) !== parsed.checksum)
  ) {
    throw new Error("Save snapshot checksum mismatch");
  }
  // Migrations are idempotent and also apply to older checksummed format-2 snapshots.
  const state = migrateLegacyRecord(structuredClone(rawState));
  if (
    (state.saveFormat !== 1 && state.saveFormat !== 2) ||
    typeof state.engineVersion !== "string" ||
    state.engineVersion !== ENGINE_VERSION ||
    !Number.isInteger(state.maxTicks) ||
    (state.maxTicks as number) < 1 ||
    !Number.isInteger(state.rngState) ||
    !Number.isInteger(state.submissionSequence) ||
    (state.phase !== "open" && state.phase !== "resolved") ||
    !Array.isArray(state.pendingCommands) ||
    !isRecord(state.policies) ||
    !isRecord(state.world)
  ) {
    throw new Error("Incomplete save snapshot");
  }
  const world = state.world;
  const requiredArrays = [
    "series",
    "parts",
    "organizations",
    "facilities",
    "networkNodes",
    "relationships",
    "agreements",
    "opportunities",
    "listings",
    "transfers",
    "cohorts",
    "pbhContracts",
    "shops",
    "airlines",
    "firms",
    "units",
    "rfqs",
    "quotes",
    "jobs",
    "exchanges",
    "deals",
    "ads",
    "events",
    "pulses",
  ];
  if (
    !Number.isInteger(world.seed) ||
    !Number.isInteger(world.nextId) ||
    (world.nextId as number) < 1 ||
    !Number.isInteger(world.tick) ||
    (world.tick as number) < 0 ||
    (world.tick as number) > (state.maxTicks as number) ||
    (world.scenario !== "prototype" && world.scenario !== "full" && world.scenario !== "shock") ||
    world.region !== "GLOBAL" ||
    !isRecord(world.economy) ||
    !finiteNumbers(world.economy, [
      "traffic",
      "growth",
      "cyclePhase",
      "cyclePeriod",
      "shockStart",
      "shockUntil",
      "shockDepth",
    ]) ||
    !isRecord(world.reliability) ||
    !isRecord(world.reliability.factor) ||
    !isRecord(world.mrp) ||
    !isRecord(world.removalHistory) ||
    !isRecord(world.calendar) ||
    !isRecord(world.globalMarket) ||
    !isRecord(world.company) ||
    !Array.isArray(world.regions) ||
    requiredArrays.some((key) => !Array.isArray(world[key])) ||
    !(world.firms as unknown[]).every(
      (firm) =>
        isRecord(firm) &&
        typeof firm.id === "string" &&
        typeof firm.accBalance === "number" &&
        Number.isFinite(firm.accBalance),
    ) ||
    !(world.rfqs as unknown[]).every(
      (rfq) =>
        isRecord(rfq) &&
        Number.isInteger(rfq.id) &&
        Number.isInteger(rfq.createdTick) &&
        (rfq.pbhContractId === null || Number.isInteger(rfq.pbhContractId)) &&
        typeof rfq.pbhBreachRecorded === "boolean" &&
        (rfq.preferredFirmId === null || typeof rfq.preferredFirmId === "string"),
    )
  ) {
    throw new Error("Invalid world in save snapshot");
  }
  // Loading always pauses at the current stable/open boundary; the live runner owns wall time.
  const migrated = structuredClone(state) as Record<string, unknown>;
  migrated.saveFormat = 2;
  return migrated as unknown as GameState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumbers(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof record[key] === "number" && Number.isFinite(record[key]));
}

function migrateLegacyRecord(state: Record<string, unknown>): Record<string, unknown> {
  state.saveFormat = 2;
  if (!isRecord(state.world)) return state;
  const world = state.world;
  if (world.scenario === undefined) {
    world.scenario = typeof state.maxTicks === "number" && state.maxTicks <= 24 ? "prototype" : "full";
  }
  if (isRecord(world.economy) && world.economy.shockStart === undefined) {
    world.economy.shockStart = 0;
  }
  for (const firm of arrayRecords(world.firms)) {
    firm.manualAcquisitions ??= 0;
    firm.repairsCompleted ??= 0;
    firm.autoRepairEnabled ??= false;
    if (isRecord(firm.buyingStrategy)) {
      firm.buyingStrategy.maxInventoryUnits ??= 80;
      firm.buyingStrategy.maxPackageUnits ??= 8;
    }
  }
  for (const unit of arrayRecords(world.units)) {
    unit.tso ??= 0;
    unit.cso ??= 0;
    unit.acquiredTick ??= 0;
  }
  for (const part of arrayRecords(world.parts)) {
    part.mtburFh ??= part.removalMode === "hardtime" ? null : part.mtbrFh;
  }
  for (const airline of arrayRecords(world.airlines)) {
    for (const fleet of arrayRecords(airline.fleetGroups)) {
      fleet.enginesPerAircraft ??= 2;
    }
  }
  for (const cohort of arrayRecords(world.cohorts)) {
    cohort.overdue ??= false;
    cohort.replacementRfqId ??= null;
    cohort.dueQuantity ??= 0;
    cohort.deliveredQuantity ??= 0;
  }
  for (const transfer of arrayRecords(world.transfers)) {
    transfer.rfqId ??= null;
    transfer.cohortId ??= null;
  }
  for (const rfq of arrayRecords(world.rfqs)) {
    rfq.createdTick ??= world.tick ?? 0;
    rfq.pbhContractId ??= null;
    rfq.pbhBreachRecorded ??= false;
    rfq.preferredFirmId ??= null;
  }
  for (const exchange of arrayRecords(world.exchanges)) {
    exchange.coreCharge ??= 0;
  }
  for (const contract of arrayRecords(world.pbhContracts)) {
    contract.ratePerFh ??= 20;
    contract.minimumWeeklyRate ??=
      typeof contract.weeklyRate === "number"
        ? Math.round(contract.weeklyRate * 0.6)
        : 25_000;
  }
  migrateV2World(world);
  for (const job of arrayRecords(world.jobs)) {
    job.orderedTick ??= world.tick ?? 0;
    job.arriveTick ??= job.orderedTick;
    job.repairTatTicks ??=
      typeof job.doneTick === "number" && typeof job.arriveTick === "number"
        ? Math.max(0, job.doneTick - job.arriveTick)
        : 0;
    job.logisticsTatTicks ??=
      typeof job.arriveTick === "number" && typeof job.orderedTick === "number"
        ? Math.max(0, job.arriveTick - job.orderedTick)
        : 0;
  }
  return state;
}


/**
 * v2 backfill. Older saves predate the calendar, the region table, the statistical
 * global market, and the company sheet (identity, turn budget, Tribal Knowledge, Team).
 * Defaults are deliberately inert: a migrated save behaves exactly like a v1 save until
 * the player earns knowledge or hires anyone.
 */
function migrateV2World(world: Record<string, unknown>): void {
  const tick = typeof world.tick === "number" ? world.tick : 0;
  if (!isRecord(world.calendar)) {
    const period = (tick % 52) + 1;
    world.calendar = {
      year: 2027 + Math.floor(tick / 52),
      period,
      periodsPerYear: 52,
      quarter: Math.min(4, Math.floor((period - 1) / 13) + 1),
      season: period >= 23 && period <= 35 ? "summer" : period >= 10 && period <= 22 ? "spring" : period >= 36 && period <= 48 ? "autumn" : "winter",
      yearFraction: (period - 1) / 52,
      seasonalDemand: 1,
      seasonalPrice: 1,
    };
  }
  if (!Array.isArray(world.regions)) world.regions = [];
  if (!isRecord(world.globalMarket)) {
    world.globalMarket = {
      cohorts: [],
      baselineCount: 0,
      growthRate: 0.06,
      retireRate: 0.02,
      priceIndex: 1,
      demandIndex: 1,
      shocks: [],
      history: [],
    };
  }
  if (!isRecord(world.company)) {
    world.company = {
      identity: {
        companyName: "Aero Asset Partners",
        founderName: "The Founder",
        portraitId: "founder-mixed-woman",
      },
      budget: { timeTotal: 40, timeSpent: 0, rcTotal: 12, rcSpent: 0 },
      relationshipCapital: 0,
      knowledge: [],
      team: [],
      candidates: [],
      visitedThisTick: [],
    };
  }
  for (const facility of arrayRecords(world.facilities)) {
    facility.regionCode ??= "NEASIA";
    if (!Array.isArray(facility.ataCapabilities)) facility.ataCapabilities = [];
    facility.scale ??= 2;
  }
  for (const node of arrayRecords(world.networkNodes)) {
    node.regionCode ??= "NEASIA";
    node.reach ??= node.state === "partner" ? "som" : node.state === "locked" ? "tam" : "sam";
    if (!Array.isArray(node.ataFocus)) node.ataFocus = [];
    node.scale ??= 2;
    node.slots ??= 3;
  }
  for (const opportunity of arrayRecords(world.opportunities)) {
    opportunity.timeCost ??= 0;
    opportunity.rcCost ??= 0;
    opportunity.accCost ??= 0;
    if (!Array.isArray(opportunity.ataFocus)) opportunity.ataFocus = [];
    opportunity.easterEgg ??= false;
    opportunity.reward ??= "";
  }
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
