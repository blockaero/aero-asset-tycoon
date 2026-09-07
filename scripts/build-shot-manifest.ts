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

const OPPORTUNITY_SHOT_NOTES: Record<string, string> = {
  listing:
    "Market listing. Daylight staging of rotables, not only a dark trading desk. Tropical or spring sky is welcome.",
  buyer_need: "Urgent airline buyer need. Interior tension is allowed; not every card is night.",
  introduction:
    "Warm broker introduction. Daylight hangar door, spring or tropical blue sky, closer to portfolio-rebalance than a night silhouette.",
  agreement: "Asset package agreement. A bright room with windows is valid; not only a dark pendant lamp.",
  teardown:
    "Teardown yard harvest. Tropical boneyard under blue or spring sky is valid; not only dusk.",
  conference:
    "Industry conference networking. Tropical and bright — glass, blue sky, spring light — not only a dark hall.",
  candidate: "Hiring candidate video-call. No identifiable face.",
  intel: "Market intelligence briefing. Quieter interior is fine.",
  warehouse_rotables:
    "Impressive professional warehouse at real inventory scale: rows of landing gears on stands, APU modules, engine and airframe assemblies. Realistic spacing you could walk, not sparse, not overlapping. Daylight, skylights or open dock to blue sky.",
  warehouse_questionable:
    "Warehouse lot whose quality is mixed and somewhat questionable: dusty, uneven rows, tired tape and oil, as-removed units among the honest ones. Still a real warehouse, not a junk pile.",
  warehouse_as_removed:
    "Open-sided or tired tropical store of as-removed landing gears and assemblies under harsh sun. Condition is visibly uneven.",
};

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
      "16:9, 2560x1440. These stack, so the one hard requirement is that they register " +
      "pixel-for-pixel with hq-room and stay transparent outside their subject. Match " +
      "that room's architecture and light. Everything else about how you render them is " +
      "your call.",
    shots: [
      ...(["winter", "spring", "summer", "autumn"] as const).map((season) => ({
        id: `hq-window-${season}`,
        ratio: "16:9",
        px: "2560x1440",
        note: `Whatever ${season} looks like out of this window. Currently faked with a hue filter.`,
      })),
      {
        id: "hq-room-night",
        ratio: "16:9",
        px: "2560x1440",
        note: "The same room after dark.",
      },
      {
        id: "hq-screen-finance",
        ratio: "9:16",
        px: "720x1280",
        note: "Left monitor: what a finance screen looks like from across a room.",
      },
      {
        id: "hq-screen-fleet",
        ratio: "9:16",
        px: "720x1280",
        note: "Centre monitor: an inventory screen, seen the same way.",
      },
      {
        id: "hq-screen-intel",
        ratio: "9:16",
        px: "720x1280",
        note: "Right monitor: a market intelligence screen.",
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
      "3:4, 900x1200. These appear in a video-call panel, so they should read as a call " +
      "rather than a headshot, and they need to be tellable apart from the founder " +
      "portraits. Beyond that, framing and backdrop are yours. Within a role the three " +
      "variants must be three different people.",
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
      "1:1. Eleven kinds of business that a player has to tell apart at a glance on a " +
      "crowded map. How you differentiate them is the interesting problem and it is " +
      "yours: silhouette, viewpoint, framing, whatever works. Keep one consistent " +
      "treatment across the set, and make sure the s1 tier still reads at 32 pixels.",
    shots: FACILITY_ARCHETYPES.flatMap((archetype) =>
      SCALE_TIERS.map((tier) => ({
        id: `facility-${slug(archetype.kind)}-${tier.suffix}`,
        ratio: "1:1",
        px: tier.px,
        note: `${archetype.label} — ${tier.note}.`,
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
      "4:3, 1600x1200. The job is to give each region a recognisable shape without " +
      "turning the map into an atlas. No labels and no political borders; how much " +
      "relief, coastline or texture that needs is your judgement.",
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
      "1:1, 256x256. Each needs to stand for its system and, more importantly, to be " +
      "distinguishable from the chapters next to it at 24 pixels. Abstract or literal " +
      "is your call; consistency across the set and legibility when small are what " +
      "actually matter.",
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
    spec:
      "1:1, 512x512. Distinct at 24 pixels, and clearly a tier above the individual " +
      "chapter glyphs they sit over. Listed here for completeness; also in the brief.",
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
      "1:1, 128x128. These must stay distinguishable in greyscale, because condition " +
      "cannot rely on colour alone. They also need an obvious ordering, since the set " +
      "runs from new down to scrap. How you encode that is open.",
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
    spec:
      "1:1, 128x128. They sit beside the condition badges, so they should feel like the " +
      "same family without being confusable with them.",
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
      "16:9, 1280x720, transparent background. Recognisable as the right size and class " +
      "of aircraft or engine, and generic enough to be fictional: no livery, no " +
      "registration marks, no manufacturer branding. Viewpoint is yours.",
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
      "3:4, 900x1200. It has to read as a certificate at a glance and feel worth the " +
      "weeks it costs to earn. Two hard limits: no legible text, and nothing resembling " +
      "a real issuing body's marks. Within that, what makes a certificate look earned " +
      "is your call.",
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
    spec: "1:1, 256x256. Section marks rather than buttons; they should not compete with the chapter glyphs.",
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
      "3:2, 1500x1000. A scene rather than an icon, and different enough between kinds " +
      "that the board can be scanned by picture. Mood is mixed: some cards are tropical " +
      "daylight and blue sky, closer to portfolio-rebalance than a night interior; some " +
      "stay quieter and more interior. Warehouse lots must read as real inventory at " +
      "scale — landing gears, APUs, engine and airframe assemblies — realistically " +
      "spaced, not sparse and not overlapping.",
    shots: [...new Set(OPPORTUNITY_TEMPLATES.map((template) => template.kind))].map((kind) => ({
      id: `card-opp-${slug(kind)}`,
      ratio: "3:2",
      px: "1500x1000",
      note: OPPORTUNITY_SHOT_NOTES[kind] ?? `Opportunity kind: ${kind.replace(/_/g, " ")}.`,
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
    spec:
      "3:2, 1500x1000. Each row carries the premise; read it and decide what the image " +
      "should be. They should feel rarer than the ordinary opportunity cards.",
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
    spec:
      "3:2, 1500x1000. These stand for market conditions rather than events, which is " +
      "the hard part. No charts, arrows or text; how you show an abstraction is yours.",
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
    spec:
      "3:2, 1500x1000. Moments worth marking. The only steer is that the insolvency card " +
      "should be sober rather than punishing.",
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
      "3:2, 1200x800. These sit behind explanatory text, so the one real constraint is " +
      "that they must not compete with it. They should suggest potential rather than " +
      "failure.",
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
    spec: "Sizes as listed. The mark and wordmark are the only shots where lettering is allowed.",
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

  lines.push("## What is fixed, and what is yours");
  lines.push("");
  lines.push(
    "The list below says what each image is **for** and what has to be **true** of it. " +
      "It deliberately does not say how to draw it. Where a spec sounds prescriptive it " +
      "is because something downstream breaks otherwise, and those cases are called out " +
      "as hard requirements. Everything else is a decision for you, and you will make it " +
      "better than a written brief can.",
  );
  lines.push("");
  lines.push(
    "The three that genuinely cannot move: the Office HQ layers stack, so they must " +
      "register pixel-for-pixel; icons have a size they must survive; and the guardrails " +
      "below are legal and product constraints, not taste.",
  );
  lines.push("");
  lines.push("## Rules that apply to every shot here");
  lines.push("");
  lines.push(
    "- The id is the filename. Lower case, hyphens, no version suffixes, `.webp` at quality 82.",
  );
  lines.push("- Save to `public/assets/gen/<id>.webp`. Commit the images and nothing else.");
  lines.push(
    "- The world is aero corporate: graphite, warm white, brushed aluminium, one accent " +
      "blue, with navigation red and green reserved for status. Hold the palette and the " +
      "register; the rest of the look is open.",
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
