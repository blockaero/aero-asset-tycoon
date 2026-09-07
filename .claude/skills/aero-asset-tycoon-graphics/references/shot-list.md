# Shot list v2 (57 images)

Status column: `todo`, `done <date>`, `redo <reason>`.

## Founder portraits (8) — ratio 3:4, 900x1200

| File | Subject | Status |
| --- | --- | --- |
| founder-white-woman.webp | White woman, 40s, confident, slight smile | todo |
| founder-white-man.webp | White man, 40s, calm, direct gaze | todo |
| founder-black-woman.webp | Black woman, 30s, assured, warm | todo |
| founder-black-man.webp | Black man, 40s, composed, thoughtful | todo |
| founder-asian-woman.webp | East Asian woman, 30s, focused, poised | todo |
| founder-asian-man.webp | East Asian man, 40s, steady, approachable | todo |
| founder-mixed-woman.webp | Mixed-heritage woman, 30s, energetic | todo |
| founder-mixed-man.webp | Mixed-heritage man, 30s, relaxed, sharp | todo |

Acceptance: identical framing and light across all eight; swap-in tested at 96 px avatar size.

## Office HQ scene layers (6) — ratio 16:9, 2560x1440, each layer on transparent where noted

| File | Layer | Status |
| --- | --- | --- |
| hq-room.webp | Empty room, standing desk, three portrait monitors off, large window right | todo |
| hq-window.webp | Sky plate seen through the window, transparent elsewhere | todo |
| hq-monitors-idle.webp | Three monitors lit dim: left dashboard shapes, center chip grid, right node tree; transparent elsewhere | todo |
| hq-monitors-lit.webp | Same monitors at full brightness for hover state | todo |
| hq-founder-idle.webp | Founder silhouette from behind at the desk, transparent elsewhere (portrait swapped in code) | todo |
| hq-wall-mount.webp | Wall region above the desk left empty for the Tribal Knowledge wall layer | todo |
| hq-foreground.webp | Desk edge, coffee cup, phone, transparent elsewhere | todo |

Acceptance: layers align pixel-exact when stacked; no baked-in text on monitors.

## Facility icon families (6 kinds x 2 sizes = 12) — ratio 1:1, 256 and 96

| File | Kind | Status |
| --- | --- | --- |
| facility-warehouse.webp | Rotables warehouse, racking silhouette | todo |
| facility-hangar.webp | Hangar with open door | todo |
| facility-component-shop.webp | Small component repair shop | todo |
| facility-engine-shop.webp | Mega engine overhaul shop, test cell | todo |
| facility-factory.webp | OEM or PMA factory | todo |
| facility-teardown.webp | Teardown yard, airframe on stands | todo |

Acceptance: readable at 96 px on graphite; consistent isometric angle.

## Map region tiles (6 of 14) — ratio 4:3, 1600x1200

| File | Region | Status |
| --- | --- | --- |
| region-north-america.webp | Continental outline, graphite relief | todo |
| region-europe.webp | | todo |
| region-middle-east.webp | | todo |
| region-east-asia.webp | | todo |
| region-southeast-asia.webp | | todo |
| region-latin-america.webp | | todo |

## Seasonal sky plates (4) — ratio 21:9, 2520x1080

| File | Season | Status |
| --- | --- | --- |
| sky-spring.webp | Cool morning haze | todo |
| sky-summer.webp | High bright noon | todo |
| sky-autumn.webp | Long gold evening | todo |
| sky-winter.webp | Blue dusk, city lights | todo |

## Pulse wheel face (1) — ratio 1:1, 1024

| File | Status |
| --- | --- |
| wheel-face.webp | Brushed aluminum disc, subtle radial grain, no markings | todo |

## Easter-egg event cards (4) — ratio 3:2, 1500x1000

| File | Event | Status |
| --- | --- | --- |
| card-consignment.webp | Crates of tagged serviceable parts in a dim warehouse | todo |
| card-idle-shop.webp | Empty engine test cell, lights on | todo |
| card-restructuring.webp | Parked airframes at dawn | todo |
| card-favor.webp | Two people shaking hands at a hangar door | todo |

## Tribal Knowledge wall (2) — ratio 16:9, 2560x1440, transparent outside the wall

| File | State | Status |
| --- | --- | --- |
| hq-wall-empty.webp | Graphite wall behind the desk with 12 empty aluminum frames in a loose grid, picture lights on | todo |
| hq-wall-filled.webp | Same frames holding blank certificates, plaques, and a small award; no legible text | todo |

Acceptance: frame positions identical between states so individual frames can be revealed in code.

## Team side screen and portraits (7) — screen 9:16 at 720x1280, portraits 3:4 at 900x1200

| File | Subject | Status |
| --- | --- | --- |
| hq-side-screen.webp | Portrait monitor on an articulated arm, blank dark screen, transparent elsewhere | todo |
| team-buyer.webp | Buyer on a video call, headset, warehouse racking behind | todo |
| team-sales.webp | Sales manager on a video call, trade-show backdrop | todo |
| team-records.webp | Technical records specialist, shelves of binders and a scanner | todo |
| team-repair.webp | Repair manager in a shop, engine stand behind | todo |
| team-regional.webp | Regional director, airport office window at dusk | todo |
| team-analyst.webp | Analyst, dual monitors with chart shapes, no legible text | todo |

Acceptance: video-call framing (chest up, slight webcam angle) distinct from founder portraits; diverse across the six.

---

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

Status: all eight `todo`.
