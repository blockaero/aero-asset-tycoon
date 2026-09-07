/**
 * ATA 100 / iSpec 2200 chapter taxonomy.
 *
 * Every part, cohort, knowledge node, team member and market shock in the game is
 * tagged with an ATA chapter, so this module is the shared vocabulary the rest of
 * the sim and the UI speak. Chapter numbers and titles are the real ones used by
 * the aviation aftermarket; the value weights are game data.
 *
 * Pure module: only const lookup tables are built at load, nothing else happens.
 */
import type { AssetClass, AtaChapter, AtaGroup } from "./types.ts";

/** Display order for group filters and legends. */
export const ATA_GROUPS: readonly AtaGroup[] = [
  "general",
  "airframe_systems",
  "structures",
  "propulsion",
  "avionics",
  "utilities",
];

export const ATA_GROUP_LABELS: Record<AtaGroup, string> = {
  general: "General & Servicing",
  airframe_systems: "Airframe Systems",
  structures: "Structures",
  propulsion: "Propulsion",
  avionics: "Avionics",
  utilities: "Cabin & Utilities",
};

/** Credit a same-group chapter gets relative to an exact chapter hit. */
export const ATA_GROUP_AFFINITY = 0.35;

/** Separator used by ataLabel. Matches the middot used elsewhere in the UI. */
const LABEL_SEPARATOR = " · ";

/**
 * The chapters that carry aftermarket value. Ordered by code so the UI can render
 * the table directly. valueWeight is a rough share of aftermarket spend; the set
 * deliberately does not sum to 1 because it is a weighting, not a distribution.
 */
export const ATA_CHAPTERS: AtaChapter[] = [
  {
    code: 5,
    title: "Time Limits/Maintenance Checks",
    group: "general",
    blurb: "Defines the inspection intervals, life limits and check packages that decide when an asset must come off wing.",
    valueWeight: 0.006,
  },
  {
    code: 6,
    title: "Dimensions and Areas",
    group: "general",
    blurb: "Station, waterline and buttock-line references used to locate every zone and access panel on the airframe.",
    valueWeight: 0.001,
  },
  {
    code: 7,
    title: "Lifting and Shoring",
    group: "general",
    blurb: "Jacking points and shoring procedures needed before gear swaps, weighing or structural repair.",
    valueWeight: 0.001,
  },
  {
    code: 10,
    title: "Parking/Mooring/Storage",
    group: "general",
    blurb: "Preservation and return-to-service procedures that protect an asset's value while it sits idle.",
    valueWeight: 0.003,
  },
  {
    code: 11,
    title: "Placards and Markings",
    group: "general",
    blurb: "Exterior and cabin placards, stencils and data plate markings required for a legal release.",
    valueWeight: 0.001,
  },
  {
    code: 12,
    title: "Servicing",
    group: "general",
    blurb: "Routine replenishment of oil, hydraulic fluid, oxygen and nitrogen between flights.",
    valueWeight: 0.004,
  },
  {
    code: 20,
    title: "Standard Practices - Airframe",
    group: "general",
    blurb: "Common shop practices such as torque, bonding, sealing and safetying that every airframe task refers back to.",
    valueWeight: 0.003,
  },
  {
    code: 21,
    title: "Air Conditioning",
    group: "utilities",
    blurb: "Packs, air cycle machines and cabin pressure control - a high-cycle rotable pool with steady shop demand.",
    valueWeight: 0.026,
  },
  {
    code: 22,
    title: "Auto Flight",
    group: "avionics",
    blurb: "Autopilot, autothrottle and flight guidance computers whose exchange units command strong avionics prices.",
    valueWeight: 0.020,
  },
  {
    code: 23,
    title: "Communications",
    group: "avionics",
    blurb: "VHF/HF radios, SATCOM, CVR and cabin interphone - line-replaceable and easy to trade.",
    valueWeight: 0.018,
  },
  {
    code: 24,
    title: "Electrical Power",
    group: "airframe_systems",
    blurb: "Generators, IDGs, TRUs and batteries; IDG overhaul is one of the most reliable component revenue streams.",
    valueWeight: 0.030,
  },
  {
    code: 25,
    title: "Equipment/Furnishings",
    group: "utilities",
    blurb: "Seats, galleys, lavatories and emergency equipment - cheap per unit but enormous in quantity.",
    valueWeight: 0.024,
  },
  {
    code: 26,
    title: "Fire Protection",
    group: "airframe_systems",
    blurb: "Detection loops, bottles and extinguishing systems governed by hard hydrostatic and weight-check intervals.",
    valueWeight: 0.012,
  },
  {
    code: 27,
    title: "Flight Controls",
    group: "airframe_systems",
    blurb: "Actuators, PCUs and spoiler/flap drive units - heavy, certification-sensitive rotables with deep repair value.",
    valueWeight: 0.032,
  },
  {
    code: 28,
    title: "Fuel",
    group: "airframe_systems",
    blurb: "Tanks, boost and transfer pumps, valves and quantity indication across the airframe fuel system.",
    valueWeight: 0.018,
  },
  {
    code: 29,
    title: "Hydraulic Power",
    group: "airframe_systems",
    blurb: "Engine-driven and electric pumps, reservoirs and accumulators feeding gear, brakes and flight controls.",
    valueWeight: 0.028,
  },
  {
    code: 30,
    title: "Ice and Rain Protection",
    group: "airframe_systems",
    blurb: "Wing and cowl anti-ice, probe heat and windshield heat - failures here drive seasonal AOG demand.",
    valueWeight: 0.012,
  },
  {
    code: 31,
    title: "Indicating/Recording Systems",
    group: "avionics",
    blurb: "Display units, data acquisition and flight data recorders that tie the rest of the aircraft to the flight deck.",
    valueWeight: 0.022,
  },
  {
    code: 32,
    title: "Landing Gear",
    group: "airframe_systems",
    blurb: "Legs, wheels, carbon brakes and extension/retraction - overhaul-heavy, life-limited and second only to engines in value.",
    valueWeight: 0.085,
  },
  {
    code: 33,
    title: "Lights",
    group: "utilities",
    blurb: "Exterior, cabin and emergency lighting; LED retrofits keep a steady trade in removed incandescent units.",
    valueWeight: 0.010,
  },
  {
    code: 34,
    title: "Navigation",
    group: "avionics",
    blurb: "IRS, air data, radio nav, weather radar and GPS - the densest concentration of high-value avionics on the aircraft.",
    valueWeight: 0.070,
  },
  {
    code: 35,
    title: "Oxygen",
    group: "utilities",
    blurb: "Crew and passenger oxygen, including chemical generators with firm calendar expiry dates.",
    valueWeight: 0.008,
  },
  {
    code: 36,
    title: "Pneumatic",
    group: "airframe_systems",
    blurb: "Engine bleed air ducting, precoolers and valves supplying packs, anti-ice and engine start.",
    valueWeight: 0.014,
  },
  {
    code: 38,
    title: "Water/Waste",
    group: "utilities",
    blurb: "Potable water and lavatory waste systems - low value per unit but consistently consumed.",
    valueWeight: 0.007,
  },
  {
    code: 45,
    title: "Central Maintenance System",
    group: "avionics",
    blurb: "Onboard fault correlation and BITE reporting that decides which LRU a line engineer actually pulls.",
    valueWeight: 0.009,
  },
  {
    code: 46,
    title: "Information Systems",
    group: "avionics",
    blurb: "EFB, cabin connectivity and onboard networks - the newest and fastest-moving avionics trade.",
    valueWeight: 0.011,
  },
  {
    code: 49,
    title: "Airborne Auxiliary Power",
    group: "propulsion",
    blurb: "The APU: a small gas turbine traded much like an engine, with its own hot-section and LLP economics.",
    valueWeight: 0.030,
  },
  {
    code: 51,
    title: "Standard Practices/Structures",
    group: "structures",
    blurb: "Structural repair fundamentals - materials, fasteners, corrosion control and approved repair schemes.",
    valueWeight: 0.006,
  },
  {
    code: 52,
    title: "Doors",
    group: "structures",
    blurb: "Passenger, cargo, service and landing gear doors with their latching and warning systems.",
    valueWeight: 0.012,
  },
  {
    code: 53,
    title: "Fuselage",
    group: "structures",
    blurb: "Frames, skins, stringers and pressure bulkheads; repair history here dominates airframe residual value.",
    valueWeight: 0.014,
  },
  {
    code: 54,
    title: "Nacelles/Pylons",
    group: "structures",
    blurb: "Cowls, thrust reversers and engine pylons - the most frequently damaged structural parts in daily service.",
    valueWeight: 0.016,
  },
  {
    code: 55,
    title: "Stabilizers",
    group: "structures",
    blurb: "Horizontal and vertical stabilizers with their elevator and rudder attach structure.",
    valueWeight: 0.008,
  },
  {
    code: 56,
    title: "Windows",
    group: "structures",
    blurb: "Flight deck windows and cabin windows, replaced on condition for crazing, delamination and heat failure.",
    valueWeight: 0.009,
  },
  {
    code: 57,
    title: "Wings",
    group: "structures",
    blurb: "Wing box, leading and trailing edge structure and the attach fittings for slats, flaps and gear.",
    valueWeight: 0.013,
  },
  {
    code: 61,
    title: "Propellers",
    group: "propulsion",
    blurb: "Propeller blades, hubs and governors on turboprops, overhauled on hard calendar and hour limits.",
    valueWeight: 0.010,
  },
  {
    code: 71,
    title: "Power Plant",
    group: "propulsion",
    blurb: "The installed powerplant as a whole - mounts, cowling, drains and the QEC that turns a bare engine into a shipset.",
    valueWeight: 0.035,
  },
  {
    code: 72,
    title: "Engine",
    group: "propulsion",
    blurb: "Fan, compressor, combustor and turbine modules including the life-limited discs and shafts that carry most of an engine's value.",
    valueWeight: 0.180,
  },
  {
    code: 73,
    title: "Engine Fuel and Control",
    group: "propulsion",
    blurb: "HMU, fuel pumps, metering units and FADEC channels - expensive accessories with long shop turnaround.",
    valueWeight: 0.055,
  },
  {
    code: 74,
    title: "Ignition",
    group: "propulsion",
    blurb: "Exciters, igniter leads and plugs, consumed steadily and replaced at every shop visit.",
    valueWeight: 0.006,
  },
  {
    code: 75,
    title: "Air",
    group: "propulsion",
    blurb: "Engine internal cooling and compressor bleed control including handling bleed and variable geometry actuation.",
    valueWeight: 0.007,
  },
  {
    code: 76,
    title: "Engine Controls",
    group: "propulsion",
    blurb: "Thrust lever quadrant, control cables and the interface between the flight deck and the engine control unit.",
    valueWeight: 0.009,
  },
  {
    code: 77,
    title: "Engine Indicating",
    group: "propulsion",
    blurb: "N1, N2, EGT and vibration sensing - cheap parts whose drift decides whether an engine gets removed.",
    valueWeight: 0.008,
  },
  {
    code: 78,
    title: "Exhaust",
    group: "propulsion",
    blurb: "Exhaust nozzle, plug and thrust reverser actuation on the hot end of the engine.",
    valueWeight: 0.011,
  },
  {
    code: 79,
    title: "Oil",
    group: "propulsion",
    blurb: "Engine oil tanks, pumps, coolers, filters and chip detectors; oil system debris is the classic teardown trigger.",
    valueWeight: 0.040,
  },
  {
    code: 80,
    title: "Starting",
    group: "propulsion",
    blurb: "Air turbine starters and starter air valves, cycled every flight and overhauled on condition.",
    valueWeight: 0.009,
  },
  {
    code: 82,
    title: "Water Injection",
    group: "propulsion",
    blurb: "Thrust augmentation by water injection - rare on modern fleets, so surplus parts trade thinly.",
    valueWeight: 0.002,
  },
  {
    code: 83,
    title: "Accessory Gearboxes",
    group: "propulsion",
    blurb: "The gearbox that drives the IDG, hydraulic pump and fuel pump off the engine core.",
    valueWeight: 0.012,
  },
];

const CHAPTER_BY_CODE: ReadonlyMap<number, AtaChapter> = new Map(
  ATA_CHAPTERS.map((chapter) => [chapter.code, chapter] as const),
);

/** Chapter record for a code, or undefined when the code is outside the taxonomy. */
export function ataChapter(code: number): AtaChapter | undefined {
  return CHAPTER_BY_CODE.get(code);
}

/** Real chapter title, falling back to "ATA <code>" for chapters we do not model. */
export function ataTitle(code: number): string {
  return CHAPTER_BY_CODE.get(code)?.title ?? `ATA ${code}`;
}

/** Full chip label, e.g. "ATA 32 · Landing Gear". */
export function ataLabel(code: number): string {
  const chapter = CHAPTER_BY_CODE.get(code);
  if (!chapter) return `ATA ${code}`;
  return `ATA ${chapter.code}${LABEL_SEPARATOR}${chapter.title}`;
}

/** Group for a code. Unknown codes fall back to "general". */
export function ataGroupOf(code: number): AtaGroup {
  return CHAPTER_BY_CODE.get(code)?.group ?? "general";
}

/** Every modelled chapter in a group, in code order. */
export function chaptersInGroup(group: AtaGroup): AtaChapter[] {
  return ATA_CHAPTERS.filter((chapter) => chapter.group === group);
}

/** One row of an ATA chip rollup. */
export type AtaRollup = {
  code: number;
  title: string;
  group: AtaGroup;
  count: number;
};

/**
 * Count items per ATA chapter, heaviest first. Ties break by aftermarket weight and
 * then by code so the UI order is stable for a given input.
 */
export function groupAtaCounts<T>(items: readonly T[], codeOf: (item: T) => number): AtaRollup[] {
  const counts = new Map<number, number>();
  for (const item of items) {
    const code = codeOf(item);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const rows: AtaRollup[] = [];
  for (const [code, count] of counts) {
    rows.push({ code, title: ataTitle(code), group: ataGroupOf(code), count });
  }
  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const weightA = CHAPTER_BY_CODE.get(a.code)?.valueWeight ?? 0;
    const weightB = CHAPTER_BY_CODE.get(b.code)?.valueWeight ?? 0;
    if (weightB !== weightA) return weightB - weightA;
    return a.code - b.code;
  });
  return rows;
}

/**
 * How much a set of known chapters helps in a target chapter.
 * 1 for an exact chapter, ATA_GROUP_AFFINITY for a chapter in the same group, else 0.
 * Group credit only applies between chapters that are both in the taxonomy.
 */
export function ataAffinityBonus(known: number[], code: number): number {
  if (known.length === 0) return 0;
  const target = CHAPTER_BY_CODE.get(code);
  let best = 0;
  for (const candidate of known) {
    if (candidate === code) return 1;
    if (!target) continue;
    const chapter = CHAPTER_BY_CODE.get(candidate);
    if (chapter && chapter.group === target.group) best = Math.max(best, ATA_GROUP_AFFINITY);
  }
  return best;
}

const PART_NUMBER_ATA = /^AAT-(\d{1,3})-(\d{1,6})$/i;

/** Recover the ATA chapter from an "AAT-24-0001" style part id. Null when it does not parse. */
export function partNumberAta(partId: string): number | null {
  const match = PART_NUMBER_ATA.exec(partId.trim());
  if (!match) return null;
  const code = Number.parseInt(match[1]!, 10);
  if (!Number.isInteger(code) || code < 1 || code > 99) return null;
  return code;
}

/**
 * Broad asset class implied by a chapter. "llp" is a category decided by the caller
 * from the part master, not by the chapter, so it is never returned here.
 */
export function ataAssetClass(code: number): AssetClass {
  if (code === 71 || (code >= 72 && code <= 83)) return "engine";
  if (code >= 51 && code <= 57) return "airframe";
  return "component";
}
