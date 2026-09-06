import type { Rng } from "./rng.ts";
import type { Category, PartMaster, Series } from "./types.ts";

export const SERIES: Series[] = [
  {
    id: "A320-200",
    name: "Airbus A320-200",
    family: "A320ceo",
    kind: "airframe",
    class: "narrowbody",
    fhPerDay: 10,
    fcPerDay: 4.5,
  },
  {
    id: "737-800",
    name: "Boeing 737-800",
    family: "737NG",
    kind: "airframe",
    class: "narrowbody",
    fhPerDay: 10.5,
    fcPerDay: 4.2,
  },
  {
    id: "E175",
    name: "Embraer E175",
    family: "E-Jet",
    kind: "airframe",
    class: "regional",
    fhPerDay: 8,
    fcPerDay: 5,
  },
  {
    id: "CFM56-5B",
    name: "CFM56-5B",
    family: "CFM56",
    kind: "engine",
    class: "narrowbody",
    fhPerDay: 10,
    fcPerDay: 4.5,
  },
  {
    id: "CFM56-7B",
    name: "CFM56-7B",
    family: "CFM56",
    kind: "engine",
    class: "narrowbody",
    fhPerDay: 10.5,
    fcPerDay: 4.2,
  },
  {
    id: "CF34-8E",
    name: "GE CF34-8E",
    family: "CF34",
    kind: "engine",
    class: "regional",
    fhPerDay: 8,
    fcPerDay: 5,
  },
];

export const ENGINE_ON: Record<string, string> = {
  "A320-200": "CFM56-5B",
  "737-800": "CFM56-7B",
  E175: "CF34-8E",
};

type Archetype = {
  name: string;
  ata: number;
  category: Category;
  seriesIds: string[];
  positions: number;
  removalMode: PartMaster["removalMode"];
  listPrice: number;
  mtbrFh: number;
  mtboFh?: number;
  lifeLimitFh?: number;
  lifeLimitFc?: number;
  repairable?: boolean;
  berBase?: number;
};

const NB = ["A320-200", "737-800"];
const ALL_AIRFRAMES = ["A320-200", "737-800", "E175"];
const ALL_ENGINES = ["CFM56-5B", "CFM56-7B", "CF34-8E"];
const CFM = ["CFM56-5B", "CFM56-7B"];

/**
 * Component archetypes spanning the ATA 100 chapters that carry real aftermarket value.
 * The ATA chapter is the primary axis the player trades, learns, and filters on, so the
 * catalog deliberately spreads across airframe systems, structures, avionics, and propulsion.
 */
const ARCHETYPES: Archetype[] = [
  // ATA 21 — Air Conditioning
  { name: "Air Cycle Machine", ata: 21, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "conditionmonitored", listPrice: 72_000, mtbrFh: 8_500, mtboFh: 16_000, repairable: true },
  { name: "Pack Flow Control Valve", ata: 21, category: "repairable", seriesIds: NB, positions: 2, removalMode: "oncondition", listPrice: 28_000, mtbrFh: 7_800, repairable: true, berBase: 0.12 },
  { name: "Cabin Pressure Controller", ata: 21, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "oncondition", listPrice: 41_000, mtbrFh: 11_500, repairable: true },
  // ATA 22 — Auto Flight
  { name: "Flight Control Computer", ata: 22, category: "rotable", seriesIds: NB, positions: 3, removalMode: "oncondition", listPrice: 165_000, mtbrFh: 16_000, repairable: true },
  { name: "Autopilot Servo Actuator", ata: 22, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 3, removalMode: "conditionmonitored", listPrice: 58_000, mtbrFh: 12_400, repairable: true },
  // ATA 23 — Communications
  { name: "VHF Transceiver", ata: 23, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 3, removalMode: "oncondition", listPrice: 34_000, mtbrFh: 18_000, repairable: true },
  { name: "Cockpit Voice Recorder", ata: 23, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 1, removalMode: "oncondition", listPrice: 47_000, mtbrFh: 22_000, repairable: true },
  { name: "Audio Management Unit", ata: 23, category: "repairable", seriesIds: NB, positions: 1, removalMode: "oncondition", listPrice: 26_000, mtbrFh: 15_500, repairable: true, berBase: 0.1 },
  // ATA 24 — Electrical Power
  { name: "Integrated Drive Generator", ata: 24, category: "rotable", seriesIds: NB, positions: 2, removalMode: "conditionmonitored", listPrice: 88_000, mtbrFh: 9_500, mtboFh: 18_000, repairable: true },
  { name: "Generator Control Unit", ata: 24, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "oncondition", listPrice: 34_000, mtbrFh: 12_000, repairable: true },
  { name: "Transformer Rectifier Unit", ata: 24, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 3, removalMode: "oncondition", listPrice: 22_000, mtbrFh: 13_500, repairable: true },
  { name: "Bus Power Control Unit", ata: 24, category: "rotable", seriesIds: NB, positions: 2, removalMode: "oncondition", listPrice: 39_000, mtbrFh: 14_000, repairable: true },
  { name: "Main Aircraft Battery", ata: 24, category: "expendable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "hardtime", listPrice: 8_400, mtbrFh: 4_000, lifeLimitFh: 4_000 },
  // ATA 25 — Equipment and Furnishings
  { name: "Escape Slide Assembly", ata: 25, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 4, removalMode: "hardtime", listPrice: 52_000, mtbrFh: 9_000, lifeLimitFh: 15_600, repairable: true },
  { name: "Galley Insert Oven", ata: 25, category: "repairable", seriesIds: NB, positions: 4, removalMode: "oncondition", listPrice: 14_500, mtbrFh: 6_200, repairable: true, berBase: 0.16 },
  // ATA 26 — Fire Protection
  { name: "Cargo Fire Extinguisher Bottle", ata: 26, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "hardtime", listPrice: 31_000, mtbrFh: 12_000, lifeLimitFh: 26_000, repairable: true },
  { name: "Engine Fire Detection Loop", ata: 26, category: "repairable", seriesIds: ALL_ENGINES, positions: 2, removalMode: "oncondition", listPrice: 18_500, mtbrFh: 10_800, repairable: true, berBase: 0.14 },
  // ATA 27 — Flight Controls
  { name: "Flight Control Actuator", ata: 27, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 3, removalMode: "conditionmonitored", listPrice: 64_000, mtbrFh: 11_000, repairable: true },
  { name: "Spoiler Servo Control", ata: 27, category: "rotable", seriesIds: NB, positions: 4, removalMode: "conditionmonitored", listPrice: 57_000, mtbrFh: 10_200, repairable: true },
  { name: "Flap Slat Electronics Unit", ata: 27, category: "rotable", seriesIds: NB, positions: 2, removalMode: "oncondition", listPrice: 92_000, mtbrFh: 15_000, repairable: true },
  { name: "Rudder Power Control Unit", ata: 27, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "conditionmonitored", listPrice: 108_000, mtbrFh: 13_000, mtboFh: 24_000, repairable: true },
  // ATA 28 — Fuel
  { name: "Fuel Boost Pump", ata: 28, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 4, removalMode: "conditionmonitored", listPrice: 26_500, mtbrFh: 7_400, repairable: true },
  { name: "Fuel Quantity Processor Unit", ata: 28, category: "rotable", seriesIds: NB, positions: 1, removalMode: "oncondition", listPrice: 44_000, mtbrFh: 16_500, repairable: true },
  // ATA 29 — Hydraulic Power
  { name: "Hydraulic Engine-Driven Pump", ata: 29, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "conditionmonitored", listPrice: 46_000, mtbrFh: 10_500, repairable: true },
  { name: "Electric Hydraulic Pump", ata: 29, category: "rotable", seriesIds: NB, positions: 1, removalMode: "oncondition", listPrice: 39_000, mtbrFh: 13_000, repairable: true },
  { name: "Hydraulic Accumulator", ata: 29, category: "repairable", seriesIds: ALL_AIRFRAMES, positions: 3, removalMode: "hardtime", listPrice: 12_800, mtbrFh: 9_000, lifeLimitFh: 20_000, repairable: true, berBase: 0.13 },
  // ATA 30 — Ice and Rain Protection
  { name: "Wing Anti-Ice Valve", ata: 30, category: "repairable", seriesIds: NB, positions: 2, removalMode: "oncondition", listPrice: 23_000, mtbrFh: 8_900, repairable: true, berBase: 0.12 },
  { name: "Windshield Heat Controller", ata: 30, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "oncondition", listPrice: 17_500, mtbrFh: 11_200, repairable: true },
  // ATA 31 — Indicating and Recording Systems
  { name: "Flight Data Recorder", ata: 31, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 1, removalMode: "oncondition", listPrice: 63_000, mtbrFh: 21_000, repairable: true },
  { name: "Multifunction Display Unit", ata: 31, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 6, removalMode: "oncondition", listPrice: 78_000, mtbrFh: 14_500, repairable: true },
  { name: "Data Concentrator Unit", ata: 31, category: "rotable", seriesIds: NB, positions: 2, removalMode: "oncondition", listPrice: 51_000, mtbrFh: 17_000, repairable: true },
  // ATA 32 — Landing Gear
  { name: "Main Wheel Assembly", ata: 32, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 4, removalMode: "oncondition", listPrice: 16_000, mtbrFh: 5_000, mtboFh: 10_000, repairable: true },
  { name: "Carbon Brake Assembly", ata: 32, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 4, removalMode: "conditionmonitored", listPrice: 31_000, mtbrFh: 4_500, repairable: true },
  { name: "Landing Gear Selector Valve", ata: 32, category: "repairable", seriesIds: NB, positions: 1, removalMode: "oncondition", listPrice: 21_000, mtbrFh: 14_000, repairable: true },
  { name: "Main Landing Gear Shock Strut", ata: 32, category: "llp", seriesIds: NB, positions: 2, removalMode: "hardtime", listPrice: 410_000, mtbrFh: 26_000, lifeLimitFc: 60_000 },
  { name: "Nose Wheel Steering Actuator", ata: 32, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 1, removalMode: "conditionmonitored", listPrice: 54_000, mtbrFh: 9_800, repairable: true },
  { name: "Brake Control Unit", ata: 32, category: "rotable", seriesIds: NB, positions: 2, removalMode: "oncondition", listPrice: 68_000, mtbrFh: 15_200, repairable: true },
  // ATA 33 — Lights
  { name: "Landing Light Assembly", ata: 33, category: "expendable", seriesIds: ALL_AIRFRAMES, positions: 4, removalMode: "oncondition", listPrice: 4_200, mtbrFh: 3_600 },
  { name: "Emergency Light Power Supply", ata: 33, category: "repairable", seriesIds: NB, positions: 2, removalMode: "hardtime", listPrice: 9_600, mtbrFh: 8_000, lifeLimitFh: 18_000, repairable: true, berBase: 0.15 },
  // ATA 34 — Navigation
  { name: "Air Data Inertial Reference Unit", ata: 34, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 3, removalMode: "oncondition", listPrice: 158_000, mtbrFh: 19_000, repairable: true },
  { name: "Radio Altimeter Transceiver", ata: 34, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "oncondition", listPrice: 43_000, mtbrFh: 16_800, repairable: true },
  { name: "Weather Radar Transceiver", ata: 34, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 1, removalMode: "oncondition", listPrice: 96_000, mtbrFh: 14_200, repairable: true },
  { name: "Traffic Collision Avoidance Computer", ata: 34, category: "rotable", seriesIds: NB, positions: 1, removalMode: "oncondition", listPrice: 112_000, mtbrFh: 20_000, repairable: true },
  // ATA 35 — Oxygen
  { name: "Crew Oxygen Cylinder", ata: 35, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "hardtime", listPrice: 11_500, mtbrFh: 10_000, lifeLimitFh: 26_000, repairable: true },
  // ATA 36 — Pneumatic
  { name: "Bleed Air Regulating Valve", ata: 36, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "conditionmonitored", listPrice: 37_000, mtbrFh: 7_100, repairable: true },
  { name: "Precooler Heat Exchanger", ata: 36, category: "repairable", seriesIds: NB, positions: 2, removalMode: "oncondition", listPrice: 61_000, mtbrFh: 12_600, repairable: true, berBase: 0.11 },
  // ATA 38 — Water and Waste
  { name: "Vacuum Waste Generator", ata: 38, category: "repairable", seriesIds: NB, positions: 2, removalMode: "oncondition", listPrice: 15_800, mtbrFh: 5_900, repairable: true, berBase: 0.17 },
  // ATA 45 — Central Maintenance System
  { name: "Central Maintenance Computer", ata: 45, category: "rotable", seriesIds: NB, positions: 1, removalMode: "oncondition", listPrice: 87_000, mtbrFh: 18_500, repairable: true },
  // ATA 49 — Airborne Auxiliary Power
  { name: "APU Starter Motor", ata: 49, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 1, removalMode: "oncondition", listPrice: 24_000, mtbrFh: 6_500, repairable: true },
  { name: "APU Fuel Control Unit", ata: 49, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 1, removalMode: "conditionmonitored", listPrice: 58_000, mtbrFh: 8_800, repairable: true },
  { name: "APU Generator", ata: 49, category: "rotable", seriesIds: NB, positions: 1, removalMode: "conditionmonitored", listPrice: 76_000, mtbrFh: 9_400, mtboFh: 17_500, repairable: true },
  { name: "APU Load Compressor", ata: 49, category: "rotable", seriesIds: NB, positions: 1, removalMode: "conditionmonitored", listPrice: 134_000, mtbrFh: 11_800, mtboFh: 21_000, repairable: true },
  // ATA 52 — Doors
  { name: "Cargo Door Actuator", ata: 52, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "conditionmonitored", listPrice: 33_000, mtbrFh: 8_200, repairable: true },
  { name: "Passenger Door Damper", ata: 52, category: "repairable", seriesIds: NB, positions: 4, removalMode: "oncondition", listPrice: 13_400, mtbrFh: 9_600, repairable: true, berBase: 0.14 },
  // ATA 54 — Nacelles and Pylons
  { name: "Thrust Reverser Actuator", ata: 54, category: "rotable", seriesIds: ALL_ENGINES, positions: 4, removalMode: "conditionmonitored", listPrice: 71_000, mtbrFh: 9_100, repairable: true },
  { name: "Nacelle Cowl Latch Assembly", ata: 54, category: "repairable", seriesIds: ALL_ENGINES, positions: 6, removalMode: "oncondition", listPrice: 7_800, mtbrFh: 7_000, repairable: true, berBase: 0.18 },
  // ATA 56 — Windows
  { name: "Cockpit Windshield Assembly", ata: 56, category: "rotable", seriesIds: ALL_AIRFRAMES, positions: 2, removalMode: "oncondition", listPrice: 68_000, mtbrFh: 8_400, repairable: true },
  // ATA 57 — Wings
  { name: "Winglet Tip Assembly", ata: 57, category: "repairable", seriesIds: NB, positions: 2, removalMode: "oncondition", listPrice: 96_000, mtbrFh: 18_000, repairable: true, berBase: 0.1 },
  // ATA 71 — Power Plant
  { name: "Engine Mount Assembly", ata: 71, category: "rotable", seriesIds: ALL_ENGINES, positions: 2, removalMode: "hardtime", listPrice: 145_000, mtbrFh: 22_000, lifeLimitFc: 30_000, repairable: true },
  { name: "Quick Engine Change Kit", ata: 71, category: "rotable", seriesIds: CFM, positions: 1, removalMode: "conditionmonitored", listPrice: 420_000, mtbrFh: 20_000, repairable: true },
  // ATA 72 — Engine
  { name: "Fan Disk", ata: 72, category: "llp", seriesIds: CFM, positions: 1, removalMode: "hardtime", listPrice: 320_000, mtbrFh: 28_000, lifeLimitFc: 20_000 },
  { name: "High-Pressure Turbine Disk", ata: 72, category: "llp", seriesIds: ALL_ENGINES, positions: 1, removalMode: "hardtime", listPrice: 285_000, mtbrFh: 24_000, lifeLimitFh: 30_000, lifeLimitFc: 18_000 },
  { name: "Low-Pressure Turbine Disk", ata: 72, category: "llp", seriesIds: CFM, positions: 1, removalMode: "hardtime", listPrice: 236_000, mtbrFh: 26_000, lifeLimitFc: 22_000 },
  { name: "High-Pressure Compressor Blade Set", ata: 72, category: "rotable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "conditionmonitored", listPrice: 178_000, mtbrFh: 14_500, mtboFh: 24_000, repairable: true },
  { name: "Combustor Liner", ata: 72, category: "rotable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "conditionmonitored", listPrice: 152_000, mtbrFh: 12_000, mtboFh: 20_000, repairable: true },
  // ATA 73 — Engine Fuel and Control
  { name: "Main Fuel Pump", ata: 73, category: "rotable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "oncondition", listPrice: 95_000, mtbrFh: 12_500, mtboFh: 22_000, repairable: true },
  { name: "Fuel Metering Unit", ata: 73, category: "rotable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "conditionmonitored", listPrice: 118_000, mtbrFh: 10_000, repairable: true },
  { name: "Electronic Engine Control", ata: 73, category: "rotable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "oncondition", listPrice: 205_000, mtbrFh: 17_500, repairable: true },
  // ATA 74 — Ignition
  { name: "Ignition Exciter Box", ata: 74, category: "rotable", seriesIds: ALL_ENGINES, positions: 2, removalMode: "oncondition", listPrice: 19_400, mtbrFh: 9_200, repairable: true },
  { name: "Igniter Plug", ata: 74, category: "expendable", seriesIds: ALL_ENGINES, positions: 2, removalMode: "hardtime", listPrice: 1_850, mtbrFh: 3_000, lifeLimitFh: 3_000 },
  // ATA 75 — Air
  { name: "Variable Bleed Valve Actuator", ata: 75, category: "repairable", seriesIds: CFM, positions: 2, removalMode: "conditionmonitored", listPrice: 29_500, mtbrFh: 8_600, repairable: true, berBase: 0.12 },
  { name: "Turbine Case Cooling Valve", ata: 75, category: "rotable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "oncondition", listPrice: 36_000, mtbrFh: 11_400, repairable: true },
  // ATA 76 — Engine Controls
  { name: "Thrust Lever Resolver", ata: 76, category: "repairable", seriesIds: NB, positions: 2, removalMode: "oncondition", listPrice: 16_200, mtbrFh: 13_800, repairable: true, berBase: 0.13 },
  // ATA 77 — Engine Indicating
  { name: "Exhaust Gas Temperature Harness", ata: 77, category: "expendable", seriesIds: ALL_ENGINES, positions: 2, removalMode: "oncondition", listPrice: 6_800, mtbrFh: 5_400 },
  { name: "Engine Temperature Sensor", ata: 77, category: "expendable", seriesIds: ALL_ENGINES, positions: 4, removalMode: "oncondition", listPrice: 2_600, mtbrFh: 15_000 },
  { name: "Engine Vibration Sensor", ata: 77, category: "repairable", seriesIds: ALL_ENGINES, positions: 2, removalMode: "oncondition", listPrice: 11_900, mtbrFh: 12_200, repairable: true, berBase: 0.15 },
  // ATA 78 — Exhaust
  { name: "Thrust Reverser Cascade Segment", ata: 78, category: "repairable", seriesIds: ALL_ENGINES, positions: 8, removalMode: "oncondition", listPrice: 22_400, mtbrFh: 10_600, repairable: true, berBase: 0.14 },
  // ATA 79 — Oil
  { name: "Oil Filter Element", ata: 79, category: "expendable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "hardtime", listPrice: 480, mtbrFh: 2_000, lifeLimitFh: 2_000 },
  { name: "Lube and Scavenge Pump", ata: 79, category: "rotable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "conditionmonitored", listPrice: 84_000, mtbrFh: 11_600, mtboFh: 19_500, repairable: true },
  { name: "Engine Oil Cooler", ata: 79, category: "repairable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "oncondition", listPrice: 47_500, mtbrFh: 13_400, repairable: true, berBase: 0.11 },
  // ATA 80 — Starting
  { name: "Engine Starter Air Valve", ata: 80, category: "repairable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "conditionmonitored", listPrice: 42_000, mtbrFh: 9_000, repairable: true },
  { name: "Air Turbine Starter", ata: 80, category: "rotable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "conditionmonitored", listPrice: 66_000, mtbrFh: 7_900, mtboFh: 15_000, repairable: true },
  // ATA 83 — Accessory Gearboxes
  { name: "Accessory Gearbox Assembly", ata: 83, category: "rotable", seriesIds: ALL_ENGINES, positions: 1, removalMode: "conditionmonitored", listPrice: 196_000, mtbrFh: 15_800, mtboFh: 26_000, repairable: true },
  { name: "Transfer Gearbox", ata: 83, category: "rotable", seriesIds: CFM, positions: 1, removalMode: "conditionmonitored", listPrice: 121_000, mtbrFh: 16_400, repairable: true },
];

function fictionalPartNumber(ata: number, sequence: number): string {
  return `AAT-${String(ata).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;
}

export function buildCatalog(rng: Rng, partCount: number): PartMaster[] {
  const parts: PartMaster[] = [];
  for (let i = 0; i < partCount; i++) {
    const source = ARCHETYPES[i % ARCHETYPES.length]!;
    const generation = Math.floor(i / ARCHETYPES.length);
    const applicationSeriesId = source.seriesIds[(generation + i) % source.seriesIds.length]!;
    const application = SERIES.find((series) => series.id === applicationSeriesId);
    const priceJitter = generation === 0 ? 1 : rng.float(0.86, 1.18);
    const intervalJitter = generation === 0 ? 1 : rng.float(0.9, 1.12);
    const suffix = generation === 0 ? "" : ` · Variant ${generation + 1}`;
    const repairable = source.repairable ?? false;
    const mtburFh =
      source.removalMode === "hardtime"
        ? null
        : Math.round(source.mtbrFh * intervalJitter);
    const mtboFh = source.mtboFh ? Math.round(source.mtboFh * intervalJitter) : null;
    const combinedMtbrFh =
      mtburFh && mtboFh
        ? Math.round(1 / (1 / mtburFh + 1 / mtboFh))
        : mtburFh ?? Math.round(source.mtbrFh * intervalJitter);
    parts.push({
      id: fictionalPartNumber(source.ata, i + 1),
      name: `${source.name} · ${application?.name ?? applicationSeriesId}${suffix}`,
      ata: source.ata,
      category: source.category,
      seriesIds: [applicationSeriesId],
      positions: source.positions,
      removalMode: source.removalMode,
      lifeLimitFh: source.lifeLimitFh ? Math.round(source.lifeLimitFh * intervalJitter) : null,
      lifeLimitFc: source.lifeLimitFc ? Math.round(source.lifeLimitFc * intervalJitter) : null,
      mtbrFh: combinedMtbrFh,
      mtburFh,
      mtboFh,
      listPrice: Math.max(50, Math.round(source.listPrice * priceJitter)),
      berBase: source.berBase ?? (source.category === "repairable" ? 0.12 : repairable ? 0.05 : 0.2),
      shopTurnMin: source.category === "llp" ? 8 : repairable ? 4 : 2,
      shopTurnMax: source.category === "llp" ? 12 : repairable ? 9 : 4,
      repairable,
      serialized: !["expendable", "consumable", "standard"].includes(source.category),
    });
  }
  return parts;
}
