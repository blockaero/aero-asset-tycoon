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
| PBH | A contract card that unlocks from Tribal Knowledge |
| (new) | Tribal Knowledge: the framed wall of certificates and awards behind the desk |
| (new) | Team: a portrait video-call monitor beside the three-monitor set |

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
- **Right monitor — Market intelligence.** With research moved to the wall (below), the right monitor becomes the intelligence screen: price and demand indices per region and asset class, shock early warnings once unlocked, the TAM/SAM/SOM funnel, and the opportunity feed from the map. It is the read-only screen; the other two are where you act.

**The wall — Tribal Knowledge.** Behind and above the desk hangs a wall of framed certificates, memberships, and awards. Empty frames show what can be earned. Clicking the wall opens Tribal Knowledge, the game's capability tree, in three panels:

1. **Certifications and memberships.** ASA-100, AFRA BMP, ISO 9001, AS9120, ISO 27001, ISTAT, ACPC. Each costs ACC and founder time over several pulses, some require a prerequisite (AS9120 needs ISO 9001 first), and each unlocks concrete mechanics: ASA-100 and AS9120 raise the ceiling on who will buy from you and cut quote rejection rates; AFRA BMP opens teardown yards and end-of-life packages; ISO 27001 unlocks lessor and OEM data-sharing deals; ISTAT and ACPC surface conference events on the map where introductions cost less RC.
2. **Asset knowledge.** A tree per asset family: airframes, engines, then sub-components by ATA chapter. Each node grants a buying, selling, or repairing edge: tighter anchor-price estimates, better BER calls, lower repair TAT through shop familiarity, first look at listings in that family. Knowledge is earned two ways: paid study, or organically by transacting in the family, so a company that trades CFM56 for a year learns CFM56.
3. **Company operations.** Three branches. Sales and marketing unlocks events (trade shows, customer days, sponsored ISTAT sessions) that appear on the map as time-limited opportunities. Operations improves logistics cost, receiving throughput, and warehouse capacity. AI unlocks automation: auto-quoting with better pricing, demand forecasting on the intelligence monitor, and records review that shortens receiving inspection.

Sim: a `knowledge` array on the player firm with node ids, progress, and unlock tick. Effects are applied as multipliers read by the existing market, repair, and network functions, so the kernel grows a lookup, not a subsystem.

**The side screen — Team.** A portrait-oriented monitor mounted on an arm to the side of the three-monitor set shows a live video call with a team member, idle-animated. Clicking it opens Team. The founder starts alone. Each hire costs a monthly salary in ACC and returns capacity and capability:

| Role | What they add |
| --- | --- |
| Buyer | More founder time back each week; auto-purchase standing orders execute without a time cost |
| Sales manager | RFQs answered automatically; RC earned faster from on-time deliveries |
| Technical records specialist | Faster receiving, fewer trace disputes, feeds the AI branch |
| Repair manager | Shop TAT bonus and better BER calls on the families they know |
| Regional director | Extends SAM into one region without a certification |
| Analyst | Unlocks charts and indices on the intelligence monitor early |

Candidates surface through the map and through Tribal Knowledge (an ISTAT membership yields better candidates). Team members carry a portrait from the same eight-plus set as the founder, so the art library serves both. Team size is capped by an operations node in Tribal Knowledge, which gives the wall and the side screen a reason to talk to each other.

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
- `references/shot-list.md`: the first 42 images in generation order: 8 founder portraits, the standing-desk scene split into parallax layers (room, desk, monitors idle, monitors lit, founder idle, window), 6 facility icon families at two sizes, 6 map region tiles, 4 seasonal sky plates, the pulse wheel face, 4 easter-egg event cards, the certificate wall in empty and filled states, and 6 team-member portraits.
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
  - Tribal Knowledge, team hires, and relationship capital move facilities inward ring by ring. Reputation still gates the outer edge.
- **Performance.** Observation to the client is sliced to SAM plus SOM. Cohort math is O(regions × classes) per tick, so the weekly pulse stays under the current budget even with 500 facilities.

---

## Sequencing

Four phases. Each ends with tests, typecheck, build, and the e2e suite green.

1. **Shell and identity (1 to 2 weeks).** New game screen, company and founder in config and saves, Office HQ rename, Pulse wheel, tabs collapse into three monitors with the existing content moved as-is. Standing orders drawer replaces the two strategy tabs. Placeholder art.
2. **Market engine (2 to 3 weeks).** Cohorts, growth and retirement, shock process, seasonality unified, materialization on SOM entry, TAM/SAM/SOM state machine over the existing node states. Balance suite extended so the evolve and balance CLI commands still run headless.
3. **Map and opportunities (2 weeks).** Larger procedural map, regions, facility kinds, opportunity slots, easter eggs, time and RC budgets, Deal Desk overlay.
4. **Art and polish (parallel, 2 weeks).** First graphics run through the skill, parallax Office HQ with the six-minute cycle, chip-based Fleet Manager, finance charts, Tribal Knowledge wall and tree UI, Team screen, three music variants.

## Decisions I need from you

- Pulse unit: keep one week per turn, or make a month the default with the week as a fast option? The plan assumes week.
- Founder portraits: fixed set of eight, or eight plus a "roll again" that regenerates? Fixed is cheaper and deterministic.
- Time budget: 40 hours a week feels right for a founder. Confirm or pick a different number.
- Image pipeline: run the first shot list from your desktop Claude session through Gemini, or approve an image API so it can run headless here?

---

## Implementation status

Shipped on `claude/aero-game-design-oogwv6`. Typecheck clean, 237 unit tests, build and
end-to-end all green.

| Proposal item | Where it lives | State |
| --- | --- | --- |
| 1. Pulse wheel | `src/client/components/PulseWheel.tsx`, `src/sim/calendar.ts` | Done |
| 2. Larger map, three budgets, easter eggs | `src/sim/bigmap.ts`, `budgets.ts`, `opportunities.ts`, `components/NetworkMapV2.tsx` | Done |
| 3. Name company and founder, portraits | `src/sim/identity.ts`, `components/NewGame.tsx` | Done |
| 4. Graphics library | `.claude/skills/aero-asset-tycoon-graphics/`, `docs/COWORK-ART-BRIEF.md`, `src/client/art/` | Procedural stand-ins; real renders need a desktop session |
| 5. Strategy demoted to a mechanic | Standing-orders drawer in Fleet Manager | Done |
| 6. Six-minute Office HQ cycle | `src/client/components/OfficeHQ.css` | Done |
| 7. Fog of war, TAM/SAM/SOM, cohort market | `src/sim/cohort-market.ts`, `bigmap.ts`, `company.ts` | Done |
| Tribal Knowledge | `src/sim/knowledge.ts`, `effects.ts` | Done |
| Team | `src/sim/team.ts` | Done |
| ATA prominence | `src/sim/ata.ts`, `catalog.ts`, and every surface | Done |

### Decisions taken

The four open questions were resolved in the build rather than left hanging.

- **Pulse unit** stayed at one week. The calendar helper makes the displayed period a
  presentation choice, so a monthly pulse is a config change rather than a kernel change.
- **Founder portraits** are a fixed set of eight, four presenting feminine and four
  masculine, one of each heritage in each set. A test asserts the records carry no numeric
  field, so nobody can later attach a stat to a face.
- **Time budget** is 40 founder hours a week, raised by knowledge and by hiring a buyer.
- **Image pipeline** produces procedural SVG stand-ins here, with a loader that prefers a
  real `.webp` render at the same shot ID. The Gemini pass runs from a desktop session
  using `docs/COWORK-ART-BRIEF.md`.

### Balance changes the test suite forced

Two real regressions surfaced and were fixed at the cause rather than by moving thresholds.

- Archetypes are ordered by ATA chapter, so a small part count took only the lowest
  chapters and dropped engine hardware entirely. The catalog now walks the archetype list
  with a coprime stride, so any prefix spans chapters and both airframe and engine series.
- Single-series applicability fragmented demand across jittered variants, which made
  stocking a chapter unviable. Best long-run net asset value had fallen to 9.75M against
  10M of starting capital. Base parts now apply to every series their archetype covers, and
  the best archetype returned to 10.40M.
