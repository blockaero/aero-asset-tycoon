/**
 * Tribal Knowledge — the capability tree opened from the wall of framed
 * certificates behind the founder's standing desk.
 *
 * Three branches:
 *   certification — real industry accreditations and memberships. These are the
 *     seven frames on the wall, ordered by frameSlot 0..6.
 *   asset        — ATA 100 chapter knowledge. A cheap fundamentals root per ATA
 *     group, then one expensive specialist per high-value chapter.
 *   operations   — three chained sub-branches: sales and marketing, operations,
 *     and AI.
 *
 * The organizations named here are real bodies in the aviation aftermarket and
 * the blurbs describe what they actually are. Every price, duration and effect
 * value is game data.
 *
 * EFFECT SIGN CONVENTION: an effect value is always the size of the improvement,
 * expressed as a positive number. buy_discount 0.06 means you buy 6% cheaper;
 * repair_tat 0.05 means turnaround is 5% shorter; logistics_cost 0.08 means
 * freight costs 8% less. Callers apply the sign; nothing in here is negative.
 * Fractions are fractions (0.06 = 6%); rc_income, time_income, team_cap and
 * warehouse_capacity are absolute per-pulse or capacity units.
 *
 * Pure module. Only const lookup tables are built at load: no Math.random, no
 * Date.now, no I/O, no mutation of anything a caller passes in.
 */

import { ATA_CHAPTERS, ataLabel } from "./ata.ts";
import type {
  AtaGroup,
  KnowledgeBranch,
  KnowledgeEffect,
  KnowledgeNode,
  KnowledgeProgress,
} from "./types.ts";

/** frameSlot for a node that is not hung on the certificate wall. */
export const NOT_FRAMED = -1;

// ---------------------------------------------------------------------------
// Branch 1 — certifications and memberships
// ---------------------------------------------------------------------------

/**
 * The seven frames on the wall, in wall order. Prerequisites are the real ones:
 * AS9120 is written on top of ISO 9001 and cannot be certified without it.
 * Nothing else in this list genuinely depends on anything else, so nothing else
 * is gated.
 */
const CERTIFICATION_NODES: KnowledgeNode[] = [
  {
    id: "cert.asa100",
    branch: "certification",
    title: "ASA-100 Accreditation",
    shortTitle: "ASA-100",
    blurb:
      "The Aviation Suppliers Association's quality system standard for distributors of new and surplus aircraft parts, granted after an on-site audit. It is written to satisfy FAA Advisory Circular 00-56, the voluntary industry distributor accreditation programme most airlines and MROs check before they will place an order.",
    requires: [],
    accCost: 400_000,
    timeCost: 5,
    ticksToComplete: 5,
    ataCodes: [],
    effects: [
      { kind: "buyer_ceiling", value: 0.1 },
      { kind: "quote_quality", value: 0.06 },
    ],
    frameSlot: 0,
  },
  {
    id: "cert.iso9001",
    branch: "certification",
    title: "ISO 9001 Quality Management System",
    shortTitle: "ISO 9001",
    blurb:
      "ISO 9001:2015 sets the generic requirements for a quality management system: the process approach, risk-based thinking, documented information and management review, certified by an accredited third-party body. Every aviation sector standard is written on top of it.",
    requires: [],
    accCost: 250_000,
    timeCost: 4,
    ticksToComplete: 4,
    ataCodes: [],
    effects: [
      { kind: "quote_quality", value: 0.05 },
      { kind: "buyer_ceiling", value: 0.05 },
    ],
    frameSlot: 1,
  },
  {
    id: "cert.as9120",
    branch: "certification",
    title: "AS9120 Aviation Distributor QMS",
    shortTitle: "AS9120",
    blurb:
      "The IAQG quality management standard for aviation, space and defence distributors. On top of the ISO 9001 requirements it adds chain of custody back to the last certificated source, control of shelf life and special handling, records retention, and a counterfeit part prevention programme.",
    requires: ["cert.iso9001"],
    accCost: 900_000,
    timeCost: 6,
    ticksToComplete: 6,
    ataCodes: [],
    effects: [
      { kind: "buyer_ceiling", value: 0.14 },
      { kind: "quote_quality", value: 0.1 },
    ],
    frameSlot: 2,
  },
  {
    id: "cert.afra_bmp",
    branch: "certification",
    title: "AFRA BMP Accreditation",
    shortTitle: "AFRA BMP",
    blurb:
      "Accreditation against the Aircraft Fleet Recycling Association's Best Management Practice for the management of used aircraft parts and assemblies, with its companion disassembly practice guide. Audited disassembly, parts recovery and materials recycling are what let an end-of-life airframe be parted out with paperwork a buyer will accept.",
    requires: [],
    accCost: 1_200_000,
    timeCost: 7,
    ticksToComplete: 6,
    ataCodes: [],
    effects: [
      { kind: "unlock_facility", facilityKind: "teardown" },
      { kind: "buy_discount", value: 0.08 },
    ],
    frameSlot: 3,
  },
  {
    id: "cert.iso27001",
    branch: "certification",
    title: "ISO/IEC 27001 Information Security",
    shortTitle: "ISO 27001",
    blurb:
      "ISO/IEC 27001:2022 certifies an information security management system: a risk assessment and treatment plan, a Statement of Applicability against the Annex A controls, internal audit and surveillance. Lessors and OEMs will not open a records or fleet-data feed to a trading partner who cannot show one.",
    requires: [],
    accCost: 1_000_000,
    timeCost: 5,
    ticksToComplete: 6,
    ataCodes: [],
    effects: [
      { kind: "unlock_facility", facilityKind: "lessor" },
      { kind: "intel", value: 0.1 },
    ],
    frameSlot: 4,
  },
  {
    id: "cert.istat",
    branch: "certification",
    title: "ISTAT Membership",
    shortTitle: "ISTAT",
    blurb:
      "Membership of the International Society of Transport Aircraft Trading, the association for aircraft and engine traders, lessors, financiers and appraisers. It runs the ISTAT Appraiser programme and the regional conferences where whole-asset deals are actually introduced.",
    requires: [],
    accCost: 300_000,
    timeCost: 3,
    ticksToComplete: 3,
    ataCodes: [],
    effects: [
      { kind: "event_access", value: 0.15 },
      { kind: "rc_income", value: 2 },
    ],
    frameSlot: 5,
  },
  {
    id: "cert.acpc",
    branch: "certification",
    title: "ACPC Membership",
    shortTitle: "ACPC",
    blurb:
      "Membership of the Air Carriers Purchasing Conference, where airline purchasing and material managers meet suppliers across several days of one-on-one roundtables and networking sessions. It is the component and consumable side of the trade, where ISTAT is the whole-asset side.",
    requires: [],
    accCost: 350_000,
    timeCost: 3,
    ticksToComplete: 3,
    ataCodes: [],
    effects: [
      { kind: "event_access", value: 0.12 },
      { kind: "sell_premium", value: 0.04, assetClass: "component" },
    ],
    frameSlot: 6,
  },
];

// ---------------------------------------------------------------------------
// Branch 2 — asset knowledge, by ATA chapter
// ---------------------------------------------------------------------------

type AssetRootSpec = {
  group: AtaGroup;
  title: string;
  shortTitle: string;
  blurb: string;
  accCost: number;
  timeCost: number;
  ticksToComplete: number;
  effects: KnowledgeEffect[];
};

/** Fundamentals roots. Cheap, fast, and the gate on every specialist in the group. */
const ASSET_ROOT_SPECS: AssetRootSpec[] = [
  {
    group: "airframe_systems",
    title: "Airframe Systems Fundamentals",
    shortTitle: "Airframe Systems",
    blurb:
      "The systems that make an airframe work: electrical power, hydraulics, flight controls, fuel, pneumatics, ice protection, fire protection and landing gear. Learn how they load one another before specialising in any single chapter.",
    accCost: 300_000,
    timeCost: 3,
    ticksToComplete: 3,
    effects: [
      { kind: "quote_quality", value: 0.03 },
      { kind: "ber_accuracy", value: 0.02 },
    ],
  },
  {
    group: "propulsion",
    title: "Propulsion Fundamentals",
    shortTitle: "Propulsion",
    blurb:
      "Engines, APUs and their accessories, from the fan to the accessory gearbox. Propulsion carries the largest single share of aftermarket value, the longest shop turnarounds and the harshest penalty for a bad workscope call.",
    accCost: 350_000,
    timeCost: 4,
    ticksToComplete: 4,
    effects: [
      { kind: "ber_accuracy", value: 0.03 },
      { kind: "quote_quality", value: 0.02 },
    ],
  },
  {
    group: "avionics",
    title: "Avionics Fundamentals",
    shortTitle: "Avionics",
    blurb:
      "Line-replaceable electronics: auto flight, communications, navigation, indicating and recording, and onboard information systems. Small, valuable and easy to ship, but mandates and obsolescence move the price faster than in any other family.",
    accCost: 300_000,
    timeCost: 3,
    ticksToComplete: 3,
    effects: [
      { kind: "quote_quality", value: 0.04 },
      { kind: "intel", value: 0.02 },
    ],
  },
  {
    group: "utilities",
    title: "Utilities Fundamentals",
    shortTitle: "Utilities",
    blurb:
      "Cabin and utility systems: air conditioning, equipment and furnishings, lighting, oxygen, and water and waste. Individually cheap, collectively the highest unit throughput a warehouse will ever see.",
    accCost: 200_000,
    timeCost: 2,
    ticksToComplete: 2,
    effects: [
      { kind: "quote_quality", value: 0.02 },
      { kind: "logistics_cost", value: 0.02 },
    ],
  },
  {
    group: "structures",
    title: "Structures Fundamentals",
    shortTitle: "Structures",
    blurb:
      "Standard structural practice plus doors, fuselage, nacelles and pylons, stabilizers, windows and wings. Structural condition and repair history set the residual value of any airframe you buy, long before its systems do.",
    accCost: 250_000,
    timeCost: 3,
    ticksToComplete: 3,
    effects: [
      { kind: "ber_accuracy", value: 0.03 },
      { kind: "quote_quality", value: 0.02 },
    ],
  },
];

const ASSET_ROOT_ID_PREFIX = "asset.root.";
const ASSET_SPECIALIST_ID_PREFIX = "asset.ata.";

/** Root node id for an ATA group, e.g. "asset.root.propulsion". */
export function assetRootId(group: AtaGroup): string {
  return `${ASSET_ROOT_ID_PREFIX}${group}`;
}

/** Specialist node id for a chapter, e.g. "asset.ata.72". */
export function assetSpecialistId(code: number): string {
  return `${ASSET_SPECIALIST_ID_PREFIX}${code}`;
}

type AssetSpecialistSpec = {
  code: number;
  blurb: string;
  accCost: number;
  timeCost: number;
  ticksToComplete: number;
  /** Positive fractions. See the sign convention in the module header. */
  buyDiscount: number;
  sellPremium: number;
  repairTat: number;
  berAccuracy: number;
};

/** One specialist per high-value chapter, ordered by ATA code. */
const ASSET_SPECIALIST_SPECS: AssetSpecialistSpec[] = [
  {
    code: 21,
    blurb:
      "Packs, air cycle machines, mix manifolds and cabin pressure controllers. High-cycle rotables with predictable shop demand, and a pack failure is one of the least deferrable defects an operator can carry.",
    accCost: 1_400_000,
    timeCost: 5,
    ticksToComplete: 4,
    buyDiscount: 0.05,
    sellPremium: 0.04,
    repairTat: 0.06,
    berAccuracy: 0.02,
  },
  {
    code: 24,
    blurb:
      "Integrated drive generators, transformer rectifier units, batteries and the bus tie network. IDG overhaul is one of the steadiest component revenue lines in the aftermarket and the exchange pool is deep enough to trade daily.",
    accCost: 1_800_000,
    timeCost: 5,
    ticksToComplete: 5,
    buyDiscount: 0.06,
    sellPremium: 0.05,
    repairTat: 0.06,
    berAccuracy: 0.02,
  },
  {
    code: 25,
    blurb:
      "Seats, galleys, lavatories, stowages and emergency equipment. Low value per unit against enormous quantities, and every cabin reconfiguration releases a fleet's worth of serviceable units at once.",
    accCost: 1_100_000,
    timeCost: 4,
    ticksToComplete: 4,
    buyDiscount: 0.05,
    sellPremium: 0.03,
    repairTat: 0.04,
    berAccuracy: 0.01,
  },
  {
    code: 27,
    blurb:
      "Primary and secondary flight control actuators, power control units and spoiler and flap drive units. Certification-sensitive, tightly held inside the OEM repair network, and unforgiving of a wrong repair-versus-replace call.",
    accCost: 2_200_000,
    timeCost: 6,
    ticksToComplete: 5,
    buyDiscount: 0.06,
    sellPremium: 0.06,
    repairTat: 0.05,
    berAccuracy: 0.03,
  },
  {
    code: 29,
    blurb:
      "Engine-driven and AC motor pumps, reservoirs, accumulators and the high-pressure distribution feeding gear, brakes and flight controls. Fluid contamination history is usually what decides whether a pump is a repair or a scrap.",
    accCost: 1_900_000,
    timeCost: 5,
    ticksToComplete: 5,
    buyDiscount: 0.06,
    sellPremium: 0.05,
    repairTat: 0.06,
    berAccuracy: 0.02,
  },
  {
    code: 31,
    blurb:
      "Display units, data acquisition and concentrator units, warning computers and flight data recorders. Among the most-traded avionics on a narrowbody, and testable on receipt without a full shop visit.",
    accCost: 1_500_000,
    timeCost: 5,
    ticksToComplete: 4,
    buyDiscount: 0.05,
    sellPremium: 0.05,
    repairTat: 0.05,
    berAccuracy: 0.02,
  },
  {
    code: 32,
    blurb:
      "Main and nose gear legs, wheels, carbon brakes and the extension and retraction system. Overhaul-heavy, life-limited and second only to engines in value; a gear shipset with clean back-to-birth records trades as an asset in its own right.",
    accCost: 3_600_000,
    timeCost: 7,
    ticksToComplete: 6,
    buyDiscount: 0.08,
    sellPremium: 0.07,
    repairTat: 0.05,
    berAccuracy: 0.04,
  },
  {
    code: 34,
    blurb:
      "Inertial reference and air data systems, radio navigation, weather radar and GPS. The densest concentration of high-value avionics on the aircraft, and every airspace mandate pushes another wave of removed units onto the market.",
    accCost: 3_200_000,
    timeCost: 6,
    ticksToComplete: 6,
    buyDiscount: 0.07,
    sellPremium: 0.07,
    repairTat: 0.06,
    berAccuracy: 0.03,
  },
  {
    code: 49,
    blurb:
      "The auxiliary power unit: a small gas turbine with its own hot section, life-limited parts and shop visit economics. It trades like a miniature engine and it is what an operator feels first on a hot morning turnaround.",
    accCost: 2_600_000,
    timeCost: 6,
    ticksToComplete: 5,
    buyDiscount: 0.07,
    sellPremium: 0.06,
    repairTat: 0.06,
    berAccuracy: 0.03,
  },
  {
    code: 53,
    blurb:
      "Frames, skins, stringers and pressure bulkheads. Corrosion findings and the repair history recorded against this chapter move an airframe's residual value further than any single system on board.",
    accCost: 1_600_000,
    timeCost: 5,
    ticksToComplete: 5,
    buyDiscount: 0.05,
    sellPremium: 0.04,
    repairTat: 0.03,
    berAccuracy: 0.04,
  },
  {
    code: 54,
    blurb:
      "Fan cowls, thrust reverser halves and engine pylons. The most frequently damaged structure in daily line service, which keeps serviceable cowl doors permanently short and permanently expensive.",
    accCost: 2_000_000,
    timeCost: 5,
    ticksToComplete: 5,
    buyDiscount: 0.06,
    sellPremium: 0.05,
    repairTat: 0.05,
    berAccuracy: 0.03,
  },
  {
    code: 72,
    blurb:
      "Fan, compressor, combustor and turbine modules, including the life-limited discs and shafts that carry most of an engine's value. Module-level knowledge is the difference between a profitable green-time trade and an unplanned shop visit.",
    accCost: 6_500_000,
    timeCost: 9,
    ticksToComplete: 8,
    buyDiscount: 0.09,
    sellPremium: 0.08,
    repairTat: 0.05,
    berAccuracy: 0.05,
  },
  {
    code: 73,
    blurb:
      "Hydromechanical units, main fuel pumps, metering units and FADEC channels. Few approved repair sources and long turnaround times, so a serviceable HMU sitting on your shelf is very close to money.",
    accCost: 3_400_000,
    timeCost: 7,
    ticksToComplete: 6,
    buyDiscount: 0.07,
    sellPremium: 0.06,
    repairTat: 0.07,
    berAccuracy: 0.03,
  },
  {
    code: 79,
    blurb:
      "Oil tanks, pressure and scavenge pumps, coolers, filters and chip detectors. Debris in the oil system is the classic trigger for an unscheduled engine removal, so reading an oil analysis well is a buying edge on the whole engine.",
    accCost: 2_800_000,
    timeCost: 6,
    ticksToComplete: 6,
    buyDiscount: 0.07,
    sellPremium: 0.05,
    repairTat: 0.06,
    berAccuracy: 0.04,
  },
  {
    code: 80,
    blurb:
      "Air turbine starters and starter air valves. Cycled on every flight and overhauled on condition, cheap enough to stock deep across a fleet type and reliable enough to move without a hard sell.",
    accCost: 1_700_000,
    timeCost: 5,
    ticksToComplete: 4,
    buyDiscount: 0.06,
    sellPremium: 0.05,
    repairTat: 0.06,
    berAccuracy: 0.02,
  },
];

function groupOfChapter(code: number): AtaGroup | undefined {
  return ATA_CHAPTERS.find((chapter) => chapter.code === code)?.group;
}

function codesInGroup(group: AtaGroup): number[] {
  return ATA_CHAPTERS.filter((chapter) => chapter.group === group).map((chapter) => chapter.code);
}

function buildAssetRoots(): KnowledgeNode[] {
  return ASSET_ROOT_SPECS.map((spec) => ({
    id: assetRootId(spec.group),
    branch: "asset" as const,
    title: spec.title,
    shortTitle: spec.shortTitle,
    blurb: spec.blurb,
    requires: [],
    accCost: spec.accCost,
    timeCost: spec.timeCost,
    ticksToComplete: spec.ticksToComplete,
    ataCodes: codesInGroup(spec.group),
    effects: spec.effects,
    frameSlot: NOT_FRAMED,
  }));
}

function buildAssetSpecialists(): KnowledgeNode[] {
  return ASSET_SPECIALIST_SPECS.map((spec) => {
    const group = groupOfChapter(spec.code);
    const rootId = group === undefined ? undefined : assetRootId(group);
    const label = ataLabel(spec.code);
    return {
      id: assetSpecialistId(spec.code),
      branch: "asset" as const,
      title: `${label} Specialist`,
      shortTitle: `ATA ${spec.code}`,
      blurb: spec.blurb,
      requires: rootId === undefined ? [] : [rootId],
      accCost: spec.accCost,
      timeCost: spec.timeCost,
      ticksToComplete: spec.ticksToComplete,
      ataCodes: [spec.code],
      effects: [
        { kind: "buy_discount" as const, value: spec.buyDiscount, ata: spec.code },
        { kind: "sell_premium" as const, value: spec.sellPremium, ata: spec.code },
        { kind: "repair_tat" as const, value: spec.repairTat, ata: spec.code },
        { kind: "ber_accuracy" as const, value: spec.berAccuracy },
      ],
      frameSlot: NOT_FRAMED,
    };
  });
}

// ---------------------------------------------------------------------------
// Branch 3 — company operations
// ---------------------------------------------------------------------------

/**
 * Three chains. Each sub-branch is strictly linear, so a player who wants the
 * late node has to pay for the whole progression.
 */
const OPERATIONS_NODES: KnowledgeNode[] = [
  // Sales and marketing ------------------------------------------------------
  {
    id: "ops.sales.trade_show",
    branch: "operations",
    title: "Trade Show Presence",
    shortTitle: "Trade Shows",
    blurb:
      "A booth, a stand crew and a travel budget for the aftermarket circuit. Being in the hall when a fleet plan changes is how a small trader hears about a package before it is listed.",
    requires: [],
    accCost: 500_000,
    timeCost: 4,
    ticksToComplete: 3,
    ataCodes: [],
    effects: [
      { kind: "event_access", value: 0.15 },
      { kind: "rc_income", value: 2 },
    ],
    frameSlot: NOT_FRAMED,
  },
  {
    id: "ops.sales.customer_days",
    branch: "operations",
    title: "Customer Days",
    shortTitle: "Customer Days",
    blurb:
      "Host purchasing and material managers at your own warehouse: walk the racks, show the quarantine cage and the records room, and let them audit you before they need you.",
    requires: ["ops.sales.trade_show"],
    accCost: 900_000,
    timeCost: 5,
    ticksToComplete: 4,
    ataCodes: [],
    effects: [
      { kind: "rc_income", value: 3 },
      { kind: "sell_premium", value: 0.03 },
    ],
    frameSlot: NOT_FRAMED,
  },
  {
    id: "ops.sales.sponsored_sessions",
    branch: "operations",
    title: "Sponsored Sessions",
    shortTitle: "Sponsorship",
    blurb:
      "Put your name on a conference session and your people on the panel. Expensive, but it turns a trading desk into a name that lessors and airlines call first.",
    requires: ["ops.sales.customer_days"],
    accCost: 1_800_000,
    timeCost: 6,
    ticksToComplete: 5,
    ataCodes: [],
    effects: [
      { kind: "event_access", value: 0.25 },
      { kind: "sell_premium", value: 0.05 },
      { kind: "rc_income", value: 4 },
    ],
    frameSlot: NOT_FRAMED,
  },

  // Operations ---------------------------------------------------------------
  {
    id: "ops.ops.logistics_desk",
    branch: "operations",
    title: "Logistics Desk",
    shortTitle: "Logistics Desk",
    blurb:
      "Dedicated freight forwarding, negotiated lane rates and dangerous goods competence in-house, so an AOG shipment does not sit waiting for a quote.",
    requires: [],
    accCost: 450_000,
    timeCost: 3,
    ticksToComplete: 3,
    ataCodes: [],
    effects: [{ kind: "logistics_cost", value: 0.08 }],
    frameSlot: NOT_FRAMED,
  },
  {
    id: "ops.ops.receiving",
    branch: "operations",
    title: "Receiving Throughput",
    shortTitle: "Receiving",
    blurb:
      "More inspection benches, a second shift on goods inward and a standard work pack for airworthiness tag review. Stock that clears receiving faster is stock you can quote today.",
    requires: ["ops.ops.logistics_desk"],
    accCost: 850_000,
    timeCost: 4,
    ticksToComplete: 4,
    ataCodes: [],
    effects: [
      { kind: "warehouse_capacity", value: 150 },
      { kind: "logistics_cost", value: 0.04 },
    ],
    frameSlot: NOT_FRAMED,
  },
  {
    id: "ops.ops.warehouse_expansion",
    branch: "operations",
    title: "Warehouse Expansion",
    shortTitle: "Warehouse",
    blurb:
      "More racking, more bonded and ESD storage, and a proper shelf-life-controlled room. Capacity is what lets you take a whole package instead of cherry-picking three line items from it.",
    requires: ["ops.ops.receiving"],
    accCost: 2_200_000,
    timeCost: 5,
    ticksToComplete: 5,
    ataCodes: [],
    effects: [
      { kind: "warehouse_capacity", value: 600 },
      { kind: "team_cap", value: 1 },
    ],
    frameSlot: NOT_FRAMED,
  },
  {
    id: "ops.ops.regional_desk",
    branch: "operations",
    title: "Regional Desk",
    shortTitle: "Regional Desk",
    blurb:
      "People on the ground in another time zone, quoting in local hours and clearing customs locally. This is what turns a region from a statistic into a market you can actually trade.",
    requires: ["ops.ops.warehouse_expansion"],
    accCost: 3_500_000,
    timeCost: 6,
    ticksToComplete: 6,
    ataCodes: [],
    effects: [
      { kind: "reach_region", regionCode: "EUW" },
      { kind: "reach_region", regionCode: "MEA" },
      { kind: "reach_region", regionCode: "SEA" },
      { kind: "team_cap", value: 2 },
      { kind: "logistics_cost", value: 0.05 },
    ],
    frameSlot: NOT_FRAMED,
  },

  // AI -----------------------------------------------------------------------
  {
    id: "ops.ai.auto_quote",
    branch: "operations",
    title: "Auto-Quote Engine",
    shortTitle: "Auto-Quote",
    blurb:
      "Price every incoming RFQ against your own transaction history and current stock position, automatically, within the hour. The founder stops pricing line items and starts pricing deals.",
    requires: [],
    accCost: 1_200_000,
    timeCost: 5,
    ticksToComplete: 4,
    ataCodes: [],
    effects: [
      { kind: "quote_quality", value: 0.12 },
      { kind: "time_income", value: 4 },
    ],
    frameSlot: NOT_FRAMED,
  },
  {
    id: "ops.ai.demand_forecasting",
    branch: "operations",
    title: "Demand Forecasting",
    shortTitle: "Forecasting",
    blurb:
      "Model removals from fleet utilisation, reliability trends and published maintenance intervals, so the intelligence monitor shows where demand is going rather than where it has been.",
    requires: ["ops.ai.auto_quote"],
    accCost: 2_400_000,
    timeCost: 6,
    ticksToComplete: 5,
    ataCodes: [],
    effects: [
      { kind: "intel", value: 0.2 },
      { kind: "quote_quality", value: 0.06 },
    ],
    frameSlot: NOT_FRAMED,
  },
  {
    id: "ops.ai.records_review",
    branch: "operations",
    title: "Records Review AI",
    shortTitle: "Records AI",
    blurb:
      "Read incoming trace packs automatically: extract the 8130-3 and EASA Form 1 fields, check the release against the part and serial, and flag the gap in a back-to-birth chain before the unit is booked in.",
    requires: ["ops.ai.demand_forecasting"],
    accCost: 3_600_000,
    timeCost: 7,
    ticksToComplete: 6,
    ataCodes: [],
    effects: [
      { kind: "repair_tat", value: 0.08 },
      { kind: "time_income", value: 6 },
    ],
    frameSlot: NOT_FRAMED,
  },
];

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/** Every node in the tree: certifications, then asset roots and specialists, then operations. */
export const KNOWLEDGE_NODES: KnowledgeNode[] = [
  ...CERTIFICATION_NODES,
  ...buildAssetRoots(),
  ...buildAssetSpecialists(),
  ...OPERATIONS_NODES,
];

const NODE_BY_ID: ReadonlyMap<string, KnowledgeNode> = new Map(
  KNOWLEDGE_NODES.map((node) => [node.id, node] as const),
);

/** Total ACC to earn the entire tree. Balance tests sanity-check the curve against this. */
export const KNOWLEDGE_TOTAL_ACC: number = KNOWLEDGE_NODES.reduce(
  (total, node) => total + node.accCost,
  0,
);

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** The node with this id, or undefined when the id is not in the tree. */
export function knowledgeNode(id: string): KnowledgeNode | undefined {
  return NODE_BY_ID.get(id);
}

/** Every node in a branch, in table order. */
export function nodesInBranch(branch: KnowledgeBranch): KnowledgeNode[] {
  return KNOWLEDGE_NODES.filter((node) => node.branch === branch);
}

function progressOf(id: string, progress: readonly KnowledgeProgress[]): KnowledgeProgress | undefined {
  return progress.find((entry) => entry.nodeId === id);
}

/** True when the node has been completed. Unknown ids are never unlocked. */
export function isUnlocked(id: string, progress: KnowledgeProgress[]): boolean {
  if (!NODE_BY_ID.has(id)) return false;
  const entry = progressOf(id, progress);
  return entry !== undefined && entry.completedTick !== null;
}

/** Prerequisite ids that are not yet complete, in the order the node declares them. */
export function missingPrerequisites(id: string, progress: KnowledgeProgress[]): string[] {
  const node = NODE_BY_ID.get(id);
  if (!node) return [];
  return node.requires.filter((requiredId) => !isUnlocked(requiredId, progress));
}

/**
 * ACC still owed on a node. The full accCost is charged up front when the founder
 * starts studying, so a node that already has a progress entry — even one at zero
 * invested ticks — owes nothing further. From then on it costs only founder time.
 */
export function remainingAccCost(id: string, progress: KnowledgeProgress[]): number {
  const node = NODE_BY_ID.get(id);
  if (!node) return 0;
  return progressOf(id, progress) ? 0 : node.accCost;
}

// ---------------------------------------------------------------------------
// Investment
// ---------------------------------------------------------------------------

export type InvestCheck = { ok: boolean; reason?: string };

/**
 * Whether the founder can put this pulse's hours into a node. Rejects an unknown
 * node, an already-earned node, an unmet prerequisite, and an ACC balance that
 * cannot cover the up-front cost.
 */
export function canInvest(
  id: string,
  progress: KnowledgeProgress[],
  accBalance: number,
): InvestCheck {
  const node = NODE_BY_ID.get(id);
  if (!node) return { ok: false, reason: `Unknown knowledge node "${id}".` };
  if (isUnlocked(id, progress)) return { ok: false, reason: `${node.shortTitle} is already earned.` };

  const missing = missingPrerequisites(id, progress);
  if (missing.length > 0) {
    const names = missing.map((requiredId) => NODE_BY_ID.get(requiredId)?.shortTitle ?? requiredId);
    return { ok: false, reason: `${node.shortTitle} requires ${names.join(", ")} first.` };
  }

  const due = remainingAccCost(id, progress);
  if (accBalance < due) {
    return { ok: false, reason: `${node.shortTitle} costs ${due} ACC, balance is ${accBalance}.` };
  }
  return { ok: true };
}

/**
 * Put one pulse of founder time into a node.
 *
 * Pure: the input array and every entry in it are left untouched, and a new array
 * is always returned. investedTicks increments by one, and the pulse on which it
 * reaches ticksToComplete is the tick recorded in completedTick. Investing in an
 * unknown or already-complete node is a no-op copy, so a replayed command can
 * never push a node past its threshold.
 */
export function investTick(
  id: string,
  progress: KnowledgeProgress[],
  tick: number,
): KnowledgeProgress[] {
  const node = NODE_BY_ID.get(id);
  if (!node) return [...progress];

  const existing = progressOf(id, progress);
  if (existing && existing.completedTick !== null) return [...progress];

  const investedTicks = (existing?.investedTicks ?? 0) + 1;
  const updated: KnowledgeProgress = {
    nodeId: id,
    investedTicks,
    completedTick: investedTicks >= node.ticksToComplete ? tick : null,
  };

  if (!existing) return [...progress, updated];
  return progress.map((entry) => (entry.nodeId === id ? updated : entry));
}

/**
 * Every effect the company has actually earned, in tree order so the result is
 * stable no matter what order the progress array happens to be in.
 */
export function completedEffects(progress: KnowledgeProgress[]): KnowledgeEffect[] {
  const effects: KnowledgeEffect[] = [];
  for (const node of KNOWLEDGE_NODES) {
    if (isUnlocked(node.id, progress)) effects.push(...node.effects);
  }
  return effects;
}

// ---------------------------------------------------------------------------
// The wall
// ---------------------------------------------------------------------------

export type KnowledgeWallState = "locked" | "available" | "in_progress" | "earned";

export type KnowledgeWallSlot = {
  node: KnowledgeNode;
  state: KnowledgeWallState;
};

/**
 * The certificate wall behind the desk: the certification branch only, ordered by
 * frameSlot. "locked" frames are empty outlines, "available" frames are the ones
 * the founder could start today.
 */
export function knowledgeWallSlots(progress: KnowledgeProgress[]): KnowledgeWallSlot[] {
  return nodesInBranch("certification")
    .slice()
    .sort((a, b) => a.frameSlot - b.frameSlot)
    .map((node) => {
      const entry = progressOf(node.id, progress);
      let state: KnowledgeWallState;
      if (entry && entry.completedTick !== null) state = "earned";
      else if (entry && entry.investedTicks > 0) state = "in_progress";
      else if (missingPrerequisites(node.id, progress).length === 0) state = "available";
      else state = "locked";
      return { node, state };
    });
}
