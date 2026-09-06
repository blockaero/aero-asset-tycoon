# Aero Asset Tycoon

Deterministic aviation aftermarket strategy game. Found an asset-management company,
trade high-value serialized assets by ATA chapter, build capability and a team, and push
the fog back across a global market you can only ever see a slice of.

## The shape of a turn

You stand at a desk. One circular **Pulse wheel** ends the turn; its rim is the timer and
its face carries the week, the year and the season. Each pulse you spend three things and
only three: **ACC** (money), **founder time** (40 hours, no rollover) and **relationship
capital** (earned by delivering on time, and it decays).

Three portrait monitors on the desk:

| Monitor | What it is |
| --- | --- |
| Left | Finance and KPIs: ACC over time, pulse breakdown, asset KPIs |
| Centre | Fleet Manager: inventory as ATA chip groups, with standing orders as a drawer |
| Right | Market intelligence: price and demand indices, the fog funnel, known shocks |

Behind the desk, a wall of framed certificates opens **Tribal Knowledge**, the capability
tree: real certifications and memberships (ASA-100, AFRA BMP, ISO 9001, AS9120, ISO 27001,
ISTAT, ACPC), ATA-chapter asset knowledge, and company operations across sales, operations
and AI. Beside the desk, a portrait video-call screen opens **Team**, where six roles buy
back founder hours or open what you cannot reach alone.

## ATA chapters

The ATA chapter is the primary axis you trade, learn and filter on. The catalog spans 34
chapters across airframe systems, structures, avionics and propulsion, part numbers encode
the chapter, inventory rolls up by chapter, the map filters by chapter, and knowledge is
earned chapter by chapter with partial credit for neighbours in the same group.

## Fog of war

The world holds roughly 100,000,000 high-value serialized assets growing 6% and retiring 2%
a year, across 190+ countries in 14 regions. The engine never simulates them. It holds
statistical cohorts and materialises serial numbers only where you can actually trade, which
is what makes three reach rings affordable:

- **TAM** exists in the statistics and is invisible on the map
- **SAM** is visible and known, but no business is established
- **SOM** is ready to trade

Supply and demand shocks push price and demand off baseline and then revert, with seasonality
on top, so buying into a trough and holding into a peak is a real strategy.

Playable build: [https://blockaero.github.io/aero-asset-tycoon/](https://blockaero.github.io/aero-asset-tycoon/). The simulation kernel runs in the browser; saves use `localStorage`.

## Run the playable prototype

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The weekly pulse, pause/resume/step, and save/load all run in the Vite page — no Node sim server is required.

Optional Node HTTP API (experiments, `/v1`, SSE) still lives on `http://127.0.0.1:8787`:

```powershell
npm run serve
npm run dev:stack
```

Production build (GitHub Pages base path `/aero-asset-tycoon/`):

```powershell
npm run build
```

The static site is `dist/client`. Push to `main` deploys it with GitHub Actions.

## Verification

```powershell
npm test
npm run typecheck
npm run build
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
```

## Headless experiments

```powershell
npm run sim -- run --seed 1 --ticks 100
npm run sim -- evolve --seed 1 --generations 3 --population 8 --ticks 40
npm run sim -- sequence --seed 1
npm run sim -- balance --seed 101 --seeds 5 --ticks 24
```

## Art

Images are addressed by a stable shot ID, never a path. The loader prefers
`public/assets/gen/<id>.webp` (a real render), falls back to `<id>.svg` (a deterministic
procedural stand-in), and finally to a token gradient. Dropping finished renders in replaces
the stand-ins with no code change. See `docs/COWORK-ART-BRIEF.md` for the shot list, naming
rules and manifest format.

```powershell
npm run art
```

One simulation tick is one week. Live pace is 25, 50, or 75 seconds per weekly pulse; headless runs never wait on wall time.

Aircraft and engine nomenclature is real for learning. Organizations, P/Ns, prices, reliability, events, and outcomes are fictional game data. This project is not affiliated with any OEM, airline, MRO, or airport.
