# Aero Asset Tycoon v2 — "Office HQ" proposal

Status: proposal for CEO review. Nothing in here is implemented yet except the graphics skill scaffold (see section 4).

## The one-line thesis

Push the simulation's complexity below the waterline and give the player three surfaces to touch: the **Office HQ** (a founder at a standing desk with three monitors), the **Network Map** (large, fogged, full of small things to open), and the **Pulse wheel** (the turn button). Everything else that is a tab today becomes a mechanic that lives inside one of those three.

Today's eight tabs collapse like this:

| Today | v2 home |
| --- | --- |
| Operations Desk | Office HQ (renamed, animated background) |
| Network Map | Network Map (much larger, fog of war, TAM/SAM/SOM) |
| Marketplace | Listings attach to facilities on the map; a Deal Desk overlay opens from a node |
| Buying Strategy | "Standing orders" card inside the center monitor (mechanic, not an office) |
| Sales Office | Same card, sell side (mechanic, not an office) |
| Asset Control | Center monitor: Fleet Manager, assets as chip groups |
| KPI Index | Left monitor: Finance & KPI dashboard |
| PBH | A contract card that unlocks from the right monitor's research tree |

Sim engine stays deterministic, weekly ticks, seed-reproducible. The kernel is not rewritten; it is scaled and wrapped.

---

## 1. The Pulse wheel

**What the player sees.** A circular turn button, roughly 140 px, bottom-right of every screen. A thin arc runs around the circumference and fills as the live timer counts toward the next pulse. Click it to resolve now; hold to pause. Inside the ring, three lines: the period unit and number ("WK 14 / 52"), the year ("2027"), and a small phase word ("Q2 · Spring"). The disc's background is a slow gradient that hints at time of day (arc progress within the pulse sweeps dawn to dusk to night) and season (year progress shifts the palette cool to warm to gold to cool). Civ meets HOMM: one obvious button, one obvious clock.

**How it is built.**
- Sim: add a pure `calendarFor(tick, config)` helper that returns `{ year, periodIndex, periodsPerYear, season, quarter }`. Tick stays one week; the period unit is presentation only, so "month" or "quarter" pulses are a config knob later, not a kernel change.
- Client: new `PulseWheel` component replacing the header pulse button, pulse trail, and pace select. SVG ring with `stroke-dasharray` driven by the live runner's progress fraction. Two CSS custom properties, `--daylight` (0..1 from arc progress) and `--season-hue` (from period index), drive the gradient. Pace and pause move into a long-press radial menu on the wheel.
- The green/red ACC delta flash stays, but as a ring pulse rather than a modal.

---

## 2. Mechanics: larger map, smaller objects, three budgets per turn

**Three budgets, spent every pulse.**
- **Time** (founder hours per week, ~40): every map action costs hours. Visiting a facility, opening an opportunity, running a due-diligence check, attending a conference easter egg.
- **ACC**: unchanged, the money.
- **Relationship capital (RC)**: earned from on-time deliveries and honored deals (the `relationships` array already tracks this). Spent to ask for introductions, jump a queue at a shop, or get a first look at a package before it lists.

Unspent time does not roll over. Unspent RC decays slowly. This is what makes a turn a decision rather than a click.

**Map objects get smaller and more numerous.** Facilities are the unit of interaction: warehouses, hangars, single-component repair shops, mega engine overhaul shops, OEM and PMA factories, lessor offices, teardown yards, brokers, conferences. Each facility carries a small set of **opportunity slots** that fill probabilistically from the seed. Most are ordinary (a listing, an RFQ, a repair-capacity offer). Some are **easter eggs**: a consignment of misfiled serviceable LLPs, an overhaul shop with idle capacity this quarter, a broker who owes you a favor, an airline restructuring that dumps a package. Easter eggs are seeded, rare, and meaningfully boost the company when opened at the right time.

**Visual direction.** Drop the solarpunk green. The palette moves to aero corporate: graphite, warm white, brushed aluminum, one Block Aero accent, navigation-light red and green as status colors only. No flight schedules anywhere. We manage assets; we do not fly them.

**The Office HQ scene.** The founder avatar stands at a standing desk facing three tall portrait monitors angled toward the player. Each monitor is a clickable hotspot that opens a full-screen surface:

- **Left monitor — Finance & KPIs.** Idle state shows a live miniature dashboard with light Block Aero branding. Opens to charts: ACC balance over time, weekly pulse breakdown, inventory value, turn rate, utilization, DSO-like receivables, and asset KPIs (serviceable ratio, average TAT, BER rate). Rebuild of today's KPI Index using the `pulses` array already in the observation.
- **Center monitor — Fleet Manager.** Assets shown as **chip-like resource groups**: one chip per part master and condition, with a count badge, so 3,000 units read as 40 chips. Click a chip to expand to serialized units. Bulk actions on a chip: send to shop, list for sale, set standing order. Buying and sales strategy live here as a "Standing orders" drawer (see section 5).
- **Right monitor — Research tree.** Company capabilities bought with ACC and time over several pulses: regional access (unlocks SAM in a region), asset-class access (engines, then LLPs, then APUs), commercial instruments (exchange, PBH, consignment), operational skills (faster TAT, better BER calls, lower logistics cost), and intelligence (shock early warning, price index history). Research is how the fog thins.

---

## 3. New game screen

Replace the seed and pace form with three steps on one screen:

1. **Name your company.** Text field plus a dice button. The dice rolls from three seeded lists (adjective, aero noun, suffix: "Meridian Rotables Inc.", "Northstar Aero Asset Management Inc."). The company name is hashed into the world seed unless a seed is entered manually.
2. **Name your founder.** Same pattern. A dice roll picks a name and then offers a portrait grid: eight founders, four presenting as women and four as men, covering white, Black, Asian, and mixed heritage. Picking a portrait does not change stats; it is the avatar rendered at the standing desk and in event cards.
3. **Start.** Campaign length defaults to full; the 24-week prototype length, pace, and raw seed sit behind a collapsed "Advanced" disclosure for dev use.

Sim change: `CampaignConfig` gains `companyName`, `founderName`, `founderPortraitId`. Saves carry them. Nothing else in the kernel reads them.

---

## 4. Graphics library and the `aero-asset-tycoon-graphics` skill

**Finding.** The skill named in the request does not exist in this environment. The closest is `block-aero-brand-imagery`, which drives the Gemini web app through Chrome and only works from a desktop Claude session with browser automation. This remote session cannot run it.

**Proposal.** Create the skill inside the repo at `.claude/skills/aero-asset-tycoon-graphics/` so every future session picks it up. It wraps the brand-imagery workflow with a game-specific style bible, a shot list, and a catalog. The scaffold is included in this branch. It contains:

- `SKILL.md`: when to trigger, the style block (aero corporate near-future, graphite and aluminum, one accent, soft global illumination, no text in image, no real airline liveries, no flight boards), the guardrails, and the output pipeline (webp, named by role, cataloged in `public/assets/manifest.json`).
- `references/shot-list.md`: the first 34 images in generation order: 8 founder portraits, the standing-desk scene split into parallax layers (room, desk, monitors idle, monitors lit, founder idle, window), 6 facility icon families at two sizes, 6 map region tiles, 4 seasonal sky plates, the pulse wheel face, and 4 easter-egg event cards.
- `references/prompt-templates.md`: one flattened prompt per image class.

**First generation run** happens in a desktop session with Chrome automation, or through an image API if one is approved. Until then the client uses placeholder gradients that match the palette, so layout work does not wait on art.

**Music variants.** The v3 hangar theme is the baseline. The music module already synthesizes in the browser. Proposal: three more variants on the same chord set, selected by season, so the library grows without new audio files: "Dawn shift" (sparser, higher register), "Quarter close" (more percussive, faster), "Night ops" (low pad, half tempo). Add later, low risk.

---

## 5. Demote buying and selling strategy to a mechanic

The `StandingPolicy` type already exists in the sim and the rivals already use it. Only the UI changes:

- Delete the Buying Strategy and Sales Office tabs.
- Add a "Standing orders" drawer to the center monitor with the same sliders, shown per chip group where it matters (target stock, max buy price as a percent of anchor, min sell margin, auto-quote on or off).
- Move deal-level actions (accept RFQ, counter, sign PBH) onto the map node or the event card that produced them.
- Keep the sim's automatic purchase and quote functions untouched.

---

## 6. Office HQ background on a six-minute cycle

Rename Operations Desk to Office HQ. Build the scene as five stacked layers, each a webp from the graphics skill, and animate with CSS only:

| Layer | 360-second animation |
| --- | --- |
| Window and sky | Light sweep left to right, color keyed to the pulse wheel's season hue |
| Room | Very slow parallax drift, 6 px amplitude |
| Monitors | Idle chart lines redraw every 90 s; glow breathes on a 20 s sub-cycle |
| Founder | Weight shift every 45 s, occasional glance at a monitor |
| Foreground | A coffee cup steam loop, a phone that lights once per cycle |

All keyframes are multiples of 360 s so the loop closes cleanly. Reduced-motion media query disables everything but the monitor glow.

---

## 7. World scale, fog of war, TAM/SAM/SOM

**The claim we want the engine to make.** A global market of high-value serialized assets that grows 6% a year and retires 2% a year, with supply and demand shocks that disrupt and then revert, plus seasonal cycles, across 190+ countries, thousands of operators, and tens of thousands of shops. The player's company sees only a slice.

**How to do it without simulating 100 million units.**

- **Statistical market, materialized slice.** The world holds **market cohorts**, not units, for everything outside the player's reach: one cohort per region, asset class, and owner type with a count, an age distribution, a price index, and a demand index. Cohorts grow and retire by the 6%/2% rule each year, spread across weeks. Only when a facility enters the player's SOM does the engine **materialize** serialized `Unit` records from its cohort, using the seed so the same facility always yields the same serials. Scaled world size lands at 30k to 50k serialized units in the player-visible universe, with the rest expressed as cohort counts.
- **Shocks.** A mean-reverting process on the global demand index and price index. Shocks arrive as seeded events (fuel spike, a type grounding, a lessor default, a new engine variant), push the indices off baseline, and decay back over 26 to 104 weeks. Seasonality multiplies on top. This gives the "hold inventory at the right time, buy when cheap" loop.
- **Geography.** 190+ countries roll up into about 14 map regions for rendering. Each region carries its country list and a facility density. Facilities are procedurally placed per seed; the map grows from today's ~10 nodes to 300 to 600.
- **Fog of war as three rings.**
  - **TAM**: exists in the cohorts, invisible on the map. Appears only as aggregate numbers in the left monitor.
  - **SAM**: the fog lifts. Facilities render on the map with kind and rough size. Opportunities there are known but not established; opening one costs time and RC. Maps to today's `lead` and `known` node states.
  - **SOM**: business is ready to be established. Full detail, listings, RFQs, standing orders allowed. Maps to today's `partner` state.
  - Research (right monitor) and relationship capital move facilities inward ring by ring. Reputation still gates the outer edge.
- **Performance.** Observation to the client is sliced to SAM plus SOM. Cohort math is O(regions × classes) per tick, so the weekly pulse stays under the current budget even with 500 facilities.

---

## Sequencing

Four phases. Each ends with tests, typecheck, build, and the e2e suite green.

1. **Shell and identity (1 to 2 weeks).** New game screen, company and founder in config and saves, Office HQ rename, Pulse wheel, tabs collapse into three monitors with the existing content moved as-is. Standing orders drawer replaces the two strategy tabs. Placeholder art.
2. **Market engine (2 to 3 weeks).** Cohorts, growth and retirement, shock process, seasonality unified, materialization on SOM entry, TAM/SAM/SOM state machine over the existing node states. Balance suite extended so the evolve and balance CLI commands still run headless.
3. **Map and opportunities (2 weeks).** Larger procedural map, regions, facility kinds, opportunity slots, easter eggs, time and RC budgets, Deal Desk overlay.
4. **Art and polish (parallel, 2 weeks).** First graphics run through the skill, parallax Office HQ with the six-minute cycle, chip-based Fleet Manager, finance charts, research tree UI, three music variants.

## Decisions I need from you

- Pulse unit: keep one week per turn, or make a month the default with the week as a fast option? The plan assumes week.
- Founder portraits: fixed set of eight, or eight plus a "roll again" that regenerates? Fixed is cheaper and deterministic.
- Time budget: 40 hours a week feels right for a founder. Confirm or pick a different number.
- Image pipeline: run the first shot list from your desktop Claude session through Gemini, or approve an image API so it can run headless here?
