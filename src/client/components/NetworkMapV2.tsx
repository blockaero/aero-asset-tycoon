/* ==========================================================================
   NetworkMapV2 — the large fogged world map.

   Pure presentational. Everything it draws comes from the GameObservation it
   is handed; every action leaves through a callback prop. No fetching, no
   global state, no timer that outlives the component.

   Three fog rings drive the render:
     tam — never drawn as a node, only as a per-region density haze
     sam — small hollow marker, known but not established
     som — solid accent marker sized by node scale, with an opportunity badge

   Performance: the world can hold 600+ nodes. The projected list is memoised
   against a *quantised* cull window, so panning changes only the <svg>
   viewBox attribute and the memoised children are handed back by reference.
   ========================================================================== */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ATA_GROUP_LABELS, ataGroupOf, ataLabel, ataTitle } from "../../sim/ata.ts";
import type { GameObservation } from "../../sim/observation.ts";
import type {
  AtaGroup,
  FacilityKind,
  MarketReach,
  NetworkNode,
  NetworkOpportunity,
  RegionCode,
} from "../../sim/types.ts";
import "./NetworkMapV2.css";

/* ---------------------------------------------------------------- *
 * Constants
 * ---------------------------------------------------------------- */

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
/** Hard ceiling on drawn markers. Anything past it is reported, never silently dropped. */
const NODE_CAP = 220;
/** Cards rendered in the side panel before the list is trimmed with a note. */
const PANEL_CAP = 40;
/** Zoom at which node labels become readable enough to be worth the DOM. */
const LABEL_ZOOM = 2.2;

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

const REACH_LABEL: Record<MarketReach, string> = {
  tam: "TAM",
  sam: "SAM",
  som: "SOM",
};

const REACH_BLURB: Record<MarketReach, string> = {
  tam: "Statistical only. Somewhere out there, unsurveyed.",
  sam: "Known to you. Not yet established.",
  som: "Established. Tradeable this pulse.",
};

/**
 * Facility glyphs, drawn in a -1..1 box and scaled onto the marker. Stroke width
 * comes from CSS with a non-scaling stroke so they stay crisp at every zoom.
 */
const FACILITY_GLYPH: Record<FacilityKind, string> = {
  warehouse: "M-1 .7V-.1L0-.8L1-.1V.7Z M-.42 .7V.1H.42V.7",
  hangar: "M-1 .7V.05A1 1 0 0 1 1 .05V.7Z M0 .7V-.35",
  repair_shop: "M-.95 0H.95 M0-.95V.95 M-.62-.62L.62 .62 M-.62 .62L.62-.62",
  factory: "M-1 .7V-.1L-.33-.62V-.1L.33-.62V-.1L1-.62V.7Z",
  engine_shop:
    "M-.9 0A.9 .9 0 1 0 .9 0A.9 .9 0 1 0-.9 0 M-.32 0A.32 .32 0 1 0 .32 0A.32 .32 0 1 0-.32 0 M0-.9V-.32 M0 .32V.9",
  component_shop: "M-.85-.85H-.05V-.05H-.85Z M.05 .05H.85V.85H.05Z M-.05-.45H.85 M-.45-.05V.85",
  teardown: "M-.95 .72H.95 M-.6 .72V-.2L.05-.72 M.4-.42L.95 .1V.72 M-.15-.5L.55-.05",
  lessor: "M-.9-.62H.9 M-.9 0H.9 M-.9 .62H.9 M-.55-.62V.62",
  broker: "M0-.92L.92 0L0 .92L-.92 0Z M-.42 0H.42",
  distribution: "M0-.9V.9 M-.85-.45L.85 .45 M-.85 .45L.85-.45 M-.3 0A.3 .3 0 1 0 .3 0A.3 .3 0 1 0-.3 0",
  conference: "M-.9-.62H.9V.18H-.9Z M-.45 .18V.75 M.45 .18V.75 M-.75 .75H.75",
};

/** Nodes whose facility record is outside the player's accessible set still need a face. */
const ROLE_GLYPH: Record<NetworkNode["role"], FacilityKind> = {
  hq: "warehouse",
  customer: "hangar",
  supplier: "distribution",
  mro: "repair_shop",
  rival: "broker",
};

/* ---------------------------------------------------------------- *
 * Viewport maths
 * ---------------------------------------------------------------- */

type Viewport = { cx: number; cy: number; k: number };
type Size = { w: number; h: number };

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Visible span in 0..100 user units for a zoom level and container aspect. */
function spanOf(k: number, aspect: number): { vw: number; vh: number } {
  const vh = 100 / k;
  return { vw: vh * aspect, vh };
}

/** Keep the world inside the frame; centre it outright when the span overflows. */
function clampCentre(value: number, span: number): number {
  if (span >= 100) return 50;
  return clamp(value, span / 2, 100 - span / 2);
}

/** Zoom about a point given in 0..1 container coordinates. */
function zoomAt(view: Viewport, factor: number, px: number, py: number, aspect: number): Viewport {
  const k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
  if (k === view.k) return view;
  const before = spanOf(view.k, aspect);
  const cx = clampCentre(view.cx, before.vw);
  const cy = clampCentre(view.cy, before.vh);
  const ux = cx - before.vw / 2 + px * before.vw;
  const uy = cy - before.vh / 2 + py * before.vh;
  const after = spanOf(k, aspect);
  return {
    k,
    cx: clampCentre(ux + after.vw * (0.5 - px), after.vw),
    cy: clampCentre(uy + after.vh * (0.5 - py), after.vh),
  };
}

/* ---------------------------------------------------------------- *
 * Projection
 * ---------------------------------------------------------------- */

type PlacedNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  reach: "sam" | "som";
  scale: number;
  kind: FacilityKind;
  opportunities: number;
  ata: number | null;
};

/** Bigger and nearer wins a slot when the cap bites. */
function byPriority(a: PlacedNode, b: PlacedNode): number {
  const reachA = a.reach === "som" ? 1 : 0;
  const reachB = b.reach === "som" ? 1 : 0;
  if (reachA !== reachB) return reachB - reachA;
  if (a.scale !== b.scale) return b.scale - a.scale;
  if (a.opportunities !== b.opportunities) return b.opportunities - a.opportunities;
  return a.id < b.id ? -1 : 1;
}

/* ---------------------------------------------------------------- *
 * Component
 * ---------------------------------------------------------------- */

export type NetworkMapV2Props = {
  observation: GameObservation;
  onInspectNode: (nodeId: string) => void;
  onOpenOpportunity: (opportunityId: number) => void;
  onVisitNode: (nodeId: string) => void;
  onOpenListing: (listingId: number) => void;
};

export function NetworkMapV2({
  observation,
  onInspectNode,
  onOpenOpportunity,
  onVisitNode,
  onOpenListing,
}: NetworkMapV2Props): ReactNode {
  const rawId = useId();
  const hazeId = `netmapv2-haze-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const reliefClipId = `netmapv2-relief-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  const [view, setView] = useState<Viewport>({ cx: 50, cy: 50, k: 1 });
  const [size, setSize] = useState<Size>({ w: 960, h: 620 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [ataFilter, setAtaFilter] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; rect: DOMRect } | null>(null);
  const movedRef = useRef(0);

  /* --- measurement: the viewBox aspect must match the box or pointer maths lie --- */
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = (): void => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setSize((current) =>
        Math.abs(current.w - rect.width) < 0.5 && Math.abs(current.h - rect.height) < 0.5
          ? current
          : { w: rect.width, h: rect.height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* --- wheel zoom: needs a non-passive listener, so it cannot be a React prop --- */
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(-delta * 0.0016);
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      setView((current) => zoomAt(current, factor, px, py, rect.width / rect.height));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const aspect = size.h > 0 ? size.w / size.h : 1.6;
  const { vw, vh } = spanOf(view.k, aspect);
  const cx = clampCentre(view.cx, vw);
  const cy = clampCentre(view.cy, vh);
  const viewBox = `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`;
  /* One length that keeps markers, glyphs and labels near-constant on screen. */
  const unit = 1 / Math.pow(view.k, 0.8);

  /* --- quantised cull window: small pans do not change these numbers --------- */
  const step = Math.max(2, vw / 10);
  const minX = Math.floor((cx - vw / 2 - vw * 0.25) / step) * step;
  const maxX = Math.ceil((cx + vw / 2 + vw * 0.25) / step) * step;
  const minY = Math.floor((cy - vh / 2 - vh * 0.25) / step) * step;
  const maxY = Math.ceil((cy + vh / 2 + vh * 0.25) / step) * step;

  /* --- lookups -------------------------------------------------------------- */
  const facilityKindById = useMemo(() => {
    const map = new Map<string, FacilityKind>();
    for (const facility of observation.facilities) map.set(facility.id, facility.kind);
    return map;
  }, [observation.facilities]);

  const opportunitiesByNode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const opportunity of observation.opportunities) {
      counts.set(opportunity.nodeId, (counts.get(opportunity.nodeId) ?? 0) + 1);
    }
    return counts;
  }, [observation.opportunities]);

  const nodeById = useMemo(() => {
    const map = new Map<string, NetworkNode>();
    for (const node of observation.nodes) map.set(node.id, node);
    return map;
  }, [observation.nodes]);

  const regionNameByCode = useMemo(() => {
    const map = new Map<RegionCode, string>();
    for (const region of observation.regions) map.set(region.code, region.name);
    return map;
  }, [observation.regions]);

  /* --- candidates: fog + ATA filter. Recomputed on filter, never on pan ------ */
  const candidates = useMemo(() => {
    const rows: PlacedNode[] = [];
    for (const node of observation.nodes) {
      const reach = observation.reachByNode[node.id] ?? node.reach;
      if (reach === "tam") continue;
      if (ataFilter !== null && !node.ataFocus.includes(ataFilter)) continue;
      const facilityId = node.facilityIds[0];
      const kind = (facilityId ? facilityKindById.get(facilityId) : undefined) ?? ROLE_GLYPH[node.role];
      rows.push({
        id: node.id,
        label: node.label,
        x: node.x,
        y: node.y,
        reach,
        scale: clamp(node.scale, 1, 5),
        kind,
        opportunities: opportunitiesByNode.get(node.id) ?? 0,
        ata: node.ataFocus[0] ?? null,
      });
    }
    return rows;
  }, [observation.nodes, observation.reachByNode, ataFilter, facilityKindById, opportunitiesByNode]);

  /* --- cull + cap ----------------------------------------------------------- */
  const culled = useMemo(() => {
    const inView: PlacedNode[] = [];
    for (const node of candidates) {
      if (node.x < minX || node.x > maxX || node.y < minY || node.y > maxY) continue;
      inView.push(node);
    }
    if (inView.length <= NODE_CAP) return { nodes: inView, capped: 0, inView: inView.length };
    const ranked = inView.slice().sort(byPriority);
    return { nodes: ranked.slice(0, NODE_CAP), capped: inView.length - NODE_CAP, inView: inView.length };
  }, [candidates, minX, maxX, minY, maxY]);

  /* --- TAM density haze, one blob per region -------------------------------- */
  const haze = useMemo(() => {
    const counts = new Map<RegionCode, number>();
    for (const node of observation.nodes) {
      if ((observation.reachByNode[node.id] ?? node.reach) !== "tam") continue;
      counts.set(node.regionCode, (counts.get(node.regionCode) ?? 0) + 1);
    }
    let peak = 1;
    for (const value of counts.values()) peak = Math.max(peak, value);
    return { counts, peak };
  }, [observation.nodes, observation.reachByNode]);

  /* --- handlers ------------------------------------------------------------- */
  const handleSelect = useCallback((nodeId: string) => {
    if (movedRef.current > 4) return;
    setSelectedNodeId((current) => (current === nodeId ? null : nodeId));
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect };
    movedRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning(true);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (dx === 0 && dy === 0) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    movedRef.current += Math.abs(dx) + Math.abs(dy);
    const frameAspect = drag.rect.width / drag.rect.height;
    setView((current) => {
      const span = spanOf(current.k, frameAspect);
      return {
        k: current.k,
        cx: clampCentre(current.cx - (dx / drag.rect.width) * span.vw, span.vw),
        cy: clampCentre(current.cy - (dy / drag.rect.height) * span.vh, span.vh),
      };
    });
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPanning(false);
  }, []);

  const nudgeZoom = useCallback((factor: number) => {
    const element = stageRef.current;
    const rect = element?.getBoundingClientRect();
    const frameAspect = rect && rect.height > 0 ? rect.width / rect.height : 1.6;
    setView((current) => zoomAt(current, factor, 0.5, 0.5, frameAspect));
  }, []);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case "ArrowLeft":
        dx = -1;
        break;
      case "ArrowRight":
        dx = 1;
        break;
      case "ArrowUp":
        dy = -1;
        break;
      case "ArrowDown":
        dy = 1;
        break;
      case "+":
      case "=":
        event.preventDefault();
        nudgeZoom(1.3);
        return;
      case "-":
      case "_":
        event.preventDefault();
        nudgeZoom(1 / 1.3);
        return;
      case "0":
        event.preventDefault();
        setView({ cx: 50, cy: 50, k: 1 });
        return;
      default:
        return;
    }
    event.preventDefault();
    const element = stageRef.current;
    const rect = element?.getBoundingClientRect();
    const frameAspect = rect && rect.height > 0 ? rect.width / rect.height : 1.6;
    setView((current) => {
      const span = spanOf(current.k, frameAspect);
      return {
        k: current.k,
        cx: clampCentre(current.cx + dx * span.vw * 0.16, span.vw),
        cy: clampCentre(current.cy + dy * span.vh * 0.16, span.vh),
      };
    });
  }, [nudgeZoom]);

  /* --- memoised SVG children ------------------------------------------------ */
  const reliefMarkup = useMemo(
    () =>
      observation.regions.map((region) => (
        <clipPath key={region.code} id={`${reliefClipId}-${region.code}`}>
          <rect x={region.x} y={region.y} width={region.width} height={region.height} rx={0.8} />
        </clipPath>
      )),
    [observation.regions, reliefClipId],
  );

  const regionMarkup = useMemo(
    () =>
      observation.regions.map((region) => {
        const count = haze.counts.get(region.code) ?? 0;
        const intensity = count / haze.peak;
        return (
          <g key={region.code} className="netmapv2-region">
            <rect
              className="netmapv2-region-plate"
              x={region.x}
              y={region.y}
              width={region.width}
              height={region.height}
              rx={0.8}
            />
            {/* Relief tile. The plate above stays underneath as the fallback, so a
                region whose art has not been rendered yet looks as it did before. */}
            <image
              className="netmapv2-region-relief"
              href={`${import.meta.env.BASE_URL}assets/gen/region-${region.code.toLowerCase()}.webp`}
              x={region.x}
              y={region.y}
              width={region.width}
              height={region.height}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${reliefClipId}-${region.code})`}
            />
            {count > 0 ? (
              <rect
                className="netmapv2-region-haze"
                x={region.x}
                y={region.y}
                width={region.width}
                height={region.height}
                rx={0.8}
                fill={`url(#${hazeId})`}
                opacity={0.16 + intensity * 0.5}
              >
                <title>{`${region.name}: ${NUMBER_FORMAT.format(count)} unsurveyed sites (TAM)`}</title>
              </rect>
            ) : null}
            <text
              className="netmapv2-region-name"
              x={region.x + 1.2}
              y={region.y + 2.6}
              style={{ fontSize: `${2.1 * unit}px` }}
            >
              {region.name}
            </text>
            {count > 0 ? (
              <text
                className="netmapv2-region-count"
                x={region.x + 1.2}
                y={region.y + 2.6 + 2.1 * unit}
                style={{ fontSize: `${1.5 * unit}px` }}
              >
                {`${NUMBER_FORMAT.format(count)} unsurveyed`}
              </text>
            ) : null}
          </g>
        );
      }),
    [observation.regions, haze, hazeId, unit],
  );

  const showLabels = view.k >= LABEL_ZOOM;

  const nodeMarkup = useMemo(
    () =>
      culled.nodes.map((node) => {
        const som = node.reach === "som";
        const radius = (som ? 0.9 + node.scale * 0.3 : 0.72 + node.scale * 0.2) * unit;
        const selected = node.id === selectedNodeId;
        const label = `${node.label} · ${REACH_LABEL[node.reach]} · scale ${node.scale}${
          node.opportunities > 0 ? ` · ${node.opportunities} open` : ""
        }`;
        return (
          <g
            key={node.id}
            className={`netmapv2-node netmapv2-node--${node.reach}${selected ? " is-selected" : ""}`}
            transform={`translate(${node.x} ${node.y})`}
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected}
            onClick={() => handleSelect(node.id)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              movedRef.current = 0;
              handleSelect(node.id);
            }}
          >
            <title>{label}</title>
            {selected ? <circle className="netmapv2-node-halo" r={radius * 2.1} /> : null}
            <circle className="netmapv2-node-body" r={radius} />
            <g
              className="netmapv2-node-glyph"
              transform={`scale(${radius * 0.62})`}
              aria-hidden="true"
            >
              <path d={FACILITY_GLYPH[node.kind]} />
            </g>
            {som && node.opportunities > 0 ? (
              <g className="netmapv2-node-badge" transform={`translate(${radius} ${-radius})`}>
                <circle r={unit * 0.78} />
                <text style={{ fontSize: `${unit * 1.02}px` }}>{Math.min(node.opportunities, 9)}</text>
              </g>
            ) : null}
            {showLabels || node.scale >= 5 ? (
              <text
                className="netmapv2-node-label"
                y={radius + unit * 1.9}
                style={{ fontSize: `${1.45 * unit}px` }}
              >
                {node.label}
              </text>
            ) : null}
          </g>
        );
      }),
    [culled, unit, selectedNodeId, showLabels, handleSelect],
  );

  /* --- panel data ----------------------------------------------------------- */
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedReach = selectedNode
    ? observation.reachByNode[selectedNode.id] ?? selectedNode.reach
    : null;

  const panelOpportunities = useMemo(() => {
    const source = selectedNodeId
      ? observation.opportunities.filter((opportunity) => opportunity.nodeId === selectedNodeId)
      : ataFilter !== null
        ? observation.opportunities.filter((opportunity) => opportunity.ataFocus.includes(ataFilter))
        : observation.opportunities;
    return source.slice().sort((a, b) => {
      if (a.easterEgg !== b.easterEgg) return a.easterEgg ? -1 : 1;
      if (a.expiresTick !== b.expiresTick) return a.expiresTick - b.expiresTick;
      return a.id - b.id;
    });
  }, [observation.opportunities, selectedNodeId, ataFilter]);

  const budget = observation.company.budget;
  const timeLeft = budget.timeTotal - budget.timeSpent;
  const rcLeft = budget.rcTotal - budget.rcSpent;
  const acc = observation.firm.accBalance;

  const blockReason = useCallback(
    (opportunity: NetworkOpportunity): string | null => {
      if (opportunity.timeCost > timeLeft) {
        return `Needs ${formatSmall(opportunity.timeCost)} h · ${formatSmall(timeLeft)} h left this pulse`;
      }
      if (opportunity.rcCost > rcLeft) {
        return `Needs ${formatSmall(opportunity.rcCost)} RC · ${formatSmall(rcLeft)} RC left`;
      }
      if (opportunity.accCost > acc) {
        return `Needs ${formatMoney(opportunity.accCost)} ACC · ${formatMoney(acc)} on hand`;
      }
      return null;
    },
    [timeLeft, rcLeft, acc],
  );

  /* --- ATA filter bar ------------------------------------------------------- */
  const ataGroups = useMemo(() => {
    const buckets = new Map<AtaGroup, { code: number; count: number }[]>();
    for (const row of observation.ataOpportunities) {
      const group = ataGroupOf(row.code);
      const list = buckets.get(group);
      if (list) list.push(row);
      else buckets.set(group, [row]);
    }
    return (Object.keys(ATA_GROUP_LABELS) as AtaGroup[])
      .map((group) => ({
        group,
        rows: (buckets.get(group) ?? [])
          .slice()
          .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.code - b.code)),
      }))
      .filter((entry) => entry.rows.length > 0);
  }, [observation.ataOpportunities]);

  const funnel = observation.funnel;
  const funnelTotal = Math.max(1, funnel.tam + funnel.sam + funnel.som);
  const offScreen = candidates.length - culled.inView;
  const visited = selectedNode
    ? observation.company.visitedThisTick.includes(selectedNode.id)
    : false;
  const worldAssets = observation.market.worldAssets;
  const trackedAssets = observation.market.trackedAssets;
  const relationshipCapital = observation.company.relationshipCapital;
  const tick = observation.tick;

  /* --- memoised chrome ------------------------------------------------------
     A pan changes only the viewBox. Every other subtree is handed back by
     reference so React has nothing to reconcile while the mouse is down.
     ------------------------------------------------------------------------ */

  /* ---- 3. Funnel readout + 6. budget strip ---- */
  const headMarkup = useMemo(
    () => (
      <header className="netmapv2-head">
        <div className="netmapv2-funnel">
          <p className="netmapv2-eyebrow">Market reach</p>
          <div className="netmapv2-funnel-bar" role="img" aria-label={funnelAria(funnel)}>
            <span
              className="netmapv2-funnel-seg netmapv2-funnel-seg--tam"
              style={{ flexGrow: funnel.tam / funnelTotal }}
            />
            <span
              className="netmapv2-funnel-seg netmapv2-funnel-seg--sam"
              style={{ flexGrow: funnel.sam / funnelTotal }}
            />
            <span
              className="netmapv2-funnel-seg netmapv2-funnel-seg--som"
              style={{ flexGrow: funnel.som / funnelTotal }}
            />
          </div>
          <dl className="netmapv2-funnel-keys">
            {(["tam", "sam", "som"] as const).map((ring) => (
              <div key={ring} className={`netmapv2-funnel-key netmapv2-funnel-key--${ring}`}>
                <dt>{REACH_LABEL[ring]}</dt>
                <dd>{NUMBER_FORMAT.format(funnel[ring])}</dd>
                <p>{REACH_BLURB[ring]}</p>
              </div>
            ))}
          </dl>
          <p className="netmapv2-world">
            <strong>{NUMBER_FORMAT.format(worldAssets)}</strong> serialized assets in the world fleet.
          </p>
          <p className="netmapv2-world-note">
            The engine tracks a scaled slice — {NUMBER_FORMAT.format(trackedAssets)} modelled assets
            stand in for the whole.
          </p>
        </div>

        <div className="netmapv2-budget" aria-label="Turn budget">
          <p className="netmapv2-eyebrow">Pulse budget</p>
          <div className="netmapv2-budget-row">
            <BudgetGauge
              label="Time"
              left={timeLeft}
              total={budget.timeTotal}
              suffix="h"
              tone={toneOf(timeLeft, budget.timeTotal)}
            />
            <BudgetGauge
              label="RC"
              left={rcLeft}
              total={budget.rcTotal}
              suffix=""
              tone={toneOf(rcLeft, budget.rcTotal)}
            />
            <div className="netmapv2-gauge netmapv2-gauge--acc">
              <span className="netmapv2-gauge-label">ACC</span>
              <span className="netmapv2-gauge-value">{formatMoney(acc)}</span>
              <span className="netmapv2-gauge-sub">
                {relationshipCapital > 0
                  ? `${formatSmall(relationshipCapital)} RC carried`
                  : "No carried RC"}
              </span>
            </div>
          </div>
        </div>
      </header>
    ),
    [funnel, funnelTotal, worldAssets, trackedAssets, budget, timeLeft, rcLeft, acc, relationshipCapital],
  );

  /* ---- 4. ATA filter bar ---- */
  const ataMarkup = useMemo(
    () => (
      <div className="netmapv2-ata" aria-label="Filter map by ATA chapter">
        <div className="netmapv2-ata-head">
          <p className="netmapv2-eyebrow">ATA chapter · open opportunities</p>
          <button
            type="button"
            className="netmapv2-ata-clear"
            onClick={() => setAtaFilter(null)}
            disabled={ataFilter === null}
          >
            {ataFilter === null ? "All chapters" : `Clear ${ataLabel(ataFilter)}`}
          </button>
        </div>
        {ataGroups.length === 0 ? (
          <p className="netmapv2-empty">No open opportunities carry an ATA chapter this pulse.</p>
        ) : (
          <div className="netmapv2-ata-groups">
            {ataGroups.map((entry) => (
              <div key={entry.group} className="netmapv2-ata-group">
                <h4 className="netmapv2-ata-heading">{ATA_GROUP_LABELS[entry.group]}</h4>
                <div className="netmapv2-ata-chips">
                  {entry.rows.map((row) => {
                    const active = ataFilter === row.code;
                    return (
                      <button
                        key={row.code}
                        type="button"
                        className={`netmapv2-chip${active ? " is-active" : ""}`}
                        aria-pressed={active}
                        title={ataTitle(row.code)}
                        onClick={() => setAtaFilter(active ? null : row.code)}
                      >
                        <span className="netmapv2-chip-label">{ataLabel(row.code)}</span>
                        <span className="netmapv2-chip-count">{NUMBER_FORMAT.format(row.count)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    [ataGroups, ataFilter],
  );

  /* ---- corner readout: nothing is dropped silently ---- */
  const readoutMarkup = useMemo(
    () => (
      <div className="netmapv2-readout">
        <span>
          <b>{NUMBER_FORMAT.format(culled.nodes.length)}</b> drawn
        </span>
        <span>
          <b>{NUMBER_FORMAT.format(culled.capped)}</b> hidden by the {NODE_CAP} cap
        </span>
        <span>
          <b>{NUMBER_FORMAT.format(Math.max(0, offScreen))}</b> outside the window
        </span>
        <span>
          zoom <b>{view.k.toFixed(1)}×</b>
        </span>
        {ataFilter !== null ? <span className="netmapv2-readout-filter">{ataLabel(ataFilter)}</span> : null}
      </div>
    ),
    [culled, offScreen, view.k, ataFilter],
  );

  const overlayMarkup = useMemo(
    () => (
      <>
        <div className="netmapv2-zoom">
          <button type="button" aria-label="Zoom in" onClick={() => nudgeZoom(1.3)}>
            +
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => nudgeZoom(1 / 1.3)}>
            −
          </button>
          <button
            type="button"
            aria-label="Reset the view"
            onClick={() => setView({ cx: 50, cy: 50, k: 1 })}
          >
            ⌂
          </button>
        </div>
        <ul className="netmapv2-legend">
          <li className="netmapv2-legend--som">SOM · established</li>
          <li className="netmapv2-legend--sam">SAM · known</li>
          <li className="netmapv2-legend--tam">TAM · density only</li>
        </ul>
      </>
    ),
    [nudgeZoom],
  );

  /* ---- 5. Opportunity panel ---- */
  const panelMarkup = useMemo(
    () => (
      <aside className="netmapv2-panel" aria-label="Opportunities">
        {selectedNode ? (
          <div className="netmapv2-selected">
            <p className="netmapv2-eyebrow">
              {REACH_LABEL[selectedReach ?? "sam"]} · {selectedNode.role.toUpperCase()} ·{" "}
              {regionNameByCode.get(selectedNode.regionCode) ?? selectedNode.regionCode}
            </p>
            <h3 className="netmapv2-selected-name">{selectedNode.label}</h3>
            <dl className="netmapv2-facts">
              <div>
                <dt>Scale</dt>
                <dd>{selectedNode.scale} / 5</dd>
              </div>
              <div>
                <dt>Slots</dt>
                <dd>{selectedNode.slots}</dd>
              </div>
              <div>
                <dt>Logistics</dt>
                <dd>{selectedNode.logisticsTatTicks} wk</dd>
              </div>
            </dl>
            {selectedNode.ataFocus.length > 0 ? (
              <ul className="netmapv2-ata-list">
                {selectedNode.ataFocus.map((code) => (
                  <li key={code} title={ataTitle(code)}>
                    {ataLabel(code)}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="netmapv2-selected-actions">
              <button
                type="button"
                className="netmapv2-action"
                onClick={() => onVisitNode(selectedNode.id)}
                disabled={visited || timeLeft <= 0}
              >
                {visited ? "Visited this pulse" : "Visit in person"}
              </button>
              <button
                type="button"
                className="netmapv2-action"
                onClick={() => onInspectNode(selectedNode.id)}
              >
                Inspect
              </button>
              <button
                type="button"
                className="netmapv2-action netmapv2-action--quiet"
                onClick={() => setSelectedNodeId(null)}
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="netmapv2-selected netmapv2-selected--none">
            <p className="netmapv2-eyebrow">Whole map</p>
            <h3 className="netmapv2-selected-name">
              {ataFilter === null ? "Every open opportunity" : ataLabel(ataFilter)}
            </h3>
            <p className="netmapv2-hint">
              Pick a node to narrow this list. Wheel to zoom, drag or arrow keys to pan.
            </p>
          </div>
        )}

        <div className="netmapv2-cards">
          {panelOpportunities.length === 0 ? (
            <p className="netmapv2-empty">Nothing open here this pulse.</p>
          ) : (
            panelOpportunities.slice(0, PANEL_CAP).map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                nodeLabel={
                  selectedNode ? null : nodeById.get(opportunity.nodeId)?.label ?? opportunity.nodeId
                }
                reason={blockReason(opportunity)}
                tick={tick}
                onOpen={onOpenOpportunity}
                onOpenListing={onOpenListing}
              />
            ))
          )}
          {panelOpportunities.length > PANEL_CAP ? (
            <p className="netmapv2-empty">
              Showing {PANEL_CAP} of {NUMBER_FORMAT.format(panelOpportunities.length)}. Filter by ATA
              chapter or pick a node to see the rest.
            </p>
          ) : null}
        </div>
      </aside>
    ),
    [
      selectedNode,
      selectedReach,
      regionNameByCode,
      visited,
      timeLeft,
      ataFilter,
      panelOpportunities,
      nodeById,
      blockReason,
      tick,
      onVisitNode,
      onInspectNode,
      onOpenOpportunity,
      onOpenListing,
    ],
  );

  return (
    <section className="netmapv2" aria-label="Network map">
      {headMarkup}
      {ataMarkup}

      {/* ---- 1 + 2. Viewport and fog ---- */}
      <div className="netmapv2-body">
        <div
          className={`netmapv2-stage${panning ? " is-panning" : ""}`}
          ref={stageRef}
          onKeyDown={handleKeyDown}
        >
          <svg
            className="netmapv2-svg"
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            role="application"
            tabIndex={0}
            aria-label="Fogged world map. Arrow keys pan, plus and minus zoom, zero resets."
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <defs>
              <pattern id={hazeId} width="2.6" height="2.6" patternUnits="userSpaceOnUse">
                <circle className="netmapv2-haze-dot" cx="1.3" cy="1.3" r="0.42" />
              </pattern>
              {reliefMarkup}
            </defs>
            <rect className="netmapv2-void" x="-100" y="-100" width="300" height="300" />
            <rect className="netmapv2-world-plate" x="0" y="0" width="100" height="100" />
            {regionMarkup}
            {nodeMarkup}
          </svg>
          {readoutMarkup}
          {overlayMarkup}
        </div>

        {panelMarkup}
      </div>
    </section>
  );
}

/** Budget pressure, so the strip goes amber then red as the pulse runs out. */
function toneOf(left: number, total: number): "ok" | "low" | "spent" {
  if (left <= 0) return "spent";
  return left / Math.max(1, total) < 0.25 ? "low" : "ok";
}

/* ---------------------------------------------------------------- *
 * Pieces
 * ---------------------------------------------------------------- */

function BudgetGauge({
  label,
  left,
  total,
  suffix,
  tone,
}: {
  label: string;
  left: number;
  total: number;
  suffix: string;
  tone: "ok" | "low" | "spent";
}): ReactNode {
  const fraction = total > 0 ? clamp(left / total, 0, 1) : 0;
  return (
    <div className={`netmapv2-gauge netmapv2-gauge--${tone}`}>
      <span className="netmapv2-gauge-label">{label}</span>
      <span className="netmapv2-gauge-value">
        {formatSmall(left)}
        {suffix ? <i>{suffix}</i> : null}
        <em>/ {formatSmall(total)}</em>
      </span>
      <span
        className="netmapv2-gauge-track"
        role="img"
        aria-label={`${label}: ${formatSmall(left)} of ${formatSmall(total)} remaining`}
      >
        <span className="netmapv2-gauge-fill" style={{ width: `${fraction * 100}%` }} />
      </span>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  nodeLabel,
  reason,
  tick,
  onOpen,
  onOpenListing,
}: {
  opportunity: NetworkOpportunity;
  nodeLabel: string | null;
  reason: string | null;
  tick: number;
  onOpen: (opportunityId: number) => void;
  onOpenListing: (listingId: number) => void;
}): ReactNode {
  const expiresIn = Math.max(0, opportunity.expiresTick - tick);
  const listingId = opportunity.kind === "listing" ? opportunity.referenceId : null;
  return (
    <article
      className={`netmapv2-card${opportunity.easterEgg ? " netmapv2-card--egg" : ""}${
        reason ? " is-blocked" : ""
      }`}
    >
      <p className="netmapv2-card-kind">
        {opportunity.easterEgg ? <span className="netmapv2-card-rare">Rare find</span> : null}
        <span>{opportunity.kind.replace(/_/g, " ")}</span>
        {nodeLabel ? <span className="netmapv2-card-node">{nodeLabel}</span> : null}
        <span className="netmapv2-card-expiry">{expiresIn === 0 ? "closes now" : `${expiresIn} wk left`}</span>
      </p>
      <h4 className="netmapv2-card-title">{opportunity.title}</h4>
      <p className="netmapv2-card-body">{opportunity.description}</p>
      {opportunity.easterEgg && opportunity.reward ? (
        <p className="netmapv2-card-reward">{opportunity.reward}</p>
      ) : null}
      {opportunity.ataFocus.length > 0 ? (
        <ul className="netmapv2-card-ata">
          {opportunity.ataFocus.map((code) => (
            <li key={code} title={ataTitle(code)}>
              {ataLabel(code)}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="netmapv2-pills">
        <li className="netmapv2-pill">
          <span>Time</span>
          <b>{formatSmall(opportunity.timeCost)} h</b>
        </li>
        <li className="netmapv2-pill">
          <span>RC</span>
          <b>{formatSmall(opportunity.rcCost)}</b>
        </li>
        <li className="netmapv2-pill">
          <span>ACC</span>
          <b>{formatMoney(opportunity.accCost)}</b>
        </li>
      </ul>
      {reason ? <p className="netmapv2-card-reason">{reason}</p> : null}
      <div className="netmapv2-card-actions">
        <button
          type="button"
          className="netmapv2-action netmapv2-action--go"
          onClick={() => onOpen(opportunity.id)}
          disabled={reason !== null}
        >
          Open
        </button>
        {listingId !== null ? (
          <button
            type="button"
            className="netmapv2-action netmapv2-action--quiet"
            onClick={() => onOpenListing(listingId)}
          >
            View listing
          </button>
        ) : null}
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- *
 * Formatting
 * ---------------------------------------------------------------- */

function formatSmall(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? NUMBER_FORMAT.format(value) : value.toFixed(1);
}

function formatMoney(value: number): string {
  return NUMBER_FORMAT.format(Math.round(value));
}

function funnelAria(funnel: { tam: number; sam: number; som: number }): string {
  return `TAM ${funnel.tam}, SAM ${funnel.sam}, SOM ${funnel.som}`;
}
