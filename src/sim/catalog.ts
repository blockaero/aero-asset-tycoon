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

const ARCHETYPES: Archetype[] = [
  { name: "Integrated Drive Generator", ata: 24, category: "rotable", seriesIds: ["A320-200", "737-800"], positions: 2, removalMode: "conditionmonitored", listPrice: 88_000, mtbrFh: 9_500, mtboFh: 18_000, repairable: true },
  { name: "Generator Control Unit", ata: 24, category: "rotable", seriesIds: ["A320-200", "737-800", "E175"], positions: 2, removalMode: "oncondition", listPrice: 34_000, mtbrFh: 12_000, repairable: true },
  { name: "Air Cycle Machine", ata: 21, category: "rotable", seriesIds: ["A320-200", "737-800", "E175"], positions: 2, removalMode: "conditionmonitored", listPrice: 72_000, mtbrFh: 8_500, mtboFh: 16_000, repairable: true },
  { name: "Pack Flow Control Valve", ata: 21, category: "repairable", seriesIds: ["A320-200", "737-800"], positions: 2, removalMode: "oncondition", listPrice: 28_000, mtbrFh: 7_800, repairable: true, berBase: 0.12 },
  { name: "Hydraulic Engine-Driven Pump", ata: 29, category: "rotable", seriesIds: ["A320-200", "737-800", "E175"], positions: 2, removalMode: "conditionmonitored", listPrice: 46_000, mtbrFh: 10_500, repairable: true },
  { name: "Electric Hydraulic Pump", ata: 29, category: "rotable", seriesIds: ["A320-200", "737-800"], positions: 1, removalMode: "oncondition", listPrice: 39_000, mtbrFh: 13_000, repairable: true },
  { name: "Main Wheel Assembly", ata: 32, category: "rotable", seriesIds: ["A320-200", "737-800", "E175"], positions: 4, removalMode: "oncondition", listPrice: 16_000, mtbrFh: 5_000, mtboFh: 10_000, repairable: true },
  { name: "Carbon Brake Assembly", ata: 32, category: "rotable", seriesIds: ["A320-200", "737-800", "E175"], positions: 4, removalMode: "conditionmonitored", listPrice: 31_000, mtbrFh: 4_500, repairable: true },
  { name: "Landing Gear Selector Valve", ata: 32, category: "repairable", seriesIds: ["A320-200", "737-800"], positions: 1, removalMode: "oncondition", listPrice: 21_000, mtbrFh: 14_000, repairable: true },
  { name: "Flight Control Actuator", ata: 27, category: "rotable", seriesIds: ["A320-200", "737-800", "E175"], positions: 3, removalMode: "conditionmonitored", listPrice: 64_000, mtbrFh: 11_000, repairable: true },
  { name: "APU Starter Motor", ata: 49, category: "rotable", seriesIds: ["A320-200", "737-800", "E175"], positions: 1, removalMode: "oncondition", listPrice: 24_000, mtbrFh: 6_500, repairable: true },
  { name: "Engine Starter Air Valve", ata: 80, category: "repairable", seriesIds: ["CFM56-5B", "CFM56-7B", "CF34-8E"], positions: 1, removalMode: "conditionmonitored", listPrice: 42_000, mtbrFh: 9_000, repairable: true },
  { name: "Main Fuel Pump", ata: 73, category: "rotable", seriesIds: ["CFM56-5B", "CFM56-7B", "CF34-8E"], positions: 1, removalMode: "oncondition", listPrice: 95_000, mtbrFh: 12_500, mtboFh: 22_000, repairable: true },
  { name: "Fuel Metering Unit", ata: 73, category: "rotable", seriesIds: ["CFM56-5B", "CFM56-7B", "CF34-8E"], positions: 1, removalMode: "conditionmonitored", listPrice: 118_000, mtbrFh: 10_000, repairable: true },
  { name: "Fan Disk", ata: 72, category: "llp", seriesIds: ["CFM56-5B", "CFM56-7B"], positions: 1, removalMode: "hardtime", listPrice: 320_000, mtbrFh: 28_000, lifeLimitFc: 20_000 },
  { name: "High-Pressure Turbine Disk", ata: 72, category: "llp", seriesIds: ["CFM56-5B", "CFM56-7B", "CF34-8E"], positions: 1, removalMode: "hardtime", listPrice: 285_000, mtbrFh: 24_000, lifeLimitFh: 30_000, lifeLimitFc: 18_000 },
  { name: "Oil Filter Element", ata: 79, category: "expendable", seriesIds: ["CFM56-5B", "CFM56-7B", "CF34-8E"], positions: 1, removalMode: "hardtime", listPrice: 480, mtbrFh: 2_000, lifeLimitFh: 2_000 },
  { name: "Temperature Sensor", ata: 77, category: "expendable", seriesIds: ["CFM56-5B", "CFM56-7B", "CF34-8E"], positions: 4, removalMode: "oncondition", listPrice: 2_600, mtbrFh: 15_000 },
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
