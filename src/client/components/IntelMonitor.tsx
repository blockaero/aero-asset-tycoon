/* ==========================================================================
   IntelMonitor — the RIGHT monitor on the desk.

   Market intelligence. This is the read-only screen: the other two monitors
   are where the player acts, this one is where they decide where to point.
   Nothing here submits a command, nothing here is clickable except Close.

   Pure presentational. Every figure is derived from the GameObservation it is
   handed; the only state is local pointer-hover for the chart crosshairs, and
   the single effect (Escape to close) removes its own listener.

   Charts are hand-drawn inline SVG. No charting library.

   Colour method (form first, colour last — see the dataviz procedure):
     · The headline indices are STAT TILES, not charts. A big number, a
       sparkline in the de-emphasis grey with the current point in the accent,
       and the 1.00 baseline drawn as a dashed reference so "above or below
       par" reads without an axis.
     · The world count line and the regional bars are ONE SERIES each, so they
       are one hue — the accent — for every mark. Colouring a nominal category
       darker-where-bigger would double-encode length as hue, so it is not done.
     · The fog funnel is an ORDERED three-step ramp of the accent, monotone in
       lightness (light TAM → deep SOM). Ordinal data, ordinal ramp; identity
       is additionally carried by the stage code inside each band, the legend
       swatches in the definition list, and the data table.
     · Seasonality is TWO series, so it is categorical: accent blue for demand,
       graphite for price. Two hues that separate on both hue and lightness,
       with a legend, direct end labels and a data table behind them.
     · Status red/green is never a series colour. It appears only on a signed
       delta or a signed shock impact, always beside a word.

   Every chart degrades calmly: a short history, a flat seasonal profile, an
   empty shock list and a zero-width funnel all render a considered state
   rather than a collapsed axis.
   ========================================================================== */
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ATA_GROUP_LABELS, ataGroupOf, ataLabel, ataTitle } from "../../sim/ata.ts";
import { calendarFor, seasonForPeriod, seasonLabel } from "../../sim/calendar.ts";
import type { GameObservation } from "../../sim/observation.ts";
import type { MarketShock, Season } from "../../sim/types.ts";
import "./IntelMonitor.css";
import { AtaGlyph } from "../art/AtaGlyph.tsx";

/* ---------------------------------------------------------------- *
 * Contract
 * ---------------------------------------------------------------- */

export type IntelMonitorProps = {
  observation: GameObservation;
  onClose: () => void;
};

/* ---------------------------------------------------------------- *
 * Constants
 * ---------------------------------------------------------------- */

/** Points sampled into a headline sparkline. */
const SPARK_POINTS = 32;
/** Regions given their own bar before the tail folds into "other". */
const REGION_ROWS = 12;
/** ATA chips shown before the tail folds into a count. */
const ATA_CHIPS = 10;
/** History points needed before an observed growth rate is worth quoting. */
const TREND_MIN_POINTS = 6;
/** Weeks of history needed before an observed growth rate is worth quoting. */
const TREND_MIN_SPAN = 8;

/* Headline sparkline geometry. */
const SPK = { w: 148, h: 38, pad: 4 };
/* World count chart geometry. */
const CNT = { w: 720, h: 216, top: 16, right: 26, bottom: 30, left: 76 };
/* Fog funnel geometry. */
const FUN = { w: 300, h: 244, top: 10, band: 70, gap: 6, maxW: 268, minW: 22 };
/* Regional bar chart geometry. */
const REG = { w: 680, row: 26, top: 6, bottom: 6, barX: 178, barMax: 330, bar: 14 };
/* Seasonality chart geometry. */
const SEA = { w: 720, h: 226, top: 20, right: 74, bottom: 36, left: 58 };
/* Shock envelope sparkline geometry. The 12 units under the floor are the tick band. */
const ENV = { w: 300, h: 68, pad: 8, axisBand: 12 };

/** The three fog rings, outermost first. Order is fixed; it is an ordinal scale. */
const RINGS = [
  {
    key: "tam" as const,
    code: "TAM",
    name: "Total addressable",
    definition: "What exists. Counted statistically, never seen up close.",
  },
  {
    key: "sam" as const,
    code: "SAM",
    name: "Serviceable addressable",
    definition: "What is visible but not established. You can see it; you have no standing there.",
  },
  {
    key: "som" as const,
    code: "SOM",
    name: "Serviceable obtainable",
    definition: "What is ready to trade. A relationship exists, so material can actually move.",
  },
];

/* ---------------------------------------------------------------- *
 * Component
 * ---------------------------------------------------------------- */

export function IntelMonitor({ observation, onClose }: IntelMonitorProps) {
  const headingId = useId();

  /* Escape closes the monitor. Registered once, removed on unmount. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const indices = useMemo(() => indexModels(observation), [observation]);
  const world = useMemo(() => worldModel(observation), [observation]);

  return (
    <section className="intel-monitor" aria-labelledby={headingId}>
      {/* Bezel is the aluminium token in CSS; there is no bezel shot in the art library. */}
      <div className="intel-bezel" aria-hidden="true" />

      <header className="intel-head">
        <div className="intel-brand">
          <BlockAeroMark className="intel-mark" />
          <div className="intel-brand-text">
            <p className="intel-eyebrow">Block Aero · Market Intelligence</p>
            <h2 className="intel-title" id={headingId}>
              Intel Monitor
            </h2>
            <p className="intel-subtitle">
              Week {formatCount(observation.tick)} · {observation.calendar.year} P
              {observation.calendar.period} · {seasonLabel(observation.calendar.season)} ·{" "}
              {observation.market.history.length}{" "}
              {observation.market.history.length === 1 ? "reading" : "readings"} on file
            </p>
          </div>
        </div>
        <div className="intel-head-right">
          <p className="intel-readonly">
            <span className="intel-readonly-dot" aria-hidden="true" />
            Read-only
          </p>
          <button type="button" className="intel-close" onClick={onClose} aria-label="Close intel monitor">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
        </div>
      </header>

      {/* ---- 1. Headline indices ----------------------------------------- */}
      <section className="intel-block" aria-labelledby={`${headingId}-indices`}>
        <div className="intel-chart-head">
          <div>
            <h3 className="intel-section-title" id={`${headingId}-indices`}>
              Headline indices
            </h3>
            <p className="intel-chart-sub">
              Both indices are quoted against a 1.000 par. Above par the world is paying more, or
              asking for more, than the baseline this campaign was founded on.
            </p>
          </div>
        </div>
        <div className="intel-indices">
          {indices.map((model) => (
            <IndexTile key={model.key} model={model} />
          ))}
        </div>
      </section>

      {/* ---- 2. The world ------------------------------------------------- */}
      <WorldSection observation={observation} model={world} headingId={`${headingId}-world`} />

      {/* ---- 3. Fog funnel ------------------------------------------------ */}
      <FunnelSection observation={observation} headingId={`${headingId}-funnel`} />

      {/* ---- 4. Shocks ---------------------------------------------------- */}
      <ShockSection observation={observation} headingId={`${headingId}-shocks`} />

      {/* ---- 5. Regional mix ---------------------------------------------- */}
      <RegionSection observation={observation} headingId={`${headingId}-regions`} />

      {/* ---- 6. Seasonality ----------------------------------------------- */}
      <SeasonSection observation={observation} headingId={`${headingId}-season`} />

      <footer className="intel-foot">
        <BlockAeroMark className="intel-mark intel-mark--small" />
        <span className="intel-wordmark">Block Aero</span>
        <span className="intel-foot-note">
          Engine {observation.engineVersion} · seed {observation.seed}
        </span>
      </footer>
    </section>
  );
}

/* ================================================================== *
 * 1. Headline indices
 * ================================================================== */

type IndexModel = {
  key: "price" | "demand";
  label: string;
  blurb: string;
  value: number;
  /** Sampled series for the sparkline, oldest first. Always includes the live value. */
  series: number[];
  /** Index points versus the comparison reading, or null when there is nothing to compare. */
  delta: number | null;
  /** The reading the delta is measured against. */
  againstTick: number | null;
  /** True when the comparison reading is a full year back rather than the oldest on file. */
  fullYear: boolean;
};

function IndexTile({ model }: { model: IndexModel }) {
  const parity = model.value >= 1 ? "above" : "below";
  const gap = Math.abs(model.value - 1);
  return (
    <article className="intel-index">
      <p className="intel-index-label">{model.label}</p>
      <p className="intel-index-value">{formatIndex(model.value)}</p>
      <p className={`intel-index-delta ${deltaTone(model.delta)}`}>
        {model.delta === null ? (
          <>
            <span className="intel-index-flat">—</span>{" "}
            <small>no earlier reading on file</small>
          </>
        ) : (
          <>
            <span aria-hidden="true">{model.delta >= 0 ? "▲" : "▼"}</span> {signedIndex(model.delta)}{" "}
            <small>
              {model.fullYear ? "vs 52 weeks ago" : `vs week ${formatCount(model.againstTick ?? 0)}`}
            </small>
          </>
        )}
      </p>
      <Sparkline values={model.series} label={`${model.label} trend, most recent ${model.series.length} readings`} />
      <p className="intel-index-note">
        {gap < 0.002
          ? "Sitting on par."
          : `${formatPercent(gap)} ${parity} par.`}{" "}
        {model.blurb}
      </p>
    </article>
  );
}

/** Sparkline with the 1.000 index baseline drawn as a dashed reference. */
function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  if (values.length < 2) {
    return (
      <div className="intel-spark intel-spark--empty" role="img" aria-label={`${label} — not enough readings to draw`}>
        <span aria-hidden="true">awaiting readings</span>
      </div>
    );
  }
  /* Par is always inside the domain, so "above or below 1.000" reads without an axis. */
  const lo = Math.min(1, ...values);
  const hi = Math.max(1, ...values);
  const span = hi - lo < 1e-4 ? 1e-4 : hi - lo;
  const innerW = SPK.w - SPK.pad * 2;
  const innerH = SPK.h - SPK.pad * 2;
  const yOf = (value: number) => SPK.pad + innerH - ((value - lo) / span) * innerH;
  const points = values.map((value, index) => ({
    cx: SPK.pad + (index / (values.length - 1)) * innerW,
    cy: yOf(value),
  }));
  const last = points[points.length - 1]!;
  return (
    <svg className="intel-spark" viewBox={`0 0 ${SPK.w} ${SPK.h}`} role="img" aria-label={label} focusable="false">
      <line className="intel-spark-par" x1={0} y1={yOf(1)} x2={SPK.w} y2={yOf(1)} />
      <path className="intel-spark-line" d={linePath(points)} />
      <circle className="intel-spark-ring" cx={last.cx} cy={last.cy} r={4.4} />
      <circle className="intel-spark-dot" cx={last.cx} cy={last.cy} r={2.8} />
    </svg>
  );
}

/* ================================================================== *
 * 2. The world
 * ================================================================== */

type WorldModel = {
  tracked: number;
  worldAssets: number;
  /** Real units each tracked asset stands for. */
  scale: number;
  growthRate: number;
  retireRate: number;
  netRate: number;
  /** Extra assets a year on the narrative world figure. */
  netUnitsPerYear: number;
  /** Years for the pool to double at the net rate, or null when it is not growing. */
  doublingYears: number | null;
  /** Annualised growth actually observed in the history, or null when it is too short. */
  observedRate: number | null;
  observedSpan: number;
};

function WorldSection({
  observation,
  model,
  headingId,
}: {
  observation: GameObservation;
  model: WorldModel;
  headingId: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const history = observation.market.history;

  const plot = {
    x: CNT.left,
    y: CNT.top,
    w: CNT.w - CNT.left - CNT.right,
    h: CNT.h - CNT.top - CNT.bottom,
  };

  const chart = useMemo(() => {
    if (history.length < 2) return null;
    const counts = history.map((point) => point.count);
    let lo = Math.min(...counts);
    let hi = Math.max(...counts);
    if (hi - lo < 1) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.14;
    lo -= pad;
    hi += pad;
    const firstTick = history[0]!.tick;
    const lastTick = history[history.length - 1]!.tick;
    const span = Math.max(1, lastTick - firstTick);
    const xOf = (tick: number) => plot.x + ((tick - firstTick) / span) * plot.w;
    const yOf = (value: number) => plot.y + plot.h - ((value - lo) / (hi - lo)) * plot.h;
    const points = history.map((point) => ({ point, cx: xOf(point.tick), cy: yOf(point.count) }));
    return { lo, hi, firstTick, lastTick, xOf, yOf, points, ticks: axisTicks(lo, hi, 4) };
  }, [history, plot.x, plot.y, plot.w, plot.h]);

  function onMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!chart) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const vx = ((event.clientX - rect.left) / rect.width) * CNT.w;
    let best = 0;
    let bestGap = Number.POSITIVE_INFINITY;
    chart.points.forEach((point, index) => {
      const gap = Math.abs(point.cx - vx);
      if (gap < bestGap) {
        bestGap = gap;
        best = index;
      }
    });
    setHover(best);
  }

  const active = chart && hover !== null ? chart.points[hover] ?? null : null;

  return (
    <section className="intel-block" aria-labelledby={headingId}>
      <div className="intel-chart-head">
        <div>
          <h3 className="intel-section-title" id={headingId}>
            The world
          </h3>
          <p className="intel-chart-sub">
            The engine tracks {formatCount(model.tracked)} serialized high-value assets. Each one
            stands for about {formatCount(model.scale)} real units, so this monitor reports on a
            world holding roughly {formatCount(model.worldAssets)} assets worth trading.
          </p>
        </div>
        <p className="intel-chart-figure">
          {signedPercent(model.netRate)}
          <small>net a year</small>
        </p>
      </div>

      <div className="intel-world-facts">
        <Fact label="Tracked assets" value={formatCount(model.tracked)} note="Serialized in the engine" />
        <Fact label="World fleet" value={formatCount(model.worldAssets)} note={`One tracked asset ≈ ${formatCount(model.scale)} real units`} />
        <Fact label="Annual growth" value={formatPercent(model.growthRate)} note="New build entering the pool" />
        <Fact label="Annual retirement" value={formatPercent(model.retireRate)} note="Teardown, storage and scrap leaving it" />
      </div>

      <p className="intel-prose">
        Growth of {formatPercent(model.growthRate)} a year against {formatPercent(model.retireRate)}{" "}
        of retirements leaves the pool widening {formatPercent(model.netRate)} a year — about{" "}
        {formatCount(model.netUnitsPerYear)} more assets in service every twelve months
        {model.doublingYears === null
          ? ", give or take the shocks"
          : `, and a doubling in roughly ${model.doublingYears.toFixed(0)} years`}
        . Both sides of your book grow with it: more airframes flying means more removals to quote
        against, and more retirements means more used material chasing the same buyers. The trend is
        not the trade. The spread is.
        {model.observedRate === null ? (
          <>
            {" "}
            Observed growth needs {TREND_MIN_POINTS} readings across {TREND_MIN_SPAN} weeks before it
            is worth quoting; the record is shorter than that so far.
          </>
        ) : (
          <>
            {" "}
            Measured across the {formatCount(model.observedSpan)} weeks on file, the tracked count has
            actually moved {signedPercent(model.observedRate)} a year.
          </>
        )}
      </p>

      {!chart ? (
        <ChartPlaceholder
          title="The count line starts after two readings"
          note="The market recorder writes one reading a pulse. Two are enough to draw a line."
        />
      ) : (
        <figure className="intel-figure">
          <div className="intel-plot">
            <svg
              className="intel-svg"
              viewBox={`0 0 ${CNT.w} ${CNT.h}`}
              role="img"
              aria-label={`Tracked asset count across ${history.length} readings, from ${formatCount(history[0]!.count)} in week ${history[0]!.tick} to ${formatCount(history[history.length - 1]!.count)} in week ${history[history.length - 1]!.tick}.`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            >
              {chart.ticks.map((tick, index, all) => (
                <g key={tick}>
                  <line
                    className="intel-grid"
                    x1={plot.x}
                    y1={chart.yOf(tick)}
                    x2={plot.x + plot.w}
                    y2={chart.yOf(tick)}
                  />
                  <text className="intel-axis-text" x={plot.x - 10} y={chart.yOf(tick) + 3.5} textAnchor="end">
                    {formatAxisValue(tick, all.length > 1 ? all[1]! - all[0]! : 0)}
                  </text>
                </g>
              ))}

              <path
                className="intel-area"
                d={`${linePath(chart.points)} L ${chart.points[chart.points.length - 1]!.cx.toFixed(2)} ${(plot.y + plot.h).toFixed(2)} L ${chart.points[0]!.cx.toFixed(2)} ${(plot.y + plot.h).toFixed(2)} Z`}
              />
              <path className="intel-line" pathLength={1} d={linePath(chart.points)} />

              <circle
                className="intel-end-ring"
                cx={chart.points[chart.points.length - 1]!.cx}
                cy={chart.points[chart.points.length - 1]!.cy}
                r={6}
              />
              <circle
                className="intel-end-dot"
                cx={chart.points[chart.points.length - 1]!.cx}
                cy={chart.points[chart.points.length - 1]!.cy}
                r={4}
              />
              <text
                className="intel-end-label"
                x={chart.points[chart.points.length - 1]!.cx - 10}
                y={chart.points[chart.points.length - 1]!.cy - 12}
                textAnchor="end"
              >
                {formatCount(history[history.length - 1]!.count)} tracked
              </text>

              {active ? (
                <g aria-hidden="true">
                  <line className="intel-crosshair" x1={active.cx} y1={plot.y} x2={active.cx} y2={plot.y + plot.h} />
                  <circle className="intel-end-ring" cx={active.cx} cy={active.cy} r={6} />
                  <circle className="intel-hover-dot" cx={active.cx} cy={active.cy} r={4} />
                </g>
              ) : null}

              <line className="intel-axis" x1={plot.x} y1={plot.y + plot.h} x2={plot.x + plot.w} y2={plot.y + plot.h} />

              {xTickIndices(chart.points.length).map((index) => {
                const point = chart.points[index]!;
                return (
                  <text
                    key={point.point.tick}
                    className="intel-axis-text"
                    x={point.cx}
                    y={plot.y + plot.h + 18}
                    textAnchor="middle"
                  >
                    wk {point.point.tick}
                  </text>
                );
              })}
            </svg>

            {active ? (
              <div
                className="intel-tooltip"
                aria-hidden="true"
                style={{
                  left: `${clampPercent((active.cx / CNT.w) * 100)}%`,
                  top: `${(active.cy / CNT.h) * 100}%`,
                }}
              >
                <p className="intel-tooltip-title">Week {active.point.tick}</p>
                <p className="intel-tooltip-row">
                  <span>Tracked</span>
                  <strong>{formatCount(active.point.count)}</strong>
                </p>
                <p className="intel-tooltip-row">
                  <span>Price index</span>
                  <strong>{formatIndex(active.point.priceIndex)}</strong>
                </p>
                <p className="intel-tooltip-row">
                  <span>Demand index</span>
                  <strong>{formatIndex(active.point.demandIndex)}</strong>
                </p>
              </div>
            ) : null}
          </div>

          <DataTable
            summary="Market readings"
            head={["Week", "Tracked", "Price index", "Demand index"]}
            rows={history
              .slice()
              .reverse()
              .map((point) => [
                `wk ${point.tick}`,
                formatCount(point.count),
                formatIndex(point.priceIndex),
                formatIndex(point.demandIndex),
              ])}
          />
        </figure>
      )}
    </section>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="intel-fact">
      <p className="intel-fact-label">{label}</p>
      <p className="intel-fact-value">{value}</p>
      <p className="intel-fact-note">{note}</p>
    </div>
  );
}

/* ================================================================== *
 * 3. Fog funnel
 * ================================================================== */

function FunnelSection({ observation, headingId }: { observation: GameObservation; headingId: string }) {
  const funnel = observation.funnel;
  const total = funnel.tam + funnel.sam + funnel.som;

  /* TAM contains SAM contains SOM, so the band widths run off cumulative counts
     while each row still reports the ring it sits in exactly. */
  const rows = useMemo(() => {
    const cumulative = { tam: total, sam: funnel.sam + funnel.som, som: funnel.som };
    return RINGS.map((ring) => ({
      ...ring,
      exact: funnel[ring.key],
      cumulative: cumulative[ring.key],
      share: total > 0 ? cumulative[ring.key] / total : 0,
    }));
  }, [funnel, total]);

  const widthOf = (value: number) =>
    total > 0 ? Math.max(FUN.minW, (value / total) * FUN.maxW) : FUN.minW;

  const height = FUN.top * 2 + RINGS.length * FUN.band + (RINGS.length - 1) * FUN.gap;
  const centre = FUN.w / 2;

  return (
    <section className="intel-block" aria-labelledby={headingId}>
      <div className="intel-chart-head">
        <div>
          <h3 className="intel-section-title" id={headingId}>
            Fog funnel
          </h3>
          <p className="intel-chart-sub">
            Every counterparty on the map sits in exactly one ring. The funnel narrows because
            knowing a market is not the same as being able to trade in it.
          </p>
        </div>
        <p className="intel-chart-figure">
          {formatCount(funnel.som)}
          <small>ready to trade</small>
        </p>
      </div>

      {total === 0 ? (
        <ChartPlaceholder
          title="No counterparties mapped yet"
          note="The funnel fills as the world builds out. Nothing has been placed on the map."
        />
      ) : (
        <figure className="intel-figure intel-funnel">
          <div className="intel-plot intel-funnel-plot">
            <svg
              className="intel-svg"
              viewBox={`0 0 ${FUN.w} ${height}`}
              role="img"
              aria-label={`Fog funnel. ${rows.map((row) => `${row.code} ${formatCount(row.cumulative)}`).join(", ")}.`}
              focusable="false"
            >
              {rows.map((row, index) => {
                const next = rows[index + 1];
                const topW = widthOf(row.cumulative);
                const bottomW = next ? widthOf(next.cumulative) : Math.max(FUN.minW, topW * 0.55);
                const y = FUN.top + index * (FUN.band + FUN.gap);
                const showCode = topW >= 66;
                return (
                  <g className={`intel-funnel-band is-${row.key}`} key={row.key}>
                    <path
                      className="intel-funnel-fill"
                      d={`M${(centre - topW / 2).toFixed(2)} ${y} H${(centre + topW / 2).toFixed(2)} L${(centre + bottomW / 2).toFixed(2)} ${y + FUN.band} H${(centre - bottomW / 2).toFixed(2)} Z`}
                    />
                    {showCode ? (
                      <text className="intel-funnel-code" x={centre} y={y + FUN.band / 2 + 5} textAnchor="middle">
                        {row.code}
                      </text>
                    ) : (
                      <text
                        className="intel-funnel-code intel-funnel-code--outside"
                        x={centre + topW / 2 + 10}
                        y={y + FUN.band / 2 + 4}
                        textAnchor="start"
                      >
                        {row.code}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <ol className="intel-rings">
            {rows.map((row) => (
              <li className="intel-ring" key={row.key}>
                <p className="intel-ring-head">
                  <i className={`intel-swatch intel-swatch--${row.key}`} aria-hidden="true" />
                  <span className="intel-ring-code">{row.code}</span>
                  <span className="intel-ring-name">{row.name}</span>
                </p>
                <p className="intel-ring-value">
                  {formatCount(row.cumulative)}
                  <small>{formatPercent(row.share)} of the map</small>
                </p>
                <p className="intel-ring-def">{row.definition}</p>
                <p className="intel-ring-exact">
                  {formatCount(row.exact)} sit at this ring and no further.
                </p>
              </li>
            ))}
          </ol>

          <DataTable
            summary="Fog funnel"
            head={["Ring", "In this ring or better", "At this ring exactly", "Share"]}
            rows={rows.map((row) => [
              `${row.code} — ${row.name}`,
              formatCount(row.cumulative),
              formatCount(row.exact),
              formatPercent(row.share),
            ])}
          />
        </figure>
      )}
    </section>
  );
}

/* ================================================================== *
 * 4. Shocks
 * ================================================================== */

type ShockView = {
  shock: MarketShock;
  phase: "pending" | "building" | "peak" | "fading" | "closed";
  status: string;
  /** Sort key: live shocks first, then the nearest pending, then the freshest closed. */
  rank: number;
  regionName: string | null;
};

function ShockSection({ observation, headingId }: { observation: GameObservation; headingId: string }) {
  const tick = observation.tick;
  const views = useMemo(() => {
    return observation.market.knownShocks
      .map((shock): ShockView => {
        const regionName =
          shock.regionCode === null
            ? null
            : observation.regions.find((region) => region.code === shock.regionCode)?.name ?? shock.regionCode;
        if (tick < shock.startTick) {
          return {
            shock,
            phase: "pending",
            status: `Opens in ${plural(shock.startTick - tick, "week")}`,
            rank: 2000 + (shock.startTick - tick),
            regionName,
          };
        }
        if (tick > shock.endTick) {
          return {
            shock,
            phase: "closed",
            status: `Closed ${plural(tick - shock.endTick, "week")} ago`,
            rank: 4000 + (tick - shock.endTick),
            regionName,
          };
        }
        if (tick < shock.peakTick) {
          return {
            shock,
            phase: "building",
            status: `Building · peak in ${plural(shock.peakTick - tick, "week")}`,
            rank: 100 + (shock.peakTick - tick),
            regionName,
          };
        }
        if (tick === shock.peakTick) {
          return { shock, phase: "peak", status: "At peak this week", rank: 0, regionName };
        }
        return {
          shock,
          phase: "fading",
          status: `Fading · ${plural(shock.endTick - tick, "week")} left`,
          rank: 1000 + (shock.endTick - tick),
          regionName,
        };
      })
      .sort((a, b) => a.rank - b.rank || a.shock.id - b.shock.id);
  }, [observation.market.knownShocks, observation.regions, tick]);

  const live = views.filter((view) => view.phase === "building" || view.phase === "peak" || view.phase === "fading");

  return (
    <section className="intel-block" aria-labelledby={headingId}>
      <div className="intel-chart-head">
        <div>
          <h3 className="intel-section-title" id={headingId}>
            Shocks
          </h3>
          <p className="intel-chart-sub">
            Impacts are quoted at peak and signed against a holder&rsquo;s book: a positive price
            impact lifts what you already own, a negative one marks it down.
          </p>
        </div>
        {views.length > 0 ? (
          <p className="intel-chart-figure">
            {formatCount(live.length)}
            <small>live now</small>
          </p>
        ) : null}
      </div>

      {views.length === 0 ? (
        <FogNotice />
      ) : (
        <>
          <div className="intel-shocks">
            {views.map((view) => (
              <ShockCard key={view.shock.id} view={view} tick={tick} />
            ))}
          </div>
          <DataTable
            summary="Known shocks"
            head={["Shock", "Window", "Peak", "Price", "Demand", "Focus"]}
            rows={views.map((view) => [
              view.shock.label,
              `wk ${view.shock.startTick}–${view.shock.endTick}`,
              `wk ${view.shock.peakTick}`,
              signedPercent(view.shock.priceImpact),
              signedPercent(view.shock.demandImpact),
              focusText(view),
            ])}
          />
        </>
      )}
    </section>
  );
}

function ShockCard({ view, tick }: { view: ShockView; tick: number }) {
  const { shock } = view;
  const weeks = Math.max(1, shock.endTick - shock.startTick);
  return (
    <article className={`intel-shock is-${view.phase}`}>
      <header className="intel-shock-head">
        <p className="intel-shock-kind">{shockKindLabel(shock.kind)}</p>
        <h4 className="intel-shock-title">{shock.label}</h4>
      </header>

      <p className={`intel-shock-status is-${view.phase}`}>
        <span className="intel-shock-pip" aria-hidden="true" />
        {view.status}
      </p>

      <ShockEnvelope shock={shock} tick={tick} />

      <dl className="intel-shock-impacts">
        <div>
          <dt>Price at peak</dt>
          <dd className={deltaTone(shock.priceImpact)}>
            <span aria-hidden="true">{shock.priceImpact >= 0 ? "▲" : "▼"}</span> {signedPercent(shock.priceImpact)}
          </dd>
        </div>
        <div>
          <dt>Demand at peak</dt>
          <dd className={deltaTone(shock.demandImpact)}>
            <span aria-hidden="true">{shock.demandImpact >= 0 ? "▲" : "▼"}</span> {signedPercent(shock.demandImpact)}
          </dd>
        </div>
      </dl>

      <p className="intel-shock-window">
        Week {formatCount(shock.startTick)} to {formatCount(shock.endTick)} · {plural(weeks, "week")} long ·
        peak week {formatCount(shock.peakTick)}
      </p>

      <ul className="intel-shock-focus">
        <li className="intel-chip intel-chip--region">
          <span className="intel-chip-key">Region</span>
          <span className="intel-chip-value">{view.regionName ?? "Worldwide"}</span>
        </li>
        {shock.ata === null ? (
          <li className="intel-chip">
            <span className="intel-chip-key">ATA</span>
            <span className="intel-chip-value">All chapters</span>
          </li>
        ) : (
          <li className="intel-chip intel-chip--ata">
            <span className="intel-chip-key">{ATA_GROUP_LABELS[ataGroupOf(shock.ata)]}</span>
            <span className="intel-chip-value">{ataLabel(shock.ata)}</span>
          </li>
        )}
      </ul>
    </article>
  );
}

/**
 * The shock's shape over its own window: a ramp to peak and a decay out, with a
 * rule where the campaign currently sits inside it.
 */
function ShockEnvelope({ shock, tick }: { shock: MarketShock; tick: number }) {
  const span = Math.max(1, shock.endTick - shock.startTick);
  const inner = ENV.w - ENV.pad * 2;
  const xOf = (value: number) =>
    ENV.pad + (clamp01((value - shock.startTick) / span)) * inner;
  const floor = ENV.h - ENV.pad - ENV.axisBand;
  const ceiling = ENV.pad;
  const peakX = xOf(shock.peakTick);
  const nowX = xOf(tick);
  const inside = tick >= shock.startTick && tick <= shock.endTick;
  return (
    <svg
      className="intel-envelope"
      viewBox={`0 0 ${ENV.w} ${ENV.h}`}
      role="img"
      aria-label={`Shock window from week ${shock.startTick}, peaking week ${shock.peakTick}, ending week ${shock.endTick}.`}
      focusable="false"
    >
      <line className="intel-envelope-axis" x1={0} y1={floor} x2={ENV.w} y2={floor} />
      <path
        className="intel-envelope-fill"
        d={`M${ENV.pad} ${floor} L${peakX.toFixed(2)} ${ceiling} L${(ENV.w - ENV.pad).toFixed(2)} ${floor} Z`}
      />
      <path
        className="intel-envelope-line"
        d={`M${ENV.pad} ${floor} L${peakX.toFixed(2)} ${ceiling} L${(ENV.w - ENV.pad).toFixed(2)} ${floor}`}
      />
      <line
        className={`intel-envelope-now ${inside ? "" : "is-outside"}`}
        x1={nowX}
        y1={ceiling - 2}
        x2={nowX}
        y2={floor + 2}
      />
      <text className="intel-envelope-tick" x={ENV.pad} y={ENV.h - 2} textAnchor="start">
        {shock.startTick}
      </text>
      <text className="intel-envelope-tick" x={ENV.w - ENV.pad} y={ENV.h - 2} textAnchor="end">
        {shock.endTick}
      </text>
    </svg>
  );
}

/**
 * The empty state. An empty shock list is the fog, not a broken panel, so it says
 * what is missing and exactly which two investments lift it.
 */
function FogNotice() {
  return (
    <div className="intel-fog">
      <svg className="intel-fog-glyph" viewBox="0 0 120 60" aria-hidden="true" focusable="false">
        <path className="intel-fog-band" d="M6 20 H62 M74 20 H114" />
        <path className="intel-fog-band" d="M6 32 H40 M52 32 H92" />
        <path className="intel-fog-band" d="M18 44 H70 M82 44 H114" />
        <circle className="intel-fog-eye" cx="60" cy="32" r="7" />
      </svg>
      <div className="intel-fog-copy">
        <p className="intel-fog-title">Intel is limited</p>
        <p className="intel-fog-body">
          Shocks are running in the world right now. Fuel spikes, type groundings, lessor defaults
          and supply squeezes are all moving the cohort indices this monitor reports. You simply
          cannot see them yet: the fog covers the economy the same way it covers the map.
        </p>
        <ul className="intel-fog-paths">
          <li>
            <span className="intel-fog-path-key">Tribal Knowledge</span>
            <span className="intel-fog-path-body">
              The AI and analyst branch under Operations. Auto-Quote opens the chain; Demand
              Forecasting is the node that turns this screen from a record of where demand has been
              into a read on where it is going.
            </span>
          </li>
          <li>
            <span className="intel-fog-path-key">Team</span>
            <span className="intel-fog-path-body">
              Hire a Market Analyst. They track fleet retirements, shop rates and shock rumours, and
              will name a shock while there is still time to trade against it.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ================================================================== *
 * 5. Regional mix
 * ================================================================== */

function RegionSection({ observation, headingId }: { observation: GameObservation; headingId: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const source = observation.market.byRegion;
    const total = source.reduce((sum, row) => sum + row.count, 0);
    const head = source.slice(0, REGION_ROWS);
    const tail = source.slice(REGION_ROWS);
    const rows = head.map((row) => ({
      key: row.code as string,
      name: row.name,
      count: row.count,
      other: false,
      demandBase: observation.regions.find((region) => region.code === row.code)?.demandBase ?? null,
    }));
    if (tail.length > 0) {
      rows.push({
        key: "other",
        name: `${tail.length} smaller regions`,
        count: tail.reduce((sum, row) => sum + row.count, 0),
        other: true,
        demandBase: null,
      });
    }
    const max = rows.reduce((best, row) => Math.max(best, row.count), 0);
    return { rows, total, max };
  }, [observation.market.byRegion, observation.regions]);

  const height = REG.top + REG.bottom + model.rows.length * REG.row;
  const top = model.rows[0];

  return (
    <section className="intel-block" aria-labelledby={headingId}>
      <div className="intel-chart-head">
        <div>
          <h3 className="intel-section-title" id={headingId}>
            Regional mix
          </h3>
          <p className="intel-chart-sub">
            Where the tracked fleet actually sits. Weight here is where material comes from; it is
            not where you can reach — the funnel above decides that.
          </p>
        </div>
        {top ? (
          <p className="intel-chart-figure">
            {top.name}
            <small>heaviest region</small>
          </p>
        ) : null}
      </div>

      {model.rows.length === 0 || model.max === 0 ? (
        <ChartPlaceholder
          title="No regional breakdown yet"
          note="Cohorts are placed when the world builds. None have been counted into a region."
        />
      ) : (
        <figure className="intel-figure">
          <div className="intel-plot">
            <svg
              className="intel-svg"
              viewBox={`0 0 ${REG.w} ${height}`}
              role="img"
              aria-label={`Tracked assets by region across ${model.rows.length} regions, led by ${model.rows[0]!.name} with ${formatCount(model.rows[0]!.count)}.`}
              onPointerLeave={() => setHover(null)}
            >
              {model.rows.map((row, index) => {
                const y = REG.top + index * REG.row;
                const barY = y + (REG.row - REG.bar) / 2;
                const width = Math.max(2, (row.count / model.max) * REG.barMax);
                const share = model.total > 0 ? row.count / model.total : 0;
                return (
                  <g
                    className={`intel-region-row ${hover === index ? "is-active" : ""}`}
                    key={row.key}
                    style={indexVar(index)}
                    onPointerEnter={() => setHover(index)}
                  >
                    <rect className="intel-hit" x={0} y={y} width={REG.w} height={REG.row} />
                    <text className="intel-region-name" x={0} y={y + REG.row / 2 + 4}>
                      {truncate(row.name, 26)}
                    </text>
                    <path
                      className={`intel-region-bar ${row.other ? "is-other" : ""}`}
                      d={roundedBar(REG.barX, barY, width, REG.bar, 4, "right")}
                    />
                    <text className="intel-region-value" x={REG.barX + width + 10} y={y + REG.row / 2 + 4}>
                      {formatCount(row.count)}
                    </text>
                    <text className="intel-region-share" x={REG.w} y={y + REG.row / 2 + 4} textAnchor="end">
                      {formatPercent(share)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <DataTable
            summary="Tracked assets by region"
            head={["Region", "Tracked", "Share", "Demand base"]}
            rows={model.rows.map((row) => [
              row.name,
              formatCount(row.count),
              formatPercent(model.total > 0 ? row.count / model.total : 0),
              row.demandBase === null ? "—" : formatIndex(row.demandBase),
            ])}
          />
        </figure>
      )}

      <AtaStrip rows={observation.ataOpportunities} />
    </section>
  );
}

/** Chapters currently in play across everything the player can see. */
function AtaStrip({ rows }: { rows: GameObservation["ataOpportunities"] }) {
  const head = rows.slice(0, ATA_CHIPS);
  const tail = rows.length - head.length;
  return (
    <div className="intel-ata">
      <p className="intel-ata-label">Chapters in play</p>
      {head.length === 0 ? (
        <p className="intel-ata-empty">
          No visible opportunity carries an ATA focus this week. Chapters reappear here as the map
          opens up.
        </p>
      ) : (
        <ul className="intel-ata-chips">
          {head.map((row) => (
            <li className="intel-chip intel-chip--ata" key={row.code}>
              <AtaGlyph code={row.code} />
              <span className="intel-chip-key">{ATA_GROUP_LABELS[ataGroupOf(row.code)]}</span>
              <span className="intel-chip-value">
                ATA {row.code} · {truncate(ataTitle(row.code), 30)}
              </span>
              <span className="intel-chip-count">{formatCount(row.count)}</span>
            </li>
          ))}
          {tail > 0 ? (
            <li className="intel-chip intel-chip--more">
              <span className="intel-chip-value">+{formatCount(tail)} more chapters</span>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

/* ================================================================== *
 * 6. Seasonality
 * ================================================================== */

type SeasonPoint = {
  period: number;
  demand: number;
  price: number;
  season: Season;
};

function SeasonSection({ observation, headingId }: { observation: GameObservation; headingId: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const calendar = observation.calendar;

  const plot = {
    x: SEA.left,
    y: SEA.top,
    w: SEA.w - SEA.left - SEA.right,
    h: SEA.h - SEA.top - SEA.bottom,
  };

  const model = useMemo(() => {
    const periods = clampInt(calendar.periodsPerYear, 4, 104, 52);
    const current = clampInt(calendar.period, 1, periods, 1);
    /* The seasonal curves are a pure function of the tick, so the whole year can be
       recovered from the tick that starts it. The live period is then overwritten
       with the observation's own numbers, which are the authority. */
    const baseTick = Math.max(0, observation.tick - (current - 1));
    const points: SeasonPoint[] = [];
    for (let period = 1; period <= periods; period += 1) {
      const at = calendarFor(baseTick + period - 1);
      points.push({
        period,
        demand: period === current ? calendar.seasonalDemand : at.seasonalDemand,
        price: period === current ? calendar.seasonalPrice : at.seasonalPrice,
        season: seasonForPeriod(period),
      });
    }
    const values = points.flatMap((point) => [point.demand, point.price, 1]);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (hi - lo < 0.01) {
      lo -= 0.01;
      hi += 0.01;
    }
    const pad = (hi - lo) * 0.16;
    lo -= pad;
    hi += pad;
    const xOf = (period: number) => plot.x + ((period - 1) / Math.max(1, periods - 1)) * plot.w;
    const yOf = (value: number) => plot.y + plot.h - ((value - lo) / (hi - lo)) * plot.h;

    let priceTrough = points[0]!;
    let pricePeak = points[0]!;
    for (const point of points) {
      if (point.price < priceTrough.price) priceTrough = point;
      if (point.price > pricePeak.price) pricePeak = point;
    }
    const swing = pricePeak.price - priceTrough.price;

    return {
      periods,
      current,
      points,
      lo,
      hi,
      xOf,
      yOf,
      ticks: axisTicks(lo, hi, 4),
      priceTrough,
      pricePeak,
      swing,
      flat: swing < 0.004,
    };
  }, [calendar, observation.tick, plot.x, plot.y, plot.w, plot.h]);

  function onMove(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const vx = ((event.clientX - rect.left) / rect.width) * SEA.w;
    const raw = Math.round(((vx - plot.x) / plot.w) * (model.periods - 1)) + 1;
    setHover(Math.min(model.periods, Math.max(1, raw)));
  }

  const active = hover === null ? null : model.points[hover - 1] ?? null;
  const here = model.points[model.current - 1] ?? null;
  const toTrough = weeksAhead(model.current, model.priceTrough.period, model.periods);
  const toPeak = weeksAhead(model.current, model.pricePeak.period, model.periods);

  const demandPoints = model.points.map((point) => ({ cx: model.xOf(point.period), cy: model.yOf(point.demand) }));
  const pricePoints = model.points.map((point) => ({ cx: model.xOf(point.period), cy: model.yOf(point.price) }));
  const lastDemand = demandPoints[demandPoints.length - 1]!;
  const lastPrice = pricePoints[pricePoints.length - 1]!;

  /* Season boundaries, drawn as hairline separators rather than colour blocks. */
  const boundaries = model.points
    .filter((point, index) => index > 0 && point.season !== model.points[index - 1]!.season)
    .map((point) => point.period);

  return (
    <section className="intel-block" aria-labelledby={headingId}>
      <div className="intel-chart-head">
        <div>
          <h3 className="intel-section-title" id={headingId}>
            Seasonality
          </h3>
          <p className="intel-chart-sub">
            Northern summer flying pushes utilisation up, removals follow a few weeks later, and
            quoted prices trail demand again because distributors price off a trailing book. That
            lag is the whole reason buying into the trough and holding into the peak is a strategy.
          </p>
        </div>
        {here ? (
          <p className="intel-chart-figure">
            P{model.current}
            <small>{seasonLabel(calendar.season)} · now</small>
          </p>
        ) : null}
      </div>

      <div className="intel-season-facts">
        <Fact
          label="Demand multiplier now"
          value={formatIndex(calendar.seasonalDemand)}
          note={describeParity(calendar.seasonalDemand)}
        />
        <Fact
          label="Price multiplier now"
          value={formatIndex(calendar.seasonalPrice)}
          note={describeParity(calendar.seasonalPrice)}
        />
        <Fact
          label="Cheapest weeks"
          value={`P${model.priceTrough.period}`}
          note={
            model.flat
              ? "Flat seasonal profile this campaign"
              : toTrough === 0
                ? "That is this week — buy"
                : `${plural(toTrough, "week")} away · ${formatIndex(model.priceTrough.price)}`
          }
        />
        <Fact
          label="Dearest weeks"
          value={`P${model.pricePeak.period}`}
          note={
            model.flat
              ? "Nothing to time against"
              : toPeak === 0
                ? "That is this week — sell"
                : `${plural(toPeak, "week")} away · ${formatIndex(model.pricePeak.price)}`
          }
        />
      </div>

      <figure className="intel-figure">
        <div className="intel-plot">
          <svg
            className="intel-svg"
            viewBox={`0 0 ${SEA.w} ${SEA.h}`}
            role="img"
            aria-label={`Seasonal demand and price multipliers across ${model.periods} periods. Prices trough at period ${model.priceTrough.period} and peak at period ${model.pricePeak.period}. The campaign is at period ${model.current}.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {model.ticks.map((tick) => (
              <g key={tick}>
                <line className="intel-grid" x1={plot.x} y1={model.yOf(tick)} x2={plot.x + plot.w} y2={model.yOf(tick)} />
                <text className="intel-axis-text" x={plot.x - 10} y={model.yOf(tick) + 3.5} textAnchor="end">
                  {tick.toFixed(2)}
                </text>
              </g>
            ))}

            {boundaries.map((period) => (
              <line
                key={period}
                className="intel-season-edge"
                x1={model.xOf(period)}
                y1={plot.y}
                x2={model.xOf(period)}
                y2={plot.y + plot.h}
              />
            ))}

            {/* Par: a threshold, dashed so it never reads as a gridline. */}
            <line className="intel-reference" x1={plot.x} y1={model.yOf(1)} x2={plot.x + plot.w} y2={model.yOf(1)} />
            <text className="intel-reference-text" x={plot.x + 4} y={model.yOf(1) - 6}>
              Par 1.00
            </text>

            <path className="intel-line intel-line--price" pathLength={1} d={linePath(pricePoints)} />
            <path className="intel-line intel-line--demand" pathLength={1} d={linePath(demandPoints)} />

            <text className="intel-series-label is-demand" x={lastDemand.cx + 10} y={lastDemand.cy + 4}>
              Demand
            </text>
            <text className="intel-series-label is-price" x={lastPrice.cx + 10} y={lastPrice.cy + 4}>
              Price
            </text>

            {/* Where the campaign stands right now. */}
            <line
              className="intel-now"
              x1={model.xOf(model.current)}
              y1={plot.y}
              x2={model.xOf(model.current)}
              y2={plot.y + plot.h}
            />
            <text className="intel-now-label" x={model.xOf(model.current)} y={plot.y - 6} textAnchor="middle">
              P{model.current} now
            </text>
            {here ? (
              <>
                <circle className="intel-end-ring" cx={model.xOf(model.current)} cy={model.yOf(here.demand)} r={6} />
                <circle className="intel-end-dot" cx={model.xOf(model.current)} cy={model.yOf(here.demand)} r={4} />
                <circle className="intel-end-ring" cx={model.xOf(model.current)} cy={model.yOf(here.price)} r={6} />
                <circle className="intel-end-dot is-price" cx={model.xOf(model.current)} cy={model.yOf(here.price)} r={4} />
              </>
            ) : null}

            {active && active.period !== model.current ? (
              <g aria-hidden="true">
                <line
                  className="intel-crosshair"
                  x1={model.xOf(active.period)}
                  y1={plot.y}
                  x2={model.xOf(active.period)}
                  y2={plot.y + plot.h}
                />
              </g>
            ) : null}

            <line className="intel-axis" x1={plot.x} y1={plot.y + plot.h} x2={plot.x + plot.w} y2={plot.y + plot.h} />

            {seasonBands(model.points).map((band) => (
              <text
                key={band.season}
                className="intel-season-name"
                x={model.xOf(band.centre)}
                y={plot.y + plot.h + 18}
                textAnchor="middle"
              >
                {seasonLabel(band.season)}
              </text>
            ))}
          </svg>

          {active ? (
            <div
              className="intel-tooltip"
              aria-hidden="true"
              style={{
                left: `${clampPercent((model.xOf(active.period) / SEA.w) * 100)}%`,
                top: `${(model.yOf(Math.max(active.demand, active.price)) / SEA.h) * 100}%`,
              }}
            >
              <p className="intel-tooltip-title">
                P{active.period} · {seasonLabel(active.season)}
              </p>
              <p className="intel-tooltip-row">
                <span>
                  <i className="intel-swatch intel-swatch--demand" /> Demand
                </span>
                <strong>{formatIndex(active.demand)}</strong>
              </p>
              <p className="intel-tooltip-row">
                <span>
                  <i className="intel-swatch intel-swatch--price" /> Price
                </span>
                <strong>{formatIndex(active.price)}</strong>
              </p>
            </div>
          ) : null}
        </div>

        <ul className="intel-legend">
          <li>
            <i className="intel-swatch intel-swatch--demand" aria-hidden="true" /> Seasonal demand
          </li>
          <li>
            <i className="intel-swatch intel-swatch--price" aria-hidden="true" /> Seasonal price
          </li>
          <li className="intel-legend-note">
            {model.flat
              ? "This campaign runs a flat seasonal profile — nothing to time."
              : `Price swings ${formatPercent(model.swing)} across the year and trails demand.`}
          </li>
        </ul>

        <DataTable
          summary="Seasonal multipliers by period"
          head={["Period", "Season", "Demand", "Price"]}
          rows={model.points.map((point) => [
            `P${point.period}${point.period === model.current ? " (now)" : ""}`,
            seasonLabel(point.season),
            formatIndex(point.demand),
            formatIndex(point.price),
          ])}
        />
      </figure>
    </section>
  );
}

/* ================================================================== *
 * Shared pieces
 * ================================================================== */

function ChartPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="intel-placeholder">
      <svg className="intel-placeholder-glyph" viewBox="0 0 104 44" aria-hidden="true" focusable="false">
        <line className="intel-placeholder-axis" x1="8" y1="4" x2="8" y2="36" />
        <line className="intel-placeholder-axis" x1="8" y1="36" x2="96" y2="36" />
        <path className="intel-placeholder-line" d="M12 28 L34 22 L56 26 L78 15 L94 18" />
      </svg>
      <p className="intel-placeholder-title">{title}</p>
      <p className="intel-placeholder-note">{note}</p>
    </div>
  );
}

/** The keyboard and screen-reader path to every value a chart draws. */
function DataTable({
  summary,
  head,
  rows,
}: {
  summary: string;
  head: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  return (
    <details className="intel-table">
      <summary>{summary} — data table</summary>
      <div className="intel-table-scroll">
        <table>
          <caption className="intel-visually-hidden">{summary}</caption>
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
 * The house mark. Geometric, monochrome: a square block, two swept slashes and a
 * datum rule, inheriting currentColor so header and footer share one shape.
 */
function BlockAeroMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="img" aria-label="Block Aero" focusable="false">
      <rect className="intel-mark-frame" x="2.4" y="2.4" width="19.2" height="19.2" rx="1" />
      <path className="intel-mark-slash" d="M7.0 15.8 L11.0 8.2 L13.1 8.2 L9.1 15.8 Z" />
      <path className="intel-mark-slash" d="M11.9 15.8 L15.9 8.2 L18.0 8.2 L14.0 15.8 Z" />
      <line className="intel-mark-datum" x1="6.6" y1="18.1" x2="17.4" y2="18.1" />
    </svg>
  );
}

/* ================================================================== *
 * Derivations
 * ================================================================== */

function indexModels(observation: GameObservation): IndexModel[] {
  const history = observation.market.history;
  const window = clampInt(observation.calendar.periodsPerYear, 4, 104, 52);
  const target = observation.tick - window;

  /* The latest reading at or before a full year back. Falls back to the oldest
     reading on file, so a young campaign still gets an honest comparison. */
  let yearAgo: (typeof history)[number] | null = null;
  for (const point of history) {
    if (point.tick <= target) yearAgo = point;
  }
  const fullYear = yearAgo !== null;
  const against = yearAgo ?? (history.length > 1 ? history[0]! : null);

  function build(
    key: IndexModel["key"],
    label: string,
    blurb: string,
    value: number,
    pick: (point: (typeof history)[number]) => number,
  ): IndexModel {
    const sampled = sample(history.map(pick), SPARK_POINTS);
    const series = sampled.length > 0 ? [...sampled.slice(0, -1), value] : [];
    return {
      key,
      label,
      blurb,
      value,
      series,
      delta: against === null ? null : value - pick(against),
      againstTick: against?.tick ?? null,
      fullYear,
    };
  }

  return [
    build(
      "price",
      "Price index",
      "It sets what your stock is worth on paper and what a seller will hold out for.",
      observation.market.priceIndex,
      (point) => point.priceIndex,
    ),
    build(
      "demand",
      "Demand index",
      "It sets how many removals turn into requests, so it leads the price index.",
      observation.market.demandIndex,
      (point) => point.demandIndex,
    ),
  ];
}

function worldModel(observation: GameObservation): WorldModel {
  const market = observation.market;
  const tracked = Math.max(0, market.trackedAssets);
  const worldAssets = Math.max(0, market.worldAssets);
  const scale = tracked > 0 ? Math.round(worldAssets / tracked) : 0;
  const netRate = market.growthRate - market.retireRate;
  const doublingYears = netRate > 0.0005 ? Math.log(2) / Math.log(1 + netRate) : null;

  const history = market.history;
  const first = history[0] ?? null;
  const last = history[history.length - 1] ?? null;
  const span = first && last ? last.tick - first.tick : 0;
  const periods = clampInt(observation.calendar.periodsPerYear, 4, 104, 52);
  let observedRate: number | null = null;
  if (
    first !== null &&
    last !== null &&
    history.length >= TREND_MIN_POINTS &&
    span >= TREND_MIN_SPAN &&
    first.count > 0
  ) {
    observedRate = (last.count / first.count) ** (periods / span) - 1;
    if (!Number.isFinite(observedRate)) observedRate = null;
  }

  return {
    tracked,
    worldAssets,
    scale,
    growthRate: market.growthRate,
    retireRate: market.retireRate,
    netRate,
    netUnitsPerYear: Math.round(worldAssets * netRate),
    doublingYears,
    observedRate,
    observedSpan: span,
  };
}

/** Contiguous runs of one season, with the period at the centre of each run. */
function seasonBands(points: readonly SeasonPoint[]): { season: Season; centre: number }[] {
  const bands: { season: Season; from: number; to: number }[] = [];
  for (const point of points) {
    const open = bands[bands.length - 1];
    if (open && open.season === point.season) {
      open.to = point.period;
    } else {
      bands.push({ season: point.season, from: point.period, to: point.period });
    }
  }
  /* Winter wraps the year end, so its two runs collapse into the larger one. */
  const bySeason = new Map<Season, { season: Season; from: number; to: number }>();
  for (const band of bands) {
    const held = bySeason.get(band.season);
    if (!held || band.to - band.from > held.to - held.from) bySeason.set(band.season, band);
  }
  return [...bySeason.values()].map((band) => ({ season: band.season, centre: (band.from + band.to) / 2 }));
}

function focusText(view: ShockView): string {
  const region = view.regionName ?? "Worldwide";
  const ata = view.shock.ata === null ? "all chapters" : ataLabel(view.shock.ata);
  return `${region} · ${ata}`;
}

const SHOCK_KIND_LABELS: Record<MarketShock["kind"], string> = {
  fuel_spike: "Fuel spike",
  type_grounding: "Type grounding",
  lessor_default: "Lessor default",
  variant_launch: "Variant launch",
  supply_squeeze: "Supply squeeze",
  traffic_boom: "Traffic boom",
  credit_crunch: "Credit crunch",
};

function shockKindLabel(kind: MarketShock["kind"]): string {
  return SHOCK_KIND_LABELS[kind] ?? "Market shock";
}

/* ---------------------------------------------------------------- *
 * Geometry helpers
 * ---------------------------------------------------------------- */

function linePath(points: readonly { cx: number; cy: number }[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.cx.toFixed(2)} ${point.cy.toFixed(2)}`)
    .join(" ");
}

/** A bar with a 4px-equivalent rounded data end and a square baseline. */
function roundedBar(x: number, y: number, w: number, h: number, r: number, end: "right"): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (radius === 0 || end !== "right") return `M${x} ${y} h${w} v${h} h${-w} Z`;
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
  const wanted = [
    0,
    Math.round((count - 1) * 0.25),
    Math.round((count - 1) * 0.5),
    Math.round((count - 1) * 0.75),
    count - 1,
  ];
  return [...new Set(wanted)];
}

/** Evenly thin a series down to at most `max` points, keeping the ends. */
function sample(values: readonly number[], max: number): number[] {
  if (values.length <= max) return [...values];
  const out: number[] = [];
  for (let index = 0; index < max; index += 1) {
    const at = Math.round((index / (max - 1)) * (values.length - 1));
    out.push(values[at]!);
  }
  return out;
}

/** Weeks forward from `from` to `to` inside a wrapping year. */
function weeksAhead(from: number, to: number, periods: number): number {
  const diff = (to - from) % periods;
  return diff < 0 ? diff + periods : diff;
}

/* ---------------------------------------------------------------- *
 * Formatting
 * ---------------------------------------------------------------- */

/** Stagger index handed to CSS, so the entrance animation lives in the stylesheet. */
function indexVar(index: number): CSSProperties & Record<string, string | number> {
  return { "--intel-i": index };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampPercent(value: number): number {
  return Math.min(88, Math.max(12, value));
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return rounded < min ? min : rounded > max ? max : rounded;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Axis labels compact by the TICK STEP, never by the magnitude: a count moving
 * 40,100 → 40,400 would otherwise print "40K" on every gridline.
 */
function formatAxisValue(value: number, step: number): string {
  if (!Number.isFinite(value)) return "—";
  if (step >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (step >= 1_000) return `${Math.round(value / 1_000)}K`;
  return Math.round(value).toLocaleString("en-US");
}

function formatIndex(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

function signedIndex(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(3)}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const pct = value * 100;
  return `${Math.abs(pct) < 9.95 ? pct.toFixed(1) : Math.round(pct).toString()}%`;
}

function signedPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${formatPercent(Math.abs(value))}`;
}

function describeParity(value: number): string {
  const gap = value - 1;
  if (Math.abs(gap) < 0.002) return "Sitting on the annual baseline";
  return `${formatPercent(Math.abs(gap))} ${gap > 0 ? "above" : "below"} the annual baseline`;
}

function plural(count: number, noun: string): string {
  const n = Math.max(0, Math.round(count));
  return `${formatCount(n)} ${noun}${n === 1 ? "" : "s"}`;
}

/** Status ink for a signed value. Never used as a series colour. */
function deltaTone(value: number | null): string {
  if (value === null || Math.abs(value) < 1e-9) return "is-flat";
  return value > 0 ? "is-gain" : "is-loss";
}
