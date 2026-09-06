/* ==========================================================================
   FinanceMonitor — the LEFT monitor on the desk.

   Financial and asset KPIs for the player's firm. Pure presentational: every
   number is derived from the GameObservation it is handed, the only state is
   local pointer-hover for the chart tooltips, and the one effect (Escape to
   close) cleans itself up.

   Charts are hand-drawn inline SVG. No charting library.

   Colour method (see the dataviz procedure — form first, colour last):
     · The pulse breakdown's job is POLARITY, so money in and money out sit on
       opposite sides of zero and wear two different ramps.
     · Money in is a 2-step accent-blue categorical pair. Validated: lightness
       band, chroma floor, CVD separation and normal-vision floor all pass
       (worst adjacent ΔE 17.7 protan / 18.1 normal).
     · Money out is an ORDERED graphite ramp — the slots run purchases → repair →
       logistics → overhead → penalties, the fixed cost cascade, so the ramp
       encodes stack position and never magnitude. Validated as an ordinal
       scale: monotone OKLab lightness 0.25 → 0.38 → 0.52 → 0.66 → 0.79, every
       adjacent gap over the floor, light end clearing the surface, one hue. It
       is backed by three more channels: a 2px surface gap between every
       segment, a 45° hatch on the palest step, and a legend plus a table.
     · The balance line and the ATA mix are single-hue by magnitude, with the
       de-emphasis grey reserved for the "other" tail.
     · Status red/green is never a series colour. It only ever marks a signed
       delta or an adverse rate, always beside a label.

   Every chart handles the zero-data case with a calm placeholder instead of a
   collapsed axis.
   ========================================================================== */
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ATA_GROUP_LABELS, ataGroupOf, ataLabel, ataTitle } from "../../sim/ata.ts";
import type { GameObservation } from "../../sim/observation.ts";
import type { AccPulse, Condition } from "../../sim/types.ts";
import "./FinanceMonitor.css";

/* ---------------------------------------------------------------- *
 * Contract
 * ---------------------------------------------------------------- */

export type FinanceMonitorProps = {
  observation: GameObservation;
  onClose: () => void;
};

/* ---------------------------------------------------------------- *
 * Constants
 * ---------------------------------------------------------------- */

/** Pulses shown in the breakdown. Two quarters of trading reads at this width. */
const BREAKDOWN_WINDOW = 24;
/** Pulses averaged into the weekly burn figure. */
const BURN_WINDOW = 8;
/** ATA chapters given their own bar before the tail folds into "other". */
const ATA_ROWS = 8;
/** Sparkline sample count. */
const SPARK_POINTS = 12;

/** Conditions that count as serviceable stock. AR / BER / SCRAP do not. */
const SERVICEABLE: ReadonlySet<Condition> = new Set<Condition>(["NE", "NS", "OH", "SV", "RP"]);

type FlowKey = "sales" | "contracts" | "purchases" | "repair" | "logistics" | "overhead" | "penalties";

type FlowSpec = {
  key: FlowKey;
  label: string;
  /** Which side of zero this component normally lands on. */
  tone: "in" | "out";
  /** Palette slot, mirrored by a .fin-fill--<slot> rule in the stylesheet. */
  slot: string;
};

/**
 * Stack order is fixed and never re-ordered by magnitude, so a chapter keeps the
 * same colour and the same seat in every bar.
 */
const FLOWS: readonly FlowSpec[] = [
  { key: "sales", label: "Sales", tone: "in", slot: "gain-1" },
  { key: "contracts", label: "Contracts", tone: "in", slot: "gain-2" },
  { key: "purchases", label: "Purchases", tone: "out", slot: "loss-1" },
  { key: "repair", label: "Repair", tone: "out", slot: "loss-2" },
  { key: "logistics", label: "Logistics", tone: "out", slot: "loss-3" },
  { key: "overhead", label: "Overhead", tone: "out", slot: "loss-4" },
  { key: "penalties", label: "Penalties", tone: "out", slot: "loss-5" },
];

/* Chart geometry. The plot frame has no CSS padding — the breathing room lives in
   these insets instead, so a viewBox percentage maps 1:1 onto a container
   percentage and the HTML tooltips land exactly on the marks they describe. */
const BAL = { w: 720, h: 244, top: 20, right: 28, bottom: 36, left: 76 };
const BRK = { w: 720, h: 240, top: 20, right: 28, bottom: 34, left: 76 };
const ATA = { w: 640, row: 32, top: 12, bottom: 12, labelX: 14, titleX: 84, barX: 238, barMax: 250, unitsX: 628 };
/** Surface gap between touching marks, in viewBox units (~2px at render size). */
const GAP = 2.2;

/* ---------------------------------------------------------------- *
 * Component
 * ---------------------------------------------------------------- */

export function FinanceMonitor({ observation, onClose }: FinanceMonitorProps) {
  const headingId = useId();

  /* Escape closes the monitor. Registered once, removed on unmount. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const money = useMemo(() => moneyKpis(observation), [observation]);
  const assets = useMemo(() => assetKpis(observation), [observation]);

  return (
    <section className="fin-monitor" aria-labelledby={headingId}>
      {/* Bezel is the aluminium token in CSS; there is no bezel shot in the art library. */}
      <div className="fin-bezel" aria-hidden="true" />

      <header className="fin-head">
        <div className="fin-brand">
          <BlockAeroMark className="fin-mark" />
          <div className="fin-brand-text">
            <p className="fin-eyebrow">Block Aero · Asset Ledger</p>
            <h2 className="fin-title" id={headingId}>
              Finance Monitor
            </h2>
            <p className="fin-subtitle">
              Week {observation.tick} · {observation.calendar.year} P{observation.calendar.period} ·{" "}
              {observation.pulses.length} {observation.pulses.length === 1 ? "pulse" : "pulses"} on the book
            </p>
          </div>
        </div>
        <button type="button" className="fin-close" onClick={onClose} aria-label="Close finance monitor">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M4 4 L12 12 M12 4 L4 12" />
          </svg>
        </button>
      </header>

      {/* ---- 3. KPI tiles ------------------------------------------------ */}
      <section className="fin-block" aria-labelledby={`${headingId}-kpi`}>
        <h3 className="fin-section-title" id={`${headingId}-kpi`}>
          Position
        </h3>
        <div className="fin-kpis">
          <Tile hero label="Net asset value" value={formatAcc(money.nav)} note="Cash plus stock at mark, less debt">
            <Sparkline values={money.navTrail} label="Net asset value trend" />
          </Tile>
          <Tile
            label="ACC balance"
            value={formatAcc(money.acc)}
            delta={money.lastDelta === null ? undefined : { value: money.lastDelta, note: "last pulse" }}
          >
            <Sparkline values={money.accTrail} label="ACC balance trend" />
          </Tile>
          <Tile label="Inventory at mark" value={formatAcc(money.inventoryAtMark)} note="Stock valued at market reference" />
          <Tile label="Fill rate" value={formatPercent(money.fillRate)} note={`${money.rfqsFilled} of ${money.rfqsSeen} requests filled`} />
          <Tile label="Units held" value={formatCount(money.unitsHeld)} note="Owned assets on the book" />
          <Tile label="Units in transit" value={formatCount(money.unitsInTransit)} note="Moving between facilities" />
          <Tile
            label="Weekly burn"
            value={money.burn === null ? "—" : formatAcc(money.burn)}
            note={money.burn === null ? "No pulses resolved yet" : `Mean overhead + logistics, last ${money.burnWindow}`}
          />
        </div>
      </section>

      {/* ---- 1. ACC balance over time ------------------------------------ */}
      <BalanceChart
        pulses={observation.pulses}
        startingCapital={observation.firm.startingCapital}
        headingId={`${headingId}-balance`}
      />

      {/* ---- 2. Weekly pulse breakdown ----------------------------------- */}
      <BreakdownChart pulses={observation.pulses} headingId={`${headingId}-breakdown`} />

      {/* ---- 4. Asset KPIs ------------------------------------------------ */}
      <section className="fin-block" aria-labelledby={`${headingId}-assets`}>
        <h3 className="fin-section-title" id={`${headingId}-assets`}>
          Asset condition
        </h3>
        <div className="fin-asset-kpis">
          <div className="fin-tile fin-tile--meter">
            <p className="fin-tile-label">Serviceable ratio</p>
            <p className="fin-tile-value">{assets.total === 0 ? "—" : formatPercent(assets.serviceableRatio)}</p>
            <Meter
              ratio={assets.serviceableRatio}
              disabled={assets.total === 0}
              label={`${assets.serviceable} of ${assets.total} units serviceable`}
            />
            <p className="fin-tile-note">
              {assets.total === 0
                ? "No units on the book"
                : `${assets.serviceable} serviceable · ${assets.total - assets.serviceable} awaiting repair or written off`}
            </p>
          </div>
          <Tile
            label="Average repair TAT"
            value={assets.avgTat === null ? "—" : `${assets.avgTat.toFixed(1)} wk`}
            note={
              assets.avgTat === null
                ? "No shop visits open"
                : `${assets.jobCount} ${assets.jobCount === 1 ? "job" : "jobs"} in work · ${assets.avgLogisticsTat.toFixed(1)} wk in freight`
            }
          />
          <Tile
            label="BER rate"
            value={assets.berRate === null ? "—" : formatPercent(assets.berRate)}
            tone={assets.berRate !== null && assets.berRate > 0.15 ? "adverse" : undefined}
            note={
              assets.berRate === null
                ? "No shop returns in the event window"
                : `${assets.berCount} beyond economic repair of ${assets.returnCount} returns`
            }
          />
        </div>
      </section>

      {/* ---- 5. ATA value mix -------------------------------------------- */}
      <AtaValueMix rows={observation.ataInventory} headingId={`${headingId}-ata`} />

      <footer className="fin-foot">
        <BlockAeroMark className="fin-mark fin-mark--small" />
        <span className="fin-wordmark">Block Aero</span>
        <span className="fin-foot-note">Engine {observation.engineVersion} · seed {observation.seed}</span>
      </footer>
    </section>
  );
}

/* ================================================================== *
 * 1. ACC balance over time
 * ================================================================== */

function BalanceChart({
  pulses,
  startingCapital,
  headingId,
}: {
  pulses: readonly AccPulse[];
  startingCapital: number;
  headingId: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9]/g, "");

  const plot = {
    x: BAL.left,
    y: BAL.top,
    w: BAL.w - BAL.left - BAL.right,
    h: BAL.h - BAL.top - BAL.bottom,
  };

  const model = useMemo(() => {
    if (pulses.length === 0) return null;
    const closings = pulses.map((pulse) => pulse.closing);
    let lo = Math.min(startingCapital, ...closings);
    let hi = Math.max(startingCapital, ...closings);
    if (hi - lo < 1) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const firstTick = pulses[0]!.tick;
    const lastTick = pulses[pulses.length - 1]!.tick;
    const span = Math.max(1, lastTick - firstTick);
    const xOf = (tick: number) =>
      pulses.length === 1 ? plot.x + plot.w / 2 : plot.x + ((tick - firstTick) / span) * plot.w;
    const yOf = (value: number) => plot.y + plot.h - ((value - lo) / (hi - lo)) * plot.h;
    const points = pulses.map((pulse) => ({ pulse, cx: xOf(pulse.tick), cy: yOf(pulse.closing) }));
    return { lo, hi, firstTick, lastTick, xOf, yOf, points, ticks: axisTicks(lo, hi, 4) };
  }, [pulses, startingCapital, plot.x, plot.y, plot.w, plot.h]);

  const latest = pulses.length > 0 ? pulses[pulses.length - 1]! : null;
  const delta = latest ? latest.closing - startingCapital : 0;

  function onMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!model) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const vx = ((event.clientX - rect.left) / rect.width) * BAL.w;
    let best = 0;
    let bestGap = Number.POSITIVE_INFINITY;
    model.points.forEach((point, index) => {
      const gap = Math.abs(point.cx - vx);
      if (gap < bestGap) {
        bestGap = gap;
        best = index;
      }
    });
    setHover(best);
  }

  const active = model && hover !== null ? model.points[hover] ?? null : null;

  return (
    <section className="fin-block" aria-labelledby={headingId}>
      <div className="fin-chart-head">
        <div>
          <h3 className="fin-section-title" id={headingId}>
            ACC balance over time
          </h3>
          <p className="fin-chart-sub">
            Closing balance each pulse against the {formatAcc(startingCapital)} ACC the firm was founded on.
          </p>
        </div>
        {latest ? (
          <p className={`fin-chart-figure ${delta >= 0 ? "is-gain" : "is-loss"}`}>
            <span aria-hidden="true">{delta >= 0 ? "▲" : "▼"}</span> {signedAcc(delta)}
            <small>since founding</small>
          </p>
        ) : null}
      </div>

      {!model ? (
        <ChartPlaceholder
          title="No pulses resolved yet"
          note="The balance line starts drawing after the first pulse settles."
        />
      ) : (
        <figure className="fin-figure">
          <div className="fin-plot">
            <svg
              className="fin-svg"
              viewBox={`0 0 ${BAL.w} ${BAL.h}`}
              role="img"
              aria-label={`ACC balance over ${pulses.length} pulses, from ${formatAcc(pulses[0]!.closing)} to ${formatAcc(latest!.closing)} ACC.`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id={`finArea${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className="fin-area-top" />
                  <stop offset="100%" className="fin-area-bottom" />
                </linearGradient>
              </defs>

              {model.ticks.map((tick) => (
                <g key={tick}>
                  <line className="fin-grid" x1={plot.x} y1={model.yOf(tick)} x2={plot.x + plot.w} y2={model.yOf(tick)} />
                  <text className="fin-axis-text" x={plot.x - 10} y={model.yOf(tick) + 3.5} textAnchor="end">
                    {formatAcc(tick)}
                  </text>
                </g>
              ))}

              <path
                className="fin-area"
                fill={`url(#finArea${uid})`}
                d={`${linePath(model.points)} L ${model.points[model.points.length - 1]!.cx.toFixed(2)} ${(plot.y + plot.h).toFixed(2)} L ${model.points[0]!.cx.toFixed(2)} ${(plot.y + plot.h).toFixed(2)} Z`}
              />

              {/* Founding capital: a reference threshold, dashed so it never reads as a gridline. */}
              <line
                className="fin-reference"
                x1={plot.x}
                y1={model.yOf(startingCapital)}
                x2={plot.x + plot.w}
                y2={model.yOf(startingCapital)}
              />
              <text className="fin-reference-text" x={plot.x + plot.w} y={model.yOf(startingCapital) - 6} textAnchor="end">
                Founding capital {formatAcc(startingCapital)}
              </text>

              {model.points.length > 1 ? (
                <path className="fin-line" pathLength={1} d={linePath(model.points)} />
              ) : null}

              {/* End marker: >=8px with a 2px surface ring. */}
              <circle
                className="fin-end-ring"
                cx={model.points[model.points.length - 1]!.cx}
                cy={model.points[model.points.length - 1]!.cy}
                r={6}
              />
              <circle
                className="fin-end-dot"
                cx={model.points[model.points.length - 1]!.cx}
                cy={model.points[model.points.length - 1]!.cy}
                r={4}
              />

              {active ? (
                <g aria-hidden="true">
                  <line className="fin-crosshair" x1={active.cx} y1={plot.y} x2={active.cx} y2={plot.y + plot.h} />
                  <circle className="fin-end-ring" cx={active.cx} cy={active.cy} r={6} />
                  <circle className="fin-hover-dot" cx={active.cx} cy={active.cy} r={4} />
                </g>
              ) : null}

              <line className="fin-axis" x1={plot.x} y1={plot.y + plot.h} x2={plot.x + plot.w} y2={plot.y + plot.h} />

              {xTickIndices(model.points.length).map((index) => {
                const point = model.points[index]!;
                return (
                  <text
                    key={point.pulse.tick}
                    className="fin-axis-text"
                    x={point.cx}
                    y={plot.y + plot.h + 16}
                    textAnchor={index === 0 ? "start" : index === model.points.length - 1 ? "end" : "middle"}
                  >
                    W{point.pulse.tick}
                  </text>
                );
              })}
            </svg>

            {active ? (
              <div
                className={`fin-tooltip ${active.cy < plot.y + plot.h * 0.45 ? "fin-tooltip--below" : ""}`}
                aria-hidden="true"
                style={{ left: `${clampPercent((active.cx / BAL.w) * 100)}%`, top: `${(active.cy / BAL.h) * 100}%` }}
              >
                <p className="fin-tooltip-title">Week {active.pulse.tick}</p>
                <p className="fin-tooltip-row">
                  <span>Closing</span>
                  <strong>{formatAcc(active.pulse.closing)}</strong>
                </p>
                <p className="fin-tooltip-row">
                  <span>Pulse delta</span>
                  <strong className={active.pulse.delta >= 0 ? "is-gain" : "is-loss"}>{signedAcc(active.pulse.delta)}</strong>
                </p>
              </div>
            ) : null}
          </div>

          <DataTable
            summary="ACC balance by pulse"
            head={["Week", "Opening", "Closing", "Delta"]}
            rows={pulses
              .slice()
              .reverse()
              .map((pulse) => [
                `W${pulse.tick}`,
                formatAcc(pulse.opening),
                formatAcc(pulse.closing),
                signedAcc(pulse.delta),
              ])}
          />
        </figure>
      )}
    </section>
  );
}

/* ================================================================== *
 * 2. Weekly pulse breakdown
 * ================================================================== */

type Segment = { key: FlowKey; slot: string; value: number; from: number; to: number };

function BreakdownChart({ pulses, headingId }: { pulses: readonly AccPulse[]; headingId: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9]/g, "");

  const recent = useMemo(() => pulses.slice(-BREAKDOWN_WINDOW), [pulses]);

  const plot = {
    x: BRK.left,
    y: BRK.top,
    w: BRK.w - BRK.left - BRK.right,
    h: BRK.h - BRK.top - BRK.bottom,
  };

  const model = useMemo(() => {
    if (recent.length === 0) return null;
    const bars = recent.map((pulse) => {
      const positives: Segment[] = [];
      const negatives: Segment[] = [];
      let up = 0;
      let down = 0;
      for (const flow of FLOWS) {
        const value = pulse[flow.key];
        if (value > 0) {
          positives.push({ key: flow.key, slot: flow.slot, value, from: up, to: up + value });
          up += value;
        } else if (value < 0) {
          negatives.push({ key: flow.key, slot: flow.slot, value, from: down, to: down + value });
          down += value;
        }
      }
      return { pulse, positives, negatives, up, down };
    });
    const hi = Math.max(1, ...bars.map((bar) => bar.up));
    const lo = Math.min(-1, ...bars.map((bar) => bar.down));
    const pad = (hi - lo) * 0.08;
    const top = hi + pad;
    const bottom = lo - pad;
    const yOf = (value: number) => plot.y + plot.h - ((value - bottom) / (top - bottom)) * plot.h;
    const band = plot.w / bars.length;
    const barW = Math.min(16, band * 0.68);
    return { bars, top, bottom, yOf, band, barW, ticks: axisTicks(bottom, top, 4) };
  }, [recent, plot.x, plot.y, plot.w, plot.h]);

  const active = model && hover !== null ? model.bars[hover] ?? null : null;

  return (
    <section className="fin-block" aria-labelledby={headingId}>
      <div className="fin-chart-head">
        <div>
          <h3 className="fin-section-title" id={headingId}>
            Weekly pulse breakdown
          </h3>
          <p className="fin-chart-sub">
            Where each pulse&rsquo;s ACC came from and went. Money in above the zero line, money out below it.
            {recent.length > 0 ? ` Last ${recent.length} ${recent.length === 1 ? "pulse" : "pulses"}.` : ""}
          </p>
        </div>
      </div>

      {!model ? (
        <ChartPlaceholder
          title="Nothing has settled yet"
          note="Sales, purchases, repair, logistics, overhead, penalties and contracts appear here once a pulse resolves."
        />
      ) : (
        <figure className="fin-figure">
          <div className="fin-plot">
            <svg
              className="fin-svg"
              viewBox={`0 0 ${BRK.w} ${BRK.h}`}
              role="img"
              aria-label={`Stacked ACC flows for the last ${model.bars.length} pulses, money in above zero and money out below.`}
              onPointerLeave={() => setHover(null)}
            >
              <defs>
                {/* Hatch on the palest ramp step: identity that survives greyscale and CVD. */}
                <pattern
                  id={`finHatch${uid}`}
                  width="5"
                  height="5"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect className="fin-hatch-ground" width="5" height="5" />
                  <line className="fin-hatch-line" x1="0" y1="0" x2="0" y2="5" />
                </pattern>
              </defs>

              {model.ticks.map((tick) => (
                <g key={tick}>
                  <line className="fin-grid" x1={plot.x} y1={model.yOf(tick)} x2={plot.x + plot.w} y2={model.yOf(tick)} />
                  <text className="fin-axis-text" x={plot.x - 10} y={model.yOf(tick) + 3.5} textAnchor="end">
                    {formatAcc(tick)}
                  </text>
                </g>
              ))}

              {model.bars.map((bar, index) => {
                const left = plot.x + model.band * index + (model.band - model.barW) / 2;
                return (
                  <g key={bar.pulse.tick} className={`fin-bar ${hover === index ? "is-active" : ""}`} style={indexVar(index)}>
                    {bar.positives.map((segment, sIndex) =>
                      renderSegment(segment, sIndex === bar.positives.length - 1, "up", left, model.barW, model.yOf, uid),
                    )}
                    {bar.negatives.map((segment, sIndex) =>
                      renderSegment(segment, sIndex === bar.negatives.length - 1, "down", left, model.barW, model.yOf, uid),
                    )}
                  </g>
                );
              })}

              {/* Zero baseline sits on top of the marks so the polarity split always reads. */}
              <line className="fin-axis" x1={plot.x} y1={model.yOf(0)} x2={plot.x + plot.w} y2={model.yOf(0)} />

              {model.bars.map((bar, index) => (
                <rect
                  key={`hit-${bar.pulse.tick}`}
                  className="fin-hit"
                  x={plot.x + model.band * index}
                  y={plot.y}
                  width={model.band}
                  height={plot.h}
                  onPointerEnter={() => setHover(index)}
                />
              ))}

              {xTickIndices(model.bars.length).map((index) => {
                const bar = model.bars[index]!;
                return (
                  <text
                    key={`x-${bar.pulse.tick}`}
                    className="fin-axis-text"
                    x={plot.x + model.band * index + model.band / 2}
                    y={plot.y + plot.h + 16}
                    textAnchor="middle"
                  >
                    W{bar.pulse.tick}
                  </text>
                );
              })}
            </svg>

            {active && hover !== null ? (
              /* A corner readout rather than a floating bubble: a seven-row card is
                 taller than most stacks, so pinning it opposite the hovered bar keeps
                 it inside the frame and never covers the mark it describes. */
              <div
                className="fin-tooltip fin-tooltip--corner"
                aria-hidden="true"
                style={
                  hover / model.bars.length < 0.5
                    ? { right: 12, top: 12 }
                    : { left: `calc(${((BRK.left / BRK.w) * 100).toFixed(2)}% + 10px)`, top: 12 }
                }
              >
                <p className="fin-tooltip-title">Week {active.pulse.tick}</p>
                {FLOWS.filter((flow) => active.pulse[flow.key] !== 0).map((flow) => (
                  <p className="fin-tooltip-row" key={flow.key}>
                    <span>
                      <i className={`fin-swatch fin-fill--${flow.slot}`} /> {flow.label}
                    </span>
                    <strong>{signedAcc(active.pulse[flow.key])}</strong>
                  </p>
                ))}
                <p className="fin-tooltip-row fin-tooltip-total">
                  <span>Net</span>
                  <strong className={active.pulse.delta >= 0 ? "is-gain" : "is-loss"}>{signedAcc(active.pulse.delta)}</strong>
                </p>
              </div>
            ) : null}
          </div>

          <ul className="fin-legend">
            <li className="fin-legend-group">In</li>
            {FLOWS.filter((flow) => flow.tone === "in").map((flow) => (
              <li key={flow.key}>
                <i className={`fin-swatch fin-fill--${flow.slot}`} aria-hidden="true" /> {flow.label}
              </li>
            ))}
            <li className="fin-legend-group">Out</li>
            {FLOWS.filter((flow) => flow.tone === "out").map((flow) => (
              <li key={flow.key}>
                <i className={`fin-swatch fin-fill--${flow.slot}`} aria-hidden="true" /> {flow.label}
              </li>
            ))}
          </ul>

          <DataTable
            summary="ACC flows by pulse"
            head={["Week", ...FLOWS.map((flow) => flow.label), "Net"]}
            rows={model.bars
              .slice()
              .reverse()
              .map((bar) => [
                `W${bar.pulse.tick}`,
                ...FLOWS.map((flow) => (bar.pulse[flow.key] === 0 ? "—" : signedAcc(bar.pulse[flow.key]))),
                signedAcc(bar.pulse.delta),
              ])}
          />
        </figure>
      )}
    </section>
  );
}

/** One stacked segment, inset by the surface gap on the side facing its neighbour. */
function renderSegment(
  segment: Segment,
  outermost: boolean,
  direction: "up" | "down",
  left: number,
  width: number,
  yOf: (value: number) => number,
  uid: string,
) {
  const yFrom = yOf(segment.from);
  const yTo = yOf(segment.to);
  let top = Math.min(yFrom, yTo);
  let height = Math.abs(yTo - yFrom);
  if (!outermost) {
    if (direction === "up") {
      top += GAP;
      height -= GAP;
    } else {
      height -= GAP;
    }
  }
  if (height < 0.8) {
    height = 0.8;
    if (direction === "up") top = Math.min(yFrom, yTo);
  }
  const radius = Math.min(3, width / 3, height);
  const path = outermost
    ? roundedBar(left, top, width, height, radius, direction === "up" ? "top" : "bottom")
    : `M${left} ${top} h${width} v${height} h${-width} Z`;
  return (
    <path
      key={segment.key}
      className={`fin-seg ${segment.slot === "loss-5" ? "" : `fin-fill--${segment.slot}`}`}
      fill={segment.slot === "loss-5" ? `url(#finHatch${uid})` : undefined}
      d={path}
    />
  );
}

/* ================================================================== *
 * 5. ATA value mix
 * ================================================================== */

type AtaRow = { code: number | null; label: string; title: string; group: string; count: number; value: number };

function AtaValueMix({
  rows,
  headingId,
}: {
  rows: GameObservation["ataInventory"];
  headingId: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (rows.length === 0) return null;
    const sorted = rows.slice().sort((a, b) => b.value - a.value);
    const head = sorted.slice(0, ATA_ROWS);
    const tail = sorted.slice(ATA_ROWS);
    const list: AtaRow[] = head.map((row) => ({
      code: row.code,
      label: ataLabel(row.code),
      title: ataTitle(row.code),
      group: ATA_GROUP_LABELS[ataGroupOf(row.code)],
      count: row.count,
      value: row.value,
    }));
    if (tail.length > 0) {
      list.push({
        code: null,
        label: `Other · ${tail.length} further ATA chapters`,
        title: `${tail.length} further chapters`,
        group: "Mixed",
        count: tail.reduce((sum, row) => sum + row.count, 0),
        value: tail.reduce((sum, row) => sum + row.value, 0),
      });
    }
    const max = Math.max(1, ...list.map((row) => row.value));
    const total = sorted.reduce((sum, row) => sum + row.value, 0);
    const height = ATA.top + ATA.bottom + list.length * ATA.row;
    return { list, max, total, height };
  }, [rows]);

  return (
    <section className="fin-block" aria-labelledby={headingId}>
      <div className="fin-chart-head">
        <div>
          <h3 className="fin-section-title" id={headingId}>
            ATA value mix
          </h3>
          <p className="fin-chart-sub">
            Inventory value at mark by ATA chapter. {model ? `${formatAcc(model.total)} ACC across ${rows.length} chapters.` : ""}
          </p>
        </div>
      </div>

      {!model ? (
        <ChartPlaceholder
          title="No assets on the book"
          note="Chapters appear here as soon as the firm owns stock."
        />
      ) : (
        <figure className="fin-figure">
          <div className="fin-plot">
            <svg
              className="fin-svg"
              viewBox={`0 0 ${ATA.w} ${model.height}`}
              role="img"
              aria-label={`Inventory value by ATA chapter. Largest is ${model.list[0]!.label} at ${formatAcc(model.list[0]!.value)} ACC.`}
              onPointerLeave={() => setHover(null)}
            >
              {model.list.map((row, index) => {
                const y = ATA.top + index * ATA.row;
                const mid = y + ATA.row / 2;
                const width = Math.max(2, (row.value / model.max) * ATA.barMax);
                const other = row.code === null;
                return (
                  <g key={row.code ?? "other"} className={`fin-ata-row ${hover === index ? "is-active" : ""}`} style={indexVar(index)}>
                    <title>{`${row.label} — ${formatAcc(row.value)} ACC, ${row.count} units`}</title>
                    <text className="fin-ata-code" x={ATA.labelX} y={mid + 1}>
                      {other ? "OTHER" : `ATA ${row.code}`}
                    </text>
                    <text className="fin-ata-title" x={ATA.titleX} y={mid - 3}>
                      {truncate(row.title, 26)}
                    </text>
                    <text className="fin-ata-group" x={ATA.titleX} y={mid + 9}>
                      {row.group}
                    </text>
                    <path
                      className={`fin-ata-bar ${other ? "is-other" : ""}`}
                      d={roundedBar(ATA.barX, mid - 6, width, 12, Math.min(3, width / 2), "right")}
                    />
                    <text className="fin-ata-value" x={ATA.barX + width + 8} y={mid + 3.5}>
                      {formatAcc(row.value)}
                    </text>
                    <text className="fin-ata-units" x={ATA.unitsX} y={mid + 3.5} textAnchor="end">
                      {formatCount(row.count)} units
                    </text>
                    <rect
                      className="fin-hit"
                      x={0}
                      y={y}
                      width={ATA.w}
                      height={ATA.row}
                      onPointerEnter={() => setHover(index)}
                    />
                  </g>
                );
              })}
            </svg>

          </div>

          <DataTable
            summary="Inventory value by ATA chapter"
            head={["Chapter", "Group", "Units", "Value at mark", "Share"]}
            rows={model.list.map((row) => [
              row.label,
              row.group,
              formatCount(row.count),
              formatAcc(row.value),
              formatPercent(model.total === 0 ? 0 : row.value / model.total),
            ])}
          />
        </figure>
      )}
    </section>
  );
}

/* ================================================================== *
 * Small parts
 * ================================================================== */

function Tile({
  label,
  value,
  note,
  delta,
  hero,
  tone,
  children,
}: {
  label: string;
  value: string;
  note?: string;
  delta?: { value: number; note: string };
  hero?: boolean;
  tone?: "adverse";
  children?: ReactNode;
}) {
  return (
    <div className={`fin-tile ${hero ? "fin-tile--hero" : ""} ${tone === "adverse" ? "fin-tile--adverse" : ""}`}>
      <p className="fin-tile-label">{label}</p>
      <p className="fin-tile-value">{value}</p>
      {delta ? (
        <p className={`fin-tile-delta ${delta.value >= 0 ? "is-gain" : "is-loss"}`}>
          <span aria-hidden="true">{delta.value >= 0 ? "▲" : "▼"}</span> {signedAcc(delta.value)} <small>{delta.note}</small>
        </p>
      ) : null}
      {children}
      {note ? <p className="fin-tile-note">{note}</p> : null}
    </div>
  );
}

/** 12-point trend line. De-emphasis hue with the current period marked in the accent. */
function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 120;
  const h = 26;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo < 1 ? 1 : hi - lo;
  const points = values.map((value, index) => ({
    cx: (index / (values.length - 1)) * (w - 6) + 3,
    cy: h - 4 - ((value - lo) / span) * (h - 8),
  }));
  const last = points[points.length - 1]!;
  return (
    <svg className="fin-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} focusable="false">
      <path className="fin-spark-line" d={linePath(points)} />
      <circle className="fin-spark-ring" cx={last.cx} cy={last.cy} r={4} />
      <circle className="fin-spark-dot" cx={last.cx} cy={last.cy} r={2.6} />
    </svg>
  );
}

/** Ratio meter. The track is a lighter step of the fill's own ramp. */
function Meter({ ratio, disabled, label }: { ratio: number; disabled: boolean; label: string }) {
  const pct = disabled ? 0 : Math.round(clamp01(ratio) * 100);
  const severity = disabled ? "idle" : ratio >= 0.7 ? "good" : ratio >= 0.45 ? "warn" : "poor";
  return (
    <svg className="fin-meter" viewBox="0 0 200 10" role="img" aria-label={label} focusable="false">
      <rect className="fin-meter-track" x="0" y="2" width="200" height="6" rx="3" />
      {pct > 0 ? (
        <path className={`fin-meter-fill is-${severity}`} d={roundedBar(0, 2, Math.max(4, pct * 2), 6, 3, "right")} />
      ) : null}
    </svg>
  );
}

function ChartPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="fin-placeholder">
      <svg className="fin-placeholder-glyph" viewBox="0 0 104 44" aria-hidden="true" focusable="false">
        <line className="fin-placeholder-axis" x1="8" y1="4" x2="8" y2="36" />
        <line className="fin-placeholder-axis" x1="8" y1="36" x2="96" y2="36" />
        <path className="fin-placeholder-line" d="M12 30 L34 24 L56 27 L78 16 L94 19" />
      </svg>
      <p className="fin-placeholder-title">{title}</p>
      <p className="fin-placeholder-note">{note}</p>
    </div>
  );
}

/** The keyboard and screen-reader path to every value a chart draws. */
function DataTable({ summary, head, rows }: { summary: string; head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <details className="fin-table">
      <summary>{summary} — data table</summary>
      <div className="fin-table-scroll">
        <table>
          <caption className="fin-visually-hidden">{summary}</caption>
          <thead>
            <tr>
              {head.map((cell) => (
                <th scope="col" key={cell}>
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row[0] ?? index}-${index}`}>
                {row.map((cell, cellIndex) =>
                  cellIndex === 0 ? (
                    <th scope="row" key={cellIndex}>
                      {cell}
                    </th>
                  ) : (
                    <td key={cellIndex}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * The house mark. Geometric, monochrome, drawn from three primitives: a square
 * block, two swept slashes and a datum rule. It inherits currentColor so the
 * header and the footer watermark share one shape at two weights.
 */
function BlockAeroMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="img" aria-label="Block Aero" focusable="false">
      <rect className="fin-mark-frame" x="2.4" y="2.4" width="19.2" height="19.2" rx="1" />
      <path className="fin-mark-slash" d="M7.0 15.8 L11.0 8.2 L13.1 8.2 L9.1 15.8 Z" />
      <path className="fin-mark-slash" d="M11.9 15.8 L15.9 8.2 L18.0 8.2 L14.0 15.8 Z" />
      <line className="fin-mark-datum" x1="6.6" y1="18.1" x2="17.4" y2="18.1" />
    </svg>
  );
}

/* ================================================================== *
 * Derivations
 * ================================================================== */

function moneyKpis(observation: GameObservation) {
  const firm = observation.firm;
  const pulses = observation.pulses;
  const burnWindow = pulses.slice(-BURN_WINDOW);
  const burn =
    burnWindow.length === 0
      ? null
      : -burnWindow.reduce((sum, pulse) => sum + pulse.overhead + pulse.logistics, 0) / burnWindow.length;
  return {
    nav: firm.nav,
    acc: firm.accBalance,
    inventoryAtMark: firm.inventoryAtMark,
    fillRate: firm.fillRate,
    rfqsSeen: firm.rfqsSeen,
    rfqsFilled: firm.rfqsFilled,
    unitsHeld: observation.inventory.length,
    unitsInTransit: observation.inventory.filter((unit) => unit.transferId !== null).length,
    burn,
    burnWindow: burnWindow.length,
    lastDelta: pulses.length > 0 ? pulses[pulses.length - 1]!.delta : null,
    navTrail: firm.navHistory.slice(-SPARK_POINTS),
    accTrail: pulses.slice(-SPARK_POINTS).map((pulse) => pulse.closing),
  };
}

function assetKpis(observation: GameObservation) {
  const total = observation.inventory.length;
  const serviceable = observation.inventory.filter((unit) => SERVICEABLE.has(unit.condition)).length;
  const jobs = observation.jobs;
  const avgTat = jobs.length === 0 ? null : jobs.reduce((sum, job) => sum + job.repairTatTicks, 0) / jobs.length;
  const avgLogisticsTat =
    jobs.length === 0 ? 0 : jobs.reduce((sum, job) => sum + job.logisticsTatTicks, 0) / jobs.length;
  const returns = observation.events.filter((event) => event.kind === "repair_complete");
  const berCount = returns.filter((event) => event.payload.condition === "BER").length;
  return {
    total,
    serviceable,
    serviceableRatio: total === 0 ? 0 : serviceable / total,
    avgTat,
    avgLogisticsTat,
    jobCount: jobs.length,
    returnCount: returns.length,
    berCount,
    berRate: returns.length === 0 ? null : berCount / returns.length,
  };
}

/* ================================================================== *
 * Geometry & format helpers
 * ================================================================== */

function linePath(points: readonly { cx: number; cy: number }[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.cx.toFixed(2)} ${point.cy.toFixed(2)}`)
    .join(" ");
}

/** A bar with a 4px-equivalent rounded data end and a square baseline. */
function roundedBar(x: number, y: number, w: number, h: number, r: number, end: "top" | "bottom" | "right"): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (radius === 0) return `M${x} ${y} h${w} v${h} h${-w} Z`;
  if (end === "top") {
    return `M${x} ${y + h} V${y + radius} A${radius} ${radius} 0 0 1 ${x + radius} ${y} H${x + w - radius} A${radius} ${radius} 0 0 1 ${x + w} ${y + radius} V${y + h} Z`;
  }
  if (end === "bottom") {
    return `M${x} ${y} V${y + h - radius} A${radius} ${radius} 0 0 0 ${x + radius} ${y + h} H${x + w - radius} A${radius} ${radius} 0 0 0 ${x + w} ${y + h - radius} V${y} Z`;
  }
  return `M${x} ${y} H${x + w - radius} A${radius} ${radius} 0 0 1 ${x + w} ${y + radius} V${y + h - radius} A${radius} ${radius} 0 0 1 ${x + w - radius} ${y + h} H${x} Z`;
}

/** Clean 1 / 2 / 2.5 / 5 × 10ⁿ ticks inside a domain. */
function axisTicks(min: number, max: number, target: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min <= 0) return [];
  const rough = (max - min) / Math.max(1, target);
  const exponent = Math.floor(Math.log10(rough));
  const base = 10 ** exponent;
  const fraction = rough / base;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * base;
  const out: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-6; value += step) {
    out.push(Math.round(value * 1e6) / 1e6);
    if (out.length > 12) break;
  }
  return out;
}

/** First, last and up to three interior x labels, so the axis never crowds. */
function xTickIndices(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 5) return Array.from({ length: count }, (_, index) => index);
  const wanted = [0, Math.round((count - 1) * 0.25), Math.round((count - 1) * 0.5), Math.round((count - 1) * 0.75), count - 1];
  return [...new Set(wanted)];
}

function indexVar(index: number): CSSProperties & Record<string, string | number> {
  return { "--fin-i": index };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampPercent(value: number): number {
  return Math.min(88, Math.max(12, value));
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatAcc(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1_000)}K`;
  return Math.round(value).toLocaleString("en-US");
}

function signedAcc(value: number): string {
  return `${value >= 0 ? "+" : "−"}${formatAcc(Math.abs(value))}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(clamp01(value) * 100)}%`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
