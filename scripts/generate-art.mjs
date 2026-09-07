#!/usr/bin/env node
/**
 * Procedural SVG stand-ins for the Aero Asset Tycoon shot list.
 *
 * The real pipeline drives Gemini through a browser (see docs/COWORK-ART-BRIEF.md).
 * This generator produces the deterministic geometric stand-ins that hold every
 * slot until a render lands: same IDs, same ratios, same composition, so a finished
 * `<id>.webp` dropped into public/assets/gen/ replaces its `<id>.svg` with no code
 * change (src/client/art/ArtImage.tsx resolves webp first, svg second).
 *
 * Rules this file obeys:
 *   - Node built-ins only, no dependencies.
 *   - Deterministic: a seeded PRNG, never Math.random, so re-running is byte-identical.
 *   - No text, numbers or lettering inside any image.
 *   - Graphite / warm white / brushed aluminium, one accent (Block Aero blue),
 *     navigation red and green only as small status dots.
 *   - The hq-* layers share one geometry table derived from OfficeHQ.css percentages,
 *     so the stack aligns pixel for pixel.
 *
 * Usage: node scripts/generate-art.mjs   (or: npm run art)
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const GEN_DIR = join(ROOT, "public", "assets", "gen");
const MANIFEST_PATH = join(ROOT, "public", "assets", "manifest.json");

/* ==========================================================================
   1. Determinism
   ========================================================================== */

/** FNV-1a. Turns a shot ID into a 32-bit seed. */
function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32. Small, fast, and identical on every machine. */
function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}

/* ==========================================================================
   2. Numbers, colour, SVG plumbing
   ========================================================================== */

/** Two decimals, no negative zero: keeps output stable and files small. */
function f(value) {
  const r = Math.round(value * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

/** Collapse whitespace inside a path so multi-line source stays compact on disk. */
function d(source) {
  return source.replace(/\s+/g, " ").trim();
}

function pts(list) {
  return list.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");
}

function hex2rgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgb2hex(rgb) {
  return `#${rgb
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Multiply toward black. k < 1 darkens. */
function shade(hex, k) {
  return rgb2hex(hex2rgb(hex).map((v) => v * k));
}

/** Lerp toward white. t in 0..1. */
function tint(hex, t) {
  return rgb2hex(hex2rgb(hex).map((v) => v + (255 - v) * t));
}

/** Relative luminance 0..1. Drives how hard the key has to work on dark skin. */
function lum(hex) {
  const [r, g, b] = hex2rgb(hex);
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

/** Lerp between two hexes. */
function mix(a, b, t) {
  const ra = hex2rgb(a);
  const rb = hex2rgb(b);
  return rgb2hex(ra.map((v, i) => v + (rb[i] - v) * t));
}

/* ==========================================================================
   3. The palette — mirrors src/client/art/palette.ts (and styles.css tokens)
   ========================================================================== */

const P = {
  g900: "#14181c",
  g800: "#1c2126",
  g700: "#262d34",
  g600: "#333c45",
  g500: "#4a545e",
  paper: "#f4f5f6",
  paperDeep: "#e3e6e9",
  ink: "#1c2126",
  inkSoft: "#39424b",
  muted: "#6a747e",
  hairline: "#b9c0c7",
  alu: "#d2d8dd",
  aluLight: "#eef1f3",
  aluMid: "#c3cad1",
  aluDark: "#9aa4ad",
  blue: "#1b6fd4",
  blueBright: "#3f8ee8",
  blueDeep: "#114a91",
  green: "#1f7a4d",
  red: "#b23a2f",
  gold: "#b9922f",
};

/* ==========================================================================
   4. SVG builders
   ========================================================================== */

function svgDoc(id, w, h, defs, body) {
  const defsBlock = defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<!-- aero-asset-tycoon procedural stand-in: ${id} -->`,
    defsBlock,
    body,
    "</svg>",
    "",
  ].join("\n");
}

function stops(list) {
  return list
    .map(([offset, color, opacity]) =>
      opacity === undefined
        ? `<stop offset="${f(offset)}" stop-color="${color}"/>`
        : `<stop offset="${f(offset)}" stop-color="${color}" stop-opacity="${f(opacity)}"/>`,
    )
    .join("");
}

/** Linear gradient. Coordinates are 0..1 unless `user` is true. */
function linGrad(id, x1, y1, x2, y2, list, user = false) {
  const units = user ? ' gradientUnits="userSpaceOnUse"' : "";
  return `<linearGradient id="${id}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"${units}>${stops(list)}</linearGradient>`;
}

/** Radial gradient. Coordinates are 0..1 unless `user` is true. */
function radGrad(id, cx, cy, r, list, user = false, extra = "") {
  const units = user ? ' gradientUnits="userSpaceOnUse"' : "";
  return `<radialGradient id="${id}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"${units}${extra}>${stops(list)}</radialGradient>`;
}

function blur(id, std, pad = 40) {
  return `<filter id="${id}" x="-${pad}%" y="-${pad}%" width="${100 + pad * 2}%" height="${100 + pad * 2}%"><feGaussianBlur stdDeviation="${f(std)}"/></filter>`;
}

function rect(x, y, w, h, fill, extra = "") {
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${extra ? ` ${extra}` : ""}/>`;
}

function rrect(x, y, w, h, r, fill, extra = "") {
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}" fill="${fill}"${extra ? ` ${extra}` : ""}/>`;
}

function ellipse(cx, cy, rx, ry, fill, extra = "") {
  return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra ? ` ${extra}` : ""}/>`;
}

function circle(cx, cy, r, fill, extra = "") {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${extra ? ` ${extra}` : ""}/>`;
}

function path(dd, fill, extra = "") {
  return `<path d="${d(dd)}" fill="${fill}"${extra ? ` ${extra}` : ""}/>`;
}

function poly(points, fill, extra = "") {
  return `<polygon points="${pts(points)}" fill="${fill}"${extra ? ` ${extra}` : ""}/>`;
}

function line(x1, y1, x2, y2, stroke, width, extra = "") {
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${f(width)}"${extra ? ` ${extra}` : ""}/>`;
}

/* ==========================================================================
   5. The shared bust — founders and team portraits are the same rig
   --------------------------------------------------------------------------
   One builder means the eight founders cannot drift apart: identical framing,
   identical light, identical camera distance. Only skin, hair silhouette and
   clothing value change. The team set reuses the rig at a longer camera
   distance with a webcam tilt, so it reads as a different kind of picture.
   ========================================================================== */

/** Head, neck and shoulder landmarks derived from one head size. */
function landmarks(o) {
  const { cx, cy, rx, ry } = o;
  const chin = cy + ry * 1.04;
  return {
    cx,
    cy,
    rx,
    ry,
    crown: cy - ry * 1.28,
    chin,
    eye: cy - ry * 0.12,
    brow: cy - ry * 0.12 - ry * 0.26,
    nose: cy + ry * 0.36,
    mouth: cy + ry * 0.64,
    ear: cy + ry * 0.05,
    neckHalf: rx * 0.42,
    collar: chin + ry * 0.53,
    shoulder: chin + ry * 1.05,
  };
}

/** Head outline: cranium, temple, taper to the jaw. */
function headPath(m) {
  const { cx, cy, rx, ry } = m;
  return d(`M ${f(cx - rx)} ${f(cy - ry * 0.16)}
    C ${f(cx - rx)} ${f(cy - ry * 1.02)}, ${f(cx - rx * 0.62)} ${f(cy - ry * 1.28)}, ${f(cx)} ${f(cy - ry * 1.28)}
    C ${f(cx + rx * 0.62)} ${f(cy - ry * 1.28)}, ${f(cx + rx)} ${f(cy - ry * 1.02)}, ${f(cx + rx)} ${f(cy - ry * 0.16)}
    C ${f(cx + rx)} ${f(cy + ry * 0.46)}, ${f(cx + rx * 0.70)} ${f(cy + ry * 1.04)}, ${f(cx)} ${f(cy + ry * 1.04)}
    C ${f(cx - rx * 0.70)} ${f(cy + ry * 1.04)}, ${f(cx - rx)} ${f(cy + ry * 0.46)}, ${f(cx - rx)} ${f(cy - ry * 0.16)} Z`);
}

/** Neck, from under the jaw down into the collar. */
function neckPath(m) {
  const { cx, chin, neckHalf, collar, ry } = m;
  return d(`M ${f(cx - neckHalf)} ${f(chin - ry * 0.24)}
    L ${f(cx - neckHalf * 1.16)} ${f(collar + ry * 0.14)}
    L ${f(cx + neckHalf * 1.16)} ${f(collar + ry * 0.14)}
    L ${f(cx + neckHalf)} ${f(chin - ry * 0.24)} Z`);
}

/** Shoulders and chest, cropped at the bottom of the frame. */
function bodyPath(m, halfW, bottomY) {
  const { cx, ry, collar, shoulder, neckHalf } = m;
  const drop = bottomY - shoulder;
  return d(`M ${f(cx - halfW)} ${f(bottomY)}
    C ${f(cx - halfW)} ${f(shoulder + drop * 0.34)}, ${f(cx - halfW * 0.80)} ${f(shoulder + drop * 0.04)}, ${f(cx - halfW * 0.54)} ${f(shoulder - ry * 0.08)}
    C ${f(cx - halfW * 0.36)} ${f(shoulder - ry * 0.30)}, ${f(cx - neckHalf * 2.0)} ${f(collar + ry * 0.16)}, ${f(cx - neckHalf * 1.24)} ${f(collar)}
    L ${f(cx + neckHalf * 1.24)} ${f(collar)}
    C ${f(cx + neckHalf * 2.0)} ${f(collar + ry * 0.16)}, ${f(cx + halfW * 0.36)} ${f(shoulder - ry * 0.30)}, ${f(cx + halfW * 0.54)} ${f(shoulder - ry * 0.08)}
    C ${f(cx + halfW * 0.80)} ${f(shoulder + drop * 0.04)}, ${f(cx + halfW)} ${f(shoulder + drop * 0.34)}, ${f(cx + halfW)} ${f(bottomY)} Z`);
}

/** A closed blob with a soft irregular edge. Used for curls and cloud masses. */
function scallop(cx, cy, rx, ry, bumps, amp, rng) {
  const steps = [];
  for (let i = 0; i < bumps; i += 1) {
    const a0 = (i / bumps) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / bumps) * Math.PI * 2 - Math.PI / 2;
    const am = (a0 + a1) / 2;
    const k = 1 + rng.range(-amp * 0.35, amp);
    steps.push([
      cx + Math.cos(a1) * rx,
      cy + Math.sin(a1) * ry,
      cx + Math.cos(am) * rx * (1 + amp) * k,
      cy + Math.sin(am) * ry * (1 + amp) * k,
    ]);
  }
  const start = [cx + Math.cos(-Math.PI / 2) * rx, cy + Math.sin(-Math.PI / 2) * ry];
  const body = steps
    .map(([x1, y1, qx, qy]) => `Q ${f(qx)} ${f(qy)} ${f(x1)} ${f(y1)}`)
    .join(" ");
  return d(`M ${f(start[0])} ${f(start[1])} ${body} Z`);
}

/**
 * Hair. Each style is a different SILHOUETTE, which is what carries at 96 px.
 * Returns { back, front }: `back` sits behind the shoulders, `front` over the head.
 */
function hairFor(style, m, colors, rng) {
  const { cx, cy, rx, ry, chin, collar } = m;
  const base = colors.hair;
  const lit = tint(base, 0.20);
  const deep = shade(base, 0.62);
  // `volume` is hair depth above the scalp, not a scale of the skull: the head
  // outline tops out at 1.28ry, so every cap has to clear that or it reads as a
  // headband instead of hair.
  const cap = (volume = 1, hairline = 0.58, sideDrop = 0.16) => {
    const top = cy - ry * (1.3 + 0.17 * volume);
    const side = cy - ry * (0.94 + 0.16 * volume);
    const wide = rx * (1.03 + 0.06 * volume);
    return d(`M ${f(cx - wide)} ${f(cy + ry * sideDrop)}
      C ${f(cx - wide)} ${f(side)}, ${f(cx - rx * 0.6)} ${f(top)}, ${f(cx)} ${f(top)}
      C ${f(cx + rx * 0.6)} ${f(top)}, ${f(cx + wide)} ${f(side)}, ${f(cx + wide)} ${f(cy + ry * sideDrop)}
      C ${f(cx + rx * 0.92)} ${f(cy - ry * 0.3)}, ${f(cx + rx * 0.72)} ${f(cy - ry * hairline)}, ${f(cx + rx * 0.16)} ${f(cy - ry * (hairline + 0.1))}
      C ${f(cx - rx * 0.42)} ${f(cy - ry * (hairline + 0.06))}, ${f(cx - rx * 0.86)} ${f(cy - ry * (hairline - 0.06))}, ${f(cx - wide)} ${f(cy + ry * sideDrop)} Z`);
  };
  const sheen = (x, y, w, h, rot) =>
    `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(w)}" ry="${f(h)}" fill="${lit}" opacity="0.22" transform="rotate(${f(rot)} ${f(x)} ${f(y)})"/>`;

  if (style === "bob") {
    const back = path(
      `M ${f(cx - rx * 1.16)} ${f(cy - ry * 0.30)}
       C ${f(cx - rx * 1.34)} ${f(chin + ry * 0.30)}, ${f(cx - rx * 1.10)} ${f(chin + ry * 0.62)}, ${f(cx - rx * 0.74)} ${f(chin + ry * 0.58)}
       L ${f(cx + rx * 0.74)} ${f(chin + ry * 0.58)}
       C ${f(cx + rx * 1.10)} ${f(chin + ry * 0.62)}, ${f(cx + rx * 1.34)} ${f(chin + ry * 0.30)}, ${f(cx + rx * 1.16)} ${f(cy - ry * 0.30)} Z`,
      base,
    );
    return {
      back,
      front: [
        path(cap(1.05, 0.52, 0.3), base),
        path(
          `M ${f(cx - rx * 0.96)} ${f(cy - ry * 0.62)}
           C ${f(cx - rx * 0.30)} ${f(cy - ry * 0.94)}, ${f(cx + rx * 0.50)} ${f(cy - ry * 0.78)}, ${f(cx + rx * 1.02)} ${f(cy - ry * 0.20)}
           C ${f(cx + rx * 0.72)} ${f(cy - ry * 0.74)}, ${f(cx - rx * 0.10)} ${f(cy - ry * 0.86)}, ${f(cx - rx * 0.96)} ${f(cy - ry * 0.62)} Z`,
          deep,
          'opacity="0.55"',
        ),
        sheen(cx - rx * 0.40, cy - ry * 0.92, rx * 0.44, ry * 0.16, -14),
      ].join(""),
    };
  }

  if (style === "halo") {
    const blobA = scallop(cx, cy - ry * 0.58, rx * 1.36, ry * 1.12, 13, 0.07, rng);
    const blobB = scallop(cx, cy - ry * 0.62, rx * 1.18, ry * 0.96, 11, 0.05, rng);
    return {
      back: path(blobA, deep),
      front: [
        path(blobB, base),
        path(cap(0.5, 0.56, 0.02), base),
        sheen(cx - rx * 0.52, cy - ry * 1.10, rx * 0.42, ry * 0.22, -18),
      ].join(""),
    };
  }

  if (style === "long") {
    const back = path(
      `M ${f(cx - rx * 1.10)} ${f(cy - ry * 0.50)}
       C ${f(cx - rx * 1.46)} ${f(chin + ry * 0.90)}, ${f(cx - rx * 1.26)} ${f(collar + ry * 1.30)}, ${f(cx - rx * 0.96)} ${f(collar + ry * 1.58)}
       L ${f(cx + rx * 0.96)} ${f(collar + ry * 1.58)}
       C ${f(cx + rx * 1.26)} ${f(collar + ry * 1.30)}, ${f(cx + rx * 1.46)} ${f(chin + ry * 0.90)}, ${f(cx + rx * 1.10)} ${f(cy - ry * 0.50)} Z`,
      base,
    );
    return {
      back,
      front: [
        path(cap(1.1, 0.46, 0.34), base),
        path(
          `M ${f(cx - rx * 1.02)} ${f(cy - ry * 0.44)}
           C ${f(cx - rx * 0.50)} ${f(cy - ry * 0.72)}, ${f(cx + rx * 0.52)} ${f(cy - ry * 0.70)}, ${f(cx + rx * 1.02)} ${f(cy - ry * 0.44)}
           L ${f(cx + rx * 1.02)} ${f(cy - ry * 0.66)}
           C ${f(cx + rx * 0.50)} ${f(cy - ry * 0.96)}, ${f(cx - rx * 0.50)} ${f(cy - ry * 0.96)}, ${f(cx - rx * 1.02)} ${f(cy - ry * 0.66)} Z`,
          deep,
          'opacity="0.5"',
        ),
        sheen(cx, cy - ry * 1.06, rx * 0.62, ry * 0.14, 0),
      ].join(""),
    };
  }

  if (style === "updo") {
    const bun = scallop(cx + rx * 0.06, cy - ry * 1.44, rx * 0.50, ry * 0.42, 9, 0.06, rng);
    return {
      back: path(bun, deep),
      front: [
        path(cap(0.72, 0.5, 0.06), base),
        path(bun, base, 'opacity="0.92"'),
        path(
          `M ${f(cx - rx * 1.02)} ${f(cy + ry * 0.04)}
           C ${f(cx - rx * 1.14)} ${f(cy + ry * 0.46)}, ${f(cx - rx * 1.06)} ${f(cy + ry * 0.72)}, ${f(cx - rx * 0.92)} ${f(cy + ry * 0.86)}
           C ${f(cx - rx * 0.98)} ${f(cy + ry * 0.50)}, ${f(cx - rx * 0.96)} ${f(cy + ry * 0.24)}, ${f(cx - rx * 0.88)} ${f(cy + ry * 0.02)} Z`,
          base,
        ),
        sheen(cx - rx * 0.34, cy - ry * 1.04, rx * 0.40, ry * 0.14, -10),
      ].join(""),
    };
  }

  if (style === "sidepart") {
    return {
      back: "",
      front: [
        path(cap(0.8, 0.62, -0.04), base),
        path(
          `M ${f(cx - rx * 0.98)} ${f(cy - ry * 0.58)}
           C ${f(cx - rx * 0.3)} ${f(cy - ry * 1.16)}, ${f(cx + rx * 0.62)} ${f(cy - ry * 1.02)}, ${f(cx + rx * 1.0)} ${f(cy - ry * 0.42)}
           C ${f(cx + rx * 0.66)} ${f(cy - ry * 0.86)}, ${f(cx - rx * 0.18)} ${f(cy - ry * 0.94)}, ${f(cx - rx * 0.98)} ${f(cy - ry * 0.58)} Z`,
          lit,
          'opacity="0.32"',
        ),
        path(
          `M ${f(cx - rx * 1.0)} ${f(cy - ry * 0.52)}
           C ${f(cx - rx * 0.78)} ${f(cy - ry * 0.24)}, ${f(cx - rx * 0.34)} ${f(cy - ry * 0.52)}, ${f(cx + rx * 0.2)} ${f(cy - ry * 0.74)}
           C ${f(cx - rx * 0.3)} ${f(cy - ry * 0.94)}, ${f(cx - rx * 0.86)} ${f(cy - ry * 0.92)}, ${f(cx - rx * 1.0)} ${f(cy - ry * 0.52)} Z`,
          base,
        ),
        sheen(cx - rx * 0.10, cy - ry * 1.14, rx * 0.52, ry * 0.14, -8),
      ].join(""),
    };
  }

  if (style === "fade") {
    return {
      back: "",
      front: [
        path(cap(0.24, 0.7, -0.16), base),
        path(cap(0.18, 0.74, -0.3), deep, 'opacity="0.6"'),
        sheen(cx - rx * 0.20, cy - ry * 1.04, rx * 0.46, ry * 0.12, -6),
      ].join(""),
    };
  }

  if (style === "crop") {
    return {
      back: "",
      front: [
        path(cap(0.8, 0.42, 0.04), base),
        path(
          `M ${f(cx - rx * 0.98)} ${f(cy - ry * 0.5)}
           C ${f(cx - rx * 0.4)} ${f(cy - ry * 0.66)}, ${f(cx + rx * 0.38)} ${f(cy - ry * 0.64)}, ${f(cx + rx * 0.98)} ${f(cy - ry * 0.44)}
           C ${f(cx + rx * 0.7)} ${f(cy - ry * 0.86)}, ${f(cx - rx * 0.5)} ${f(cy - ry * 0.9)}, ${f(cx - rx * 0.98)} ${f(cy - ry * 0.5)} Z`,
          deep,
          'opacity="0.4"',
        ),
        sheen(cx, cy - ry * 1.12, rx * 0.58, ry * 0.12, 0),
      ].join(""),
    };
  }

  // "curls"
  const puff = scallop(cx, cy - ry * 0.82, rx * 1.18, ry * 0.86, 11, 0.09, rng);
  return {
    back: path(puff, deep),
    front: [
      path(puff, base, 'opacity="0.94"'),
      path(cap(0.55, 0.58, -0.02), base),
      sheen(cx - rx * 0.36, cy - ry * 1.14, rx * 0.38, ry * 0.14, -12),
    ].join(""),
  };
}

/** Clothing. Three cuts, all business-neutral, all different in value. */
function garmentFor(kind, m, colors, halfW, bottomY) {
  const { cx, ry, collar } = m;
  const jacket = colors.jacket;
  const jacketDeep = shade(jacket, 0.72);
  const shirt = colors.shirt;
  const parts = [];

  if (kind === "blazer") {
    parts.push(
      poly(
        [
          [cx - ry * 0.62, collar - ry * 0.02],
          [cx + ry * 0.62, collar - ry * 0.02],
          [cx + ry * 0.82, bottomY],
          [cx - ry * 0.82, bottomY],
        ],
        shirt,
      ),
    );
    parts.push(
      path(
        `M ${f(cx - ry * 0.64)} ${f(collar - ry * 0.06)}
         L ${f(cx - ry * 0.10)} ${f(collar + ry * 1.30)}
         L ${f(cx - ry * 0.10)} ${f(bottomY)}
         L ${f(cx - halfW * 0.96)} ${f(bottomY)}
         C ${f(cx - halfW * 0.96)} ${f(collar + ry * 1.50)}, ${f(cx - halfW * 0.56)} ${f(collar + ry * 0.36)}, ${f(cx - ry * 0.64)} ${f(collar - ry * 0.06)} Z`,
        jacket,
      ),
    );
    parts.push(
      path(
        `M ${f(cx + ry * 0.64)} ${f(collar - ry * 0.06)}
         L ${f(cx + ry * 0.10)} ${f(collar + ry * 1.30)}
         L ${f(cx + ry * 0.10)} ${f(bottomY)}
         L ${f(cx + halfW * 0.96)} ${f(bottomY)}
         C ${f(cx + halfW * 0.96)} ${f(collar + ry * 1.50)}, ${f(cx + halfW * 0.56)} ${f(collar + ry * 0.36)}, ${f(cx + ry * 0.64)} ${f(collar - ry * 0.06)} Z`,
        jacketDeep,
      ),
    );
    parts.push(
      poly(
        [
          [cx - ry * 0.62, collar],
          [cx - ry * 0.12, collar + ry * 0.90],
          [cx - ry * 0.54, collar + ry * 0.62],
        ],
        tint(shirt, 0.10),
      ),
    );
    parts.push(
      poly(
        [
          [cx + ry * 0.62, collar],
          [cx + ry * 0.12, collar + ry * 0.90],
          [cx + ry * 0.54, collar + ry * 0.62],
        ],
        shade(shirt, 0.94),
      ),
    );
    return parts.join("");
  }

  if (kind === "crew") {
    parts.push(
      path(
        `M ${f(cx - ry * 0.44)} ${f(collar - ry * 0.04)}
         C ${f(cx - ry * 0.30)} ${f(collar + ry * 0.30)}, ${f(cx + ry * 0.30)} ${f(collar + ry * 0.30)}, ${f(cx + ry * 0.44)} ${f(collar - ry * 0.04)}`,
        "none",
        `stroke="${shade(jacket, 0.74)}" stroke-width="${f(ry * 0.10)}" stroke-linecap="round"`,
      ),
    );
    return parts.join("");
  }

  // "zip" — quarter-zip over a collarless shell
  parts.push(
    path(
      `M ${f(cx - ry * 0.40)} ${f(collar - ry * 0.02)}
       C ${f(cx - ry * 0.26)} ${f(collar + ry * 0.26)}, ${f(cx + ry * 0.26)} ${f(collar + ry * 0.26)}, ${f(cx + ry * 0.40)} ${f(collar - ry * 0.02)}
       L ${f(cx + ry * 0.46)} ${f(collar + ry * 0.20)}
       C ${f(cx + ry * 0.28)} ${f(collar + ry * 0.52)}, ${f(cx - ry * 0.28)} ${f(collar + ry * 0.52)}, ${f(cx - ry * 0.46)} ${f(collar + ry * 0.20)} Z`,
      shade(jacket, 0.78),
    ),
  );
  parts.push(
    rect(cx - ry * 0.035, collar + ry * 0.30, ry * 0.07, ry * 0.92, shade(jacket, 0.62)),
  );
  return parts.join("");
}

/**
 * The whole person. Background, light and vignette stay with the caller so the
 * founder set and the team set can each keep their own room.
 */
function renderBust(o) {
  const m = landmarks(o);
  const rng = o.rng;
  const c = o.colors;
  const skin = c.skin;
  const skinShade = shade(skin, 0.80);
  const skinDeep = shade(skin, 0.66);
  const skinLit = tint(skin, 0.16);
  const halfW = o.rx * o.shoulderScale;
  const body = bodyPath(m, halfW, o.bottomY);
  const head = headPath(m);
  const hair = hairFor(c.hairStyle, m, c, rng);
  const ns = o.ns;
  const out = [];

  out.push(hair.back);

  // Neck, then the jaw shadow that seats the head on it.
  out.push(path(neckPath(m), skinShade));
  out.push(
    ellipse(m.cx, m.chin - m.ry * 0.02, m.rx * 0.60, m.ry * 0.26, skinDeep, 'opacity="0.55"'),
  );

  // Clothing.
  out.push(path(body, c.jacket));
  out.push(
    path(body, `url(#${ns}-cloth)`, 'style="mix-blend-mode:normal"'),
  );
  out.push(garmentFor(c.garment, m, c, halfW, o.bottomY));

  // Head and its modelling, all clipped to the outline.
  out.push(path(head, skin));
  out.push(`<g clip-path="url(#${ns}-head)">`);
  out.push(rect(m.cx, m.crown, m.rx * 1.2, m.ry * 2.6, `url(#${ns}-face)`));
  out.push(
    ellipse(m.cx - m.rx * 0.42, m.cy - m.ry * 0.62, m.rx * 0.52, m.ry * 0.34, skinLit, 'opacity="0.45"'),
  );
  out.push(
    ellipse(m.cx - m.rx * 0.58, m.nose + m.ry * 0.06, m.rx * 0.30, m.ry * 0.22, skinLit, 'opacity="0.22"'),
  );

  // Brows.
  const browW = m.rx * 0.40;
  const browOff = m.rx * 0.40;
  for (const s of [-1, 1]) {
    out.push(
      path(
        `M ${f(m.cx + s * (browOff - browW * 0.5))} ${f(m.brow + m.ry * 0.03)}
         Q ${f(m.cx + s * browOff)} ${f(m.brow - m.ry * 0.05)} ${f(m.cx + s * (browOff + browW * 0.5))} ${f(m.brow + m.ry * 0.01)}`,
        "none",
        `stroke="${c.brow}" stroke-width="${f(m.ry * 0.055)}" stroke-linecap="round" opacity="0.9"`,
      ),
    );
  }

  // Eyes: almond, iris, lid line, one small catchlight.
  const eyeOff = m.rx * 0.40;
  const eyeW = m.rx * 0.19;
  const eyeH = m.ry * 0.075;
  for (const s of [-1, 1]) {
    const ex = m.cx + s * eyeOff;
    out.push(
      path(
        `M ${f(ex - eyeW)} ${f(m.eye)}
         Q ${f(ex)} ${f(m.eye - eyeH * 1.45)} ${f(ex + eyeW)} ${f(m.eye)}
         Q ${f(ex)} ${f(m.eye + eyeH * 1.05)} ${f(ex - eyeW)} ${f(m.eye)} Z`,
        "#e9ecef",
        'opacity="0.92"',
      ),
    );
    out.push(circle(ex + o.gaze * m.rx * 0.02, m.eye - eyeH * 0.10, eyeW * 0.44, c.iris));
    out.push(circle(ex + o.gaze * m.rx * 0.02, m.eye - eyeH * 0.10, eyeW * 0.20, "#0d1114"));
    out.push(
      circle(ex + o.gaze * m.rx * 0.02 - eyeW * 0.16, m.eye - eyeH * 0.42, eyeW * 0.10, "#ffffff", 'opacity="0.7"'),
    );
    out.push(
      path(
        `M ${f(ex - eyeW * 1.06)} ${f(m.eye + eyeH * 0.06)}
         Q ${f(ex)} ${f(m.eye - eyeH * 1.62)} ${f(ex + eyeW * 1.06)} ${f(m.eye - eyeH * 0.04)}`,
        "none",
        `stroke="${skinDeep}" stroke-width="${f(m.ry * 0.026)}" stroke-linecap="round" opacity="0.85"`,
      ),
    );
  }

  // Nose: one shadow plane on the shaded side, two soft nostrils.
  out.push(
    path(
      `M ${f(m.cx + m.rx * 0.05)} ${f(m.eye + m.ry * 0.06)}
       C ${f(m.cx + m.rx * 0.16)} ${f(m.nose - m.ry * 0.14)}, ${f(m.cx + m.rx * 0.20)} ${f(m.nose - m.ry * 0.04)}, ${f(m.cx + m.rx * 0.13)} ${f(m.nose + m.ry * 0.03)}
       C ${f(m.cx + m.rx * 0.04)} ${f(m.nose + m.ry * 0.07)}, ${f(m.cx - m.rx * 0.02)} ${f(m.nose + m.ry * 0.02)}, ${f(m.cx + m.rx * 0.02)} ${f(m.nose - m.ry * 0.06)} Z`,
      skinShade,
      'opacity="0.55"',
    ),
  );
  for (const s of [-1, 1]) {
    out.push(
      ellipse(m.cx + s * m.rx * 0.12, m.nose + m.ry * 0.045, m.rx * 0.035, m.ry * 0.018, skinDeep, 'opacity="0.5"'),
    );
  }

  // Mouth: a closed, neutral line with a lit lower lip.
  out.push(
    path(
      `M ${f(m.cx - m.rx * 0.26)} ${f(m.mouth)}
       Q ${f(m.cx)} ${f(m.mouth + m.ry * 0.045)} ${f(m.cx + m.rx * 0.26)} ${f(m.mouth)}`,
      "none",
      `stroke="${shade(skin, 0.58)}" stroke-width="${f(m.ry * 0.03)}" stroke-linecap="round" opacity="0.75"`,
    ),
  );
  out.push(
    ellipse(m.cx, m.mouth + m.ry * 0.075, m.rx * 0.20, m.ry * 0.035, skinLit, 'opacity="0.35"'),
  );

  // Facial hair, where the person has it.
  if (c.beard === "full") {
    out.push(
      path(
        `M ${f(m.cx - m.rx * 0.86)} ${f(m.cy + m.ry * 0.24)}
         C ${f(m.cx - m.rx * 0.90)} ${f(m.chin - m.ry * 0.02)}, ${f(m.cx - m.rx * 0.52)} ${f(m.chin + m.ry * 0.14)}, ${f(m.cx)} ${f(m.chin + m.ry * 0.14)}
         C ${f(m.cx + m.rx * 0.52)} ${f(m.chin + m.ry * 0.14)}, ${f(m.cx + m.rx * 0.90)} ${f(m.chin - m.ry * 0.02)}, ${f(m.cx + m.rx * 0.86)} ${f(m.cy + m.ry * 0.24)}
         C ${f(m.cx + m.rx * 0.60)} ${f(m.mouth + m.ry * 0.30)}, ${f(m.cx - m.rx * 0.60)} ${f(m.mouth + m.ry * 0.30)}, ${f(m.cx - m.rx * 0.86)} ${f(m.cy + m.ry * 0.24)} Z`,
        c.hair,
        'opacity="0.92"',
      ),
    );
    out.push(
      path(
        `M ${f(m.cx - m.rx * 0.30)} ${f(m.mouth - m.ry * 0.10)}
         Q ${f(m.cx)} ${f(m.mouth - m.ry * 0.20)} ${f(m.cx + m.rx * 0.30)} ${f(m.mouth - m.ry * 0.10)}
         Q ${f(m.cx)} ${f(m.mouth - m.ry * 0.02)} ${f(m.cx - m.rx * 0.30)} ${f(m.mouth - m.ry * 0.10)} Z`,
        c.hair,
      ),
    );
  } else if (c.beard === "stubble") {
    out.push(
      path(
        `M ${f(m.cx - m.rx * 0.88)} ${f(m.cy + m.ry * 0.30)}
         C ${f(m.cx - m.rx * 0.84)} ${f(m.chin - m.ry * 0.04)}, ${f(m.cx - m.rx * 0.48)} ${f(m.chin + m.ry * 0.06)}, ${f(m.cx)} ${f(m.chin + m.ry * 0.06)}
         C ${f(m.cx + m.rx * 0.48)} ${f(m.chin + m.ry * 0.06)}, ${f(m.cx + m.rx * 0.84)} ${f(m.chin - m.ry * 0.04)}, ${f(m.cx + m.rx * 0.88)} ${f(m.cy + m.ry * 0.30)}
         C ${f(m.cx + m.rx * 0.60)} ${f(m.mouth + m.ry * 0.34)}, ${f(m.cx - m.rx * 0.60)} ${f(m.mouth + m.ry * 0.34)}, ${f(m.cx - m.rx * 0.88)} ${f(m.cy + m.ry * 0.30)} Z`,
        c.hair,
        'opacity="0.28"',
      ),
    );
  }

  // Shadow side of the face, painted last so it sits over the features.
  out.push(rect(m.cx - m.rx * 1.2, m.crown, m.rx * 2.4, m.ry * 2.6, `url(#${ns}-faceShade)`));
  out.push("</g>");

  // Ears.
  for (const s of [-1, 1]) {
    out.push(
      ellipse(m.cx + s * m.rx * 0.99, m.ear, m.rx * 0.12, m.ry * 0.17, s < 0 ? skin : skinShade),
    );
  }

  out.push(hair.front);

  if (c.glasses) {
    const gx = m.rx * 0.40;
    const gw = m.rx * 0.30;
    const gh = m.ry * 0.15;
    for (const s of [-1, 1]) {
      out.push(
        rrect(m.cx + s * gx - gw, m.eye - gh, gw * 2, gh * 2, gh * 0.5, "none",
          `stroke="${P.aluDark}" stroke-width="${f(m.ry * 0.022)}" opacity="0.85"`),
      );
    }
    out.push(
      line(m.cx - gx + gw, m.eye - gh * 0.2, m.cx + gx - gw, m.eye - gh * 0.2, P.aluDark, m.ry * 0.02, 'opacity="0.85"'),
    );
  }

  if (c.headset) {
    out.push(
      path(
        `M ${f(m.cx - m.rx * 1.02)} ${f(m.ear - m.ry * 0.10)}
         C ${f(m.cx - m.rx * 0.96)} ${f(m.crown - m.ry * 0.14)}, ${f(m.cx + m.rx * 0.96)} ${f(m.crown - m.ry * 0.14)}, ${f(m.cx + m.rx * 1.02)} ${f(m.ear - m.ry * 0.10)}`,
        "none",
        `stroke="${P.g600}" stroke-width="${f(m.ry * 0.055)}" stroke-linecap="round"`,
      ),
    );
    out.push(rrect(m.cx - m.rx * 1.18, m.ear - m.ry * 0.16, m.rx * 0.26, m.ry * 0.34, m.rx * 0.09, P.g700));
    out.push(rrect(m.cx + m.rx * 0.92, m.ear - m.ry * 0.16, m.rx * 0.26, m.ry * 0.34, m.rx * 0.09, P.g700));
    out.push(
      path(
        `M ${f(m.cx - m.rx * 1.04)} ${f(m.ear + m.ry * 0.16)}
         C ${f(m.cx - m.rx * 0.98)} ${f(m.mouth + m.ry * 0.10)}, ${f(m.cx - m.rx * 0.72)} ${f(m.mouth + m.ry * 0.22)}, ${f(m.cx - m.rx * 0.50)} ${f(m.mouth + m.ry * 0.20)}`,
        "none",
        `stroke="${P.g600}" stroke-width="${f(m.ry * 0.030)}" stroke-linecap="round"`,
      ),
    );
  }

  // Rim light: warm key from the left, one cool Block Aero accent on the right.
  out.push(`<g clip-path="url(#${ns}-rimL)">`);
  out.push(path(head, "none", `stroke="${tint(skin, 0.55)}" stroke-width="${f(m.ry * 0.05)}" opacity="0.55"`));
  out.push(path(body, "none", `stroke="${P.alu}" stroke-width="${f(m.ry * 0.045)}" opacity="0.20"`));
  out.push("</g>");
  out.push(`<g clip-path="url(#${ns}-rimR)">`);
  out.push(path(head, "none", `stroke="${P.blueBright}" stroke-width="${f(m.ry * 0.045)}" opacity="0.55"`));
  out.push(path(body, "none", `stroke="${P.blueBright}" stroke-width="${f(m.ry * 0.05)}" opacity="0.42"`));
  out.push("</g>");

  return {
    body,
    head,
    markup: out.join(""),
    landmarks: m,
    halfW,
  };
}

/** Defs every bust needs: head clip, rim clips, face light, cloth shading. */
function bustDefs(ns, o, colors) {
  const m = landmarks(o);
  const halfW = o.rx * o.shoulderScale;
  const skinShade = shade(colors.skin, 0.74);
  // Darker skin needs a harder key and a lighter shadow side to keep the same
  // modelling; without this the deeper tones flatten into silhouette.
  const dark = 1 - lum(colors.skin);
  const keyTint = 0.18 + dark * 0.30;
  const keyAlpha = 0.48 + dark * 0.26;
  const shadeMax = 0.5 - dark * 0.20;
  return [
    `<clipPath id="${ns}-head"><path d="${headPath(m)}"/></clipPath>`,
    `<clipPath id="${ns}-rimL"><rect x="${f(m.cx - halfW - 40)}" y="0" width="${f(halfW * 0.55)}" height="${f(o.bottomY)}"/></clipPath>`,
    `<clipPath id="${ns}-rimR"><rect x="${f(m.cx + halfW * 0.52)}" y="0" width="${f(halfW * 0.72 + 40)}" height="${f(o.bottomY)}"/></clipPath>`,
    radGrad(
      `${ns}-face`,
      m.cx - m.rx * 0.55,
      m.cy - m.ry * 0.60,
      m.rx * 2.1,
      [
        [0, tint(colors.skin, keyTint), keyAlpha],
        [0.55, colors.skin, 0],
        [1, colors.skin, 0],
      ],
      true,
    ),
    linGrad(
      `${ns}-faceShade`,
      m.cx - m.rx * 0.2,
      0,
      m.cx + m.rx,
      0,
      [
        [0, skinShade, 0],
        [0.55, skinShade, shadeMax * 0.44],
        [1, skinShade, shadeMax],
      ],
      true,
    ),
    linGrad(
      `${ns}-cloth`,
      m.cx - halfW,
      m.collar,
      m.cx + halfW,
      o.bottomY,
      [
        [0, "#ffffff", 0.10],
        [0.42, "#000000", 0],
        [1, "#000000", 0.16],
      ],
      true,
    ),
  ];
}

/* ==========================================================================
   6. Founder portraits — 3:4, 900x1200
   --------------------------------------------------------------------------
   Eight people, one camera. Framing, lighting, head size and head position are
   constants; only skin, hair silhouette, brow, iris and clothing value change.
   ========================================================================== */

const FOUNDER_RIG = { cx: 450, cy: 470, rx: 132, ry: 162, shoulderScale: 2.62, bottomY: 1200 };

const FOUNDERS = [
  {
    id: "founder-white-woman",
    skin: "#ecc7ab",
    hair: "#4a2a1c",
    brow: "#5b3826",
    iris: "#3d5a6b",
    hairStyle: "bob",
    garment: "blazer",
    jacket: "#262d34",
    shirt: "#e8eaec",
    beard: "none",
  },
  {
    id: "founder-white-man",
    skin: "#dfb495",
    hair: "#4b4741",
    brow: "#57524a",
    iris: "#4a6070",
    hairStyle: "sidepart",
    garment: "blazer",
    jacket: "#5c666f",
    shirt: "#f1f2f3",
    beard: "none",
  },
  {
    id: "founder-black-woman",
    skin: "#6f4630",
    hair: "#15120f",
    brow: "#1a1512",
    iris: "#3a2418",
    hairStyle: "halo",
    garment: "crew",
    jacket: "#7d868e",
    shirt: "#7d868e",
    beard: "none",
  },
  {
    id: "founder-black-man",
    skin: "#57351f",
    hair: "#15120f",
    brow: "#1a1512",
    iris: "#33210f",
    hairStyle: "fade",
    garment: "blazer",
    jacket: "#14181c",
    shirt: "#c9ced3",
    beard: "full",
  },
  {
    id: "founder-asian-woman",
    skin: "#e7bd92",
    hair: "#241a13",
    brow: "#2b2018",
    iris: "#33241a",
    hairStyle: "long",
    garment: "blazer",
    jacket: "#4a545e",
    shirt: "#f4f5f6",
    beard: "none",
  },
  {
    id: "founder-asian-man",
    skin: "#d0a170",
    hair: "#181410",
    brow: "#1e1913",
    iris: "#2c2018",
    hairStyle: "crop",
    garment: "zip",
    jacket: "#48525c",
    shirt: "#48525c",
    beard: "none",
  },
  {
    id: "founder-mixed-woman",
    skin: "#bf8b61",
    hair: "#3a2618",
    brow: "#42301f",
    iris: "#4a3a22",
    hairStyle: "updo",
    garment: "blazer",
    jacket: "#333c45",
    shirt: "#dfe3e7",
    beard: "none",
  },
  {
    id: "founder-mixed-man",
    skin: "#a06d47",
    hair: "#241a13",
    brow: "#2b2018",
    iris: "#3a2a1a",
    hairStyle: "curls",
    garment: "zip",
    jacket: "#262d34",
    shirt: "#262d34",
    beard: "stubble",
  },
];

/** The studio: one graphite sweep, one key, one long shadow. Shared by all eight. */
function portraitRoom(ns, w, h, opts = {}) {
  const keyX = opts.keyX ?? w * 0.24;
  const keyY = opts.keyY ?? h * 0.16;
  return {
    defs: [
      linGrad(`${ns}-bg`, 0, 0, 0, 1, [
        [0, "#2b3238"],
        [0.46, "#20262c"],
        [1, "#14181c"],
      ]),
      radGrad(
        `${ns}-key`,
        keyX,
        keyY,
        Math.max(w, h) * 0.78,
        [
          [0, "#ffffff", 0.16],
          [0.45, "#9fb3c4", 0.05],
          [1, "#14181c", 0],
        ],
        true,
      ),
      radGrad(
        `${ns}-vig`,
        w * 0.5,
        h * 0.44,
        Math.max(w, h) * 0.72,
        [
          [0, "#000000", 0],
          [0.62, "#000000", 0.10],
          [1, "#05070a", 0.55],
        ],
        true,
      ),
      radGrad(
        `${ns}-accent`,
        w * 0.86,
        h * 0.30,
        w * 0.52,
        [
          [0, P.blue, 0.16],
          [1, P.blue, 0],
        ],
        true,
      ),
      blur(`${ns}-soft`, 26, 30),
    ],
    back: [
      rect(0, 0, w, h, `url(#${ns}-bg)`),
      rect(0, 0, w, h, `url(#${ns}-key)`),
      rect(0, 0, w, h, `url(#${ns}-accent)`),
    ].join(""),
    front: rect(0, 0, w, h, `url(#${ns}-vig)`),
  };
}

function renderFounder(spec) {
  const W = 900;
  const H = 1200;
  const ns = "p";
  const rng = makeRng(hashSeed(spec.id));
  const colors = {
    skin: spec.skin,
    hair: spec.hair,
    brow: spec.brow,
    iris: spec.iris,
    hairStyle: spec.hairStyle,
    garment: spec.garment,
    jacket: spec.jacket,
    shirt: spec.shirt,
    beard: spec.beard,
  };
  const rig = { ...FOUNDER_RIG, rng, colors, ns, gaze: 0 };
  const room = portraitRoom(ns, W, H);
  const bust = renderBust(rig);

  const shadow = [
    `<g opacity="0.34" filter="url(#${ns}-soft)">`,
    path(bust.body, "#05080b", 'transform="translate(70 26)"'),
    path(bust.head, "#05080b", 'transform="translate(70 26)"'),
    "</g>",
  ].join("");

  // A single floor reveal keeps the sweep from reading as flat paper.
  const sweep = [
    rect(0, H * 0.74, W, H * 0.26, "#181d22", 'opacity="0.55"'),
    rect(0, H * 0.735, W, 2, "#39424b", 'opacity="0.4"'),
  ].join("");

  return svgDoc(
    spec.id,
    W,
    H,
    [...room.defs, ...bustDefs(ns, rig, colors)],
    [room.back, sweep, shadow, bust.markup, room.front].join("\n"),
  );
}

/* ==========================================================================
   7. Team portraits — 3:4, 900x1200
   --------------------------------------------------------------------------
   Video-call framing: camera further back, subject off-centre, a slight webcam
   tilt, and a backdrop that says what the person does. Deliberately a different
   photograph from the founder set.
   ========================================================================== */

const TEAM_RIG = { cx: 474, cy: 512, rx: 112, ry: 138, shoulderScale: 2.86, bottomY: 1200 };

const TEAM = [
  {
    id: "team-buyer",
    skin: "#c98f63",
    hair: "#241a13",
    brow: "#2b2018",
    iris: "#3b2a1b",
    hairStyle: "curls",
    garment: "zip",
    jacket: "#333c45",
    shirt: "#333c45",
    beard: "stubble",
    headset: true,
    backdrop: "racking",
  },
  {
    id: "team-sales",
    skin: "#e9c1a2",
    hair: "#4a2a1c",
    brow: "#5b3826",
    iris: "#46606e",
    hairStyle: "bob",
    garment: "blazer",
    jacket: "#1c2126",
    shirt: "#eef0f2",
    beard: "none",
    backdrop: "stand",
  },
  {
    id: "team-records",
    skin: "#7a4f34",
    hair: "#15120f",
    brow: "#1a1512",
    iris: "#3a2418",
    hairStyle: "updo",
    garment: "crew",
    jacket: "#4a545e",
    shirt: "#4a545e",
    beard: "none",
    backdrop: "binders",
  },
  {
    id: "team-repair",
    skin: "#d8ac7d",
    hair: "#3a4046",
    brow: "#464c52",
    iris: "#4a5a64",
    hairStyle: "fade",
    garment: "zip",
    jacket: "#262d34",
    shirt: "#262d34",
    beard: "full",
    backdrop: "engine",
  },
  {
    id: "team-regional",
    skin: "#8f5c3a",
    hair: "#1b1611",
    brow: "#221b14",
    iris: "#3a2a1a",
    hairStyle: "crop",
    garment: "blazer",
    jacket: "#39424b",
    shirt: "#dfe3e7",
    beard: "none",
    backdrop: "window",
  },
  {
    id: "team-analyst",
    skin: "#eac9ae",
    hair: "#241a13",
    brow: "#2b2018",
    iris: "#3c5566",
    hairStyle: "long",
    garment: "crew",
    jacket: "#1c2126",
    shirt: "#1c2126",
    beard: "none",
    glasses: true,
    backdrop: "monitors",
  },
];

/** Role backdrops. Low contrast, out of focus, never a passenger scene. */
function teamBackdrop(kind, W, H, ns, rng) {
  const out = [];
  const soft = ` filter="url(#${ns}-bgblur)"`;
  const g = (o) => `<g opacity="${f(o)}"${soft}>`;

  if (kind === "racking") {
    out.push(g(0.62));
    for (let i = 0; i < 5; i += 1) {
      const x = 40 + i * 205;
      out.push(rect(x, 120, 26, 760, P.g600));
      for (let r = 0; r < 4; r += 1) {
        out.push(rect(x, 190 + r * 190, 205, 16, P.g500));
        if (rng() > 0.35) {
          out.push(rect(x + 40, 206 + r * 190, 120, 92, mix(P.g600, P.alu, 0.18)));
        }
      }
    }
    out.push("</g>");
  } else if (kind === "stand") {
    out.push(g(0.7));
    out.push(rect(0, 90, W, 700, P.g700));
    out.push(rect(60, 150, 320, 560, mix(P.g700, P.alu, 0.12)));
    out.push(rect(560, 150, 300, 560, mix(P.g700, P.alu, 0.06)));
    out.push(rect(60, 150, 320, 12, P.blueDeep));
    out.push(rect(560, 150, 300, 12, P.blueDeep));
    out.push("</g>");
    out.push(
      ellipse(W * 0.5, H * 0.30, W * 0.46, H * 0.24, P.blue, 'opacity="0.10"'),
    );
  } else if (kind === "binders") {
    out.push(g(0.66));
    for (let r = 0; r < 4; r += 1) {
      const y = 150 + r * 200;
      out.push(rect(0, y + 140, W, 18, P.g500));
      let x = 24;
      while (x < W - 40) {
        const w = 26 + Math.round(rng.range(0, 22));
        const v = rng.range(0.06, 0.24);
        out.push(rect(x, y + 22, w, 118, mix(P.g700, P.alu, v)));
        x += w + 6;
      }
    }
    out.push("</g>");
    out.push(rrect(700, 700, 150, 60, 8, P.g600, 'opacity="0.7"'));
  } else if (kind === "engine") {
    out.push(g(0.7));
    out.push(circle(300, 470, 260, P.g600));
    out.push(circle(300, 470, 190, P.g700));
    out.push(circle(300, 470, 60, P.g500));
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      out.push(
        poly(
          [
            [300 + Math.cos(a) * 62, 470 + Math.sin(a) * 62],
            [300 + Math.cos(a + 0.18) * 186, 470 + Math.sin(a + 0.18) * 186],
            [300 + Math.cos(a + 0.34) * 186, 470 + Math.sin(a + 0.34) * 186],
          ],
          P.g500,
          'opacity="0.7"',
        ),
      );
    }
    out.push(rect(120, 720, 360, 22, P.g500));
    out.push(rect(150, 742, 26, 180, P.g600));
    out.push(rect(430, 742, 26, 180, P.g600));
    out.push(rect(690, 200, 30, 700, P.g600));
    out.push("</g>");
  } else if (kind === "window") {
    out.push(
      rect(0, 0, W, H, `url(#${ns}-dusk)`),
    );
    out.push(g(0.8));
    out.push(rect(0, 640, W, 6, P.g500));
    out.push(rect(300, 60, 16, 860, P.g600));
    out.push(rect(640, 60, 16, 860, P.g600));
    out.push("</g>");
    for (let i = 0; i < 12; i += 1) {
      out.push(
        circle(30 + i * 78, 700 + (i % 3) * 12, 4, i % 4 === 0 ? P.blueBright : "#f0d9a8", 'opacity="0.5"'),
      );
    }
  } else {
    // monitors
    out.push(g(0.72));
    out.push(rrect(20, 210, 400, 520, 12, P.g800));
    out.push(rrect(470, 240, 400, 470, 12, P.g800));
    out.push(rrect(40, 230, 360, 480, 6, "#101820"));
    out.push(rrect(490, 260, 360, 430, 6, "#101820"));
    let prev = [60, 560];
    for (let i = 1; i <= 8; i += 1) {
      const x = 60 + i * 40;
      const y = 560 - rng.range(0, 240);
      out.push(line(prev[0], prev[1], x, y, P.blueBright, 5, 'opacity="0.55" stroke-linecap="round"'));
      prev = [x, y];
    }
    for (let i = 0; i < 6; i += 1) {
      out.push(rect(510, 300 + i * 58, 120 + rng.range(0, 180), 22, P.blueDeep, 'opacity="0.5"'));
    }
    out.push("</g>");
  }
  return out.join("");
}

function renderTeam(spec) {
  const W = 900;
  const H = 1200;
  const ns = "t";
  const rng = makeRng(hashSeed(spec.id));
  const colors = {
    skin: spec.skin,
    hair: spec.hair,
    brow: spec.brow,
    iris: spec.iris,
    hairStyle: spec.hairStyle,
    garment: spec.garment,
    jacket: spec.jacket,
    shirt: spec.shirt,
    beard: spec.beard,
    glasses: spec.glasses === true,
    headset: spec.headset === true,
  };
  const rig = { ...TEAM_RIG, rng, colors, ns, gaze: 1 };
  const bust = renderBust(rig);

  const defs = [
    linGrad(`${ns}-bg`, 0, 0, 0, 1, [
      [0, "#242b31"],
      [0.5, "#1b2126"],
      [1, "#14181c"],
    ]),
    linGrad(`${ns}-dusk`, 0, 0, 0, 1, [
      [0, "#2a3a4c"],
      [0.5, "#3d4a58"],
      [0.62, "#7d6a58"],
      [0.63, "#1c2126"],
      [1, "#14181c"],
    ]),
    radGrad(
      `${ns}-key`,
      W * 0.30,
      H * 0.22,
      W * 0.95,
      [
        [0, "#ffffff", 0.13],
        [1, "#14181c", 0],
      ],
      true,
    ),
    radGrad(
      `${ns}-vig`,
      W * 0.5,
      H * 0.46,
      Math.max(W, H) * 0.66,
      [
        [0, "#000000", 0],
        [0.58, "#000000", 0.12],
        [1, "#05070a", 0.62],
      ],
      true,
    ),
    blur(`${ns}-bgblur`, 13, 30),
    blur(`${ns}-soft`, 22, 30),
    ...bustDefs(ns, rig, colors),
  ];

  const body = [
    rect(0, 0, W, H, `url(#${ns}-bg)`),
    teamBackdrop(spec.backdrop, W, H, ns, rng),
    rect(0, 0, W, H, `url(#${ns}-key)`),
    `<g opacity="0.30" filter="url(#${ns}-soft)">`,
    path(bust.body, "#05080b", 'transform="translate(56 22)"'),
    path(bust.head, "#05080b", 'transform="translate(56 22)"'),
    "</g>",
    `<g transform="rotate(-2.2 ${f(TEAM_RIG.cx)} ${f(H)})">`,
    bust.markup,
    "</g>",
    rect(0, 0, W, H, `url(#${ns}-vig)`),
  ].join("\n");

  return svgDoc(spec.id, W, H, defs, body);
}

/* ==========================================================================
   8. Office HQ — 16:9, 2560x1440, nine layers that must stack pixel for pixel
   --------------------------------------------------------------------------
   Every number below is derived from the percentages in OfficeHQ.css, so the
   art lands exactly under the DOM overlays the component paints on top of it
   (screen glows, the demand chart, the ATA readout, the call dot, the steam,
   the phone light) and exactly inside the hotspot rectangles.
   ========================================================================== */

const HQ_W = 2560;
const HQ_H = 1440;
const px = (p) => (HQ_W * p) / 100;
const py = (p) => (HQ_H * p) / 100;

/** left/top/width/height in CSS percent -> pixel box. */
function cssBox(leftPct, topPct, wPct, hPct) {
  const x = px(leftPct);
  const y = py(topPct);
  const w = px(wPct);
  const h = py(hPct);
  return { x, y, w, h, x2: x + w, y2: y + h, cx: x + w / 2, cy: y + h / 2 };
}

const HQ = {
  screenLeft: cssBox(28.2, 27.8, 12.5, 40.4),
  screenCentre: cssBox(43.3, 27, 13.4, 42.5),
  screenRight: cssBox(59.3, 27.8, 12.5, 40.4),
  screenSide: cssBox(75.5, 33, 10.5, 25),
  head: cssBox(46.6, 46.8, 6.8, 11),
  // The solid pier on the left of frame. It is the only opaque stretch of the
  // back wall left once the glazing runs, and it is what the certificate grid
  // hangs on. Its right edge is the first curtain-wall jamb.
  pier: { x: 132, y: 0, w: 468, x2: 600 },
  // Full-height curtain wall: from the ceiling head trim down to the floor
  // line, from the pier across to the right edge of frame. `window` stays the
  // name every downstream helper already uses; only its box changed.
  window: (() => {
    const x = 600;
    const y = 118;
    const x2 = HQ_W;
    const y2 = 1068;
    return { x, y, w: x2 - x, h: y2 - y, x2, y2 };
  })(),
  // Frame thickness of the curtain wall, and the mullion/transom grid inside
  // it. hq-room paints the aluminium; hq-window paints the view, clipped to
  // exactly the same glass rectangle, so the two can never drift.
  glazing: { frame: 18, bays: 5, mullion: 14, transomY: 470, transomH: 12 },
  foregroundTop: py(87),
  cup: { cx: px(68) + px(2.4) / 2, rimY: py(87) + 4, r: px(2.4) * 0.78 },
  phoneLight: { cx: px(24) + px(0.7) / 2, cy: HQ_H - py(7.5) - px(0.7) / 2 },
  // The desk sits low in frame on purpose: a standing desk whose surface is well
  // below the founder's shoulders, so the figure reads as standing at it.
  floorY: 1068,
  deskBackY: 1043,
  deskFrontY: 1110,
  deskLipY: 1140,
  deskBackX0: 660,
  deskBackX1: 2300,
  deskFrontX0: 596,
  deskFrontX1: 2380,
  // The founder, from behind, standing. Shoulder tips land 121px above the back
  // edge of the desk; the widest point (196) stays inside the centre monitor's
  // bezel, so the figure never touches the flanking panels.
  founder: {
    neckTopY: 806,
    neckHalf: 40,
    collarY: 858,
    shoulderTipX: 178,
    shoulderTipY: 922,
    shoulderDrop: 8,
    armpitX: 138,
    armpitY: 972,
    waistX: 96,
    waistY: 1156,
    hipX: 116,
    hipY: 1252,
    armOuterX: 196,
    armInnerX: 130,
  },
};

/**
 * Monitor faces: three portrait panels, 9:16 each, angled toward the viewer.
 * The outer edge of each flanking panel is the near edge, so it is drawn taller
 * than the inner edge; the centre panel faces the camera square on. Each quad
 * contains its CSS rect, and every quad's width:height sits on 9:16 (0.5625).
 *   left/right  320 x 570 (0.561)   centre  344 x 612 (0.562)
 */
const MON = {
  left: [
    [722, 400],
    [1042, 412],
    [1042, 970],
    [722, 982],
  ],
  centre: [
    [1108, 388],
    [1452, 388],
    [1452, 1000],
    [1108, 1000],
  ],
  right: [
    [1518, 412],
    [1838, 400],
    [1838, 982],
    [1518, 970],
  ],
  side: [
    [1920, 462],
    [2216, 470],
    [2216, 848],
    [1920, 840],
  ],
};

function growQuad(q, pad) {
  const cx = q.reduce((s, p) => s + p[0], 0) / q.length;
  const cy = q.reduce((s, p) => s + p[1], 0) / q.length;
  return q.map(([x, y]) => [x + Math.sign(x - cx) * pad, y + Math.sign(y - cy) * pad]);
}

function quadBounds(q) {
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * The twelve certificate frames. Computed once, at module scope, and shared by
 * hq-wall-empty and hq-wall-filled so the two states cannot drift by a pixel.
 */
const WALL_FRAMES = (() => {
  const rng = makeRng(hashSeed("hq-wall-frames"));
  const fw = 176;
  const fh = 112;
  const cols = 2;
  const rowCount = 6;
  const gapX = 32;
  const pitchX = fw + gapX;
  const pitchY = 120;
  // Centred on the pier, hung as a tall two-wide column: reads as a lobby
  // credential wall on a solid return, and clears the founder entirely.
  const x0 = HQ.pier.x + (HQ.pier.w - (cols * fw + (cols - 1) * gapX)) / 2;
  const y0 = 132;
  const frames = [];
  for (let r = 0; r < rowCount; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      frames.push({
        x: x0 + c * pitchX + rng.range(-4, 4),
        y: y0 + r * pitchY + rng.range(-3, 3),
        w: fw,
        h: fh,
      });
    }
  }
  return frames;
})();

/** Tight bounds of the grid. The .officehq-hotspot--wall rect is this box. */
const WALL_GRID = (() => {
  const xs = WALL_FRAMES.map((fr) => fr.x);
  const ys = WALL_FRAMES.map((fr) => fr.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const x2 = Math.max(...WALL_FRAMES.map((fr) => fr.x + fr.w));
  const y2 = Math.max(...WALL_FRAMES.map((fr) => fr.y + fr.h));
  return { x, y, x2, y2, w: x2 - x, h: y2 - y };
})();

/** The little award, standing on the credenza below the grid. Filled state only. */
const WALL_AWARD = { x: 492, y: 850, w: 48, h: 74, standY: 924 };

function hqDoc(id, defs, body) {
  return svgDoc(id, HQ_W, HQ_H, defs, body);
}

/* --- hq-room: the only opaque layer. Window glass is cut out so hq-window
   (which sits underneath at z-index 1) shows through. ---------------------- */
function renderHqRoom() {
  const rng = makeRng(hashSeed("hq-room"));
  const win = HQ.window;
  const gz = HQ.glazing;
  const pier = HQ.pier;
  // The glass aperture: the curtain wall minus its perimeter frame. hq-window
  // clips to this exact rectangle, so the cut-out and the view always agree.
  const glass = {
    x: win.x + gz.frame,
    y: win.y + gz.frame,
    x2: win.x2 - gz.frame,
    y2: win.y2 - gz.frame,
  };
  const bayW = (glass.x2 - glass.x) / gz.bays;
  const defs = [
    // Warm white plaster, daylit from the glazing on the right.
    linGrad("wallG", 0, 0, 0, HQ.floorY, [
      [0, "#e9edf0"],
      [0.42, "#e2e7eb"],
      [1, "#d5dbe0"],
    ], true),
    linGrad("wallLight", 0, 0, HQ_W, 0, [
      [0, "#5a646e", 0.16],
      [0.44, "#5a646e", 0.05],
      [0.82, "#ffffff", 0.20],
      [1, "#ffffff", 0.30],
    ], true),
    linGrad("floorG", 0, HQ.floorY, 0, HQ_H, [
      [0, "#c6ced5"],
      [0.5, "#bcc5cc"],
      [1, "#b2bbc3"],
    ], true),
    linGrad("floorLight", 900, 0, 2560, 0, [
      [0, "#ffffff", 0],
      [1, "#ffffff", 0.34],
    ], true),
    linGrad("pool", 1200, 1440, 2400, HQ.floorY, [
      [0, "#eef4fa", 0],
      [1, "#ffffff", 0.42],
    ], true),
    linGrad("deskTop", 0, HQ.deskBackY, 0, HQ.deskFrontY, [
      [0, "#b6bfc7"],
      [0.35, "#dde2e7"],
      [1, "#c0c9d0"],
    ], true),
    linGrad("deskFace", 0, HQ.deskFrontY, 0, HQ.deskLipY, [
      [0, "#a3acb4"],
      [1, "#68727c"],
    ], true),
    linGrad("ceilGlow", 0, 70, 0, 420, [
      [0, "#ffffff", 0.34],
      [1, "#ffffff", 0],
    ], true),
    // Daylight spilling off the glazing across the pier and the near floor.
    linGrad("dayWash", win.x, 0, pier.x, 0, [
      [0, "#ffffff", 0.34],
      [1, "#ffffff", 0],
    ], true),
    radGrad("roomVig", HQ_W * 0.5, HQ_H * 0.46, HQ_W * 0.62, [
      [0, "#ffffff", 0],
      [0.7, "#ffffff", 0],
      [1, "#7d8792", 0.22],
    ], true),
  ];

  const body = [];

  // Back wall, with the full glazed aperture cut out (even-odd).
  const wallPath = `M 0 0 H ${HQ_W} V ${f(HQ.floorY)} H 0 Z
       M ${f(glass.x)} ${f(glass.y)} H ${f(glass.x2)} V ${f(glass.y2)} H ${f(glass.x)} Z`;
  body.push(`<path fill-rule="evenodd" d="${d(wallPath)}" fill="url(#wallG)"/>`);
  body.push(`<path fill-rule="evenodd" d="${d(wallPath)}" fill="url(#wallLight)"/>`);

  // Ceiling and its light strip.
  body.push(rect(0, 0, HQ_W, 108, "#eff2f5"));
  body.push(rect(0, 106, HQ_W, 3, "#b9c1c8", 'opacity="0.7"'));
  body.push(rrect(420, 42, 1560, 26, 6, "#ffffff"));
  body.push(rrect(420, 42, 1560, 8, 4, "#ffffff", 'opacity="0.9"'));
  body.push(rect(300, 70, 1960, 350, "url(#ceilGlow)"));

  // The solid pier on the left. Certificate frames hang on this face.
  body.push(rect(pier.x, 0, pier.w, HQ.floorY, "#dfe4e9"));
  body.push(rect(pier.x, 0, pier.w, HQ.floorY, "url(#dayWash)"));
  body.push(rect(pier.x2 - 3, 0, 3, HQ.floorY, "#aeb7bf", 'opacity="0.8"'));
  body.push(rect(pier.x, 0, 2, HQ.floorY, "#c3cad1", 'opacity="0.7"'));

  // Left return wall, for depth.
  body.push(rect(0, 0, 132, HQ.floorY, "#cbd2d8"));
  body.push(rect(130, 0, 2, HQ.floorY, "#a9b2ba", 'opacity="0.8"'));

  // A low credenza against the pier, standing on the floor line.
  body.push(rect(170, HQ.floorY - 138, 430, 138, "#c9d0d7"));
  body.push(rect(170, HQ.floorY - 144, 430, 10, P.alu));
  body.push(rect(170, HQ.floorY - 144, 430, 3, "#ffffff", 'opacity="0.8"'));
  body.push(rect(316, HQ.floorY - 138, 4, 138, "#a9b2ba", 'opacity="0.8"'));
  body.push(circle(300, HQ.floorY - 70, 6, P.blueBright, 'opacity="0.7"'));

  // Skirting, only where there is wall to skirt: the glazing runs to the floor.
  body.push(rect(0, HQ.floorY - 14, win.x, 14, "#c0c8cf"));
  body.push(rect(0, HQ.floorY, HQ_W, 3, "#98a2ab", 'opacity="0.7"'));

  // Floor, the daylight pool off the glazing, and the desk's soft shadow.
  body.push(rect(0, HQ.floorY, HQ_W, HQ_H - HQ.floorY, "url(#floorG)"));
  body.push(rect(0, HQ.floorY, HQ_W, HQ_H - HQ.floorY, "url(#floorLight)"));
  body.push(
    poly(
      [
        [2560, HQ.floorY],
        [2560, HQ_H],
        [1120, HQ_H],
        [1810, HQ.floorY],
      ],
      "url(#pool)",
    ),
  );
  body.push(
    poly(
      [
        [HQ.deskFrontX0, HQ.deskLipY],
        [HQ.deskFrontX1, HQ.deskLipY],
        [1880, HQ_H],
        [60, HQ_H],
      ],
      "#5c666f",
      'opacity="0.20"',
    ),
  );

  // Curtain wall: perimeter frame, then slim aluminium mullions and one
  // transom, all painted over the cut-out so the glass reads as glass.
  body.push(
    `<path fill-rule="evenodd" d="${d(
      `M ${f(win.x)} ${f(win.y)} H ${f(win.x2)} V ${f(win.y2)} H ${f(win.x)} Z
       M ${f(glass.x)} ${f(glass.y)} H ${f(glass.x2)} V ${f(glass.y2)} H ${f(glass.x)} Z`,
    )}" fill="${P.aluMid}"/>`,
  );
  body.push(rect(win.x, win.y, win.w, 6, P.aluLight, 'opacity="0.9"'));
  body.push(rect(win.x, win.y, 6, win.h, P.aluLight, 'opacity="0.9"'));
  body.push(rect(win.x, win.y2 - 6, win.w, 6, "#8f99a2", 'opacity="0.8"'));
  for (let i = 1; i < gz.bays; i += 1) {
    const mx = glass.x + bayW * i - gz.mullion / 2;
    body.push(rect(mx, glass.y, gz.mullion, glass.y2 - glass.y, P.aluMid));
    body.push(rect(mx, glass.y, 4, glass.y2 - glass.y, P.aluLight, 'opacity="0.85"'));
  }
  body.push(rect(glass.x, gz.transomY, glass.x2 - glass.x, gz.transomH, P.aluMid));
  body.push(rect(glass.x, gz.transomY, glass.x2 - glass.x, 4, P.aluLight, 'opacity="0.85"'));
  // Two raking reflections across the glass, kept very faint.
  for (const sx of [glass.x + 240, glass.x + 1180]) {
    body.push(
      poly(
        [
          [sx, glass.y2],
          [sx + 300, glass.y],
          [sx + 430, glass.y],
          [sx + 130, glass.y2],
        ],
        "#ffffff",
        'opacity="0.07"',
      ),
    );
  }

  // Standing desk.
  body.push(
    poly(
      [
        [HQ.deskBackX0, HQ.deskBackY],
        [HQ.deskBackX1, HQ.deskBackY],
        [HQ.deskFrontX1, HQ.deskFrontY],
        [HQ.deskFrontX0, HQ.deskFrontY],
      ],
      "url(#deskTop)",
    ),
  );
  body.push(rect(HQ.deskFrontX0, HQ.deskFrontY, HQ.deskFrontX1 - HQ.deskFrontX0, 30, "url(#deskFace)"));
  body.push(rect(HQ.deskFrontX0, HQ.deskFrontY, HQ.deskFrontX1 - HQ.deskFrontX0, 3, "#ffffff", 'opacity="0.6"'));
  body.push(rect(880, HQ.deskLipY + 8, 1160, 20, "#5c666f", 'opacity="0.45"'));
  for (const lx of [790, 2090]) {
    body.push(poly([[lx, HQ.deskLipY], [lx + 62, HQ.deskLipY], [lx + 70, 1292], [lx - 8, 1292]], "#8b949c"));
    body.push(rect(lx - 8, HQ.deskLipY, 12, 210, "#d6dce1", 'opacity="0.7"'));
    body.push(rrect(lx - 40, 1288, 148, 16, 4, "#7f888f"));
  }

  // Dust and haze in the daylight, kept faint.
  for (let i = 0; i < 26; i += 1) {
    const x = rng.range(1500, 2500);
    const y = rng.range(400, 1200);
    body.push(circle(x, y, rng.range(1.5, 4), "#ffffff", `opacity="${f(rng.range(0.10, 0.28))}"`));
  }

  body.push(rect(0, 0, HQ_W, HQ_H, "url(#roomVig)"));
  return hqDoc("hq-room", defs, body.join("\n"));
}

/* --- hq-window: what the glass shows. Transparent everywhere else. -------- */
function renderHqWindow() {
  const rng = makeRng(hashSeed("hq-window"));
  const w = HQ.window;
  const horizon = w.y + w.h * 0.74;
  const defs = [
    linGrad("skyG", 0, w.y, 0, w.y2, [
      [0, "#8fb2d2"],
      [0.42, "#b9cfe2"],
      [0.74, "#dfe8ef"],
      [1, "#cfd8de"],
    ], true),
    radGrad("sun", w.x2 - 120, w.y + 150, 420, [
      [0, "#ffffff", 0.85],
      [0.35, "#eef3f8", 0.30],
      [1, "#eef3f8", 0],
    ], true),
    linGrad("hazeG", 0, horizon - 120, 0, horizon, [
      [0, "#ffffff", 0],
      [1, "#ffffff", 0.55],
    ], true),
  ];
  const body = [];
  body.push(`<g clip-path="url(#winClip)">`);
  body.push(rect(w.x, w.y, w.w, w.h, "url(#skyG)"));
  body.push(rect(w.x, w.y, w.w, w.h, "url(#sun)"));

  // Cloud strata: flat, wide, low contrast.
  for (let i = 0; i < 16; i += 1) {
    const cy = w.y + rng.range(60, w.h * 0.55);
    const cx = w.x + rng.range(40, w.w - 40);
    const rx = rng.range(90, 260);
    body.push(ellipse(cx, cy, rx, rx * rng.range(0.10, 0.18), "#ffffff", `opacity="${f(rng.range(0.18, 0.42))}"`));
  }

  // Two contrails, thin and parallel.
  body.push(line(w.x + 30, w.y + 210, w.x2 - 40, w.y + 96, "#ffffff", 4, 'opacity="0.30"'));
  body.push(line(w.x + 60, w.y + 268, w.x2 - 20, w.y + 158, "#ffffff", 3, 'opacity="0.18"'));

  body.push(rect(w.x, horizon - 120, w.w, 120, "url(#hazeG)"));

  // Distant apron: flat structures only, no liveries, no foliage.
  body.push(rect(w.x, horizon, w.w, w.y2 - horizon, "#aab5be"));
  body.push(rect(w.x, horizon, w.w, 4, "#8e99a3", 'opacity="0.7"'));
  // Distant apron structures, spread across the full run of the curtain wall.
  for (let i = 0; i < 6; i += 1) {
    const bx = w.x + 40 + i * (w.w / 6);
    const bw = rng.range(130, 240);
    const bh = rng.range(26, 54);
    body.push(rect(bx, horizon - bh, bw, bh, "#7d8a95", 'opacity="0.85"'));
    body.push(rect(bx + 20, horizon - bh - 16, 22, 16, "#7d8a95", 'opacity="0.85"'));
  }
  for (const tx of [w.x + 470, w.x + 1340]) {
    body.push(rect(tx, horizon - 120, 26, 120, "#7d8a95", 'opacity="0.9"'));
    body.push(rect(tx - 12, horizon - 140, 50, 24, "#8e99a3", 'opacity="0.9"'));
  }
  body.push(rect(w.x, horizon + 60, w.w, 3, "#98a3ac", 'opacity="0.6"'));
  body.push(rect(w.x, w.y2 - 90, w.w, 90, "#9aa5ae", 'opacity="0.55"'));
  body.push("</g>");
  defs.push(
    `<clipPath id="winClip"><rect x="${f(w.x + HQ.glazing.frame)}" y="${f(w.y + HQ.glazing.frame)}" width="${f(w.w - HQ.glazing.frame * 2)}" height="${f(w.h - HQ.glazing.frame * 2)}"/></clipPath>`,
  );
  return hqDoc("hq-window", defs, body.join("\n"));
}

/* --- Monitors. Idle carries the hardware; lit carries only the bright screens,
   so the hover cross-fade changes the glass and nothing else. --------------- */

function bezel(quad, id) {
  const outer = growQuad(quad, 18);
  return [
    poly(outer, "#20262c"),
    poly(growQuad(quad, 6), "#2e363e"),
    poly(quad, "#0d1115"),
    `<polyline points="${pts([outer[0], outer[1]])}" fill="none" stroke="${P.aluDark}" stroke-width="3" opacity="0.55"/>`,
    `<polyline points="${pts([outer[3], outer[0]])}" fill="none" stroke="${P.aluDark}" stroke-width="3" opacity="0.35"/>`,
  ].join("");
}

/** A slim neck on a flat oval foot: the low stand a portrait panel sits on. */
function monitorStand(quad, deskY) {
  const b = quadBounds(quad);
  const cx = (b.x + b.x2) / 2;
  const neckTop = b.y2 + 4;
  const neckH = Math.max(16, deskY - 26 - neckTop);
  return [
    rect(cx - 19, neckTop, 38, neckH, "#39424b"),
    rect(cx - 19, neckTop, 9, neckH, "#5d666f", 'opacity="0.7"'),
    ellipse(cx, deskY - 10, 96, 18, "#2b333a"),
    ellipse(cx, deskY - 14, 88, 14, "#4a545e"),
    ellipse(cx, deskY + 6, 120, 16, "#05070a", 'opacity="0.32"'),
  ].join("");
}

/** Abstract screen furniture. No text, no numerals, nothing legible. */
function screenContent(kind, quad, lit, rng) {
  const b = quadBounds(quad);
  const acc = lit ? P.blueBright : P.blue;
  const dim = lit ? 0.85 : 0.42;
  const out = [];
  const pad = 26;
  const x = b.x + pad;
  const w = b.w - pad * 2;

  if (kind === "dashboard") {
    // Tall stack: header, six rows, a ring, a footer rule.
    out.push(rect(x, b.y + b.h * 0.05, w, 10, acc, `opacity="${f(dim * 0.8)}"`));
    for (let i = 0; i < 6; i += 1) {
      const y = b.y + b.h * 0.115 + i * (b.h * 0.062);
      out.push(
        rrect(x, y, w * rng.range(0.42, 0.94), b.h * 0.036, 6, acc, `opacity="${f(dim * rng.range(0.3, 0.62))}"`),
      );
    }
    const dcx = b.x + b.w * 0.5;
    const dcy = b.y2 - b.h * 0.245;
    const dr = b.w * 0.26;
    out.push(circle(dcx, dcy, dr, "none", `stroke="${acc}" stroke-width="20" opacity="${f(dim * 0.35)}"`));
    out.push(
      `<path d="${d(
        `M ${f(dcx)} ${f(dcy - dr)} A ${f(dr)} ${f(dr)} 0 0 1 ${f(dcx + dr * 0.87)} ${f(dcy + dr * 0.5)}`,
      )}" fill="none" stroke="${acc}" stroke-width="20" opacity="${f(dim)}" stroke-linecap="round"/>`,
    );
    out.push(rect(x, b.y2 - b.h * 0.055, w * 0.5, 8, acc, `opacity="${f(dim * 0.5)}"`));
  } else if (kind === "grid") {
    // The app paints its demand chart and ATA readout across the upper middle of
    // this panel and the founder stands in front of the lower middle, so the art
    // holds the top strip and the two gutters either side of the figure.
    out.push(rect(x, b.y + b.h * 0.03, w * 0.55, 12, acc, `opacity="${f(dim * 0.8)}"`));
    out.push(rect(x, b.y + b.h * 0.062, w, 3, acc, `opacity="${f(dim * 0.4)}"`));
    const railW = b.w * 0.16;
    const railY = b.y + b.h * 0.5;
    for (let c = 0; c < 2; c += 1) {
      const rx0 = c === 0 ? x : b.x2 - pad - railW;
      for (let r = 0; r < 7; r += 1) {
        const on = rng() > 0.42;
        out.push(
          rect(
            rx0,
            railY + r * (b.h * 0.052),
            railW * rng.range(0.55, 1),
            b.h * 0.032,
            acc,
            `opacity="${f(dim * (on ? 0.55 : 0.18))}"`,
          ),
        );
      }
    }
  } else {
    // node tree
    const nx = b.x + b.w * 0.26;
    out.push(rect(x, b.y + b.h * 0.055, w * 0.7, 10, acc, `opacity="${f(dim * 0.7)}"`));
    let prevY = b.y + b.h * 0.13;
    out.push(circle(nx, prevY, 16, acc, `opacity="${f(dim)}"`));
    for (let i = 0; i < 5; i += 1) {
      const y = b.y + b.h * 0.22 + i * (b.h * 0.135);
      const bx = nx + b.w * 0.24 + (i % 2) * (b.w * 0.13);
      out.push(line(nx, prevY, nx, y, acc, 5, `opacity="${f(dim * 0.55)}"`));
      out.push(line(nx, y, bx, y, acc, 5, `opacity="${f(dim * 0.55)}"`));
      out.push(circle(bx, y, 13, acc, `opacity="${f(dim * rng.range(0.5, 1))}"`));
      out.push(
        rect(bx + b.w * 0.075, y - 7, rng.range(b.w * 0.1, b.w * 0.28), 14, acc, `opacity="${f(dim * 0.3)}"`),
      );
      prevY = y;
    }
  }
  return `<g clip-path="url(#${kind}Clip)">${out.join("")}</g>`;
}

function screenDefs(lit) {
  const a = lit ? 0.55 : 0.16;
  return [
    `<clipPath id="dashboardClip"><polygon points="${pts(MON.left)}"/></clipPath>`,
    `<clipPath id="gridClip"><polygon points="${pts(MON.centre)}"/></clipPath>`,
    `<clipPath id="treeClip"><polygon points="${pts(MON.right)}"/></clipPath>`,
    linGrad("glassL", 722, 400, 1042, 982, [
      [0, lit ? "#12283f" : "#131a20"],
      [1, lit ? "#0d1c2e" : "#0d1216"],
    ], true),
    linGrad("glassC", 1108, 388, 1452, 1000, [
      [0, lit ? "#13304a" : "#141b22"],
      [1, lit ? "#0d1f34" : "#0d1217"],
    ], true),
    linGrad("glassR", 1518, 400, 1838, 982, [
      [0, lit ? "#12283f" : "#131a20"],
      [1, lit ? "#0d1c2e" : "#0d1216"],
    ], true),
    radGrad("screenBloom", 1280, 700, 820, [
      [0, P.blueBright, a],
      [1, P.blueBright, 0],
    ], true),
  ];
}

function renderHqMonitors(lit) {
  const id = lit ? "hq-monitors-lit" : "hq-monitors-idle";
  const rng = makeRng(hashSeed(id));
  const defs = screenDefs(lit);
  const body = [];

  if (!lit) {
    body.push(monitorStand(MON.left, HQ.deskBackY + 20));
    body.push(monitorStand(MON.centre, HQ.deskBackY + 28));
    body.push(monitorStand(MON.right, HQ.deskBackY + 20));
    body.push(bezel(MON.left, "l"));
    body.push(bezel(MON.centre, "c"));
    body.push(bezel(MON.right, "r"));
  }

  body.push(poly(MON.left, "url(#glassL)"));
  body.push(poly(MON.centre, "url(#glassC)"));
  body.push(poly(MON.right, "url(#glassR)"));
  body.push(screenContent("dashboard", MON.left, lit, rng));
  body.push(screenContent("grid", MON.centre, lit, rng));
  body.push(screenContent("tree", MON.right, lit, rng));

  // Glass sheen, identical in both states so the cross-fade stays quiet.
  for (const q of [MON.left, MON.centre, MON.right]) {
    const b = quadBounds(q);
    body.push(
      `<g clip-path="url(#${q === MON.left ? "dashboard" : q === MON.centre ? "grid" : "tree"}Clip)">` +
        poly(
          [
            [b.x, b.y2],
            [b.x + b.w * 0.42, b.y],
            [b.x + b.w * 0.62, b.y],
            [b.x + b.w * 0.16, b.y2],
          ],
          "#ffffff",
          'opacity="0.035"',
        ) +
        "</g>",
    );
  }

  if (lit) {
    body.push(rect(540, 300, 1480, 820, "url(#screenBloom)", 'style="mix-blend-mode:screen"'));
  } else {
    // A single status dot per monitor. Navigation green, nothing else.
    body.push(circle(quadBounds(MON.left).x2 + 8, quadBounds(MON.left).y2 + 6, 5, P.green, 'opacity="0.8"'));
    body.push(circle(quadBounds(MON.centre).x2 + 8, quadBounds(MON.centre).y2 + 6, 5, P.green, 'opacity="0.8"'));
    body.push(circle(quadBounds(MON.right).x2 + 8, quadBounds(MON.right).y2 + 6, 5, P.green, 'opacity="0.8"'));
  }

  return hqDoc(id, defs, body.join("\n"));
}

/* --- hq-founder-idle: the founder standing at the desk, seen from behind. The
   head is an opening, because OfficeHQ.tsx renders the chosen portrait behind
   this layer.

   Nothing here may read as furniture. The silhouette is a head, a neck, a
   sloping trapezius, two deltoids, two upper arms modelled as rounded masses,
   and a ribcage that pinches to a waist before it flares into the hips — with
   real daylight between each arm and the waist, which no chair back has. The
   right shoulder sits a little lower than the left, because a body at rest is
   never symmetrical. The shoulder tips land 121px above the back edge of the
   desk, so the figure plainly stands at the surface. ------------------------ */
function renderHqFounder() {
  const h = HQ.head;
  const g = HQ.founder;
  const cx = h.cx;
  const cy = h.cy;
  const rx = h.w / 2;
  const ry = h.h / 2;
  const bottom = HQ_H;

  /** Signed offset from the spine: side -1 is camera-left, +1 camera-right. */
  const X = (side, dx) => cx + side * dx;
  /** Camera-right is the window side, and it carries the lower shoulder. */
  const tipY = (side) => g.shoulderTipY + (side > 0 ? g.shoulderDrop : 0);

  const defs = [
    linGrad("founderG", cx - g.armOuterX, g.shoulderTipY, cx + g.armOuterX, bottom, [
      [0, "#1c2229"],
      [0.42, "#2d363f"],
      [1, "#161b20"],
    ], true),
    linGrad("founderHead", cx, cy - ry * 1.3, cx, cy + ry * 1.3, [
      [0, "#333c45"],
      [1, "#161b21"],
    ], true),
    // One gradient per arm, dark where it meets the ribs and light on the
    // outside, so each upper arm reads as a round mass rather than a rail.
    linGrad("founderArmL", cx - g.armOuterX, 0, cx - g.armInnerX, 0, [
      [0, "#232b33"],
      [1, "#0f141a"],
    ], true),
    linGrad("founderArmR", cx + g.armInnerX, 0, cx + g.armOuterX, 0, [
      [0, "#151b21"],
      [1, "#3a444d"],
    ], true),
  ];

  /** Head, neck, trapezius, ribcage, waist, hips. One closed contour. */
  function torsoPath() {
    // Written top-to-bottom for one side; the right side is the same list of
    // control points walked back up, so the two halves cannot drift.
    const down = (side) => {
      const t = tipY(side);
      return [
        [g.neckHalf + 2, g.neckTopY + 40, g.neckHalf + 4, g.collarY - 18, g.neckHalf + 12, g.collarY],
        [g.neckHalf * 2.2, g.collarY + 10, g.shoulderTipX * 0.72, t - 44, g.shoulderTipX, t],
        [g.shoulderTipX - 6, t + 18, g.armpitX + 10, g.armpitY - 16, g.armpitX, g.armpitY],
        [g.armpitX - 16, g.armpitY + 62, g.waistX + 6, g.waistY - 70, g.waistX, g.waistY],
        [g.waistX + 2, g.waistY + 44, g.hipX - 4, g.hipY - 44, g.hipX, g.hipY],
        [g.hipX + 5, g.hipY + 70, g.hipX + 8, bottom - 60, g.hipX + 8, bottom],
      ];
    };
    const curve = (side, [ax, ay, bx, by, ex, ey]) =>
      `C ${f(X(side, ax))} ${f(ay)}, ${f(X(side, bx))} ${f(by)}, ${f(X(side, ex))} ${f(ey)}`;
    const up = (side, seg, prev) => {
      // Same segment reversed: end point becomes the previous segment's end.
      const [ax, ay, bx, by] = seg;
      return `C ${f(X(side, bx))} ${f(by)}, ${f(X(side, ax))} ${f(ay)}, ${f(X(side, prev[0]))} ${f(prev[1])}`;
    };
    const left = down(-1);
    const right = down(1);
    const parts = [`M ${f(X(-1, g.neckHalf))} ${f(g.neckTopY)}`];
    for (const seg of left) parts.push(curve(-1, seg));
    parts.push(`L ${f(X(1, g.hipX + 8))} ${f(bottom)}`);
    for (let i = right.length - 1; i >= 0; i -= 1) {
      const prev = i === 0 ? [g.neckHalf, g.neckTopY] : [right[i - 1][4], right[i - 1][5]];
      parts.push(up(1, right[i], prev));
    }
    parts.push("Z");
    return d(parts.join(" "));
  }

  /** One upper arm: a deltoid cap over a long rounded mass. */
  function armPath(side) {
    const t = tipY(side);
    return d(`M ${f(X(side, g.shoulderTipX - 14))} ${f(t - 6)}
      C ${f(X(side, g.armOuterX - 2))} ${f(t + 20)}, ${f(X(side, g.armOuterX))} ${f(t + 52)}, ${f(X(side, g.armOuterX))} ${f(g.armpitY + 40)}
      C ${f(X(side, g.armOuterX))} ${f(g.waistY - 20)}, ${f(X(side, g.armOuterX - 4))} ${f(g.hipY - 40)}, ${f(X(side, g.armOuterX - 10))} ${f(bottom)}
      L ${f(X(side, g.armInnerX + 4))} ${f(bottom)}
      C ${f(X(side, g.armInnerX + 2))} ${f(g.hipY - 40)}, ${f(X(side, g.armInnerX - 2))} ${f(g.waistY - 40)}, ${f(X(side, g.armInnerX))} ${f(g.armpitY + 30)}
      C ${f(X(side, g.armInnerX + 4))} ${f(g.armpitY - 20)}, ${f(X(side, g.shoulderTipX - 44))} ${f(t + 4)}, ${f(X(side, g.shoulderTipX - 14))} ${f(t - 6)} Z`);
  }

  // A skull that tapers into the neck instead of ringing the portrait, so
  // nothing up here can read as a headrest.
  const skull = d(`M ${f(X(-1, rx + 10))} ${f(cy + ry * 0.14)}
    C ${f(X(-1, rx + 10))} ${f(cy - ry * 0.92)}, ${f(X(-1, rx * 0.64))} ${f(cy - ry * 1.22)}, ${f(cx)} ${f(cy - ry * 1.22)}
    C ${f(X(1, rx * 0.64))} ${f(cy - ry * 1.22)}, ${f(X(1, rx + 10))} ${f(cy - ry * 0.92)}, ${f(X(1, rx + 10))} ${f(cy + ry * 0.14)}
    C ${f(X(1, rx + 10))} ${f(cy + ry * 0.74)}, ${f(X(1, rx * 0.8))} ${f(cy + ry * 1.12)}, ${f(X(1, g.neckHalf))} ${f(cy + ry * 1.2)}
    L ${f(X(-1, g.neckHalf))} ${f(cy + ry * 1.2)}
    C ${f(X(-1, rx * 0.8))} ${f(cy + ry * 1.12)}, ${f(X(-1, rx + 10))} ${f(cy + ry * 0.74)}, ${f(X(-1, rx + 10))} ${f(cy + ry * 0.14)} Z`);

  const torso = torsoPath();
  const armL = armPath(-1);
  const armR = armPath(1);

  const body = [];

  body.push(path(skull, "url(#founderHead)"));
  body.push(path(torso, "url(#founderG)"));
  // Definition where the body meets the room, and a shadow where the arm sits
  // against the ribs.
  body.push(path(torso, "none", `stroke="#0b0f13" stroke-width="4" opacity="0.45"`));
  // A small collar notch at the base of the neck. No arcs across the back.
  body.push(
    path(
      `M ${f(X(-1, g.neckHalf * 1.7))} ${f(g.collarY + 22)} C ${f(X(-1, g.neckHalf * 0.9))} ${f(g.collarY - 2)}, ${f(X(1, g.neckHalf * 0.9))} ${f(g.collarY - 2)}, ${f(X(1, g.neckHalf * 1.7))} ${f(g.collarY + 22)}`,
      "none",
      `stroke="#465059" stroke-width="9" opacity="0.55"`,
    ),
  );

  body.push(path(armL, "url(#founderArmL)"));
  body.push(path(armR, "url(#founderArmR)"));

  // Window light picks out the right arm and the right of the skull; a whisper
  // of the accent finds the left.
  body.push(`<g clip-path="url(#rimWindow)">`);
  body.push(path(armR, "none", `stroke="${P.alu}" stroke-width="7" opacity="0.34"`));
  body.push(path(skull, "none", `stroke="${P.alu}" stroke-width="5" opacity="0.22"`));
  body.push("</g>");
  body.push(`<g clip-path="url(#rimAccent)">`);
  body.push(path(armL, "none", `stroke="${P.blueBright}" stroke-width="5" opacity="0.22"`));
  body.push(path(skull, "none", `stroke="${P.blueBright}" stroke-width="4" opacity="0.2"`));
  body.push("</g>");

  defs.push(
    `<clipPath id="rimWindow"><rect x="${f(cx + g.armInnerX * 0.45)}" y="0" width="${f(g.armOuterX * 1.4)}" height="${f(bottom)}"/></clipPath>`,
    `<clipPath id="rimAccent"><rect x="${f(cx - g.armOuterX - 20)}" y="0" width="${f(g.armOuterX * 0.62)}" height="${f(bottom)}"/></clipPath>`,
  );

  // The opening itself is cut with a mask, so every renderer agrees.
  defs.push(
    [
      `<mask id="headHole">`,
      rect(0, 0, HQ_W, HQ_H, "#ffffff"),
      ellipse(cx, cy, rx, ry, "#000000"),
      `</mask>`,
    ].join(""),
  );

  return hqDoc("hq-founder-idle", defs, `<g mask="url(#headHole)">${body.join("\n")}</g>`);
}

/* --- hq-foreground: the near desk edge the camera looks over, plus the two
   props the app animates (steam over the cup, a light on the phone). ------- */
function renderHqForeground() {
  const top = HQ.foregroundTop;
  const cup = HQ.cup;
  const light = HQ.phoneLight;
  const defs = [
    linGrad("fgTop", 0, top, 0, HQ_H, [
      [0, "#c8cfd6"],
      [0.2, "#dfe4e8"],
      [0.7, "#b3bcc4"],
      [1, "#9aa4ad"],
    ], true),
    linGrad("fgShadow", 0, top - 90, 0, top, [
      [0, "#05070a", 0],
      [1, "#05070a", 0.22],
    ], true),
    linGrad("fgFace", 0, 1386, 0, HQ_H, [
      [0, "#7c858e"],
      [1, "#454e57"],
    ], true),
    linGrad("cupG", cup.cx - cup.r, 0, cup.cx + cup.r, 0, [
      [0, "#eef1f3"],
      [0.55, "#cdd4da"],
      [1, "#9aa4ad"],
    ], true),
  ];
  const body = [];

  // Ambient occlusion where the near surface meets the room behind it.
  body.push(rect(0, top - 90, HQ_W, 90, "url(#fgShadow)"));
  body.push(rect(0, top, HQ_W, HQ_H - top, "url(#fgTop)"));
  body.push(rect(0, top, HQ_W, 4, "#ffffff", 'opacity="0.55"'));
  body.push(rect(0, top + 4, HQ_W, 2, "#8f99a2", 'opacity="0.5"'));

  // A brushed grain across the aluminium, straight and fine.
  const grain = makeRng(hashSeed("hq-foreground-grain"));
  for (let i = 0; i < 90; i += 1) {
    const y = top + 10 + grain.range(0, HQ_H - top - 20);
    body.push(rect(0, y, HQ_W, grain.range(0.6, 1.8), "#ffffff", `opacity="${f(grain.range(0.02, 0.07))}"`));
  }

  // Coffee cup, directly under the steam the component animates.
  body.push(ellipse(cup.cx + 26, cup.rimY + 96, cup.r * 1.9, 18, "#05070a", 'opacity="0.28"'));
  body.push(
    path(
      `M ${f(cup.cx - cup.r)} ${f(cup.rimY)}
       L ${f(cup.cx - cup.r * 0.82)} ${f(cup.rimY + 92)}
       Q ${f(cup.cx)} ${f(cup.rimY + 112)} ${f(cup.cx + cup.r * 0.82)} ${f(cup.rimY + 92)}
       L ${f(cup.cx + cup.r)} ${f(cup.rimY)} Z`,
      "url(#cupG)",
    ),
  );
  body.push(
    path(
      `M ${f(cup.cx + cup.r * 0.9)} ${f(cup.rimY + 22)}
       C ${f(cup.cx + cup.r * 1.7)} ${f(cup.rimY + 18)}, ${f(cup.cx + cup.r * 1.7)} ${f(cup.rimY + 72)}, ${f(cup.cx + cup.r * 0.86)} ${f(cup.rimY + 70)}`,
      "none",
      `stroke="#b9c1c8" stroke-width="9"`,
    ),
  );
  body.push(ellipse(cup.cx, cup.rimY, cup.r, cup.r * 0.34, "#e8ecef"));
  body.push(ellipse(cup.cx, cup.rimY + 2, cup.r * 0.82, cup.r * 0.26, "#2b2118"));
  body.push(ellipse(cup.cx - cup.r * 0.24, cup.rimY - 1, cup.r * 0.3, cup.r * 0.08, "#6b5442", 'opacity="0.55"'));

  // Desk phone. The blue indicator the app blinks sits in the dark inset.
  const phoneX = light.cx - 96;
  const phoneY = light.cy - 44;
  body.push(rrect(phoneX - 10, phoneY + 78, 300, 16, 6, "#05070a", 'opacity="0.26"'));
  body.push(
    poly(
      [
        [phoneX, phoneY + 78],
        [phoneX + 268, phoneY + 78],
        [phoneX + 248, phoneY + 6],
        [phoneX + 22, phoneY + 6],
      ],
      "#39424b",
    ),
  );
  body.push(
    poly(
      [
        [phoneX + 22, phoneY + 6],
        [phoneX + 248, phoneY + 6],
        [phoneX + 244, phoneY - 2],
        [phoneX + 26, phoneY - 2],
      ],
      "#5c656e",
    ),
  );
  body.push(rrect(phoneX + 40, phoneY + 14, 190, 22, 10, "#2b333a"));
  body.push(rrect(phoneX + 46, phoneY + 44, 178, 26, 8, "#232a31"));
  body.push(circle(light.cx, light.cy, 14, "#11161a"));

  // A slim tablet lying flat, edge-on, well clear of the phone.
  body.push(
    poly(
      [
        [96, 1372],
        [560, 1372],
        [512, 1300],
        [148, 1300],
      ],
      "#2b333a",
      'opacity="0.9"',
    ),
  );
  body.push(
    poly(
      [
        [116, 1364],
        [544, 1364],
        [502, 1308],
        [160, 1308],
      ],
      "#0f1418",
    ),
  );
  body.push(
    poly(
      [
        [140, 1354],
        [330, 1354],
        [310, 1318],
        [178, 1318],
      ],
      P.blue,
      'opacity="0.30"',
    ),
  );

  // Pen, one accent stripe.
  body.push(
    `<g transform="rotate(-8 1150 1330)">${rrect(1060, 1322, 190, 14, 7, "#1c2126")}${rect(1150, 1322, 34, 14, P.blue)}</g>`,
  );

  // The near edge itself: the surface breaks and the fascia falls away.
  body.push(rect(0, 1382, HQ_W, 4, "#ffffff", 'opacity="0.35"'));
  body.push(rect(0, 1386, HQ_W, HQ_H - 1386, "url(#fgFace)"));

  return hqDoc("hq-foreground", defs, body.join("\n"));
}

/* --- The certificate wall. Two states, one frame table. -------------------
   The grid hangs on HQ.pier, the solid return on the left of frame, so the
   glazing behind the founder stays unbroken. Two ceiling washers graze the
   pier face instead of a picture light per frame: at this pitch a light over
   every frame would sit on the frame above it. ----------------------------- */
function wallLights() {
  const out = [];
  const cols = [...new Set(WALL_FRAMES.map((fr) => Math.round(fr.x / 10) * 10))].sort((a, b) => a - b);
  for (const c of cols) {
    const col = WALL_FRAMES.filter((fr) => Math.round(fr.x / 10) * 10 === c);
    const cx = col[0].x + col[0].w / 2;
    out.push(rrect(cx - 40, WALL_GRID.y - 44, 80, 12, 4, P.g500));
    out.push(rrect(cx - 40, WALL_GRID.y - 44, 80, 4, 2, P.aluLight, 'opacity="0.85"'));
    out.push(rect(cx - 3, WALL_GRID.y - 32, 6, 8, P.aluDark));
  }
  return out.join("");
}

function frameShell(fr, withGlass) {
  const out = [];
  out.push(rrect(fr.x + 5, fr.y + 7, fr.w, fr.h, 3, "#5c666f", 'opacity="0.22"'));
  out.push(rrect(fr.x, fr.y, fr.w, fr.h, 3, P.g500));
  out.push(rrect(fr.x, fr.y, fr.w, 4, 2, P.aluMid, 'opacity="0.8"'));
  out.push(rrect(fr.x + 9, fr.y + 9, fr.w - 18, fr.h - 18, 1, "#c8cfd5"));
  if (withGlass) {
    out.push(
      poly(
        [
          [fr.x + 9, fr.y + fr.h - 9],
          [fr.x + fr.w * 0.45, fr.y + 9],
          [fr.x + fr.w * 0.62, fr.y + 9],
          [fr.x + 9 + fr.w * 0.17, fr.y + fr.h - 9],
        ],
        "#ffffff",
        'opacity="0.20"',
      ),
    );
  }
  return out.join("");
}

function renderHqWallEmpty() {
  const defs = [
    linGrad("coneG", 0, 0, 0, 1, [
      [0, "#ffffff", 0.30],
      [1, "#ffffff", 0],
    ]),
  ];
  const body = [];
  // One wash cone per column, falling the whole height of the grid.
  const cols = [...new Set(WALL_FRAMES.map((fr) => Math.round(fr.x / 10) * 10))].sort((a, b) => a - b);
  for (const c of cols) {
    const col = WALL_FRAMES.filter((fr) => Math.round(fr.x / 10) * 10 === c);
    const cx = col[0].x + col[0].w / 2;
    body.push(
      poly(
        [
          [cx - 34, WALL_GRID.y - 30],
          [cx + 34, WALL_GRID.y - 30],
          [cx + 122, WALL_GRID.y2 + 30],
          [cx - 122, WALL_GRID.y2 + 30],
        ],
        "url(#coneG)",
      ),
    );
  }
  for (const fr of WALL_FRAMES) {
    body.push(frameShell(fr, false));
  }
  body.push(wallLights());
  return hqDoc("hq-wall-empty", defs, body.join("\n"));
}

function renderHqWallFilled() {
  const rng = makeRng(hashSeed("hq-wall-filled"));
  const defs = [
    linGrad("matG", 0, 0, 0, 1, [
      [0, "#f7f8f9"],
      [1, "#dfe3e7"],
    ]),
    linGrad("awardG", 0, 0, 1, 1, [
      [0, "#eef1f3"],
      [0.5, "#b9c1c8"],
      [1, "#8f99a2"],
    ]),
  ];
  const body = [];
  for (const fr of WALL_FRAMES) {
    body.push(frameShell(fr, false));
    const ix = fr.x + 9;
    const iy = fr.y + 9;
    const iw = fr.w - 18;
    const ih = fr.h - 18;
    body.push(rect(ix, iy, iw, ih, "url(#matG)"));
    // A blank certificate: a ruled block and a seal. No lettering of any kind.
    const bx = ix + iw * 0.14;
    const bw = iw * 0.52;
    for (let i = 0; i < 4; i += 1) {
      body.push(rect(bx, iy + ih * 0.26 + i * (ih * 0.11), bw * rng.range(0.55, 1), 3.4, "#9aa4ad", 'opacity="0.55"'));
    }
    body.push(rect(bx, iy + ih * 0.14, bw * 0.62, 6, P.g600, 'opacity="0.35"'));
    body.push(circle(ix + iw * 0.80, iy + ih * 0.66, iw * 0.075, P.blue, 'opacity="0.55"'));
    body.push(circle(ix + iw * 0.80, iy + ih * 0.66, iw * 0.038, P.blueDeep, 'opacity="0.5"'));
    body.push(
      poly(
        [
          [ix, iy + ih],
          [ix + iw * 0.42, iy],
          [ix + iw * 0.56, iy],
          [ix + iw * 0.14, iy + ih],
        ],
        "#ffffff",
        'opacity="0.16"',
      ),
    );
  }
  // The small award, standing on the credenza top below the grid.
  const a = WALL_AWARD;
  body.push(ellipse(a.x + a.w / 2, a.standY, a.w * 0.8, 6, "#5c666f", 'opacity="0.28"'));
  body.push(
    poly(
      [
        [a.x + a.w * 0.5, a.y],
        [a.x + a.w, a.y + a.h * 0.72],
        [a.x + a.w * 0.78, a.y + a.h],
        [a.x + a.w * 0.22, a.y + a.h],
        [a.x, a.y + a.h * 0.72],
      ],
      "url(#awardG)",
    ),
  );
  body.push(rect(a.x + a.w * 0.28, a.y + a.h * 0.62, a.w * 0.44, 7, P.blue, 'opacity="0.7"'));
  return hqDoc("hq-wall-filled", defs, body.join("\n"));
}

/* --- hq-side-screen: the team monitor on an articulated arm. -------------- */
function renderHqSideScreen() {
  const q = MON.side;
  const b = quadBounds(q);
  const defs = [
    linGrad("sideGlass", b.x, b.y, b.x2, b.y2, [
      [0, "#161d24"],
      [1, "#0c1115"],
    ], true),
    linGrad("armG", 0, 0, 1, 0, [
      [0, "#e2e6ea"],
      [0.5, "#aab3bb"],
      [1, "#6f7982"],
    ]),
  ];
  const body = [];
  const clampX = 2270;
  // Articulated arm: a clamp on the desk, a riser, an elbow, then the forearm
  // reaching back to the monitor's mount plate.
  body.push(rrect(clampX - 36, HQ.deskBackY - 34, 72, 44, 6, "#2b333a"));
  body.push(rrect(clampX - 46, HQ.deskBackY - 42, 92, 14, 5, "url(#armG)"));
  body.push(rect(clampX - 13, 636, 26, HQ.deskBackY - 636 - 28, "url(#armG)"));
  body.push(rect(clampX - 13, 636, 6, HQ.deskBackY - 636 - 28, "#ffffff", 'opacity="0.35"'));
  body.push(
    `<g transform="rotate(28 ${f(clampX)} 640)">${rrect(clampX - 96, 627, 108, 26, 13, "url(#armG)")}</g>`,
  );
  body.push(circle(clampX, 640, 21, "#39424b"));
  body.push(circle(clampX, 640, 8, "#8f99a2"));
  body.push(circle(b.x2 - 6, 588, 17, "#39424b"));
  body.push(rrect(b.x2 - 34, 570, 34, 96, 8, "#39424b"));

  body.push(poly(growQuad(q, 16), "#20262c"));
  body.push(poly(growQuad(q, 5), "#2e363e"));
  body.push(poly(q, "url(#sideGlass)"));
  body.push(
    `<g clip-path="url(#sideClip)">` +
      poly(
        [
          [b.x, b.y2],
          [b.x + b.w * 0.5, b.y],
          [b.x + b.w * 0.7, b.y],
          [b.x + b.w * 0.2, b.y2],
        ],
        "#ffffff",
        'opacity="0.04"',
      ) +
      "</g>",
  );
  defs.push(`<clipPath id="sideClip"><polygon points="${pts(q)}"/></clipPath>`);
  // A camera bar on top; the app paints the green call dot into the glass corner.
  body.push(rrect(b.x + b.w / 2 - 30, b.y - 30, 60, 12, 5, "#2b333a"));
  body.push(circle(b.x + b.w / 2, b.y - 24, 4, "#0d1114"));
  return hqDoc("hq-side-screen", defs, body.join("\n"));
}

/* ==========================================================================
   9. Facility icons — 1:1, 512x512
   --------------------------------------------------------------------------
   One isometric camera for all eleven, one graphite base plate, and eleven
   genuinely different silhouettes: a box, an arch, a sawtooth, a stack, a
   ring, a stepped cube, a tube on trestles, a tower, a mast, a long dock and
   a drum. Silhouette is what survives at 32 px, so no two share one.
   ========================================================================== */

const ICON = 512;
const ISO_S = 30;
const ISO_OX = 256;
const ISO_OY = 300;

function iso(x, y, z) {
  return [ISO_OX + (x - y) * ISO_S * 0.8660254, ISO_OY + (x + y) * ISO_S * 0.5 - z * ISO_S];
}

/** Axis-aligned iso box. Top is aluminium, the left face catches the key light. */
function isoBox(x0, y0, x1, y1, z0, z1, colors) {
  const c = colors ?? {};
  const top = c.top ?? P.alu;
  const left = c.left ?? P.g500;
  const right = c.right ?? P.g700;
  const out = [];
  out.push(
    poly([iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)], top),
  );
  out.push(
    poly([iso(x0, y1, z1), iso(x1, y1, z1), iso(x1, y1, z0), iso(x0, y1, z0)], left),
  );
  out.push(
    poly([iso(x1, y0, z1), iso(x1, y1, z1), iso(x1, y1, z0), iso(x1, y0, z0)], right),
  );
  return out.join("");
}

/** Iso cylinder: elliptical top, straight sides. */
function isoCylinder(cxw, cyw, r, z0, z1, colors) {
  const c = colors ?? {};
  const top = iso(cxw, cyw, z1);
  const rx = r * ISO_S * 0.8660254 * 2;
  const ry = r * ISO_S;
  const h = (z1 - z0) * ISO_S;
  return [
    path(
      `M ${f(top[0] - rx)} ${f(top[1])} L ${f(top[0] - rx)} ${f(top[1] + h)}
       A ${f(rx)} ${f(ry)} 0 0 0 ${f(top[0] + rx)} ${f(top[1] + h)}
       L ${f(top[0] + rx)} ${f(top[1])} Z`,
      c.side ?? P.g600,
    ),
    path(
      `M ${f(top[0] - rx)} ${f(top[1])} L ${f(top[0] - rx)} ${f(top[1] + h)}
       A ${f(rx)} ${f(ry)} 0 0 0 ${f(top[0])} ${f(top[1] + h + ry)}
       L ${f(top[0])} ${f(top[1] + ry)} Z`,
      c.shade ?? P.g700,
      'opacity="0.55"',
    ),
    ellipse(top[0], top[1], rx, ry, c.top ?? P.alu),
  ].join("");
}

function iconBase(id) {
  const plate = [
    [-3.8, -3.8],
    [3.8, -3.8],
    [3.8, 3.8],
    [-3.8, 3.8],
  ].map(([x, y]) => iso(x, y, 0));
  const inner = [
    [-3.3, -3.3],
    [3.3, -3.3],
    [3.3, 3.3],
    [-3.3, 3.3],
  ].map(([x, y]) => iso(x, y, 0));
  const defs = [
    linGrad(`${id}-plate`, 0, 0, 0, 1, [
      [0, "#39424b"],
      [1, "#1c2126"],
    ]),
    radGrad(`${id}-shadow`, 0.5, 0.5, 0.5, [
      [0, "#05070a", 0.42],
      [1, "#05070a", 0],
    ]),
    linGrad(`${id}-roof`, 0, 0, 1, 1, [
      [0, "#eef1f3"],
      [0.55, "#cbd2d8"],
      [1, "#a7b0b8"],
    ]),
  ];
  const body = [
    ellipse(264, 340, 168, 58, `url(#${id}-shadow)`),
    poly(plate, `url(#${id}-plate)`),
    poly(inner, "#20262c"),
    `<polyline points="${pts([plate[3], plate[0], plate[1]])}" fill="none" stroke="${P.aluDark}" stroke-width="2.5" opacity="0.5"/>`,
  ].join("");
  return { defs, body };
}

function facilityIcon(id, drawFn) {
  const rng = makeRng(hashSeed(id));
  const base = iconBase("i");
  const parts = drawFn(rng, "i");
  // The subject is scaled about the plate centre so it reads at 32 px without
  // enlarging the plate past the safe margin.
  const subject = `<g transform="translate(${ISO_OX} ${ISO_OY}) scale(1.17) translate(${-ISO_OX} ${-ISO_OY})">${parts.body}</g>`;
  return svgDoc(id, ICON, ICON, [...base.defs, ...(parts.defs ?? [])], [base.body, subject].join("\n"));
}

const ROOF = { top: "url(#i-roof)", left: P.g500, right: P.g700 };
const DARK = { top: P.aluDark, left: P.g600, right: P.g800 };

const FACILITIES = {
  /** Tall racking box with a loading dock: the classic warehouse block. */
  "facility-warehouse": () => ({
    body: [
      isoBox(-2.6, -2.6, 2.6, 2.2, 0, 3.4, ROOF),
      // dock apron and two shutter doors on the left face
      poly([iso(-2.6, 2.2, 0), iso(2.6, 2.2, 0), iso(2.6, 3.2, 0), iso(-2.6, 3.2, 0)], "#2b333a"),
      poly([iso(-1.9, 2.2, 1.5), iso(-0.7, 2.2, 1.5), iso(-0.7, 2.2, 0), iso(-1.9, 2.2, 0)], "#161b20"),
      poly([iso(0.5, 2.2, 1.5), iso(1.7, 2.2, 1.5), iso(1.7, 2.2, 0), iso(0.5, 2.2, 0)], "#161b20"),
      poly([iso(-2.6, -2.6, 3.4), iso(2.6, -2.6, 3.4), iso(2.6, 2.2, 3.4), iso(-2.6, 2.2, 3.4)], "#ffffff", 'opacity="0.06"'),
      // roof vents
      isoBox(-1.6, -1.6, -0.6, -0.6, 3.4, 3.8, DARK),
      isoBox(0.6, -1.6, 1.6, -0.6, 3.4, 3.8, DARK),
      circle(...iso(2.6, 1.0, 2.9), 7, P.blue),
    ].join(""),
  }),

  /** Barrel-vault arch with the door open. */
  "facility-hangar": () => {
    const back = iso(0, -2.4, 0);
    const front = iso(0, 2.4, 0);
    const halfW = 2.8 * ISO_S * 0.8660254;
    const h = 3.4 * ISO_S;
    const arch = (p) =>
      `M ${f(p[0] - halfW)} ${f(p[1])} L ${f(p[0] - halfW)} ${f(p[1] - h * 0.45)}
       Q ${f(p[0])} ${f(p[1] - h * 1.28)} ${f(p[0] + halfW)} ${f(p[1] - h * 0.45)}
       L ${f(p[0] + halfW)} ${f(p[1])} Z`;
    return {
      body: [
        path(arch(back), "#39424b"),
        poly(
          [
            [back[0] - halfW, back[1]],
            [back[0] - halfW, back[1] - h * 0.45],
            [front[0] - halfW, front[1] - h * 0.45],
            [front[0] - halfW, front[1]],
          ],
          P.g600,
        ),
        path(
          `M ${f(back[0] - halfW)} ${f(back[1] - h * 0.45)}
           Q ${f(back[0])} ${f(back[1] - h * 1.28)} ${f(back[0] + halfW)} ${f(back[1] - h * 0.45)}
           L ${f(front[0] + halfW)} ${f(front[1] - h * 0.45)}
           Q ${f(front[0])} ${f(front[1] - h * 1.28)} ${f(front[0] - halfW)} ${f(front[1] - h * 0.45)} Z`,
          "url(#i-roof)",
        ),
        path(arch(front), "#2b333a"),
        path(
          `M ${f(front[0] - halfW * 0.74)} ${f(front[1])}
           L ${f(front[0] - halfW * 0.74)} ${f(front[1] - h * 0.42)}
           Q ${f(front[0])} ${f(front[1] - h * 1.02)} ${f(front[0] + halfW * 0.74)} ${f(front[1] - h * 0.42)}
           L ${f(front[0] + halfW * 0.74)} ${f(front[1])} Z`,
          "#0f1418",
        ),
        // door leaves parked either side
        poly(
          [
            [front[0] - halfW * 0.74, front[1]],
            [front[0] - halfW * 0.74, front[1] - h * 0.42],
            [front[0] - halfW * 0.46, front[1] - h * 0.60],
            [front[0] - halfW * 0.46, front[1] - h * 0.02],
          ],
          P.aluDark,
        ),
        poly(
          [
            [front[0] + halfW * 0.74, front[1]],
            [front[0] + halfW * 0.74, front[1] - h * 0.42],
            [front[0] + halfW * 0.46, front[1] - h * 0.60],
            [front[0] + halfW * 0.46, front[1] - h * 0.02],
          ],
          P.aluDark,
        ),
        rect(front[0] - halfW * 0.30, front[1] - h * 0.36, halfW * 0.60, 8, P.blue, 'opacity="0.85"'),
      ].join(""),
    };
  },

  /** North-light sawtooth roof: a zigzag nothing else in the set has. */
  "facility-repair-shop": () => {
    const teeth = [];
    for (let i = 0; i < 4; i += 1) {
      const y0 = -2.4 + i * 1.2;
      const y1 = y0 + 1.2;
      teeth.push(
        poly([iso(-2.4, y0, 2.0), iso(2.4, y0, 2.0), iso(2.4, y1, 2.8), iso(-2.4, y1, 2.8)], "url(#i-roof)"),
      );
      teeth.push(
        poly([iso(-2.4, y1, 2.8), iso(2.4, y1, 2.8), iso(2.4, y1, 2.0), iso(-2.4, y1, 2.0)], "#2a5f96"),
      );
      teeth.push(
        poly([iso(2.4, y0, 2.0), iso(2.4, y1, 2.8), iso(2.4, y1, 2.0)], P.g700),
      );
    }
    return {
      body: [
        isoBox(-2.4, -2.4, 2.4, 2.4, 0, 2.0, { top: P.g600, left: P.g500, right: P.g700 }),
        teeth.join(""),
        poly([iso(-1.2, 2.4, 1.4), iso(0.2, 2.4, 1.4), iso(0.2, 2.4, 0), iso(-1.2, 2.4, 0)], "#161b20"),
        circle(...iso(1.7, 2.4, 1.0), 7, P.blue),
      ].join(""),
    };
  },

  /** Production block with a tall stack. */
  "facility-factory": () => ({
    body: [
      isoBox(-2.7, -1.2, 1.4, 2.4, 0, 2.4, ROOF),
      isoBox(-2.7, -2.6, 1.4, -1.2, 0, 3.2, { top: P.aluMid, left: P.g600, right: P.g800 }),
      // monitor roof lantern
      isoBox(-2.0, -2.2, 0.7, -1.6, 3.2, 3.7, DARK),
      // the stack
      isoCylinder(2.2, 1.4, 0.42, 0, 5.4, { top: P.aluMid, side: P.g500, shade: P.g700 }),
      ellipse(iso(2.2, 1.4, 5.4)[0], iso(2.2, 1.4, 5.4)[1], 22, 8, "#0f1418"),
      poly([iso(-2.7, 2.4, 1.3), iso(-1.3, 2.4, 1.3), iso(-1.3, 2.4, 0), iso(-2.7, 2.4, 0)], "#161b20"),
      circle(...iso(1.4, 1.6, 2.0), 7, P.blue),
    ].join(""),
  }),

  /** Test cell: thick walls and a big intake ring on the front. */
  "facility-engine-shop": () => {
    const front = iso(0, 2.6, 1.9);
    return {
      body: [
        isoBox(-2.8, -2.0, 2.8, 2.6, 0, 3.8, { top: P.aluMid, left: P.g500, right: P.g700 }),
        // exhaust stack behind
        isoBox(-2.4, -2.8, -0.6, -2.0, 0, 5.0, DARK),
        // intake ring, the silhouette cue
        circle(front[0], front[1], 74, "#11161b"),
        circle(front[0], front[1], 74, "none", `stroke="${P.alu}" stroke-width="14"`),
        circle(front[0], front[1], 46, "none", `stroke="${P.aluDark}" stroke-width="8" opacity="0.8"`),
        circle(front[0], front[1], 16, P.g500),
        line(front[0] - 74, front[1], front[0] + 74, front[1], P.g600, 6, 'opacity="0.6"'),
        line(front[0], front[1] - 74, front[0], front[1] + 74, P.g600, 6, 'opacity="0.6"'),
        circle(front[0] + 96, front[1] - 62, 8, P.red, 'opacity="0.9"'),
      ].join(""),
    };
  },

  /** Small clean workshop: a stepped cube with a rooftop plant drum. */
  "facility-component-shop": () => ({
    body: [
      isoBox(-1.9, -1.9, 1.9, 1.9, 0, 2.0, ROOF),
      isoBox(-1.3, -1.3, 1.3, 1.3, 2.0, 3.1, { top: P.aluLight, left: P.g600, right: P.g800 }),
      isoCylinder(0.4, -0.4, 0.5, 3.1, 3.9, { top: P.aluMid, side: P.g500, shade: P.g700 }),
      poly([iso(-1.3, 1.3, 3.1), iso(1.3, 1.3, 3.1), iso(1.3, 1.3, 2.5), iso(-1.3, 1.3, 2.5)], "#2a5f96", 'opacity="0.85"'),
      poly([iso(-0.9, 1.9, 1.2), iso(0.1, 1.9, 1.2), iso(0.1, 1.9, 0), iso(-0.9, 1.9, 0)], "#161b20"),
      circle(...iso(1.9, 0.6, 1.4), 6, P.blue),
    ].join(""),
  }),

  /** Teardown yard: a fuselage barrel up on trestles. No building at all. */
  "facility-teardown": () => {
    const a = iso(-2.5, 0, 2.1);
    const b = iso(2.5, 0, 2.1);
    const ry = 52;
    const rx = 30;
    return {
      body: [
        // three A-frame trestles, clearly under the barrel
        ...[-1.7, 0.1, 1.9].map((x) => {
          const foot = iso(x, 0, 0);
          const head = iso(x, 0, 1.5);
          return [
            poly(
              [
                [head[0] - 6, head[1]],
                [head[0] + 6, head[1]],
                [foot[0] + 34, foot[1]],
                [foot[0] + 22, foot[1]],
                [head[0], head[1] + 16],
                [foot[0] - 22, foot[1]],
                [foot[0] - 34, foot[1]],
              ],
              P.g500,
            ),
            rect(head[0] - 20, head[1] - 10, 40, 12, P.aluDark),
          ].join("");
        }),
        ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + ry + 6, 150, 16, "#05070a", 'opacity="0.35"'),
        // the barrel
        path(
          `M ${f(a[0])} ${f(a[1] - ry)} L ${f(b[0])} ${f(b[1] - ry)}
           A ${f(rx)} ${f(ry)} 0 0 1 ${f(b[0])} ${f(b[1] + ry)}
           L ${f(a[0])} ${f(a[1] + ry)}
           A ${f(rx)} ${f(ry)} 0 0 1 ${f(a[0])} ${f(a[1] - ry)} Z`,
          "url(#i-roof)",
        ),
        // open cut end, nearest the camera
        ellipse(b[0], b[1], rx, ry, "#11161b"),
        ellipse(b[0], b[1], rx * 0.72, ry * 0.74, P.g600),
        // frames and a removed skin panel
        line(a[0] + 54, a[1] - ry + 10, a[0] + 54, a[1] + ry - 10, P.g600, 5, 'opacity="0.65"'),
        line(a[0] + 118, a[1] - ry + 14, a[0] + 118, a[1] + ry - 14, P.g600, 5, 'opacity="0.65"'),
        poly(
          [
            [a[0] + 26, a[1] - 34],
            [a[0] + 46, a[1] - 38],
            [a[0] + 46, a[1] + 4],
            [a[0] + 26, a[1] + 8],
          ],
          "#0f1418",
          'opacity="0.8"',
        ),
        circle(a[0] - 4, a[1] + ry + 22, 7, P.blue),
      ].join(""),
    };
  },

  /** Lessor: a slim curtain-wall tower. The only vertical in the set. */
  "facility-lessor": () => {
    const glass = [];
    for (let i = 0; i < 7; i += 1) {
      glass.push(
        poly(
          [iso(-1.2, 1.2, 1.0 + i * 0.72), iso(1.2, 1.2, 1.0 + i * 0.72), iso(1.2, 1.2, 1.42 + i * 0.72), iso(-1.2, 1.2, 1.42 + i * 0.72)],
          "#2a5f96",
          'opacity="0.55"',
        ),
      );
    }
    return {
      body: [
        isoBox(-2.2, -2.2, 2.2, 2.2, 0, 0.6, { top: P.g600, left: P.g500, right: P.g700 }),
        isoBox(-1.2, -1.2, 1.2, 1.2, 0.6, 6.2, { top: P.aluLight, left: P.g500, right: P.g700 }),
        glass.join(""),
        isoBox(-0.8, -0.8, 0.8, 0.8, 6.2, 6.7, DARK),
        poly([iso(-0.5, 2.2, 0.6), iso(0.5, 2.2, 0.6), iso(0.5, 2.2, 0), iso(-0.5, 2.2, 0)], "#161b20"),
        rect(iso(0, 1.2, 6.4)[0] - 3, iso(0, 1.2, 7.4)[1], 6, 46, P.aluDark),
        circle(iso(0, 1.2, 7.4)[0], iso(0, 1.2, 7.4)[1] - 4, 7, P.red, 'opacity="0.9"'),
      ].join(""),
    };
  },

  /** Broker: a low pavilion under a very tall mast and dish. */
  "facility-broker": () => {
    const mastBase = iso(1.4, -1.0, 0.9);
    return {
      body: [
        isoBox(-2.6, -1.0, 1.0, 2.2, 0, 1.6, ROOF),
        poly([iso(-2.6, 2.2, 1.6), iso(1.0, 2.2, 1.6), iso(1.4, 2.9, 1.6), iso(-3.0, 2.9, 1.6)], P.aluDark),
        poly([iso(-2.6, 2.2, 1.2), iso(1.0, 2.2, 1.2), iso(1.0, 2.2, 0), iso(-2.6, 2.2, 0)], "#11161b"),
        poly([iso(-2.6, 2.2, 1.2), iso(1.0, 2.2, 1.2), iso(1.0, 2.2, 0.9), iso(-2.6, 2.2, 0.9)], P.blue, 'opacity="0.45"'),
        rect(mastBase[0] - 5, iso(1.4, -1.0, 6.4)[1], 10, mastBase[1] - iso(1.4, -1.0, 6.4)[1], P.aluDark),
        ...[1.8, 3.0, 4.2, 5.4].map((z) => {
          const p = iso(1.4, -1.0, z);
          return line(p[0] - 16, p[1] + 8, p[0] + 16, p[1] - 8, P.g500, 4, 'opacity="0.8"');
        }),
        ellipse(iso(1.4, -1.0, 6.4)[0] + 20, iso(1.4, -1.0, 6.4)[1] - 6, 30, 22, P.alu, 'transform="rotate(-18 ' + f(iso(1.4, -1.0, 6.4)[0] + 20) + ' ' + f(iso(1.4, -1.0, 6.4)[1] - 6) + ')"'),
        circle(iso(1.4, -1.0, 6.4)[0] + 4, iso(1.4, -1.0, 6.4)[1] - 2, 6, P.g600),
      ].join(""),
    };
  },

  /** Distribution: a long low cross-dock with a conveyor running out of it. */
  "facility-distribution": () => ({
    body: [
      isoBox(-3.0, -1.4, 2.2, 0.8, 0, 1.9, ROOF),
      // dock doors along the long left face
      ...[-2.6, -1.8, -1.0, -0.2, 0.6, 1.4].map((x) =>
        poly([iso(x, 0.8, 1.2), iso(x + 0.55, 0.8, 1.2), iso(x + 0.55, 0.8, 0), iso(x, 0.8, 0)], "#161b20"),
      ),
      poly([iso(-3.0, 0.8, 1.9), iso(2.2, 0.8, 1.9), iso(2.2, 0.8, 1.6), iso(-3.0, 0.8, 1.6)], P.blue, 'opacity="0.35"'),
      // conveyor: a diagonal that breaks the box silhouette
      poly(
        [iso(2.2, -0.6, 1.5), iso(3.6, -0.6, 0.2), iso(3.6, -0.2, 0.2), iso(2.2, -0.2, 1.5)],
        P.aluDark,
      ),
      poly(
        [iso(2.2, -0.6, 1.7), iso(3.6, -0.6, 0.4), iso(3.6, -0.2, 0.4), iso(2.2, -0.2, 1.7)],
        P.alu,
      ),
      isoBox(3.0, -0.6, 3.5, -0.15, 0.4, 0.9, { top: P.aluMid, left: P.g500, right: P.g700 }),
      isoBox(-3.4, 1.4, -2.4, 2.2, 0, 0.9, { top: P.aluMid, left: P.g500, right: P.g700 }),
      isoBox(-2.2, 1.4, -1.2, 2.2, 0, 0.9, { top: P.aluMid, left: P.g500, right: P.g700 }),
    ].join(""),
  }),

  /** Conference: the only round plan, under a shallow dome and a canopy. */
  "facility-conference": () => {
    const c = iso(0, 0, 2.2);
    const rx = 2.3 * ISO_S * 0.8660254 * 2;
    return {
      body: [
        isoCylinder(0, 0, 2.3, 0, 2.2, { top: P.aluLight, side: P.g500, shade: P.g700 }),
        // glazing band
        path(
          `M ${f(c[0] - rx)} ${f(c[1] + 26)} L ${f(c[0] - rx)} ${f(c[1] + 54)}
           A ${f(rx)} ${f(2.3 * ISO_S)} 0 0 0 ${f(c[0] + rx)} ${f(c[1] + 54)}
           L ${f(c[0] + rx)} ${f(c[1] + 26)}
           A ${f(rx)} ${f(2.3 * ISO_S)} 0 0 1 ${f(c[0] - rx)} ${f(c[1] + 26)} Z`,
          "#2a5f96",
          'opacity="0.7"',
        ),
        // dome
        path(
          `M ${f(c[0] - rx)} ${f(c[1])} A ${f(rx)} ${f(rx * 0.62)} 0 0 1 ${f(c[0] + rx)} ${f(c[1])}
           A ${f(rx)} ${f(2.3 * ISO_S)} 0 0 1 ${f(c[0] - rx)} ${f(c[1])} Z`,
          "url(#i-roof)",
        ),
        path(
          `M ${f(c[0] - rx * 0.55)} ${f(c[1] - rx * 0.42)} A ${f(rx * 0.55)} ${f(rx * 0.34)} 0 0 1 ${f(c[0] + rx * 0.55)} ${f(c[1] - rx * 0.42)}`,
          "none",
          `stroke="${P.aluDark}" stroke-width="3" opacity="0.6"`,
        ),
        circle(c[0], c[1] - rx * 0.62, 9, P.aluDark),
        // entrance canopy
        poly([iso(-0.9, 2.2, 1.1), iso(0.9, 2.2, 1.1), iso(1.3, 3.1, 1.1), iso(-1.3, 3.1, 1.1)], P.alu),
        poly([iso(-0.9, 2.2, 1.05), iso(0.9, 2.2, 1.05), iso(1.3, 3.1, 1.05), iso(-1.3, 3.1, 1.05)], P.g700, 'opacity="0.5"'),
        rect(iso(-1.2, 3.1, 1.05)[0], iso(-1.2, 3.1, 1.05)[1], 7, 40, P.aluDark),
        rect(iso(1.2, 3.1, 1.05)[0], iso(1.2, 3.1, 1.05)[1], 7, 40, P.aluDark),
        circle(...iso(2.0, 1.6, 0.4), 7, P.blue),
      ].join(""),
    };
  },
};

/* ==========================================================================
   10. Seasonal skies — 21:9, 2520x1080
   ========================================================================== */

const SKY_W = 2520;
const SKY_H = 1080;

const SKIES = {
  "sky-winter": {
    band: [
      [0, "#16243a"],
      [0.34, "#25405f"],
      [0.62, "#4a6683"],
      [0.78, "#8c94a0"],
      [1, "#2a3038"],
    ],
    sun: { x: 0.78, y: 0.62, r: 0.30, color: "#f0e3c8", a: 0.45 },
    cloud: "#6d7f96",
    cloudA: [0.16, 0.34],
    lights: true,
    haze: "#9fb0c4",
  },
  "sky-spring": {
    band: [
      [0, "#7fa6c9"],
      [0.38, "#a8c4dc"],
      [0.68, "#cfdde8"],
      [0.82, "#e6ecf0"],
      [1, "#b9c3cb"],
    ],
    sun: { x: 0.30, y: 0.30, r: 0.34, color: "#ffffff", a: 0.55 },
    cloud: "#ffffff",
    cloudA: [0.22, 0.44],
    lights: false,
    haze: "#dde7ef",
  },
  "sky-summer": {
    band: [
      [0, "#4d86bf"],
      [0.36, "#79a9d4"],
      [0.7, "#b6d0e5"],
      [0.86, "#e2ecf3"],
      [1, "#c2ccd3"],
    ],
    sun: { x: 0.62, y: 0.18, r: 0.26, color: "#ffffff", a: 0.75 },
    cloud: "#ffffff",
    cloudA: [0.3, 0.6],
    lights: false,
    haze: "#e8eff4",
  },
  "sky-autumn": {
    band: [
      [0, "#3f4a5c"],
      [0.3, "#6f6a6d"],
      [0.56, "#b08b62"],
      [0.78, "#dcb583"],
      [1, "#6b5a49"],
    ],
    sun: { x: 0.22, y: 0.7, r: 0.34, color: "#ffd9a0", a: 0.7 },
    cloud: "#8d7b70",
    cloudA: [0.2, 0.42],
    lights: false,
    haze: "#e0c49c",
  },
};

function renderSky(id) {
  const s = SKIES[id];
  const rng = makeRng(hashSeed(id));
  const horizon = SKY_H * 0.82;
  const defs = [
    linGrad("skyBand", 0, 0, 0, 1, s.band),
    radGrad(
      "skySun",
      SKY_W * s.sun.x,
      SKY_H * s.sun.y,
      SKY_W * s.sun.r,
      [
        [0, s.sun.color, s.sun.a],
        [0.4, s.sun.color, s.sun.a * 0.32],
        [1, s.sun.color, 0],
      ],
      true,
    ),
    linGrad("skyHaze", 0, horizon - 220, 0, horizon, [
      [0, s.haze, 0],
      [1, s.haze, 0.72],
    ], true),
    linGrad("skyGround", 0, horizon, 0, SKY_H, [
      [0, "#232a31"],
      [1, "#14181c"],
    ], true),
  ];
  const body = [rect(0, 0, SKY_W, SKY_H, "url(#skyBand)"), rect(0, 0, SKY_W, SKY_H, "url(#skySun)")];

  // Cloud strata: wide, flat, layered. Nothing fluffy, nothing cute.
  for (let i = 0; i < 16; i += 1) {
    const y = rng.range(SKY_H * 0.10, horizon - 60);
    const depth = (y - SKY_H * 0.1) / (horizon - SKY_H * 0.1);
    const rx = rng.range(180, 620) * (0.5 + depth * 0.8);
    const ry = rx * rng.range(0.05, 0.11);
    const x = rng.range(-100, SKY_W + 100);
    const a = rng.range(s.cloudA[0], s.cloudA[1]) * (1 - depth * 0.45);
    body.push(ellipse(x, y, rx, ry, s.cloud, `opacity="${f(a)}"`));
    body.push(ellipse(x + rx * 0.3, y - ry * 0.9, rx * 0.5, ry * 0.9, s.cloud, `opacity="${f(a * 0.7)}"`));
  }

  // Two contrails, high and thin.
  body.push(line(120, SKY_H * 0.30, SKY_W * 0.62, SKY_H * 0.12, "#ffffff", 5, 'opacity="0.16"'));
  body.push(line(SKY_W * 0.44, SKY_H * 0.42, SKY_W, SKY_H * 0.24, "#ffffff", 4, 'opacity="0.10"'));

  body.push(rect(0, horizon - 220, SKY_W, 220, "url(#skyHaze)"));
  body.push(rect(0, horizon, SKY_W, SKY_H - horizon, "url(#skyGround)"));
  body.push(rect(0, horizon, SKY_W, 3, "#0d1114", 'opacity="0.6"'));

  // A flat, abstract skyline: hangars, a tower, masts. No foliage anywhere.
  let x = -60;
  while (x < SKY_W + 60) {
    const w = rng.range(90, 320);
    const h = rng.range(12, 54);
    body.push(rect(x, horizon - h, w, h, "#1d2429", `opacity="${f(rng.range(0.55, 0.9))}"`));
    if (rng() > 0.78) {
      body.push(rect(x + w * 0.4, horizon - h - rng.range(30, 90), 8, rng.range(30, 90), "#1d2429", 'opacity="0.8"'));
    }
    x += w + rng.range(20, 90);
  }
  body.push(rect(SKY_W * 0.68, horizon - 150, 26, 150, "#1d2429", 'opacity="0.9"'));
  body.push(rect(SKY_W * 0.665, horizon - 176, 56, 30, "#1d2429", 'opacity="0.9"'));

  if (s.lights) {
    for (let i = 0; i < 70; i += 1) {
      const lx = rng.range(0, SKY_W);
      const ly = horizon - rng.range(2, 46);
      body.push(circle(lx, ly, rng.range(1.6, 3.4), rng() > 0.82 ? P.blueBright : "#ffd9a0", `opacity="${f(rng.range(0.3, 0.85))}"`));
    }
    for (let i = 0; i < 10; i += 1) {
      body.push(circle(rng.range(0, SKY_W), horizon + rng.range(10, 120), 3, "#ffd9a0", 'opacity="0.35"'));
    }
  }

  return svgDoc(id, SKY_W, SKY_H, defs, body.join("\n"));
}

/* ==========================================================================
   11. Pulse wheel face — 1:1, 1024x1024, brushed aluminium, no markings
   ========================================================================== */

function renderWheelFace() {
  const S = 1024;
  const c = S / 2;
  const rng = makeRng(hashSeed("wheel-face"));
  const R = 470;
  const defs = [
    radGrad("discG", 0.42, 0.36, 0.72, [
      [0, "#f2f4f6"],
      [0.42, "#d3d9de"],
      [0.72, "#aeb7bf"],
      [1, "#8d97a0"],
    ]),
    linGrad("bevelG", 0, 0, 1, 1, [
      [0, "#ffffff"],
      [0.45, "#b9c1c8"],
      [1, "#6f7982"],
    ]),
    radGrad("hubG", 0.4, 0.34, 0.7, [
      [0, "#e9edf0"],
      [0.6, "#b3bcc3"],
      [1, "#7c868f"],
    ]),
    radGrad("discShadow", 0.5, 0.55, 0.5, [
      [0, "#05070a", 0.4],
      [0.72, "#05070a", 0.18],
      [1, "#05070a", 0],
    ]),
    linGrad("sheenA", 0, 0, 1, 1, [
      [0, "#ffffff", 0.34],
      [0.5, "#ffffff", 0],
      [1, "#ffffff", 0.12],
    ]),
    `<clipPath id="discClip"><circle cx="${c}" cy="${c}" r="${R - 26}"/></clipPath>`,
  ];
  const body = [];
  body.push(ellipse(c, c + 18, R + 22, R + 22, "url(#discShadow)"));
  body.push(circle(c, c, R, "url(#bevelG)"));
  body.push(circle(c, c, R - 14, "#7f8991"));
  body.push(circle(c, c, R - 26, "url(#discG)"));

  // Radial grain: many fine spokes, each a different weight. This is the whole
  // texture, so it is generated, not faked with a filter.
  body.push('<g clip-path="url(#discClip)">');
  for (let i = 0; i < 520; i += 1) {
    const a = (i / 520) * Math.PI * 2 + rng.range(-0.004, 0.004);
    const inner = 62 + rng.range(0, 26);
    const outer = R - 26 - rng.range(0, 14);
    const lighten = rng() > 0.5;
    body.push(
      line(
        c + Math.cos(a) * inner,
        c + Math.sin(a) * inner,
        c + Math.cos(a) * outer,
        c + Math.sin(a) * outer,
        lighten ? "#ffffff" : "#69737c",
        rng.range(0.7, 2.6),
        `opacity="${f(rng.range(0.04, 0.16))}"`,
      ),
    );
  }
  // Two soft sheens crossing the grain.
  body.push(rect(0, 0, S, S, "url(#sheenA)"));
  body.push(
    ellipse(c - 120, c - 150, 300, 190, "#ffffff", 'opacity="0.16" transform="rotate(-28 392 362)"'),
  );
  body.push("</g>");

  // Hub and its ring.
  body.push(circle(c, c, 76, "#6f7982"));
  body.push(circle(c, c, 68, "url(#hubG)"));
  body.push(circle(c, c, 30, "#8d97a0"));
  body.push(circle(c, c, 24, "#b9c1c8"));
  body.push(circle(c, c, R - 26, "none", 'stroke="#ffffff" stroke-width="3" opacity="0.35"'));
  body.push(circle(c, c, R - 40, "none", 'stroke="#5f6871" stroke-width="2" opacity="0.30"'));
  return svgDoc("wheel-face", S, S, defs, body.join("\n"));
}

/* ==========================================================================
   12. Event cards — 3:2, 1500x1000
   ========================================================================== */

const CARD_W = 1500;
const CARD_H = 1000;

function cardFrame(ns, top, bottom) {
  return {
    defs: [
      linGrad(`${ns}-air`, 0, 0, 0, 1, [
        [0, top],
        [1, bottom],
      ]),
      radGrad(
        `${ns}-vig`,
        CARD_W * 0.5,
        CARD_H * 0.48,
        CARD_W * 0.62,
        [
          [0, "#000000", 0],
          [0.6, "#000000", 0.10],
          [1, "#05070a", 0.58],
        ],
        true,
      ),
      linGrad(`${ns}-floor`, 0, CARD_H * 0.58, 0, CARD_H, [
        [0, "#232a31"],
        [1, "#101418"],
      ], true),
    ],
    vignette: rect(0, 0, CARD_W, CARD_H, `url(#${ns}-vig)`),
  };
}

/** A standing person, seen from the side. Used only on card-favor. */
function figureSilhouette(x, groundY, height, flip, fill) {
  const s = height / 420;
  const dir = flip ? -1 : 1;
  const headR = 30 * s;
  const headY = groundY - height + headR;
  return [
    `<g transform="translate(${f(x)} 0) scale(${f(dir)} 1)">`,
    circle(0, headY, headR, fill),
    path(
      `M ${f(-42 * s)} ${f(groundY)}
       L ${f(-36 * s)} ${f(headY + headR * 1.9)}
       C ${f(-30 * s)} ${f(headY + headR * 0.9)}, ${f(30 * s)} ${f(headY + headR * 0.9)}, ${f(36 * s)} ${f(headY + headR * 1.9)}
       L ${f(44 * s)} ${f(groundY)} Z`,
      fill,
    ),
    path(
      `M ${f(30 * s)} ${f(headY + headR * 2.4)}
       C ${f(74 * s)} ${f(headY + headR * 3.4)}, ${f(96 * s)} ${f(headY + headR * 5.0)}, ${f(112 * s)} ${f(headY + headR * 5.6)}`,
      "none",
      `stroke="${fill}" stroke-width="${f(20 * s)}" stroke-linecap="round"`,
    ),
    "</g>",
  ].join("");
}

const CARDS = {
  /** Crates of tagged serviceable parts in a dim warehouse. */
  "card-consignment": () => {
    const ns = "c";
    const rng = makeRng(hashSeed("card-consignment"));
    const frame = cardFrame(ns, "#1b2229", "#0f1317");
    const defs = [
      ...frame.defs,
      linGrad(`${ns}-shaft`, 0.5, 0, 0.5, 1, [
        [0, "#dce8f4", 0.20],
        [1, "#dce8f4", 0],
      ]),
      linGrad(`${ns}-crate`, 0, 0, 0, 1, [
        [0, "#6d7178"],
        [1, "#4a4f56"],
      ]),
    ];
    const body = [rect(0, 0, CARD_W, CARD_H, `url(#${ns}-air)`)];
    // Racking receding into the dark.
    for (let i = 0; i < 4; i += 1) {
      const scale = 1 - i * 0.16;
      const x = 60 + i * 90;
      const w = 1380 - i * 180;
      const y = 120 + i * 40;
      body.push(rect(x, y, w, 8 * scale, "#2b333a", `opacity="${f(0.7 - i * 0.12)}"`));
      body.push(rect(x, y + 150 * scale, w, 8 * scale, "#2b333a", `opacity="${f(0.6 - i * 0.12)}"`));
      body.push(rect(x, y, 12 * scale, 300 * scale, "#2b333a", `opacity="${f(0.7 - i * 0.12)}"`));
      body.push(rect(x + w - 12, y, 12 * scale, 300 * scale, "#2b333a", `opacity="${f(0.7 - i * 0.12)}"`));
    }
    // Light shaft from a high window.
    body.push(poly([[820, 0], [1080, 0], [1360, CARD_H], [700, CARD_H]], `url(#${ns}-shaft)`));
    body.push(rect(0, CARD_H * 0.68, CARD_W, CARD_H * 0.32, `url(#${ns}-floor)`));

    // Crates, each with a pale tag. The tags carry no writing.
    const crates = [
      [180, 700, 300, 210],
      [500, 742, 250, 168],
      [770, 690, 330, 220],
      [1130, 748, 240, 162],
      [330, 520, 210, 150],
      [900, 500, 230, 160],
    ];
    for (const [cx, cy, cw, ch] of crates) {
      body.push(rect(cx + 14, cy + ch, cw, 16, "#05070a", 'opacity="0.4"'));
      body.push(rect(cx, cy, cw, ch, `url(#${ns}-crate)`));
      body.push(rect(cx, cy, cw, 10, "#8b9199", 'opacity="0.8"'));
      body.push(rect(cx, cy + ch * 0.44, cw, 9, "#3b4046", 'opacity="0.8"'));
      body.push(rect(cx + cw * 0.5 - 5, cy, 10, ch, "#3b4046", 'opacity="0.6"'));
      const tw = 54;
      body.push(rect(cx + cw - tw - 22, cy + ch * 0.16, tw, 38, "#e8ebee", 'opacity="0.92"'));
      body.push(rect(cx + cw - tw - 22, cy + ch * 0.16, tw, 8, P.blue, 'opacity="0.7"'));
      body.push(circle(cx + cw - tw - 22 + tw / 2, cy + ch * 0.16 - 6, 5, "#8b9199"));
      if (rng() > 0.5) {
        body.push(circle(cx + 26, cy + ch - 26, 6, P.green, 'opacity="0.8"'));
      }
    }
    body.push(frame.vignette);
    return svgDoc("card-consignment", CARD_W, CARD_H, defs, body.join("\n"));
  },

  /** Empty engine test cell, lights on, nothing on the stand. */
  "card-idle-shop": () => {
    const ns = "c";
    const frame = cardFrame(ns, "#2b333a", "#171c21");
    const defs = [
      ...frame.defs,
      radGrad(`${ns}-lamp`, 0.5, 0.5, 0.5, [
        [0, "#ffffff", 0.5],
        [1, "#ffffff", 0],
      ]),
      linGrad(`${ns}-wall`, 0, 0, 0, 1, [
        [0, "#39424b"],
        [1, "#232a31"],
      ]),
    ];
    const body = [rect(0, 0, CARD_W, CARD_H, `url(#${ns}-wall)`)];
    // Perforated acoustic wall.
    for (let r = 0; r < 9; r += 1) {
      for (let c2 = 0; c2 < 26; c2 += 1) {
        body.push(circle(60 + c2 * 55, 90 + r * 55, 7, "#1c2126", 'opacity="0.5"'));
      }
    }
    // Cell walls converging.
    body.push(poly([[0, 0], [230, 150], [230, 780], [0, 1000]], "#20262c"));
    body.push(poly([[1500, 0], [1270, 150], [1270, 780], [1500, 1000]], "#1b2126"));
    body.push(rect(230, 660, 1040, 6, "#4a545e", 'opacity="0.6"'));
    // Lamps.
    for (const lx of [420, 750, 1080]) {
      body.push(rrect(lx - 90, 96, 180, 26, 8, "#e6eaee"));
      body.push(ellipse(lx, 190, 210, 150, `url(#${ns}-lamp)`));
    }
    // Floor with rails, and the empty stand.
    body.push(rect(0, 660, CARD_W, 340, `url(#${ns}-floor)`));
    body.push(poly([[300, 1000], [640, 664], [700, 664], [470, 1000]], "#39424b", 'opacity="0.85"'));
    body.push(poly([[1180, 1000], [880, 664], [820, 664], [1010, 1000]], "#39424b", 'opacity="0.85"'));
    body.push(rect(560, 792, 380, 22, "#4a545e"));
    body.push(rect(586, 814, 26, 150, "#39424b"));
    body.push(rect(888, 814, 26, 150, "#39424b"));
    body.push(rect(540, 958, 120, 16, "#2b333a"));
    body.push(rect(860, 958, 120, 16, "#2b333a"));
    body.push(ellipse(750, 986, 300, 26, "#05070a", 'opacity="0.35"'));
    // Thrust frame ring, empty.
    body.push(circle(750, 560, 176, "none", 'stroke="#4a545e" stroke-width="22"'));
    body.push(circle(750, 560, 176, "none", 'stroke="#8f99a2" stroke-width="6" opacity="0.6"'));
    body.push(rect(744, 560, 12, 240, "#4a545e"));
    body.push(circle(1210, 250, 12, P.green, 'opacity="0.9"'));
    body.push(circle(1210, 300, 12, P.red, 'opacity="0.35"'));
    body.push(frame.vignette);
    return svgDoc("card-idle-shop", CARD_W, CARD_H, defs, body.join("\n"));
  },

  /** Parked airframes at dawn. Plain metal: no liveries, no marks. */
  "card-restructuring": () => {
    const ns = "c";
    const rng = makeRng(hashSeed("card-restructuring"));
    const horizon = 620;
    const defs = [
      linGrad(`${ns}-dawn`, 0, 0, 0, 1, [
        [0, "#25344a"],
        [0.34, "#4f5d6f"],
        [0.56, "#9a8a80"],
        [0.66, "#d8b487"],
        [0.72, "#8b8479"],
        [1, "#2a2f35"],
      ]),
      radGrad(`${ns}-sun`, 1180, 600, 520, [
        [0, "#ffd9a0", 0.6],
        [1, "#ffd9a0", 0],
      ], true),
      radGrad(
        `${ns}-vig`,
        CARD_W * 0.5,
        CARD_H * 0.5,
        CARD_W * 0.62,
        [
          [0, "#000000", 0],
          [0.62, "#000000", 0.08],
          [1, "#05070a", 0.5],
        ],
        true,
      ),
      linGrad(`${ns}-metal`, 0, 0, 0, 1, [
        [0, "#8e98a2"],
        [0.45, "#c7ced4"],
        [1, "#5d666f"],
      ]),
    ];
    const body = [
      rect(0, 0, CARD_W, CARD_H, `url(#${ns}-dawn)`),
      rect(0, 0, CARD_W, CARD_H, `url(#${ns}-sun)`),
      rect(0, horizon, CARD_W, CARD_H - horizon, "#2c3138"),
      rect(0, horizon, CARD_W, 4, "#1b2126", 'opacity="0.7"'),
    ];
    // Three airframes, receding. Bare metal: no liveries, no marks, no doors.
    const planes = [
      { x: 300, y: 916, s: 1.0, a: 1 },
      { x: 820, y: 836, s: 0.72, a: 0.82 },
      { x: 1230, y: 780, s: 0.52, a: 0.64 },
    ];
    for (const pl of planes) {
      const s2 = pl.s;
      const X = (v) => pl.x + v * s2;
      const Y = (v) => pl.y + v * s2;
      const g = [];
      g.push(ellipse(X(0), Y(4), 350 * s2, 20 * s2, "#05070a", 'opacity="0.42"'));
      // fin and stabiliser first, so the fuselage overlaps their roots
      g.push(
        poly(
          [[X(-322), Y(-96)], [X(-286), Y(-244)], [X(-232), Y(-244)], [X(-196), Y(-98)]],
          "#7f8892",
        ),
      );
      g.push(poly([[X(-318), Y(-92)], [X(-408), Y(-66)], [X(-286), Y(-58)]], "#6d767f"));
      // fuselage
      g.push(
        path(
          `M ${f(X(352))} ${f(Y(-64))}
           C ${f(X(332))} ${f(Y(-94))}, ${f(X(282))} ${f(Y(-102))}, ${f(X(232))} ${f(Y(-104))}
           L ${f(X(-232))} ${f(Y(-104))}
           C ${f(X(-300))} ${f(Y(-102))}, ${f(X(-334))} ${f(Y(-92))}, ${f(X(-356))} ${f(Y(-54))}
           L ${f(X(-296))} ${f(Y(-34))}
           C ${f(X(-256))} ${f(Y(-24))}, ${f(X(-200))} ${f(Y(-22))}, ${f(X(-120))} ${f(Y(-22))}
           L ${f(X(222))} ${f(Y(-22))}
           C ${f(X(302))} ${f(Y(-26))}, ${f(X(342))} ${f(Y(-44))}, ${f(X(352))} ${f(Y(-64))} Z`,
          `url(#${ns}-metal)`,
        ),
      );
      // cockpit glass, kept to one dark wedge
      g.push(
        poly([[X(300), Y(-84)], [X(340), Y(-70)], [X(300), Y(-62)], [X(272), Y(-80)]], "#2b333a"),
      );
      // wing and engine
      g.push(
        poly([[X(-30), Y(-58)], [X(126), Y(-54)], [X(34), Y(2)], [X(-196), Y(-8)]], "#6d767f"),
      );
      g.push(rrect(X(-88), Y(-34), 108 * s2, 48 * s2, 24 * s2, "#59626b"));
      g.push(ellipse(X(-84), Y(-10), 12 * s2, 24 * s2, "#3b4249"));
      // gear
      g.push(rect(X(232), Y(-22), 11 * s2, 40 * s2, "#3b4249"));
      g.push(rect(X(-50), Y(-22), 13 * s2, 40 * s2, "#3b4249"));
      g.push(circle(X(238), Y(20), 15 * s2, "#20262c"));
      g.push(circle(X(-44), Y(20), 17 * s2, "#20262c"));
      body.push(`<g opacity="${f(pl.a)}">${g.join("")}</g>`);
    }
    // Apron markings kept abstract: a broken line, nothing legible.
    for (let i = 0; i < 9; i += 1) {
      body.push(rect(80 + i * 170, 960, 90, 7, "#d9c39a", `opacity="${f(0.10 + rng.range(0, 0.10))}"`));
    }
    body.push(rect(0, 0, CARD_W, CARD_H, `url(#${ns}-vig)`));
    return svgDoc("card-restructuring", CARD_W, CARD_H, defs, body.join("\n"));
  },

  /** Two people shaking hands at a hangar door. */
  "card-favor": () => {
    const ns = "c";
    const frame = cardFrame(ns, "#232a31", "#12171b");
    const defs = [
      ...frame.defs,
      radGrad(`${ns}-doorGlow`, 0.5, 0.62, 0.6, [
        [0, "#f4e6c8", 0.85],
        [0.55, "#d9c9a8", 0.35],
        [1, "#d9c9a8", 0],
      ]),
      linGrad(`${ns}-doorFill`, 0, 0, 0, 1, [
        [0, "#c8b285"],
        [1, "#efe4cc"],
      ]),
    ];
    const ground = 880;
    const body = [rect(0, 0, CARD_W, CARD_H, `url(#${ns}-air)`)];
    // Hangar face.
    body.push(rect(0, 0, CARD_W, ground, "#1e242a"));
    body.push(rect(0, 120, CARD_W, 6, "#39424b", 'opacity="0.5"'));
    for (let i = 0; i < 10; i += 1) {
      body.push(rect(60 + i * 148, 0, 6, ground, "#151a1f", 'opacity="0.7"'));
    }
    // The open door, an arch of warm light.
    const dx = 470;
    const dw = 560;
    body.push(
      path(
        `M ${f(dx)} ${f(ground)} L ${f(dx)} ${f(430)}
         Q ${f(dx + dw / 2)} ${f(180)} ${f(dx + dw)} ${f(430)}
         L ${f(dx + dw)} ${f(ground)} Z`,
        `url(#${ns}-doorFill)`,
      ),
    );
    body.push(ellipse(dx + dw / 2, 700, 620, 520, `url(#${ns}-doorGlow)`));
    body.push(
      path(
        `M ${f(dx)} ${f(ground)} L ${f(dx)} ${f(430)}
         Q ${f(dx + dw / 2)} ${f(180)} ${f(dx + dw)} ${f(430)}
         L ${f(dx + dw)} ${f(ground)}`,
        "none",
        `stroke="${P.aluDark}" stroke-width="14" opacity="0.75"`,
      ),
    );
    // Door leaves parked either side.
    body.push(rect(dx - 150, 380, 140, ground - 380, "#2b333a"));
    body.push(rect(dx + dw + 10, 380, 140, ground - 380, "#2b333a"));
    // Floor and the long shadows the doorway throws toward the camera.
    body.push(rect(0, ground, CARD_W, CARD_H - ground, `url(#${ns}-floor)`));
    body.push(poly([[dx, ground], [dx + dw, ground], [dx + dw + 220, CARD_H], [dx - 220, CARD_H]], "#e8dcc0", 'opacity="0.10"'));
    // The handshake, backlit.
    body.push(figureSilhouette(660, ground + 20, 400, false, "#12171b"));
    body.push(figureSilhouette(880, ground + 20, 386, true, "#12171b"));
    body.push(ellipse(770, ground + 26, 210, 20, "#05070a", 'opacity="0.45"'));
    body.push(circle(770, ground - 196, 16, "#12171b"));
    body.push(rect(0, 0, CARD_W, CARD_H, `url(#${ns}-vig)`));
    return svgDoc("card-favor", CARD_W, CARD_H, defs, body.join("\n"));
  },
};

/* ==========================================================================
   13. ATA group badges — 1:1, 512x512, six glyphs, six silhouettes
   ========================================================================== */

const BADGE = 512;

function badgeBase(id) {
  const defs = [
    linGrad(`${id}-plate`, 0, 0, 0.4, 1, [
      [0, "#39424b"],
      [0.5, "#232a31"],
      [1, "#161b20"],
    ]),
    linGrad(`${id}-edge`, 0, 0, 0, 1, [
      [0, "#ffffff", 0.30],
      [0.5, "#ffffff", 0.04],
      [1, "#ffffff", 0],
    ]),
    radGrad(`${id}-glow`, 0.5, 0.42, 0.6, [
      [0, P.blue, 0.22],
      [1, P.blue, 0],
    ]),
  ];
  const body = [
    rrect(36, 36, 440, 440, 84, "#05070a", 'opacity="0.35" transform="translate(6 10)"'),
    rrect(36, 36, 440, 440, 84, `url(#${id}-plate)`),
    rrect(36, 36, 440, 440, 84, `url(#${id}-glow)`),
    rrect(40, 40, 432, 432, 80, "none", `stroke="url(#${id}-edge)" stroke-width="4"`),
  ].join("");
  return { defs, body };
}

const ATA_BADGES = {
  /** General & servicing: a hub ring with four service ticks. */
  "ata-general": () => [
    circle(256, 256, 108, "none", `stroke="${P.alu}" stroke-width="30"`),
    circle(256, 256, 34, P.blueBright),
    ...[0, 90, 180, 270].map((a) => {
      const r = (a * Math.PI) / 180;
      return line(
        256 + Math.cos(r) * 146,
        256 + Math.sin(r) * 146,
        256 + Math.cos(r) * 196,
        256 + Math.sin(r) * 196,
        P.alu,
        26,
        'stroke-linecap="round"',
      );
    }),
  ].join(""),

  /** Airframe systems: a closed circuit with three valve nodes. */
  "ata-airframe-systems": () => {
    const pA = [256, 116];
    const pB = [386, 342];
    const pC = [126, 342];
    return [
      path(
        `M ${f(pA[0])} ${f(pA[1])} L ${f(pB[0])} ${f(pB[1])} L ${f(pC[0])} ${f(pC[1])} Z`,
        "none",
        `stroke="${P.alu}" stroke-width="30" stroke-linejoin="round"`,
      ),
      circle(pA[0], pA[1], 40, P.blueBright),
      circle(pB[0], pB[1], 34, P.alu),
      circle(pC[0], pC[1], 34, P.alu),
      circle(256, 268, 26, P.alu, 'opacity="0.5"'),
    ].join("");
  },

  /** Structures: a hexagonal frame with a cross brace. */
  "ata-structures": () => {
    const pointsHex = [];
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      pointsHex.push([256 + Math.cos(a) * 168, 256 + Math.sin(a) * 168]);
    }
    return [
      `<polygon points="${pts(pointsHex)}" fill="none" stroke="${P.alu}" stroke-width="30" stroke-linejoin="round"/>`,
      line(pointsHex[0][0], pointsHex[0][1], pointsHex[3][0], pointsHex[3][1], P.blueBright, 22),
      line(pointsHex[1][0], pointsHex[1][1], pointsHex[4][0], pointsHex[4][1], P.alu, 18, 'opacity="0.65"'),
    ].join("");
  },

  /** Propulsion: a fan disc with blade cut-outs. */
  "ata-propulsion": () => {
    const blades = [];
    for (let i = 0; i < 7; i += 1) {
      const a = (Math.PI * 2 * i) / 7;
      const a2 = a + 0.42;
      blades.push(
        path(
          `M ${f(256 + Math.cos(a) * 52)} ${f(256 + Math.sin(a) * 52)}
           Q ${f(256 + Math.cos(a + 0.5) * 130)} ${f(256 + Math.sin(a + 0.5) * 130)}
             ${f(256 + Math.cos(a2) * 168)} ${f(256 + Math.sin(a2) * 168)}
           L ${f(256 + Math.cos(a2 + 0.30) * 168)} ${f(256 + Math.sin(a2 + 0.30) * 168)}
           Q ${f(256 + Math.cos(a + 0.86) * 128)} ${f(256 + Math.sin(a + 0.86) * 128)}
             ${f(256 + Math.cos(a + 0.52) * 52)} ${f(256 + Math.sin(a + 0.52) * 52)} Z`,
          P.alu,
        ),
      );
    }
    return [
      circle(256, 256, 186, "none", `stroke="${P.alu}" stroke-width="24" opacity="0.85"`),
      blades.join(""),
      circle(256, 256, 56, P.blueBright),
      circle(256, 256, 24, P.g800),
    ].join("");
  },

  /** Avionics: three radiating chevrons. */
  "ata-avionics": () => {
    const arc = (r, w, color, op) =>
      path(
        `M ${f(256 - r * 0.78)} ${f(330 - r * 0.30)} Q ${f(256)} ${f(330 - r * 1.16)} ${f(256 + r * 0.78)} ${f(330 - r * 0.30)}`,
        "none",
        `stroke="${color}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"`,
      );
    return [
      arc(210, 28, P.alu, 0.35),
      arc(148, 28, P.alu, 0.65),
      arc(88, 28, P.alu, 1),
      circle(256, 344, 34, P.blueBright),
    ].join("");
  },

  /** Cabin & utilities: three stacked bars, a service ladder. */
  "ata-utilities": () => [
    rrect(122, 130, 268, 54, 20, P.alu),
    rrect(122, 230, 210, 54, 20, P.alu, 'opacity="0.82"'),
    rrect(122, 330, 148, 54, 20, P.blueBright),
    circle(410, 356, 30, P.alu, 'opacity="0.6"'),
  ].join(""),
};

/* ==========================================================================
   14. The shot list, exactly as docs/COWORK-ART-BRIEF.md names it — 49 files
   ========================================================================== */

const SHOTS = [
  ...FOUNDERS.map((spec) => ({
    id: spec.id,
    role: "founder",
    ratio: "3:4",
    w: 900,
    h: 1200,
    render: () => renderFounder(spec),
  })),
  ...TEAM.map((spec) => ({
    id: spec.id,
    role: "team",
    ratio: "3:4",
    w: 900,
    h: 1200,
    render: () => renderTeam(spec),
  })),
  { id: "hq-room", role: "hq", ratio: "16:9", w: HQ_W, h: HQ_H, render: renderHqRoom },
  { id: "hq-window", role: "hq", ratio: "16:9", w: HQ_W, h: HQ_H, render: renderHqWindow },
  {
    id: "hq-monitors-idle",
    role: "hq",
    ratio: "16:9",
    w: HQ_W,
    h: HQ_H,
    render: () => renderHqMonitors(false),
  },
  {
    id: "hq-monitors-lit",
    role: "hq",
    ratio: "16:9",
    w: HQ_W,
    h: HQ_H,
    render: () => renderHqMonitors(true),
  },
  { id: "hq-founder-idle", role: "hq", ratio: "16:9", w: HQ_W, h: HQ_H, render: renderHqFounder },
  { id: "hq-foreground", role: "hq", ratio: "16:9", w: HQ_W, h: HQ_H, render: renderHqForeground },
  { id: "hq-wall-empty", role: "hq", ratio: "16:9", w: HQ_W, h: HQ_H, render: renderHqWallEmpty },
  { id: "hq-wall-filled", role: "hq", ratio: "16:9", w: HQ_W, h: HQ_H, render: renderHqWallFilled },
  { id: "hq-side-screen", role: "hq", ratio: "16:9", w: HQ_W, h: HQ_H, render: renderHqSideScreen },
  ...Object.entries(FACILITIES).map(([id, draw]) => ({
    id,
    role: "facility",
    ratio: "1:1",
    w: ICON,
    h: ICON,
    render: () => facilityIcon(id, draw),
  })),
  ...Object.keys(SKIES).map((id) => ({
    id,
    role: "sky",
    ratio: "21:9",
    w: SKY_W,
    h: SKY_H,
    render: () => renderSky(id),
  })),
  { id: "wheel-face", role: "wheel", ratio: "1:1", w: 1024, h: 1024, render: renderWheelFace },
  ...Object.entries(CARDS).map(([id, draw]) => ({
    id,
    role: "card",
    ratio: "3:2",
    w: CARD_W,
    h: CARD_H,
    render: draw,
  })),
  ...Object.entries(ATA_BADGES).map(([id, glyph]) => ({
    id,
    role: "ata",
    ratio: "1:1",
    w: BADGE,
    h: BADGE,
    render: () => {
      const base = badgeBase("b");
      return svgDoc(id, BADGE, BADGE, base.defs, [base.body, glyph()].join("\n"));
    },
  })),
];

/*
 * Shots the game requests but which have no procedural stand-in, because a generic
 * fallback already covers them and a hand-built stand-in would be thrown away when
 * the render lands. Listing them keeps the catalogue honest about what is wanted.
 *
 * The eight founder back views: the desk scene shows one generic silhouette for every
 * avatar until these arrive. OfficeHQ prefers hq-founder-<who> and falls back to
 * hq-founder-idle, so a render is picked up with no code change.
 */

const CONDITION_CODES = ["ne", "ns", "oh", "sv", "rp", "ar", "ber", "scrap"];

/**
 * Opportunity kinds and easter eggs, mirrored from src/sim/opportunities.ts. The
 * registry test fails if a delivered card has no row here.
 */
const CARD_IDS = [
  "card-egg-bonded-store-release",
  "card-egg-broker-favour",
  "card-egg-chapter-specialist",
  "card-egg-idle-overhaul-capacity",
  "card-egg-misfiled-llp-consignment",
  "card-egg-portfolio-rebalance",
  "card-egg-records-archive",
  "card-egg-restructuring-package",
  "card-egg-spare-capacity-lease",
  "card-egg-unlisted-qec",
  "card-opp-agreement",
  "card-opp-buyer-need",
  "card-opp-candidate",
  "card-opp-conference",
  "card-opp-intel",
  "card-opp-introduction",
  "card-opp-listing",
  "card-opp-teardown",
  "card-opp-warehouse-as-removed",
  "card-opp-warehouse-questionable",
  "card-opp-warehouse-rotables",
];

/**
 * ATA chapters that carry a glyph. Mirrors the chapter codes in src/sim/ata.ts; the
 * shot-manifest build is generated from the sim enum itself, and tests/art-registry
 * fails if the two drift.
 */
const ATA_GLYPH_CODES = [
  5, 6, 7, 10, 11, 12, 20, 21, 22, 23, 24, 25,
  26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38,
  45, 46, 49, 51, 52, 53, 54, 55, 56, 57, 61, 71,
  72, 73, 74, 75, 76, 77, 78, 79, 80, 82, 83,
];

const REGION_CODES = [
  "na", "carib", "latam", "euw", "eue", "cis", "mea",
  "afr", "sasia", "sea", "gchina", "neasia", "oce", "casia",
];

const AWAITED = [
  "white-woman",
  "white-man",
  "black-woman",
  "black-man",
  "asian-woman",
  "asian-man",
  "mixed-woman",
  "mixed-man",
].map((who) => ({
  id: `hq-founder-${who}`,
  role: "hq",
  ratio: "16:9",
  w: HQ_W,
  h: HQ_H,
  fallback: "hq-founder-idle",
})).concat(
  // Region relief tiles. The map draws a plain plate underneath, so a region with no
  // tile yet degrades to exactly what it looked like before.
  REGION_CODES.map((code) => ({
    id: `region-${code}`,
    role: "region",
    ratio: "4:3",
    w: 1600,
    h: 1200,
    fallback: "netmapv2-region-plate",
  })),
).concat(
  // One glyph per ATA chapter. Chapters without a render draw no mark at all, so a
  // partial delivery reads as plain text chips rather than a half-illustrated row.
  ATA_GLYPH_CODES.map((code) => ({
    id: `ata-ch-${String(code).padStart(2, "0")}`,
    role: "ata",
    ratio: "1:1",
    w: 512,
    h: 512,
    fallback: "none",
  })),
).concat(
  // Condition badges, ordered new down to scrap.
  CONDITION_CODES.map((code) => ({
    id: `condition-${code}`,
    role: "badge",
    ratio: "1:1",
    w: 128,
    h: 128,
    fallback: "none",
  })),
  // Opportunity and easter-egg cards. NetworkMapV2 draws these through
  // opportunityCardShotId, so the id here has to match that function exactly.
  CARD_IDS.map((id) => ({
    id,
    role: "card",
    ratio: "3:2",
    w: 1200,
    h: 800,
    fallback: "netmapv2-card-plate",
  })),
);

/* ==========================================================================
   15. Write everything, then the manifest
   ========================================================================== */

/** Role for a delivered render nobody declared, read off the id prefix. */
function roleFromId(id) {
  const prefixes = [
    ["ata-ch-", "ata"], ["ata-", "ata"], ["brand-", "brand"], ["card-", "card"],
    ["category-", "badge"], ["class-", "badge"], ["condition-", "badge"],
    ["empty-", "empty"], ["facility-", "facility"], ["founder-", "founder"],
    ["hq-", "hq"], ["knowledge-", "knowledge"], ["region-", "region"],
    ["series-", "series"], ["sky-", "sky"], ["team-", "team"], ["wheel-", "wheel"],
    ["cert-", "cert"],
  ];
  for (const [prefix, role] of prefixes) if (id.startsWith(prefix)) return role;
  return "chrome";
}

function main() {
  mkdirSync(GEN_DIR, { recursive: true });

  const seen = new Set();
  const rows = [];
  let bytes = 0;

  for (const shot of SHOTS) {
    if (seen.has(shot.id)) throw new Error(`duplicate shot id: ${shot.id}`);
    seen.add(shot.id);
    const markup = shot.render();
    if (!markup.startsWith("<svg")) throw new Error(`bad markup for ${shot.id}`);
    const file = join(GEN_DIR, `${shot.id}.svg`);
    writeFileSync(file, markup, "utf8");
    bytes += Buffer.byteLength(markup, "utf8");
    // A finished render supersedes its stand-in. The loader already prefers .webp,
    // so the manifest has to say the same thing or the catalogue lies about what
    // is actually shipping.
    const rendered = existsSync(join(GEN_DIR, `${shot.id}.webp`));
    rows.push({
      id: shot.id,
      file: `assets/gen/${shot.id}.${rendered ? "webp" : "svg"}`,
      role: shot.role,
      ratio: shot.ratio,
      w: shot.w,
      h: shot.h,
      generated: rendered ? "gemini" : "procedural",
    });
  }

  for (const shot of AWAITED) {
    if (seen.has(shot.id)) throw new Error(`awaited shot collides with a rendered one: ${shot.id}`);
    seen.add(shot.id);
    const rendered = existsSync(join(GEN_DIR, `${shot.id}.webp`));
    rows.push({
      id: shot.id,
      file: `assets/gen/${shot.id}.webp`,
      role: shot.role,
      ratio: shot.ratio,
      w: shot.w,
      h: shot.h,
      generated: rendered ? "gemini" : "awaited",
      fallback: shot.fallback,
    });
  }

  // Renders delivered from other sessions land straight in public/assets/gen. Rather
  // than making every batch edit this file first, anything on disk that no shot claims
  // is published here with its role read off the id prefix. The catalogue then always
  // describes what actually ships; tests/art-registry is what checks it is drawn.
  for (const file of readdirSync(GEN_DIR).sort()) {
    if (!file.endsWith(".webp")) continue;
    const id = file.slice(0, -".webp".length);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      file: `assets/gen/${id}.webp`,
      role: roleFromId(id),
      ratio: "unknown",
      w: 0,
      h: 0,
      generated: "gemini",
    });
  }

  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  /*
   * Clickable regions the UI has to line up with, published as percentages of the
   * 16:9 stage. The art is the source of truth: when a subject moves, its hotspot
   * has to move with it or the click target lands on empty scenery. A test compares
   * these against the rules in OfficeHQ.css so that drift fails the build rather
   * than shipping a dead button.
   */
  const pct = (value, total) => Number(((value / total) * 100).toFixed(2));
  const regions = {
    wall: {
      top: pct(WALL_GRID.y, HQ_H),
      left: pct(WALL_GRID.x, HQ_W),
      width: pct(WALL_GRID.w, HQ_W),
      height: pct(WALL_GRID.h, HQ_H),
    },
  };
  writeFileSync(
    MANIFEST_PATH,
    `${JSON.stringify({ version: 1, assets: rows, regions }, null, 2)}\n`,
    "utf8",
  );

  const renderedCount = rows.filter((row) => row.generated === "gemini").length;
  const awaitedCount = rows.filter((row) => row.generated === "awaited").length;
  const byRole = rows.reduce((acc, row) => {
    acc[row.role] = (acc[row.role] ?? 0) + 1;
    return acc;
  }, {});
  process.stdout.write(
    `generate-art: ${rows.length} files, ${bytes} bytes -> public/assets/gen/\n` +
      `${Object.entries(byRole)
        .map(([role, count]) => `  ${role}: ${count}`)
        .join("\n")}\n` +
      `manifest: public/assets/manifest.json ` +
        `(${renderedCount} rendered, ` +
        `${rows.length - renderedCount - awaitedCount} on stand-ins, ` +
        `${awaitedCount} awaited)\n`,
  );
}

main();
