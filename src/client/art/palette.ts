/**
 * The art palette, in one place.
 *
 * These are the same values the CSS custom properties in `src/client/styles.css`
 * carry, typed so generated art, canvas drawing and component code can all quote
 * the same hexes instead of guessing. `scripts/generate-art.mjs` mirrors this table
 * (it runs on Node built-ins only and cannot import a `.ts` module); if a value
 * changes here, change it there too.
 *
 * The rule the whole library follows: graphite and warm white carry the image,
 * brushed aluminium carries the hardware, and there is exactly ONE accent —
 * Block Aero blue. Navigation red and green appear only as small status dots.
 */

/** Graphite, darkest to lightest. The structural value scale for every scene. */
export const GRAPHITE = {
  g900: "#14181c",
  g800: "#1c2126",
  g700: "#262d34",
  g600: "#333c45",
  g500: "#4a545e",
} as const;

/** Warm white and the paper values that sit above graphite. */
export const PAPER = {
  paper: "#f4f5f6",
  paperDeep: "#e3e6e9",
  paperGlow: "#ffffff",
  ink: "#1c2126",
  inkSoft: "#39424b",
  muted: "#6a747e",
  hairline: "#b9c0c7",
} as const;

/** Brushed aluminium. `flat` is the single-value stand-in for the gradient. */
export const ALUMINIUM = {
  flat: "#d2d8dd",
  light: "#eef1f3",
  mid: "#c3cad1",
  dark: "#9aa4ad",
  /** Stop list for a brushed-metal linear gradient, in order. */
  sheen: ["#d4d9de", "#eef1f3", "#c3cad1", "#e7eaed", "#cbd2d8"],
} as const;

/** The single accent: Block Aero blue. Nothing else in the library is saturated. */
export const ACCENT = {
  blue: "#1b6fd4",
  blueBright: "#3f8ee8",
  blueDeep: "#114a91",
  /** Screen glow, as rgba because it is always composited. */
  blueGlow: "rgba(63, 142, 232, 0.32)",
} as const;

/** Navigation-light status colours. Small dots only — never decoration. */
export const STATUS = {
  green: "#1f7a4d",
  red: "#b23a2f",
  amber: "#9a6b12",
  gold: "#b9922f",
} as const;

/** Sky base hue per season, matching `SEASON_HUE` in `OfficeHQ.tsx`. */
export const SEASON_HUE = {
  winter: 214,
  spring: 202,
  summer: 196,
  autumn: 28,
} as const;

/** Skin base tones for the founder and team busts, warm and evenly spaced. */
export const SKIN = {
  whiteWoman: "#ecc7ab",
  whiteMan: "#dfb495",
  blackWoman: "#6f4630",
  blackMan: "#57351f",
  asianWoman: "#e7bd92",
  asianMan: "#d0a170",
  mixedWoman: "#bf8b61",
  mixedMan: "#a06d47",
} as const;

/** Hair tones. Kept low-chroma so the accent stays the only saturated colour. */
export const HAIR = {
  black: "#15120f",
  espresso: "#241a13",
  brown: "#3a2618",
  auburn: "#4a2a1c",
  ash: "#3a4046",
  steel: "#59626a",
} as const;

export type GraphiteToken = keyof typeof GRAPHITE;
export type PaperToken = keyof typeof PAPER;
export type AccentToken = keyof typeof ACCENT;
export type StatusToken = keyof typeof STATUS;
export type SeasonToken = keyof typeof SEASON_HUE;

/** Every flat colour in the palette, flattened for lookup by name. */
export const PALETTE = {
  ...GRAPHITE,
  ...PAPER,
  aluminium: ALUMINIUM.flat,
  aluminiumLight: ALUMINIUM.light,
  aluminiumMid: ALUMINIUM.mid,
  aluminiumDark: ALUMINIUM.dark,
  blue: ACCENT.blue,
  blueBright: ACCENT.blueBright,
  blueDeep: ACCENT.blueDeep,
  green: STATUS.green,
  red: STATUS.red,
  amber: STATUS.amber,
  gold: STATUS.gold,
} as const;

export type PaletteName = keyof typeof PALETTE;
