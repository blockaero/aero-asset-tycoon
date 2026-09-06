/**
 * Founder and company identity: the new-game screen.
 *
 * The player names their company, names themselves, and picks a portrait. Every
 * roll in here goes through the seeded Rng, so a given seed and call order
 * always produces the same new-game screen — no Math.random, no Date.now.
 *
 * The company name is also the world seed (see seedFromCompanyName), which is
 * how "Meridian Rotables Inc." always deals the same opening market. That makes
 * a name shareable: type the same one, play the same world.
 *
 * COSMETIC ONLY: a portrait carries no stats, no bonuses, no modifiers, and no
 * hidden weighting anywhere in the sim. presentation and heritage exist so the
 * UI can offer a varied, representative set and build alt text; nothing in the
 * kernel ever reads them. Founder names are rolled from lists that are entirely
 * independent of the portrait set — no name is tied to any portrait, and the
 * two rolls never consult each other.
 */

import type { FounderIdentity, TeamRole } from "./types.ts";
import type { Rng } from "./rng.ts";

/** Matches the 48-char cap the set_identity command contract enforces. */
export const MAX_IDENTITY_LENGTH = 48;

// ---------------------------------------------------------------------------
// Company names
// ---------------------------------------------------------------------------

/**
 * Leading words. Real aftermarket firms lean on navigation, weather and bird
 * names (waypoints, kestrels, tailwinds), so these read as plausible trade
 * names without borrowing any actual company's.
 *
 * Every entry is <= 10 characters, which keeps the longest possible rolled name
 * inside MAX_IDENTITY_LENGTH.
 */
export const COMPANY_FIRST_WORDS: readonly string[] = [
  "Anvil",
  "Aurora",
  "Beacon",
  "Bluewater",
  "Cardinal",
  "Compass",
  "Granite",
  "Halyard",
  "Harbor",
  "Highfield",
  "Ironwood",
  "Kestrel",
  "Keystone",
  "Lodestar",
  "Meridian",
  "Northstar",
  "Osprey",
  "Peregrine",
  "Pinnacle",
  "Redline",
  "Sable",
  "Sierra",
  "Silverline",
  "Slipstream",
  "Solstice",
  "Summit",
  "Tailwind",
  "Trident",
  "Vantage",
  "Waypoint",
  "Windward",
  "Zenith",
];

/**
 * The trade descriptor. These are the real lines of business in the aviation
 * aftermarket: rotables (repairable units that cycle through overhaul and
 * return to service), airframe and engine material, surplus trading, leasing,
 * and asset management.
 *
 * Deliberately contains no word that also appears in COMPANY_SUFFIXES, so a
 * rolled name never reads "... Group Group".
 */
export const COMPANY_MIDDLE_WORDS: readonly string[] = [
  "Rotables",
  "Rotable Solutions",
  "Aero Asset Management",
  "Asset Management",
  "Component Partners",
  "Component Solutions",
  "Component Exchange",
  "Aero Components",
  "Aviation Capital",
  "Aviation Services",
  "Aviation Leasing",
  "Airframe Trading",
  "Airframe Solutions",
  "Engine Leasing",
  "Turbine Partners",
  "Aero Materiel",
  "Aero Logistics",
  "Aerospace Trading",
  "Surplus Trading",
  "Parts Trading",
];

/** Corporate suffixes. A rolled name always ends in exactly one of these. */
export const COMPANY_SUFFIXES: readonly string[] = [
  "Inc.",
  "LLC",
  "Ltd.",
  "Corp.",
  "Group",
  "Holdings",
  "GmbH",
  "S.A.",
  "B.V.",
  "N.V.",
  "AG",
  "Pte. Ltd.",
];

/**
 * Roll a company name: first word + trade descriptor + corporate suffix.
 *
 * Consumes exactly three values from the Rng, always in that order.
 */
export function rollCompanyName(rng: Rng): string {
  const first = rng.pick(COMPANY_FIRST_WORDS);
  const middle = rng.pick(COMPANY_MIDDLE_WORDS);
  const suffix = rng.pick(COMPANY_SUFFIXES);
  return `${first} ${middle} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Founder names
// ---------------------------------------------------------------------------

/**
 * Given names spanning many cultures. The aftermarket is a genuinely global
 * trade, so the roll should look like one.
 *
 * These are NOT grouped or correlated with the portrait set in any way — any
 * name can land on any portrait.
 */
export const GIVEN_NAMES: readonly string[] = [
  "Adaeze",
  "Ahmed",
  "Aiko",
  "Aisha",
  "Alejandro",
  "Amara",
  "Anders",
  "Andrés",
  "Aroha",
  "Beatriz",
  "Bilal",
  "Camila",
  "Chidi",
  "Dilnoza",
  "Eitan",
  "Elena",
  "Emeka",
  "Esi",
  "Fatima",
  "Freya",
  "Giulia",
  "Hana",
  "Hiroshi",
  "Ingrid",
  "Isabela",
  "Jamal",
  "Ji-woo",
  "Kalani",
  "Kaveh",
  "Kwame",
  "Lars",
  "Leilani",
  "Lucía",
  "Mateo",
  "Mei",
  "Min-jun",
  "Nadia",
  "Naveen",
  "Ngozi",
  "Nikolai",
  "Oluwaseun",
  "Omar",
  "Priya",
  "Rafael",
  "Ravi",
  "Rin",
  "Rosa",
  "Samira",
  "Sanne",
  "Sofia",
  "Tariq",
  "Thandiwe",
  "Tomás",
  "Wei",
  "Yusuf",
  "Zaina",
];

/** Surnames, likewise broad and likewise independent of the portrait set. */
export const SURNAMES: readonly string[] = [
  "Abadi",
  "Adeyemi",
  "Almeida",
  "Andersson",
  "Bakker",
  "Baptiste",
  "Beaumont",
  "Bello",
  "Chaudhary",
  "Chen",
  "Costa",
  "Dahl",
  "Diallo",
  "Dubois",
  "Eriksen",
  "Fernández",
  "Fitzgerald",
  "Gallagher",
  "Ghosh",
  "Gruber",
  "Haddad",
  "Hoffmann",
  "Ibrahim",
  "Iyer",
  "Jiménez",
  "Kaur",
  "Kim",
  "Kowalski",
  "Larsen",
  "Lindqvist",
  "Lombardi",
  "Mensah",
  "Moreau",
  "Nakamura",
  "Novak",
  "Okafor",
  "Osei",
  "Petrov",
  "Quintero",
  "Rahman",
  "Rossi",
  "Santos",
  "Sarr",
  "Silva",
  "Sørensen",
  "Tanaka",
  "Tremblay",
  "Ueda",
  "Vásquez",
  "Wang",
  "Weber",
  "Yamada",
  "Yilmaz",
  "Zhang",
  "Zulu",
];

/**
 * Roll a founder name: given name + surname.
 *
 * Consumes exactly two values from the Rng, always in that order.
 */
export function rollFounderName(rng: Rng): string {
  return `${rng.pick(GIVEN_NAMES)} ${rng.pick(SURNAMES)}`;
}

// ---------------------------------------------------------------------------
// Portraits
// ---------------------------------------------------------------------------

export type PortraitPresentation = "feminine" | "masculine";

export type PortraitHeritage = "white" | "black" | "asian" | "mixed";

/**
 * A selectable portrait.
 *
 * COSMETIC ONLY. This record has no numeric field by design: there is nowhere
 * to hang a bonus, and nothing in the sim branches on presentation or heritage.
 */
export type PortraitOption = {
  id: string;
  label: string;
  presentation: PortraitPresentation;
  heritage: PortraitHeritage;
  file: string;
};

/** Where the generated art lives, relative to the public root. */
const PORTRAIT_DIR = "assets/gen";

function portraitFile(id: string): string {
  return `${PORTRAIT_DIR}/${id}.svg`;
}

/**
 * The eight founder portraits: four feminine, four masculine, one of each
 * heritage in each set.
 *
 * Labels are numbered rather than descriptive so the picker reads as a row of
 * artwork instead of a demographic menu; presentation and heritage stay on the
 * record so a UI can still build proper alt text from them.
 *
 * Order is stable and load-bearing: FOUNDER_PORTRAITS[0] is the fallback that
 * sanitizeIdentity uses for an unknown id.
 */
export const FOUNDER_PORTRAITS: readonly PortraitOption[] = [
  {
    id: "founder-white-woman",
    label: "Portrait 1",
    presentation: "feminine",
    heritage: "white",
    file: portraitFile("founder-white-woman"),
  },
  {
    id: "founder-black-woman",
    label: "Portrait 2",
    presentation: "feminine",
    heritage: "black",
    file: portraitFile("founder-black-woman"),
  },
  {
    id: "founder-asian-woman",
    label: "Portrait 3",
    presentation: "feminine",
    heritage: "asian",
    file: portraitFile("founder-asian-woman"),
  },
  {
    id: "founder-mixed-woman",
    label: "Portrait 4",
    presentation: "feminine",
    heritage: "mixed",
    file: portraitFile("founder-mixed-woman"),
  },
  {
    id: "founder-white-man",
    label: "Portrait 5",
    presentation: "masculine",
    heritage: "white",
    file: portraitFile("founder-white-man"),
  },
  {
    id: "founder-black-man",
    label: "Portrait 6",
    presentation: "masculine",
    heritage: "black",
    file: portraitFile("founder-black-man"),
  },
  {
    id: "founder-asian-man",
    label: "Portrait 7",
    presentation: "masculine",
    heritage: "asian",
    file: portraitFile("founder-asian-man"),
  },
  {
    id: "founder-mixed-man",
    label: "Portrait 8",
    presentation: "masculine",
    heritage: "mixed",
    file: portraitFile("founder-mixed-man"),
  },
];

/**
 * One portrait per hireable role, keyed "team-<role>" so a TeamCandidate can
 * carry the role's portraitId directly.
 *
 * Labels are the real trade job titles. Presentation and heritage vary across
 * the set for the same cosmetic reason as the founder portraits, and are just
 * as inert: a candidate's skill, salary and ATA affinity are rolled by the
 * hiring code and never look at this table.
 */
export const TEAM_PORTRAITS: readonly PortraitOption[] = [
  {
    id: "team-buyer",
    label: "Asset Buyer",
    presentation: "masculine",
    heritage: "asian",
    file: portraitFile("team-buyer"),
  },
  {
    id: "team-sales",
    label: "Sales Lead",
    presentation: "feminine",
    heritage: "black",
    file: portraitFile("team-sales"),
  },
  {
    id: "team-records",
    label: "Technical Records Specialist",
    presentation: "feminine",
    heritage: "white",
    file: portraitFile("team-records"),
  },
  {
    id: "team-repair",
    label: "Repair Coordinator",
    presentation: "masculine",
    heritage: "mixed",
    file: portraitFile("team-repair"),
  },
  {
    id: "team-regional",
    label: "Regional Manager",
    presentation: "feminine",
    heritage: "asian",
    file: portraitFile("team-regional"),
  },
  {
    id: "team-analyst",
    label: "Market Analyst",
    presentation: "masculine",
    heritage: "white",
    file: portraitFile("team-analyst"),
  },
];

/** The portrait id belonging to a hireable role. */
export function teamPortraitId(role: TeamRole): string {
  return `team-${role}`;
}

/** Look up a founder or team portrait by id. Null when the id is unknown. */
export function portraitById(id: string): PortraitOption | null {
  for (const portrait of FOUNDER_PORTRAITS) {
    if (portrait.id === id) return portrait;
  }
  for (const portrait of TEAM_PORTRAITS) {
    if (portrait.id === id) return portrait;
  }
  return null;
}

function isFounderPortraitId(id: string): boolean {
  for (const portrait of FOUNDER_PORTRAITS) {
    if (portrait.id === id) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Roll a complete identity for the new-game screen.
 *
 * Consumes the Rng in a fixed order — company (3), founder (2), portrait (1) —
 * so the same seed always offers the same starting suggestion.
 */
export function defaultIdentity(rng: Rng): FounderIdentity {
  const companyName = rollCompanyName(rng);
  const founderName = rollFounderName(rng);
  const portrait = rng.pick(FOUNDER_PORTRAITS);
  return { companyName, founderName, portraitId: portrait.id };
}

/** Strip control characters, collapse whitespace runs, trim the ends. */
function normalizeText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Used when a hash lands exactly on zero. Matches the Rng's own zero guard. */
const FALLBACK_SEED = 0x9e3779b9;

/**
 * Stable 32-bit hash of a company name, used as the world seed.
 *
 * FNV-1a plus an avalanche pass, so names that differ by one character land far
 * apart in seed space rather than in adjacent worlds. Always returns a positive
 * non-zero integer below 2^32.
 *
 * The name is normalized first — trimmed, whitespace-collapsed, lowercased — so
 * "Meridian Rotables Inc." and "  meridian   rotables inc. " open the same
 * world. Casing is a typo, not a different company.
 */
export function seedFromCompanyName(name: string): number {
  const normalized = normalizeText(name).toLowerCase();
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  const seed = hash >>> 0;
  return seed === 0 ? FALLBACK_SEED : seed;
}

function cleanField(raw: string | undefined, roll: () => string): string {
  const normalized = normalizeText(raw ?? "");
  const chosen = normalized === "" ? normalizeText(roll()) : normalized;
  return chosen.slice(0, MAX_IDENTITY_LENGTH).trim();
}

/**
 * Turn whatever the new-game form submitted into a valid identity.
 *
 * Blank or whitespace-only fields fall back to a roll, names are trimmed and
 * capped at MAX_IDENTITY_LENGTH, and an unknown portrait id falls back to the
 * first portrait. The result always satisfies the set_identity contract.
 *
 * The Rng is only consumed for fields that actually need a roll, so a fully
 * filled-in form leaves it untouched.
 */
export function sanitizeIdentity(input: Partial<FounderIdentity>, rng: Rng): FounderIdentity {
  const companyName = cleanField(input.companyName, () => rollCompanyName(rng));
  const founderName = cleanField(input.founderName, () => rollFounderName(rng));
  const requested = normalizeText(input.portraitId ?? "");
  const portraitId = isFounderPortraitId(requested) ? requested : FOUNDER_PORTRAITS[0]!.id;
  return { companyName, founderName, portraitId };
}
