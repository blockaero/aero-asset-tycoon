# Architecture findings: navigation vs the intended three-layer UX

Investigation of the playable client as of `cfa11c0` (solarpunk overhaul) on `main`. No gameplay or layout changes in this note. File paths are current; line numbers can drift.

**Owner ask:** a coherent zoom/navigation hierarchy —

1. **Global map** — world-level overview
2. **Regional view** — facilities can be interacted with and discovered
3. **HQ / window views** — interiors and desks that open from explored places or office options

**Hypothesis (verified):** map/navigation is a flat panel/tab switcher, not a zoom stack. HQ and office windows are sibling tabs bolted onto the shell, not first-class view layers.

---

## 1. Verdict

The simulation already has organizations, facilities, network nodes, and a reputation-gated discovery ladder. The client does not present that world as a place you zoom through.

What the player actually gets:

- Campaign starts on an **HQ office scene** (layer 3), not a world map.
- Eight **peer tabs** replace each other in one `view` string.
- “Network Map” is a **relationship graph** drawn on a world-map *texture*. Node `x`/`y` are layout points, not geography.
- There is **no region entity** the player can enter. `World.region` is the literal token `"GLOBAL"`.
- Facilities exist in the kernel and are projected to the client, but they are **name lookups**, not interactable places.
- Marketplace, Sales, Strategy, Asset Control, KPI Index, and PBH are **desk sheets** reached from the tab bar (and some HQ hotspots). They do not open from a region or facility.

The last two UI commits improved *surface* (photo office, map texture, type, pulse beat, then a green palette) and did not introduce a navigation model. The solarpunk map texture in particular makes the graph look like a geographic world you should be able to zoom into — which you cannot.

---

## 2. Current structure

### 2.1 Repo shape

| Layer | Lives in | Role |
| --- | --- | --- |
| Deterministic kernel | `src/sim/` | World, weekly pulse, commands, observation |
| Live session | `src/live/` | Pause/resume/step, pace clock, snapshots |
| Browser adapter | `src/client/local-runner.ts`, `browser-saves.ts` | In-page `LiveCampaignManager` + `localStorage` |
| HTTP adapter | `src/server/http.ts` | Optional Node API / experiments; not used by the Pages SPA |
| UI | `src/client/App.tsx` (~1,387 lines) + `styles.css` | Entire player-facing app |

There is no router, no URL state, no scene graph, and no `ArtImage` / asset-manifest module.

### 2.2 Client shell and “routing”

All location is React state in `App`:

```ts
type View = "hq" | "map" | "market" | "strategy" | "sales" | "assets" | "kpis" | "pbh";
const [view, setView] = useState<View>("hq");
const [inspect, setInspect] = useState<InspectTarget>(null);
```

(`src/client/App.tsx`)

`View` is a **desk-tab enum**. Switching is `setView(id)`. There is no stack, no “came from,” no camera, no zoom level.

Chrome is always:

1. `LedgerHeader` — ACC, pulse, clock, Pulse/Pause/Save (campaign chrome; this should stay)
2. `nav.view-tabs` — the eight peers, labeled “Headquarters”
3. `main.workspace` — one of eight mutually exclusive panels
4. Optional overlays: `InspectSheet`, `PulseBeat`, `EndSheet`

```
CampaignStart
    │ create/load
    ▼
app-shell
  ledger-header          (always)
  view-tabs              (always; 8 peers)
  notice
  workspace ──┬── hq        Headquarters scene
              ├── map       NetworkMap + node aside
              ├── market    Marketplace sheet
              ├── strategy  policy forms
              ├── sales     RFQ desk
              ├── assets    inventory table
              ├── kpis      glossary
              └── pbh       contract cards
  inspect modal          (optional, not a layer)
```

HQ hotspots call the same `setView`. The map’s HQ node calls `onHq()` → `setView("hq")`. A listing opportunity calls `setView("market")` and drops map selection.

That is a **hub-and-spoke tab switcher** with HQ as default hub.

### 2.3 How regions, facilities, fog, and HQ are modeled vs rendered

**Sim (authoritative)**

- `RegionId = "GLOBAL"` only. Saves reject any other value (`src/sim/save.ts`).
- `Facility` has `organizationId`, `nodeId`, `kind` (`warehouse` / `hangar` / `repair_shop` / `factory`), capacity, TAT. **No coordinates, no region, no interior id.**
- `NetworkNode` has `role`, `x`/`y` in a 0–100 box, `facilityIds[]`, and `state: locked | lead | known | partner`.
- Discovery is **reputation / relationship**, not geography (`updateNetworkReach` in `src/sim/network.ts`):

  `locked` → (reputation) → `lead` → (relationship) → `known` → (relationship ≥ 45) → `partner`

- Observation fog (`projectObservation` / `projectNetworkNode`):
  - Locked nodes stay on the map but strip `organizationId` / `facilityIds` / `hiddenDetail`.
  - Listings, RFQs, orgs, shops, and facilities are filtered to unlocked organizations.
- Facilities are 1:1 with nodes in `createWorld` (one shop, hangar, or warehouse per node). Prototype seed: HQ + factory + 3 MROs + 3 airlines + 2 rivals ≈ 10 nodes on one canvas. Full campaign adds more airlines/rivals to the **same** canvas.
- Place flavor is **names only**: `Tokyo HQ`, `Haneda Asset Warehouse`, `Kanto Component Services`. Logistics TAT is a per-facility integer, not distance.

**Client (what is drawn)**

- HQ: CSS background `--asset-hq-office` + five absolutely positioned hotspot buttons. Not a facility interior; not bound to `fac-player-warehouse`.
- Map: CSS background `--asset-world-map` + SVG nodes/routes. Hub-and-spoke lines from HQ. Click non-HQ → **sidebar**, not a region or facility scene.
- `observation.facilities` is used for shop option labels and “Facility A → Facility B” pipeline text. Facilities are never pins, never interiors.
- `hiddenDetail` is authored on every non-HQ node and **never shown** in the UI (only asserted empty when locked in tests).
- Inspect is a second, shallower organization sheet on top of the map aside. `inspectSnippet` in `src/sim/tick.ts` (facility/node/asset/part) is used by the optional HTTP server, not by the React inspect modal.

### 2.4 Simulation vs React boundary

This split is healthy and should be kept.

| In the kernel | In React |
| --- | --- |
| World, RNG, weekly resolve | Which desk tab is showing |
| Commands queued until Pulse | Notices, inspect target, market focus, pulse-beat flash |
| Observation DTO | All presentation |
| Node state / listing fog | Hotspot positions, tab labels, art |

`GameObservation` is a **read model** (clone + filter). It is not a camera and not a scene list.

Player actions are `GameCommand` values (`purchase_listing`, `send_to_shop`, …) queued via `sendCommand` and applied on the next pulse. The UI is already correctly “intent now, world later.”

**Do not** put zoom/layer/window state into `World` or the save format unless a campaign must resume on a specific place. View state can stay client-only.

### 2.5 Art / asset loading (only as it constrains architecture)

There is no loader, manifest, or `ArtImage`. `main.tsx` sets three CSS variables:

- `--asset-hq-office` → `hq-office-solarpunk.webp`
- `--asset-world-map` → `world-map-solarpunk.webp`
- `--asset-tarmac` → `tarmac-solarpunk.webp` (start screen wash)

Generated but **unbound** (no component reads them):

- Solarpunk: `aircraft-`, `engine-`, `hangar-`
- Ops-desk pass: `aircraft-gate`, `control-tower`, `data-plate`, `engine-stand`, `hangar`, plus the pre-solarpunk office/map/tarmac

Art is therefore a **skin on two surfaces** (office, map), not a scene graph. That is why a mood overhaul can ship without a regional view, and why facility interiors cannot be swapped in without a new binding.

---

## 3. What the recent UI commits did to navigation

| Commit | What changed | Effect on the three-layer UX |
| --- | --- | --- |
| `183f110` — “bright near-future operations desk” | Replaced CSS diorama HQ with a photo office + clearer hotspots; put a world texture under the SVG graph; restyled strands; hero Pulse; copy from “Tokyo HQ / NET TOKYO” to “Operations Desk / Global Network”; three-voice type | **HQ layer got clearer as a desk.** Map *looks* more geographic but is still a graph. Copy **removed** the only geographic home (Tokyo) without adding regions. Navigation enum **unchanged**. |
| `cfa11c0` — “solarpunk overhaul” | Palette tokens (warm greens/golds/cream), new generated backgrounds, v3 music | **Skin only.** No `App.tsx` navigation change. Green-first “sustainable” mood fights the industrial aerospace direction and makes the fake-geographic map feel even more like a world to explore. |

Net: **visual polish on a flat desk; navigation model unchanged; spatial metaphor more implied, still unimplemented.**

`docs/PLAYTEST.md` still describes “Enter Tokyo HQ” and “office → map → external node → HQ loop.” That matches the *tab loop that exists*, not the zoom hierarchy now requested. The playtest is HQ-centric by design.

---

## 4. Concrete gaps vs the three-layer UX

### Missing layer 1 — Global map as a world

- Player does not start on a world overview.
- Map is one of eight tabs, titled like a form (`Sheet` + `NET / GLOBAL / 01`).
- Nodes are a social graph (HQ-centered spokes), not continents/regions.
- Locked nodes are dim dots on the same canvas, not fogged territory.

### Missing layer 2 — Regional view (the hole)

- No `Region` type beyond the `"GLOBAL"` placeholder.
- No way to “enter” a cluster of facilities.
- Facilities cannot be discovered as objects; orgs unlock as graph nodes.
- Clicking a node never changes scale. Selection is a highlight + aside.

This is the structural gap. Without it, HQ and windows have nothing spatial to open from.

### Layer 3 — HQ / windows exist, but as peers, not layers

- HQ is a full workspace panel, not an interior opened from a place.
- Windows (market, sales, …) are the same kind of thing as HQ and Map.
- No back stack: Market ← Map loses the selected node; HQ node jumps to the HQ tab.
- KPI Index and PBH are **tab-only** — not on the office scene.
- Inspect / PulseBeat / EndSheet are the only true overlays, and they are not place-bound.
- `min-width: 1280px` — no mobile/zoom language at all.

### Inconsistent patterns / dead ends

- Two organization inspectors (map aside vs inspect modal) with overlapping opportunity actions.
- `hiddenDetail` is dead presentation data.
- `inspectSnippet` (including `kind: "facility"`) is unused by the SPA.
- Tokyo/Haneda/Kanto remain in world data while UI says “global operations desk.”
- CSS still mixes leftover ops-desk cyan-blue shadows with solarpunk tokens (`styles.css` start screen).
- Playtest script, sim names, and UI labels tell three slightly different stories about where you are.

### Missing abstractions that make the intended UX hard

1. **`NavigationState` / camera** — something other than `View` string.
2. **`Region` in the world model** — id, label, bounds or member node ids.
3. **Facility as a presentable place** — coordinates or slot in a region scene; optional interior key.
4. **Window as overlay-on-place** — `{ place, window }` not a sibling of `map`.
5. **Scene/art binding** — `office | world | region | facilityKind → asset`, so interiors can exist without another one-off CSS variable.
6. **Client history** — back from a window returns to the region or HQ that opened it.

Until those exist, more tabs, more hotspots, or more generated hero images will not produce a zoom hierarchy.

---

## 5. Recommended next moves (priority)

These are design/architecture moves, not an implementation in this PR.

### P0 — Freeze art mood passes; specify the camera first

Write a one-page **view contract** before another palette or asset batch.

Suggested client type (client-only; do not save unless you later need “resume in Osaka hangar”):

```ts
type DeskWindow =
  | "market"
  | "sales"
  | "strategy"
  | "assets"
  | "pbh"
  | "kpis"
  | { inspect: InspectTarget };

type Navigation =
  | { layer: "world" }
  | { layer: "region"; regionId: string }
  | { layer: "place"; regionId: string; nodeId: string; window?: DeskWindow };
```

Rules that make the hierarchy real:

- Default after start/load: **`world`**, not `hq`.
- HQ is `place` for `node-hq` (office scene). Desk tools are `window` on that place (or on another node when that is the fiction).
- Tab bar becomes debug/power-user or a compact “open window” list — not the primary map.
- Back always pops: window → place → region → world.

Keep `LedgerHeader` as campaign chrome at every layer.

### P1 — Make regions first-class in the sim (small data change, unlocks UX)

- Replace `RegionId = "GLOBAL"` with a short closed set (e.g. `APAC` / `AMER` / `EMEA`, or a tighter Japan-home + two foreign desks). Update the save check in the same change.
- Assign each `NetworkNode` / `Facility` a `regionId`.
- Group existing `x`/`y` into regional clusters **or** store lat/lng and project. Today’s coordinates must not be treated as a globe — they will fight a real map.
- Observation: region list + which regions are “charted” (any unlocked node) vs fogged.

Relationship `NodeState` can stay. It is **who you know**, not **where you are**. Do not overload it as zoom.

### P2 — Build the missing regional view

World layer: region marks / fog, not every org.

Region layer: **facilities as the interactable objects** (hangar, warehouse, shop, factory). Discovery can reveal a facility when its node leaves `locked`, or when the player “surveys” the region.

Place layer: reuse the current HQ scene pattern for player HQ; add a thin facility frame (kind + name + 1–2 actions) for others. Do not require unique art per node — bind by `FacilityKind`.

Ship this **before** generating more lush map/office images.

### P3 — Re-home windows onto places

- Marketplace / buying policy: HQ monitors / strategy board, or a supplier facility.
- Sales / PBH: HQ phone, or a customer hangar.
- Asset Control: warehouse place (player `fac-player-warehouse`), not a global tab that happens to list every unit.
- Repair send: from warehouse **or** after entering an MRO node.

`setView("market")` from the map is the anti-pattern: it teleports to a sibling sheet and forgets the node.

### P4 — Art binding, then direction (not another overhaul)

Add a small scene table (even a const object) and one `ArtImage` (or CSS-var setter driven by that table):

- `world`, `region.fallback`, `place.hq`, `place.warehouse|hangar|repair_shop|factory`

Wire or delete the unused webps so the asset folder matches the scene graph.

Direction (non-binding, matches owner mood): graphic industrial aerospace / metal / tech first; green and gold as accent. The solarpunk tokens and living-wall office are a **skin debt**, not a navigation blocker — walk them back when touching CSS, do not block P0–P3 on a third aesthetic pass.

### Explicit non-goals

- Do not fake zoom with a CSS transform on the current 100×100 SVG graph.
- Do not add a ninth tab named “Region.”
- Do not move navigation into the weekly kernel.
- Do not generate interiors until `FacilityKind → scene` exists.

---

## 6. Suggested first implementation slice

Smallest change that proves the hierarchy without a sim rewrite:

1. Add the `Navigation` type and a stack in `App` (or a 30-line `navigation.ts`).
2. Render **world** as the current map with nodes **grouped into 2–3 hard-coded region hulls** (client-side grouping by existing labels/positions is acceptable for a spike; promote to `RegionId` in P1).
3. Clicking a hull opens a **region panel** (even a list of facilities) instead of selecting a node on the globe.
4. HQ hotspot and HQ node both push `{ layer: "place", nodeId: "node-hq" }`; desk buttons set `window` on that place.
5. Hide or demote the tab bar behind a “desks” control.

If that slice feels like a real zoom, then do P1 in the world schema. If it still feels like tabs, the camera contract is wrong — fix that before art or more sim fields.

---

## 7. Code index

| Concern | Where |
| --- | --- |
| View enum, tabs, HQ, map, windows | `src/client/App.tsx` |
| Office / map skins, hotspots, tabs | `src/client/styles.css`, `src/client/main.tsx` |
| World seed, node positions, `region: "GLOBAL"` | `src/sim/world.ts` |
| Types: `RegionId`, `Facility`, `NetworkNode`, `NodeState` | `src/sim/types.ts` |
| Discovery + locked projection | `src/sim/network.ts` |
| Client fog / DTO | `src/sim/observation.ts` |
| Save rejects non-`GLOBAL` region | `src/sim/save.ts` |
| Headless inspect (unused by SPA) | `src/sim/tick.ts` `inspectSnippet` |
| Commands | `src/contracts/commands.ts`, `src/sim/kernel.ts` |
| In-browser session | `src/client/local-runner.ts`, `src/live/runner.ts` |
| HQ-centric playtest loop | `docs/PLAYTEST.md` |
