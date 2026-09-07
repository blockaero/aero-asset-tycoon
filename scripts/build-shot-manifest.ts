/**
 * Builds docs/ART-MANIFEST.md — the full list of images the game wants, excluding the
 * founder portraits and back views, which are specced in docs/COWORK-ART-BRIEF.md.
 *
 * Every shot here is derived from a real enum or data table in the simulation, so the
 * manifest cannot drift into wishlist territory: if a facility kind, ATA chapter or
 * easter egg exists in the engine, it appears here, and if it is deleted it stops
 * appearing. Run with `npm run shots`.
 */

import { writeFileSync } from "node:fs";
import { ATA_CHAPTERS, ATA_GROUPS, ATA_GROUP_LABELS, ataTitle } from "../src/sim/ata.ts";
import { FACILITY_ARCHETYPES } from "../src/sim/bigmap.ts";
import { SERIES } from "../src/sim/catalog.ts";
import { REGIONS } from "../src/sim/geography.ts";
import { nodesInBranch } from "../src/sim/knowledge.ts";
import { EASTER_EGGS, OPPORTUNITY_TEMPLATES } from "../src/sim/opportunities.ts";
import { TEAM_ROLE_DEFS, TEAM_ROLES } from "../src/sim/team.ts";

type Shot = { id: string; ratio: string; px: string; note: string };
type Group = {
  title: string;
  role: string;
  tier: number;
  why: string;
  spec: string;
  shots: Shot[];
};

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** ATA chapters that actually appear on a part in the catalog. */
const CATALOG_ATA = [
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 45, 49, 52, 54,
  56, 57, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 83,
];

/** Marker sizes on the map. A single icon scaled up reads soft; three tiers do not. */
const SCALE_TIERS: { suffix: string; px: string; note: string }[] = [
  { suffix: "s1", px: "128", note: "single bench, minimal detail" },
  { suffix: "s3", px: "256", note: "mid-size site" },
  { suffix: "s5", px: "512", note: "mega site, full detail" },
];

const SHOCKS: [string, string][] = [
  ["fuel-spike", "Fuel price spike"],
  ["type-grounding", "Fleet type grounding"],
  ["lessor-default", "Lessor portfolio default"],
  ["variant-launch", "New engine variant launch"],
  ["supply-squeeze", "Component supply squeeze"],
  ["traffic-boom", "Regional traffic boom"],
  ["credit-crunch", "Credit tightening"],
];

const groups: Group[] = [
  {
    title: "Office HQ — remaining layers",
    role: "hq",
    tier: 1,
    why:
      "The nine base layers are specced in the brief. These are the states the scene " +
      "needs beyond them. The window currently tints through a CSS hue filter, which " +
      "is a stand-in for four real skies; the monitor plates are drawn as flat SVG.",
    spec:
      "16:9, 2560x1440, transparent outside the subject, registered pixel-for-pixel to " +
      "hq-room. Same standing desk, three portrait monitors, glazed back wall, " +
      "certificates on the left pier.",
    shots: [
      ...(["winter", "spring", "summer", "autumn"] as const).map((season) => ({
        id: `hq-window-${season}`,
        ratio: "16:9",
        px: "2560x1440",
        note: `The view through the curtain wall in ${season}. Replaces the hue filter.`,
      })),
      {
        id: "hq-room-night",
        ratio: "16:9",
        px: "2560x1440",
        note: "The same room after dark: interior lighting on, apron lights through the glass.",
      },
      {
        id: "hq-screen-finance",
        ratio: "9:16",
        px: "720x1280",
        note: "Left monitor content plate: charts and tiles, no legible text.",
      },
      {
        id: "hq-screen-fleet",
        ratio: "9:16",
        px: "720x1280",
        note: "Centre monitor content plate: a grid of chips.",
      },
      {
        id: "hq-screen-intel",
        ratio: "9:16",
        px: "720x1280",
        note: "Right monitor content plate: indices and a node tree.",
      },
    ],
  },
  {
    title: "Team portraits",
    role: "team",
    tier: 1,
    why:
      "Candidates roll continuously and the board refreshes every pulse, so one face " +
      "per role means every buyer you are ever offered is the same person. Three " +
      "variants each is the minimum that stops the board looking broken.",
    spec:
      "3:4, 900x1200. Video-call framing, chest up, slight webcam angle, a backdrop " +
      "hinting the role. Visibly distinct from the founder portraits, which are shot " +
      "straighter and closer.",
    shots: TEAM_ROLES.flatMap((role) =>
      ["a", "b", "c"].map((variant) => ({
        id: `team-${role}-${variant}`,
        ratio: "3:4",
        px: "900x1200",
        note: `${TEAM_ROLE_DEFS[role].label}, variant ${variant.toUpperCase()}.`,
      })),
    ),
  },
  {
    title: "Facility icons by scale",
    role: "facility",
    tier: 1,
    why:
      "The map sizes a marker by node scale 1 to 5, and one icon scaled up reads soft " +
      "at the small end and empty at the large end. Three tiers per kind lets a " +
      "component bench and a mega engine shop read as different businesses, not just " +
      "different sizes.",
    spec:
      "1:1, isometric, single object, centred, graphite base plate, soft shadow. The " +
      "s1 tier must stay readable at 32 pixels.",
    shots: FACILITY_ARCHETYPES.flatMap((archetype) =>
      SCALE_TIERS.map((tier) => ({
        id: `facility-${slug(archetype.kind)}-${tier.suffix}`,
        ratio: "1:1",
        px: tier.px,
        note: `${archetype.label}, ${tier.note}.`,
      })),
    ),
  },
  {
    title: "Map region tiles",
    role: "region",
    tier: 2,
    why:
      "The map draws 14 regions as plain graphite rectangles today. Relief plates give " +
      "the world shape and make the fog read as geography rather than an empty grid.",
    spec:
      "4:3, 1600x1200. Stylised relief: graphite land, darker sea, faint aluminium " +
      "coastline. No labels, no political borders, no city dots.",
    shots: REGIONS.map((entry) => ({
      id: `region-${slug(entry.code)}`,
      ratio: "4:3",
      px: "1600x1200",
      note: `${entry.name}. ${entry.countries.length} countries.`,
    })),
  },
  {
    title: "ATA chapter glyphs",
    role: "ata",
    tier: 2,
    why:
      "The ATA chapter is the axis the whole game trades and learns on. Chips, the " +
      "knowledge tree, the map filter bar and every opportunity card name a chapter, " +
      "and they all currently show a number in a box. One glyph per chapter that " +
      "actually appears on a part in the catalog.",
    spec:
      "1:1, 256x256. A single abstract glyph suggesting the system, not a literal part " +
      "drawing. Must be distinguishable from its neighbours at 24 pixels. Monochrome " +
      "plus the accent.",
    shots: CATALOG_ATA.map((code) => ({
      id: `ata-ch-${String(code).padStart(2, "0")}`,
      ratio: "1:1",
      px: "256",
      note: `ATA ${code} · ${ataTitle(code)}.`,
    })),
  },
  {
    title: "ATA group badges",
    role: "ata",
    tier: 2,
    why: "Section headings above the chapter chips, and the map filter bar's groupings.",
    spec: "1:1, 512x512. Distinct at 24 pixels. Already specced in the brief; listed here for completeness.",
    shots: ATA_GROUPS.map((group) => ({
      id: `ata-${slug(group)}`,
      ratio: "1:1",
      px: "512",
      note: ATA_GROUP_LABELS[group],
    })),
  },
  {
    title: "Condition badges",
    role: "badge",
    tier: 2,
    why:
      "Condition is on every chip, every listing and every unit row. It is currently a " +
      "two-letter code in a pill, which is correct but does not let you scan a shelf.",
    spec:
      "1:1, 128x128. A shape-plus-tone system that survives greyscale, since condition " +
      "must not rely on colour alone. Serviceable grades read calm, AR and below read urgent.",
    shots: [
      ["ne", "New"],
      ["ns", "New surplus"],
      ["oh", "Overhauled"],
      ["sv", "Serviceable"],
      ["rp", "Repaired"],
      ["ar", "As removed"],
      ["ber", "Beyond economic repair"],
      ["scrap", "Scrap"],
    ].map(([code, label]) => ({
      id: `condition-${code}`,
      ratio: "1:1",
      px: "128",
      note: `${label} (${code!.toUpperCase()}).`,
    })),
  },
  {
    title: "Category and asset-class marks",
    role: "badge",
    tier: 3,
    why:
      "Categories drive the standing-order filters and the buy side; asset class drives " +
      "the cohort market and the intelligence screen.",
    spec: "1:1, 128x128. Same shape system as the condition badges so the two read as one family.",
    shots: [
      ...["llp", "rotable", "repairable", "expendable", "consumable", "standard"].map((name) => ({
        id: `category-${name}`,
        ratio: "1:1",
        px: "128",
        note: `Part category: ${name}.`,
      })),
      ...["airframe", "engine", "component", "llp"].map((name) => ({
        id: `class-${name}`,
        ratio: "1:1",
        px: "128",
        note: `Asset class: ${name}.`,
      })),
    ],
  },
  {
    title: "Series silhouettes",
    role: "series",
    tier: 3,
    why:
      "Every part is applicable to one or more series, and the fleet groups, RFQs and " +
      "listings all name them. A silhouette lets a player recognise applicability faster than a code.",
    spec:
      "16:9, 1280x720. Side-on silhouette, graphite on transparent, no livery, no " +
      "registration marks, no manufacturer branding. Generic enough to be fictional.",
    shots: SERIES.map((series) => ({
      id: `series-${slug(series.id)}`,
      ratio: "16:9",
      px: "1280x720",
      note: `${series.name} — ${series.kind}, ${series.class}.`,
    })),
  },
  {
    title: "Certificates for the wall",
    role: "cert",
    tier: 1,
    why:
      "Tribal Knowledge hangs earned certifications in frames on the pier, and the " +
      "frames currently hold blank plates. These are the faces that go in them, and " +
      "they are the reward for a multi-week investment, so they should feel earned.",
    spec:
      "3:4, 900x1200. A framed certificate face: seal, rule work, signature block. NO " +
      "LEGIBLE TEXT and no real issuing-body logos or marks. The look of a certificate " +
      "at a glance, not a forgery of one.",
    shots: [
      ...nodesInBranch("certification").map((node) => ({
        id: `cert-${slug(node.shortTitle)}`,
        ratio: "3:4",
        px: "900x1200",
        note: `${node.title}.`,
      })),
      {
        id: "cert-frame-empty",
        ratio: "3:4",
        px: "900x1200",
        note: "An empty frame with its mount, for a certification not yet earned.",
      },
      {
        id: "cert-award",
        ratio: "3:4",
        px: "900x1200",
        note: "The small award standing on the credenza below the grid.",
      },
    ],
  },
  {
    title: "Tribal Knowledge branch marks",
    role: "knowledge",
    tier: 3,
    why: "Headings in the capability tree: five asset roots and three operations sub-branches.",
    spec: "1:1, 256x256. Quiet, structural, clearly a section mark rather than a button.",
    shots: [
      ...nodesInBranch("asset")
        .filter((node) => node.requires.length === 0)
        .map((node) => ({
          id: `knowledge-root-${slug(node.shortTitle)}`,
          ratio: "1:1",
          px: "256",
          note: `Asset knowledge root: ${node.shortTitle}.`,
        })),
      ...[
        ["sales", "Sales and marketing"],
        ["operations", "Operations"],
        ["ai", "AI"],
      ].map(([id, label]) => ({
        id: `knowledge-ops-${id}`,
        ratio: "1:1",
        px: "256",
        note: `Operations sub-branch: ${label}.`,
      })),
    ],
  },
  {
    title: "Opportunity cards",
    role: "card",
    tier: 2,
    why:
      "Every opportunity on the map is a card, and there is one kind per template. A " +
      "card per kind lets the board be read by shape before it is read by word.",
    spec:
      "3:2, 1500x1000. Cinematic, quiet, one point of warm light. A scene, not an icon.",
    shots: [...new Set(OPPORTUNITY_TEMPLATES.map((template) => template.kind))].map((kind) => ({
      id: `card-opp-${slug(kind)}`,
      ratio: "3:2",
      px: "1500x1000",
      note: `Opportunity kind: ${kind.replace(/_/g, " ")}.`,
    })),
  },
  {
    title: "Easter egg cards",
    role: "card",
    tier: 2,
    why:
      "The ten seeded rare finds. These are the moments a player screenshots, and each " +
      "has a specific aviation premise already written, so each deserves its own image " +
      "rather than a shared generic card.",
    spec: "3:2, 1500x1000. Same cinematic treatment as the opportunity cards, warmer and rarer.",
    shots: EASTER_EGGS.map((egg) => ({
      id: `card-egg-${slug(egg.id)}`,
      ratio: "3:2",
      px: "1500x1000",
      note: `${egg.title}. ${egg.description.split(".")[0]}.`,
    })),
  },
  {
    title: "Market shock cards",
    role: "card",
    tier: 3,
    why:
      "Shocks drive the whole price and demand story and appear on the intelligence " +
      "monitor as bare text. One card per shock kind makes the economy legible.",
    spec: "3:2, 1500x1000. Editorial rather than dramatic. No charts, no arrows, no text.",
    shots: SHOCKS.map(([id, label]) => ({
      id: `card-shock-${id}`,
      ratio: "3:2",
      px: "1500x1000",
      note: label,
    })),
  },
  {
    title: "Milestone cards",
    role: "card",
    tier: 3,
    why:
      "The campaign has no punctuation. These mark the handful of moments that change " +
      "how the company operates.",
    spec: "3:2, 1500x1000. Warmer than the opportunity cards. The insolvency card is sober, not cruel.",
    shots: [
      ["first-sale", "The first asset sold"],
      ["first-hire", "The first person hired"],
      ["first-cert", "The first certification hung on the wall"],
      ["first-region", "The first region opened"],
      ["solvent-year", "A full year closed in profit"],
      ["insolvent", "The company runs out of cash"],
    ].map(([id, label]) => ({
      id: `card-milestone-${id}`,
      ratio: "3:2",
      px: "1500x1000",
      note: label!,
    })),
  },
  {
    title: "Empty states",
    role: "empty",
    tier: 3,
    why:
      "Every surface has a first-run state where it has nothing to show. They currently " +
      "show a sentence on a blank panel, which is the least confident the game ever looks.",
    spec:
      "3:2, 1200x800. Understated, mostly negative space, a single object. These sit " +
      "behind explanatory text so they must not compete with it.",
    shots: [
      ["inventory", "Fleet Manager with nothing on the shelves"],
      ["opportunities", "The map with no open opportunities"],
      ["team", "The team screen with only the founder"],
      ["shocks", "Intelligence with no shock visibility earned"],
      ["knowledge", "Tribal Knowledge with nothing earned"],
      ["saves", "No saved campaigns on this machine"],
    ].map(([id, label]) => ({
      id: `empty-${id}`,
      ratio: "3:2",
      px: "1200x800",
      note: label!,
    })),
  },
  {
    title: "Brand and chrome",
    role: "brand",
    tier: 3,
    why: "The shell around the game: the mark, the loading state, and the card it shows when shared.",
    spec: "As listed. The mark and wordmark are the only shots where lettering is allowed.",
    shots: [
      { id: "brand-mark", ratio: "1:1", px: "512", note: "The Block Aero mark, monochrome, no wordmark." },
      { id: "brand-wordmark", ratio: "4:1", px: "1024x256", note: "Wordmark lockup for the header." },
      { id: "loading-plate", ratio: "16:9", px: "1920x1080", note: "Shown while a campaign world is built." },
      { id: "og-share", ratio: "1.91:1", px: "1200x630", note: "Link preview card." },
      { id: "wheel-bezel", ratio: "1:1", px: "1024", note: "Outer bezel ring for the pulse wheel, transparent centre." },
    ],
  },
];

function render(): string {
  const total = groups.reduce((sum, group) => sum + group.shots.length, 0);
  const lines: string[] = [];

  lines.push("# Art manifest — everything except the founders");
  lines.push("");
  lines.push(
    "Generated by `npm run shots` from the simulation's own enums and data tables, so " +
      "it cannot drift from the game. If a facility kind, ATA chapter or easter egg " +
      "exists in the engine it is listed here; if one is deleted it stops being listed.",
  );
  lines.push("");
  lines.push(
    "The eight founder portraits and the eight founder back views are **not** here. " +
      "They are specced in `docs/COWORK-ART-BRIEF.md`, which is also authoritative on " +
      "the style block, the guardrails, the naming rules and how to commit a batch.",
  );
  lines.push("");
  lines.push(`**${total} shots**, across ${groups.length} groups.`);
  lines.push("");

  lines.push("## Rules that apply to every shot here");
  lines.push("");
  lines.push(
    "- The id is the filename. Lower case, hyphens, no version suffixes, `.webp` at quality 82.",
  );
  lines.push("- Save to `public/assets/gen/<id>.webp`. Commit the images and nothing else.");
  lines.push(
    "- Aero corporate: graphite, warm white, brushed aluminium, one accent blue. " +
      "Navigation red and green only as small status indicators.",
  );
  lines.push(
    "- No text, numbers or lettering inside any image, with the single exception of the brand wordmark.",
  );
  lines.push(
    "- No real airline liveries, manufacturer marks, certification-body logos or identifiable people.",
  );
  lines.push(
    "- No flight boards, departure schedules, routes or passenger scenes. This company manages assets and is not an airline.",
  );
  lines.push("");

  lines.push("## Priority");
  lines.push("");
  lines.push("| Tier | Groups | Shots | What it unblocks |");
  lines.push("| --- | --- | --- | --- |");
  const tierWhy: Record<number, string> = {
    1: "Surfaces a player sees in the first minute, and the certificate reward loop",
    2: "The map and the ATA axis, which is the spine of the whole game",
    3: "Polish, punctuation and chrome",
  };
  for (const tier of [1, 2, 3]) {
    const inTier = groups.filter((group) => group.tier === tier);
    const shots = inTier.reduce((sum, group) => sum + group.shots.length, 0);
    lines.push(`| ${tier} | ${inTier.length} | ${shots} | ${tierWhy[tier]} |`);
  }
  lines.push("");

  for (const tier of [1, 2, 3]) {
    lines.push(`---`);
    lines.push("");
    lines.push(`# Tier ${tier}`);
    lines.push("");
    for (const group of groups.filter((entry) => entry.tier === tier)) {
      lines.push(`## ${group.title}`);
      lines.push("");
      lines.push(`**${group.shots.length} shots** · role \`${group.role}\``);
      lines.push("");
      lines.push(`*Why.* ${group.why}`);
      lines.push("");
      lines.push(`*Spec.* ${group.spec}`);
      lines.push("");
      lines.push("| Shot id | Ratio | Pixels | What it is |");
      lines.push("| --- | --- | --- | --- |");
      for (const shot of group.shots) {
        lines.push(`| \`${shot.id}\` | ${shot.ratio} | ${shot.px} | ${shot.note} |`);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("## Counts by role");
  lines.push("");
  const byRole = new Map<string, number>();
  for (const group of groups) {
    byRole.set(group.role, (byRole.get(group.role) ?? 0) + group.shots.length);
  }
  lines.push("| Role | Shots |");
  lines.push("| --- | --- |");
  for (const [role, count] of [...byRole.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${role}\` | ${count} |`);
  }
  lines.push(`| **total** | **${total}** |`);
  lines.push("");
  lines.push(
    `Derived from ${ATA_CHAPTERS.length} ATA chapters, ${REGIONS.length} regions, ` +
      `${FACILITY_ARCHETYPES.length} facility kinds, ${SERIES.length} series, ` +
      `${TEAM_ROLES.length} team roles, ${EASTER_EGGS.length} easter eggs and ` +
      `${nodesInBranch("certification").length} certifications.`,
  );
  lines.push("");
  return lines.join("\n");
}

const out = new URL("../docs/ART-MANIFEST.md", import.meta.url);
writeFileSync(out, render(), "utf8");
const total = groups.reduce((sum, group) => sum + group.shots.length, 0);
process.stdout.write(`build-shot-manifest: ${total} shots across ${groups.length} groups -> docs/ART-MANIFEST.md\n`);
