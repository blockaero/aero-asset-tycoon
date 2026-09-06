# Cowork art brief — Aero Asset Tycoon image library

Copy the block under **The prompt** into a Cowork session on a machine where Claude in Chrome
browser automation works and you are signed in to Gemini. The rest of this file is reference.

Cloud Code sessions cannot run this: the pipeline drives the Gemini web app through a real
browser. Everything below assumes a desktop session.

---

## Why the filenames matter

The game never references an image by path. It references a **shot ID**, and the loader in
`src/client/art/ArtImage.tsx` resolves it in this order:

1. `public/assets/gen/<id>.webp` — the real render
2. `public/assets/gen/<id>.svg` — the procedural stand-in already committed
3. a graphite gradient block sized to the shot's ratio

So a finished render dropped in as `<id>.webp` **replaces its stand-in with no code change**.
Get the ID exactly right and everything else takes care of itself. Get it wrong and the render
is simply never loaded, silently.

- Lower case, hyphens, no spaces, no underscores, no version suffixes.
- No `-v2`, no `-final`, no `-1024`. Re-rendering a shot means overwriting the same filename.
- `.webp` only. Quality 82. No `.png`, no `.jpg`.

## Where it goes

Repository `blockaero/aero-asset-tycoon`, directory `public/assets/gen/`.

Work on a **new branch off `main`**, named `claude/aero-art-gemini-01`. Do not push to
`claude/aero-game-design-oogwv6`; that branch is carrying the v2 build and a large binary drop
would collide with it. Open a draft pull request when the batch is done.

## The manifest

`public/assets/manifest.json` is the catalogue. Update it in the same commit as the images.
One entry per file, sorted by `id`:

```json
{
  "version": 1,
  "assets": [
    {
      "id": "founder-asian-woman",
      "file": "assets/gen/founder-asian-woman.webp",
      "role": "founder",
      "ratio": "3:4",
      "w": 900,
      "h": 1200,
      "generated": "gemini",
      "generatedAt": "2026-09-07"
    }
  ]
}
```

`role` is one of `founder`, `team`, `hq`, `facility`, `region`, `sky`, `wheel`, `card`, `ata`.
`generated` is `"gemini"` for a real render and `"procedural"` for a stand-in. Leave the
existing `procedural` rows in place for any shot you did not render; do not delete them.

## The shot list

Full detail lives in `.claude/skills/aero-asset-tycoon-graphics/references/shot-list.md`.
These are the IDs, which are the filenames.

**Founder portraits — 3:4, 900x1200, role `founder`.** Eight, four feminine and four masculine,
one of each heritage in each set. Identical framing, lighting and camera distance across all
eight so they can be swapped in a picker without jumping.

```
founder-white-woman   founder-white-man
founder-black-woman   founder-black-man
founder-asian-woman   founder-asian-man
founder-mixed-woman   founder-mixed-man
```

**Team portraits — 3:4, 900x1200, role `team`.** Video-call framing, chest up, slight webcam
angle, a subtle backdrop hinting the role. Visibly distinct from the founder set.

```
team-buyer   team-sales   team-records   team-repair   team-regional   team-analyst
```

**Office HQ layers — 16:9, 2560x1440, role `hq`.** These stack, so they must align pixel for
pixel. Render the room first and use it as the reference for every other layer. The desk is a
**standing** desk with **three portrait-oriented** monitors angled toward the viewer, plus a
portrait monitor on an arm to the side, and a wall of framed certificates behind.

```
hq-room             full scene, monitors off, large window right
hq-window           sky seen through the window, transparent elsewhere
hq-monitors-idle    three monitors lit dim, transparent elsewhere
hq-monitors-lit     same monitors at full brightness, for hover
hq-founder-idle     founder from behind at the desk, transparent elsewhere
hq-foreground       desk edge, cup, phone, transparent elsewhere
hq-wall-empty       wall behind the desk, twelve empty aluminium frames, picture lights
hq-wall-filled      same frames holding blank certificates and a small award
hq-side-screen      portrait monitor on an articulated arm, blank dark screen
```

Frame positions in `hq-wall-empty` and `hq-wall-filled` must be identical, because the game
reveals individual frames as the player earns them.

**Facility icons — 1:1, 512x512, role `facility`.** Isometric, single object, centred, graphite
base plate, soft shadow. Must stay readable at 32 pixels. One per facility kind in the engine.

```
facility-warehouse       facility-hangar         facility-repair-shop
facility-factory         facility-engine-shop    facility-component-shop
facility-teardown        facility-lessor         facility-broker
facility-distribution    facility-conference
```

**Seasonal skies — 21:9, 2520x1080, role `sky`.**

```
sky-winter   sky-spring   sky-summer   sky-autumn
```

**Pulse wheel — 1:1, 1024x1024, role `wheel`.** Brushed aluminium disc, radial grain, no
markings of any kind. The game draws the timer arc and the text over it.

```
wheel-face
```

**Event cards — 3:2, 1500x1000, role `card`.**

```
card-consignment    crates of tagged serviceable parts in a dim warehouse
card-idle-shop      empty engine test cell, lights on
card-restructuring  parked airframes at dawn
card-favor          two people shaking hands at a hangar door
```

**ATA group badges — 1:1, 512x512, role `ata`.** Six abstract glyphs, one per ATA group, each
clearly distinct at 24 pixels. These mark chapter chips throughout the interface.

```
ata-general   ata-airframe-systems   ata-structures
ata-propulsion   ata-avionics   ata-utilities
```

That is 49 files.

## Priority if you cannot do all 49

1. The eight founder portraits. The new-game screen is the first thing a player sees.
2. `hq-room`, `hq-monitors-idle`, `hq-monitors-lit`, `hq-founder-idle`. The main scene.
3. The eleven facility icons. The map is unreadable without them.
4. The six ATA badges.
5. Everything else.

---

## The prompt

> Generate the Aero Asset Tycoon image library using the `block-aero-brand-imagery` skill for the
> Gemini pipeline, and the repository's own `aero-asset-tycoon-graphics` skill for the style bible,
> guardrails and shot list.
>
> Clone `blockaero/aero-asset-tycoon` and read these two files before generating anything:
> `.claude/skills/aero-asset-tycoon-graphics/SKILL.md` and
> `.claude/skills/aero-asset-tycoon-graphics/references/shot-list.md`. Then read
> `docs/COWORK-ART-BRIEF.md` for the filenames, ratios and manifest format. The brief is
> authoritative on naming; the skill is authoritative on style.
>
> Style, applied to every image without exception: aero corporate, near-future, quietly premium.
> Graphite, warm white, brushed aluminium, and one accent, Block Aero blue. Navigation red and
> green only as small status indicators. Soft global illumination, long shadows, clean geometry,
> a little haze. Painterly-digital, not photoreal and not cartoon. Think a Civilization leader
> screen designed by an aviation asset manager.
>
> Hard guardrails: no text, numbers, logos or lettering anywhere in any image. No real airline
> liveries, no real manufacturer marks, no identifiable real people. No flight boards, departure
> schedules, routes or passenger scenes, because this company manages assets and is not an
> airline. No solarpunk, no foliage, no solar panels, no green sustainability cues; the previous
> art direction used those and we have moved away from it. Leave an eight percent safe margin on
> all edges.
>
> Work through the shot list in the priority order the brief gives. For each image: build the
> flattened prompt, generate, check it against the shot's description, remove the Gemini
> watermark, export webp at quality 82 at the ratio and pixel size the brief specifies, and save
> it to `public/assets/gen/<id>.webp` using the exact ID from the brief as the filename. Then add
> or update its row in `public/assets/manifest.json` with `generated` set to `gemini`.
>
> Consistency matters more than any single image. Render `hq-room` first and treat it as the
> reference for every other Office HQ layer, since they stack and must align. Render one founder
> portrait first, get the framing and lighting right, then match the other seven to it.
>
> Commit to a new branch `claude/aero-art-gemini-01` off `main`, in batches by category rather
> than one commit per file, and open a draft pull request when you are done. Do not push to
> `claude/aero-game-design-oogwv6`.
>
> When finished, report which of the 49 shots you rendered, which you skipped and why, and any
> shot where the guardrails and the description pulled against each other.

---

## Checking the result

After the branch lands, on any machine:

```
npm run dev
```

The loader prefers `.webp` over `.svg` automatically. Any shot still on its stand-in will look
flat and geometric next to a real render, which is the quickest way to spot what is missing.
