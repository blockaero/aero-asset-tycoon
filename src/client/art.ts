/**
 * Shot-id art loader. Prefer `public/assets/gen/<id>.webp`, then legacy `public/assets/`.
 * There is no MANIFEST.txt in gen/; ids below match files on disk.
 */

export const DEFAULT_FOUNDER_SHOT = "hq-founder-asian-man";

export const HQ_ROOM_SHOTS = ["hq-room", "hq-room-night"] as const;
export const HQ_WALL_SHOTS = ["hq-wall-empty", "hq-wall-filled"] as const;
export const HQ_MONITOR_SHOTS = ["hq-monitors-idle", "hq-monitors-lit"] as const;
export const HQ_FOUNDER_SHOTS = [
  "hq-founder-asian-man",
  "hq-founder-asian-woman",
  "hq-founder-black-man",
  "hq-founder-black-woman",
  "hq-founder-mixed-woman",
  "hq-founder-white-man",
  "hq-founder-white-woman",
] as const;

/** HQ plates that exist under `public/assets/gen/`. */
export const HQ_BOUND_SHOTS = [
  ...HQ_ROOM_SHOTS,
  ...HQ_WALL_SHOTS,
  ...HQ_MONITOR_SHOTS,
  ...HQ_FOUNDER_SHOTS,
] as const;

/**
 * Requested HQ ids with no gen file. Mixed-man / idle fall back to another plate.
 * No `region-*` gen tiles exist yet — world/region use the tessellated aviation chart, not a US raster.
 */
export const MISSING_GEN_SHOTS = new Set<string>([
  "hq-founder-mixed-man",
  "hq-founder-idle",
  "world-map",
  "tarmac",
  "hq-office",
  "region-kanto",
  "region-pacific",
  "region-atlantic",
]);

const SHOT_FALLBACKS: Record<string, string> = {
  "hq-founder-mixed-man": "hq-founder-mixed-woman",
  "hq-founder-idle": "hq-room",
  "region-kanto": "world-map",
  "region-pacific": "world-map",
  "region-atlantic": "world-map",
  "hq-office": DEFAULT_FOUNDER_SHOT,
};

const LEGACY_FILES: Record<string, readonly string[]> = {
  "world-map": ["world-map.webp", "world-map-solarpunk.webp"],
  tarmac: ["tarmac-solarpunk.webp", "tarmac.webp"],
  "hq-office": ["hq-office-solarpunk.webp", "hq-office.webp"],
  "hq-room": ["hq-office-solarpunk.webp", "hq-office.webp"],
};

export function publicBaseUrl(): string {
  const raw = import.meta.env.BASE_URL || "/";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

export function genShotUrl(shotId: string): string {
  return `${publicBaseUrl()}assets/gen/${shotId}.webp`;
}

export function legacyAssetUrl(filename: string): string {
  return `${publicBaseUrl()}assets/${filename}`;
}

/** Candidate URLs: gen/<id> first, then alias gen plates, then legacy public/assets/. */
export function shotCandidates(shotId: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  let current: string | undefined = shotId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    push(genShotUrl(current));
    for (const file of LEGACY_FILES[current] ?? []) {
      push(legacyAssetUrl(file));
    }
    current = SHOT_FALLBACKS[current];
  }
  return urls;
}

/** First URL expected to exist (skip known-missing gen files to avoid a 404 flash). */
export function initialShotSrc(shotId: string): string {
  const candidates = shotCandidates(shotId);
  for (const url of candidates) {
    if (url.includes("/assets/gen/")) {
      const id = url.slice(url.lastIndexOf("/") + 1).replace(/\.webp$/, "");
      if (MISSING_GEN_SHOTS.has(id)) continue;
    }
    return url;
  }
  return candidates[0] ?? genShotUrl(shotId);
}

export function cssImageUrl(shotId: string): string {
  return `url("${initialShotSrc(shotId)}")`;
}

/** Opaque 2560×1440 RGB plates — HQ uses a single full-plate swap, default founder. */
export function hqBackdropShot(): string {
  return DEFAULT_FOUNDER_SHOT;
}
