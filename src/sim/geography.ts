/**
 * World geography for the v2 map.
 *
 * Fourteen market regions tile a 0..100 x 0..100 map space. The rectangles are a
 * coarse equirectangular projection: x runs west to east, y runs north to south,
 * and no two rectangles overlap so the map renderer can hit-test a point against a
 * single region. Country lists are real sovereign states (plus Kosovo, Palestine,
 * Taiwan and Vatican City) assigned to exactly one region each, following the UN
 * M49 geoscheme where the aftermarket does not disagree with it.
 *
 * The four indices are game data, calibrated against how the aviation aftermarket
 * actually behaves: North America and Western Europe carry the demand and the shop
 * labour cost, Southeast Asia and Eastern Europe are the low-cost repair basins,
 * and Africa and Central Asia are thin demand at the end of a long logistics tail.
 *
 * Pure module: only const lookup tables are built at load, nothing else happens.
 */
import type { Region, RegionCode } from "./types.ts";
import type { Rng } from "./rng.ts";

/**
 * Every region, in RegionCode declaration order.
 *
 * Rectangles are non-overlapping tiles of the 0..100 map space. A country belongs
 * to a region by market convention, not by whether its landmass falls inside the
 * region's rectangle; the rectangle is where the map draws the region.
 */
export const REGIONS: Region[] = [
  {
    code: "NA",
    name: "North America",
    countries: ["Canada", "United States", "Mexico"],
    x: 3,
    y: 4,
    width: 30,
    height: 34,
    facilityDensity: 22,
    demandBase: 1.35,
    labourIndex: 1.35,
    logisticsPenalty: 0.4,
  },
  {
    code: "CARIB",
    name: "Caribbean",
    countries: [
      "Antigua and Barbuda",
      "Bahamas",
      "Barbados",
      "Cuba",
      "Dominica",
      "Dominican Republic",
      "Grenada",
      "Haiti",
      "Jamaica",
      "Saint Kitts and Nevis",
      "Saint Lucia",
      "Saint Vincent and the Grenadines",
      "Trinidad and Tobago",
    ],
    x: 26,
    y: 38.5,
    width: 11,
    height: 6,
    facilityDensity: 2,
    demandBase: 0.7,
    labourIndex: 0.8,
    logisticsPenalty: 1.1,
  },
  {
    code: "LATAM",
    name: "Latin America",
    countries: [
      "Belize",
      "Costa Rica",
      "El Salvador",
      "Guatemala",
      "Honduras",
      "Nicaragua",
      "Panama",
      "Argentina",
      "Bolivia",
      "Brazil",
      "Chile",
      "Colombia",
      "Ecuador",
      "Guyana",
      "Paraguay",
      "Peru",
      "Suriname",
      "Uruguay",
      "Venezuela",
    ],
    x: 24,
    y: 45,
    width: 20,
    height: 36,
    facilityDensity: 6,
    demandBase: 0.85,
    labourIndex: 0.75,
    logisticsPenalty: 1.2,
  },
  {
    code: "EUW",
    name: "Western Europe",
    countries: [
      "Andorra",
      "Austria",
      "Belgium",
      "Cyprus",
      "Denmark",
      "Finland",
      "France",
      "Germany",
      "Greece",
      "Iceland",
      "Ireland",
      "Italy",
      "Liechtenstein",
      "Luxembourg",
      "Malta",
      "Monaco",
      "Netherlands",
      "Norway",
      "Portugal",
      "San Marino",
      "Spain",
      "Sweden",
      "Switzerland",
      "United Kingdom",
      "Vatican City",
    ],
    x: 43,
    y: 8,
    width: 11,
    height: 22,
    facilityDensity: 20,
    demandBase: 1.3,
    labourIndex: 1.4,
    logisticsPenalty: 0.5,
  },
  {
    code: "EUE",
    name: "Eastern Europe",
    countries: [
      "Albania",
      "Bosnia and Herzegovina",
      "Bulgaria",
      "Croatia",
      "Czechia",
      "Estonia",
      "Hungary",
      "Kosovo",
      "Latvia",
      "Lithuania",
      "Montenegro",
      "North Macedonia",
      "Poland",
      "Romania",
      "Serbia",
      "Slovakia",
      "Slovenia",
    ],
    x: 54.5,
    y: 14,
    width: 6.5,
    height: 16,
    facilityDensity: 6,
    demandBase: 0.9,
    labourIndex: 0.7,
    logisticsPenalty: 0.8,
  },
  {
    code: "CIS",
    name: "Russia & the CIS",
    countries: [
      "Russia",
      "Belarus",
      "Ukraine",
      "Moldova",
      "Armenia",
      "Georgia",
      "Azerbaijan",
    ],
    x: 61.5,
    y: 4,
    width: 36,
    height: 21,
    facilityDensity: 4,
    demandBase: 0.75,
    labourIndex: 0.65,
    logisticsPenalty: 1.4,
  },
  {
    code: "MEA",
    name: "Middle East & North Africa",
    countries: [
      "Turkey",
      "Israel",
      "Palestine",
      "Lebanon",
      "Syria",
      "Jordan",
      "Iraq",
      "Iran",
      "Saudi Arabia",
      "Kuwait",
      "Bahrain",
      "Qatar",
      "United Arab Emirates",
      "Oman",
      "Yemen",
      "Egypt",
      "Libya",
      "Tunisia",
      "Algeria",
      "Morocco",
    ],
    x: 52,
    y: 30.5,
    width: 14,
    height: 15,
    facilityDensity: 9,
    demandBase: 1.15,
    labourIndex: 0.95,
    logisticsPenalty: 0.7,
  },
  {
    code: "AFR",
    name: "Sub-Saharan Africa",
    countries: [
      "Angola",
      "Benin",
      "Botswana",
      "Burkina Faso",
      "Burundi",
      "Cabo Verde",
      "Cameroon",
      "Central African Republic",
      "Chad",
      "Comoros",
      "Democratic Republic of the Congo",
      "Republic of the Congo",
      "C\u00f4te d'Ivoire",
      "Djibouti",
      "Equatorial Guinea",
      "Eritrea",
      "Eswatini",
      "Ethiopia",
      "Gabon",
      "Gambia",
      "Ghana",
      "Guinea",
      "Guinea-Bissau",
      "Kenya",
      "Lesotho",
      "Liberia",
      "Madagascar",
      "Malawi",
      "Mali",
      "Mauritania",
      "Mauritius",
      "Mozambique",
      "Namibia",
      "Niger",
      "Nigeria",
      "Rwanda",
      "S\u00e3o Tom\u00e9 and Pr\u00edncipe",
      "Senegal",
      "Seychelles",
      "Sierra Leone",
      "Somalia",
      "South Africa",
      "South Sudan",
      "Sudan",
      "Tanzania",
      "Togo",
      "Uganda",
      "Zambia",
      "Zimbabwe",
    ],
    x: 45,
    y: 46,
    width: 20,
    height: 26,
    facilityDensity: 4,
    demandBase: 0.55,
    labourIndex: 0.6,
    logisticsPenalty: 1.8,
  },
  {
    code: "SASIA",
    name: "South Asia",
    countries: [
      "Afghanistan",
      "Bangladesh",
      "Bhutan",
      "India",
      "Maldives",
      "Nepal",
      "Pakistan",
      "Sri Lanka",
    ],
    x: 66.5,
    y: 34,
    width: 7,
    height: 13,
    facilityDensity: 5,
    demandBase: 0.95,
    labourIndex: 0.55,
    logisticsPenalty: 1.2,
  },
  {
    code: "SEA",
    name: "Southeast Asia",
    countries: [
      "Brunei",
      "Cambodia",
      "Indonesia",
      "Laos",
      "Malaysia",
      "Myanmar",
      "Philippines",
      "Singapore",
      "Thailand",
      "Timor-Leste",
      "Vietnam",
    ],
    x: 74,
    y: 39,
    width: 13,
    height: 12,
    facilityDensity: 9,
    demandBase: 1.05,
    labourIndex: 0.6,
    logisticsPenalty: 1,
  },
  {
    code: "GCHINA",
    name: "Greater China",
    countries: ["China", "Taiwan"],
    x: 74,
    y: 25.5,
    width: 13,
    height: 13,
    facilityDensity: 11,
    demandBase: 1.2,
    labourIndex: 0.85,
    logisticsPenalty: 0.8,
  },
  {
    code: "NEASIA",
    name: "Northeast Asia",
    countries: ["Japan", "South Korea", "North Korea", "Mongolia"],
    x: 87.5,
    y: 25.5,
    width: 8,
    height: 13,
    facilityDensity: 8,
    demandBase: 1.1,
    labourIndex: 1.25,
    logisticsPenalty: 0.9,
  },
  {
    code: "OCE",
    name: "Oceania",
    countries: [
      "Australia",
      "New Zealand",
      "Papua New Guinea",
      "Fiji",
      "Solomon Islands",
      "Vanuatu",
      "Samoa",
      "Tonga",
      "Kiribati",
      "Tuvalu",
      "Nauru",
      "Palau",
      "Marshall Islands",
      "Micronesia",
    ],
    x: 80,
    y: 52,
    width: 18,
    height: 26,
    facilityDensity: 4,
    demandBase: 0.85,
    labourIndex: 1.2,
    logisticsPenalty: 1.5,
  },
  {
    code: "CASIA",
    name: "Central Asia",
    countries: ["Kazakhstan", "Kyrgyzstan", "Tajikistan", "Turkmenistan", "Uzbekistan"],
    x: 67,
    y: 25.5,
    width: 6.5,
    height: 8,
    facilityDensity: 2,
    demandBase: 0.5,
    labourIndex: 0.55,
    logisticsPenalty: 1.9,
  },
];

/** Region codes in map order. */
export const REGION_CODES: RegionCode[] = REGIONS.map((entry) => entry.code);

const REGION_BY_CODE: ReadonlyMap<RegionCode, Region> = new Map(
  REGIONS.map((entry) => [entry.code, entry] as const),
);

/**
 * Common aliases the UI or an import file might use, normalized on both sides.
 * Every value must be a country name that appears in exactly one region above.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  "united states of america": "United States",
  america: "United States",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  holland: "Netherlands",
  uae: "United Arab Emirates",
  emirates: "United Arab Emirates",
  ksa: "Saudi Arabia",
  turkiye: "Turkey",
  "czech republic": "Czechia",
  "russian federation": "Russia",
  "republic of korea": "South Korea",
  "korea, south": "South Korea",
  "south korea": "South Korea",
  dprk: "North Korea",
  "korea, north": "North Korea",
  prc: "China",
  "mainland china": "China",
  "people's republic of china": "China",
  "hong kong": "China",
  macau: "China",
  "chinese taipei": "Taiwan",
  drc: "Democratic Republic of the Congo",
  "dr congo": "Democratic Republic of the Congo",
  "congo-kinshasa": "Democratic Republic of the Congo",
  "congo-brazzaville": "Republic of the Congo",
  congo: "Republic of the Congo",
  "ivory coast": "C\u00f4te d'Ivoire",
  burma: "Myanmar",
  "cape verde": "Cabo Verde",
  swaziland: "Eswatini",
  "east timor": "Timor-Leste",
  "holy see": "Vatican City",
  vatican: "Vatican City",
  "federated states of micronesia": "Micronesia",
  "the gambia": "Gambia",
  "the bahamas": "Bahamas",
  macedonia: "North Macedonia",
};

/** Lowercase, de-accent, collapse whitespace, straighten apostrophes. */
function normalizeCountry(country: string): string {
  return country
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const COUNTRY_TO_REGION: ReadonlyMap<string, RegionCode> = (() => {
  const map = new Map<string, RegionCode>();
  for (const entry of REGIONS) {
    for (const country of entry.countries) {
      map.set(normalizeCountry(country), entry.code);
    }
  }
  return map;
})();

/** The region record for a code. Throws on an unknown code. */
export function region(code: RegionCode): Region {
  const found = REGION_BY_CODE.get(code);
  if (!found) throw new Error(`geography: unknown region code "${code}"`);
  return found;
}

/** Distinct countries across every region. */
export function countryCount(): number {
  return COUNTRY_TO_REGION.size;
}

/** Every country in map order, deduplicated. */
export function allCountries(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of REGIONS) {
    for (const country of entry.countries) {
      const key = normalizeCountry(country);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(country);
    }
  }
  return out;
}

/** Region a country trades in. Case- and accent-insensitive. Null when unknown. */
export function regionOfCountry(country: string): RegionCode | null {
  const key = normalizeCountry(country);
  const direct = COUNTRY_TO_REGION.get(key);
  if (direct) return direct;
  const alias = COUNTRY_ALIASES[key];
  if (!alias) return null;
  return COUNTRY_TO_REGION.get(normalizeCountry(alias)) ?? null;
}

/** Sum of every region's facilityDensity. The denominator for allocateFacilities. */
export function totalFacilityDensity(): number {
  let sum = 0;
  for (const entry of REGIONS) sum += entry.facilityDensity;
  return sum;
}

/**
 * Split a facility budget across the regions in proportion to facilityDensity.
 * Largest-remainder apportionment: every region takes its floor share, then the
 * leftover facilities go to the largest fractional parts first, ties broken by map
 * order. The returned counts always sum to exactly floor(total).
 */
export function allocateFacilities(total: number): Record<RegionCode, number> {
  const out = {} as Record<RegionCode, number>;
  const budget = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const denominator = totalFacilityDensity();
  const rows = REGIONS.map((entry, index) => {
    const exact = denominator > 0 ? (budget * entry.facilityDensity) / denominator : 0;
    const base = Math.floor(exact);
    return { code: entry.code, index, base, fraction: exact - base };
  });

  let assigned = 0;
  for (const row of rows) {
    out[row.code] = row.base;
    assigned += row.base;
  }

  const byRemainder = [...rows].sort(
    (a, b) => b.fraction - a.fraction || a.index - b.index,
  );
  let remaining = budget - assigned;
  let cursor = 0;
  while (remaining > 0 && byRemainder.length > 0) {
    const row = byRemainder[cursor % byRemainder.length]!;
    out[row.code] += 1;
    remaining -= 1;
    cursor += 1;
  }
  return out;
}

/** Centre of a region's rectangle in map space. */
export function regionCentre(code: RegionCode): { x: number; y: number } {
  const entry = region(code);
  return { x: entry.x + entry.width / 2, y: entry.y + entry.height / 2 };
}

/** Fraction of each side kept clear so points never sit on a region border. */
const REGION_POINT_INSET = 0.12;

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/**
 * A deterministic point inside a region's rectangle, inset from the edges so map
 * markers do not straddle a border. Consumes exactly two Rng draws, x then y.
 */
export function regionPoint(rng: Rng, code: RegionCode): { x: number; y: number } {
  const entry = region(code);
  const insetX = entry.width * REGION_POINT_INSET;
  const insetY = entry.height * REGION_POINT_INSET;
  const x = rng.float(entry.x + insetX, entry.x + entry.width - insetX);
  const y = rng.float(entry.y + insetY, entry.y + entry.height - insetY);
  return { x: roundTo(x, 2), y: roundTo(y, 2) };
}

/** Longest possible centre-to-centre distance in a 0..100 map. */
const MAX_CENTRE_DISTANCE = Math.hypot(100, 100);
const DISTANCE_WEEK_BASE = 0.6;
const DISTANCE_WEEK_SPAN = 3.4;
const DISTANCE_WEEK_PENALTY = 1;

/** Fewest extra logistics weeks between two different regions. */
export const MIN_DISTANCE_WEEKS = 1;
/** Most extra logistics weeks between two different regions. */
export const MAX_DISTANCE_WEEKS = 4;

/**
 * Extra logistics weeks for a shipment between two regions: 0 inside a region, and
 * otherwise 1..4 whole weeks from the centre-to-centre map distance plus the mean
 * of both regions' logisticsPenalty. Symmetric by construction.
 */
export function distanceWeeks(from: RegionCode, to: RegionCode): number {
  if (from === to) {
    region(from);
    region(to);
    return 0;
  }
  const a = region(from);
  const b = region(to);
  const centreA = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const centreB = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const spread = Math.hypot(centreA.x - centreB.x, centreA.y - centreB.y) / MAX_CENTRE_DISTANCE;
  const penalty = (a.logisticsPenalty + b.logisticsPenalty) / 2;
  const raw = DISTANCE_WEEK_BASE + spread * DISTANCE_WEEK_SPAN + penalty * DISTANCE_WEEK_PENALTY;
  const weeks = Math.round(raw);
  if (weeks < MIN_DISTANCE_WEEKS) return MIN_DISTANCE_WEEKS;
  if (weeks > MAX_DISTANCE_WEEKS) return MAX_DISTANCE_WEEKS;
  return weeks;
}
