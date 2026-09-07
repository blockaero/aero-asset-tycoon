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

Work on a **new branch off `main`**, named `claude/aero-art-gemini-NN` for the batch number.
Open a draft pull request when the batch is done.

**Commit the `.webp` files and nothing else.** Not the manifest, not this brief, not the skill,
not the scripts. Those all live on the game branch and are maintained there, so a batch that
also carries them turns a clean drop-in into a merge conflict over files the art pass never
needed to touch. `npm run art` on the game branch rebuilds the manifest by looking at which
`.webp` files are actually present, and flips those rows to `generated: "gemini"` on its own.

Batch 01 learned this the hard way: it shipped a manifest whose 42 unrendered rows pointed at
`.webp` files that do not exist, because it was cut from `main` where the procedural `.svg`
stand-ins are not present.

## The manifest

`public/assets/manifest.json` is the catalogue, and it is generated, not hand-written. Run
`npm run art` on the game branch after dropping renders in and it rebuilds every row, marking
each shot `gemini` or `procedural` by looking at what is on disk. Do not edit it by hand and do
not commit it from an art batch. For reference, a row looks like this:

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
`generated` is `"gemini"` for a real render and `"procedural"` for a stand-in.

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
portrait monitor on an arm to the side. The back wall is **floor-to-ceiling glazing** in five
bays; the framed certificates hang on the solid pier at the left of frame, not behind the
founder.

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


## Founder back views — 8 shots, 16:9, 2560x1440, role `hq`

**This is the priority for the next batch.** The scene currently shows one generic dark
silhouette for every founder, with the chosen portrait floating in a circle at head height.
On a figure seen from behind that reads as a face on the back of a head. Eight per-avatar back
views replace it, and the game already prefers them: drop `hq-founder-<who>.webp` in and it is
used automatically, with the generic silhouette staying as the fallback until then.

```
hq-founder-white-woman   hq-founder-white-man
hq-founder-black-woman   hq-founder-black-man
hq-founder-asian-woman   hq-founder-asian-man
hq-founder-mixed-woman   hq-founder-mixed-man
```

Each `hq-founder-<who>` is the same person as the matching `founder-<who>` portrait: same skin
tone, same hair silhouette and colour, same suit. A player who picks portrait 3 must recognise
themselves at the desk.

**The shot.** The founder stands at a standing desk, seen from BEHIND, facing away from the
viewer, out through the floor-to-ceiling glazing. Head, neck, sloping shoulders, upper arms
reading as separate masses, torso narrowing to a waist. No face, no three-quarter turn, no
glance back over the shoulder. Standing, not seated: no chair, no chair back, no armrests, no
wheels. Arms hang naturally or rest lightly on the desk edge.

**Registration.** These stack on `hq-room`, so the figure has to land in the same place every
time. Everything outside the figure is transparent. Against the 2560x1440 frame, with the
figure centred on x 1280:

| Landmark | Value |
| --- | --- |
| Top of head | about y 700 |
| Base of neck | y 806, half-width 40 |
| Collar | y 858 |
| Shoulder tips | y 922, x 1280 plus or minus 178 |
| Right shoulder sits lower than left by | 8 px |
| Armpit | y 972, x 1280 plus or minus 138 |
| Waist, the narrowest point | y 1156, half-width 96 |
| Hip | y 1252, half-width 116 |
| Outer edge of arms | x 1280 plus or minus 196 |
| Desk back edge, for reference | y 1043 |

Shoulder tips must sit about 120 px above the desk back edge. That gap is what makes the figure
read as standing at the desk rather than sitting behind it. The widest point must stay inside
x 1084 to 1476 so the figure never overlaps the flanking monitors.

**Lighting.** The light is behind them, coming through the glazing, so expect a rim light along
the shoulders and the top of the head and a body that sits in relative shade. That contre-jour
is what sells the pose.

That takes the shot list from 49 to 57.

That is 57 files.

## Priority if you cannot do them all

1. ~~The eight founder portraits.~~ Seven done in batch 01; `founder-white-man` outstanding.
2. **The eight founder back views above.** The desk scene shows a generic silhouette for
   everyone until these land.
3. `hq-room`, `hq-monitors-idle`, `hq-monitors-lit`. The rest of the main scene.
4. The eleven facility icons. The map is unreadable without them.
5. The six ATA badges.
6. Everything else.

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
> it to `public/assets/gen/<id>.webp` using the exact ID from the brief as the filename. Do not
> touch `public/assets/manifest.json`; it is generated on the game branch from what is on disk.
>
> Consistency matters more than any single image. Render `hq-room` first and treat it as the
> reference for every other Office HQ layer, since they stack and must align. Render one founder
> portrait first, get the framing and lighting right, then match the other seven to it.
>
> Commit ONLY the `.webp` files, to a new branch `claude/aero-art-gemini-NN` off `main`, in
> batches by category rather than one commit per file, and open a draft pull request when you are
> done. Do not commit the manifest, this brief, the skill or the scripts: those are maintained on
> the game branch and shipping them from an art batch causes merge conflicts for no benefit.
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


---

## Batch log

**Batch 01 — 2026-09-07 — 7 of 49.** Founder portraits, 900x1200 webp q82, sourced 1792x2400
from Gemini, mat border trimmed by corner sampling, no watermark present on any of the seven.
`founder-white-man` was generated but missing from the upload, so it is still on its stand-in
and is visibly the odd one out in the picker.

Two notes worth carrying into batch 02:

- **The blue accent drifts across the set.** Lapel pin, blazer lining, lapel piping, pocket
  square, tie bar, lanyard, full necktie. Each is fine alone, but the eight are meant to swap in
  a picker without jumping, and a pin becoming a necktie reads as a different art direction.
  Specify identical accent placement for the whole set.
- **Backgrounds drift too.** One portrait has a city skyline, another a glass-partitioned
  office, the rest soft neutral walls. Less jarring than the accent, but the same instruction to
  keep framing identical is strained.

`scripts/process-render.py` came from this batch and is kept: it samples the actual corner
colour to find Gemini's mat border rather than assuming white, which matters because the border
came back white, cream and absent across seven renders of the same prompt.
