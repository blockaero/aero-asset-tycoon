import type { CSSProperties, KeyboardEvent } from "react";
import type { GameObservation } from "../sim/observation.ts";
import type { NetworkNode } from "../sim/types.ts";
import {
  EAST_MERIDIAN,
  LAND_MASSES,
  WEST_MERIDIAN,
  graticuleLines,
  meridianPath,
  pointsToPath,
  projectToInset,
  regionFillPoints,
  regionLabelAnchor,
} from "./chart-geometry.ts";
import { REGION_HULLS, facilityForNode, nodesInRegion, regionById } from "./navigation.ts";

/** Inline custom properties so SVG fill/stroke can resolve tokens (HTML inheritance is unreliable). */
const CHART_STYLE = {
  "--chart-paper": "#f3ead2",
  "--chart-water": "#c5d2d8",
  "--chart-land": "#e2d6bc",
  "--chart-border": "#2f6b4f",
  "--chart-route": "#c43c32",
  "--chart-ink": "#2a2a28",
} as CSSProperties;

export function WorldAtlas({
  observation,
  onEnterRegion,
}: {
  observation: GameObservation;
  onEnterRegion: (regionId: string) => void;
}) {
  const hq = observation.nodes.find((node) => node.role === "hq");
  return (
    <section className="atlas-scene" aria-label="World map">
      <div className="map-layout atlas-layout">
        <article className="airmail-poster">
          <header className="chart-masthead">
            <p className="eyebrow">AERONAUTICAL CHART / THEATERS OF OPERATION</p>
            <h2>Landing fields of the aftermarket</h2>
            <span>Rev 03 · Green line is the shared border</span>
          </header>
          <svg
            className="world-chart"
            style={CHART_STYLE}
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            aria-label="World regions"
          >
            <ChartDefs idPrefix="world" />
            <rect className="chart-water" width="100" height="100" />
            <rect width="100" height="100" fill="url(#world-hatch)" opacity="0.35" />
            <g clipPath="url(#world-clip)">
              {LAND_MASSES.map((d, index) => (
                <path key={index} className="chart-land" d={d} />
              ))}
              <g className="chart-graticule" aria-hidden="true">
                {graticuleLines().map((line) => (
                  <line key={line.key} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
                ))}
              </g>
              {REGION_HULLS.map((region) => {
                const nodes = nodesInRegion(observation.nodes, region.id);
                const charted = nodes.some((node) => node.state !== "locked");
                const [lx, ly] = regionLabelAnchor(region.id);
                return (
                  <g key={region.id} className={`region-cell ${region.id} ${charted ? "charted" : "fogged"}`}>
                    <path
                      d={pointsToPath(regionFillPoints(region.id))}
                      tabIndex={0}
                      role="button"
                      aria-label={`Enter ${region.label} region`}
                      onClick={() => onEnterRegion(region.id)}
                      onKeyDown={activate(() => onEnterRegion(region.id))}
                    />
                    <text className="region-numeral" x={lx} y={ly - 3} textAnchor="middle">{region.numeral}</text>
                    <text className="region-name" x={lx} y={ly + 5} textAnchor="middle">{region.label}</text>
                  </g>
                );
              })}
            </g>
            <path className="region-border-halo" d={meridianPath(WEST_MERIDIAN)} />
            <path className="region-border-halo" d={meridianPath(EAST_MERIDIAN)} />
            <path className="region-border" d={meridianPath(WEST_MERIDIAN)} />
            <path className="region-border" d={meridianPath(EAST_MERIDIAN)} />
            <rect className="chart-frame" x="1.5" y="2" width="97" height="96" />
            {hq && observation.nodes.filter((node) => node.id !== hq.id && node.state !== "locked").map((node) => (
              <line
                key={`route-${node.id}`}
                className="airmail-route"
                x1={hq.x}
                y1={hq.y}
                x2={node.x}
                y2={node.y}
              />
            ))}
            {observation.nodes.map((node) => (
              <AerodromeDot key={node.id} node={node} />
            ))}
          </svg>
          <div className="chart-insets">
            {REGION_HULLS.map((region) => {
              const nodes = nodesInRegion(observation.nodes, region.id);
              const projected = projectToInset(nodes);
              return (
                <button
                  key={region.id}
                  type="button"
                  className="chart-inset"
                  onClick={() => onEnterRegion(region.id)}
                  aria-label={`${region.label} vicinity chart`}
                >
                  <span className="inset-label">{region.numeral} · {region.label} and vicinity</span>
                  <svg style={CHART_STYLE} viewBox="0 0 100 100" aria-hidden="true">
                    <rect className="chart-water" width="100" height="100" />
                    {nodes.map((node) => {
                      const point = projected[node.id] ?? [50, 50];
                      return <AerodromeDot key={node.id} node={node} x={point[0]} y={point[1]} />;
                    })}
                  </svg>
                </button>
              );
            })}
          </div>
        </article>
        <aside className="node-sheet chart-legend">
          <p className="eyebrow">WORLD / REGIONS</p>
          <h3>Chart a theater</h3>
          <p className="locked-note">
            Borders are shared meridians. Facilities become interactable after you enter a theater. Discovery still follows the relationship ladder.
          </p>
          <ul className="aerodrome-key">
            <li><i className="key-dot partner" /> Charted field</li>
            <li><i className="key-dot locked" /> Uncharted field</li>
            <li><i className="key-route" /> Airmail route</li>
          </ul>
          {REGION_HULLS.map((region) => {
            const nodes = nodesInRegion(observation.nodes, region.id);
            const visible = nodes.filter((node) => node.state !== "locked").length;
            return (
              <article key={region.id} className="region-card">
                <p className="eyebrow">{region.numeral} · {region.code}</p>
                <strong>{region.label}</strong>
                <p>{visible} of {nodes.length} landing fields charted</p>
                <button type="button" className="primary small" onClick={() => onEnterRegion(region.id)}>
                  Enter {region.label}
                </button>
              </article>
            );
          })}
        </aside>
      </div>
    </section>
  );
}

export function RegionLandingChart({
  observation,
  regionId,
  onEnterPlace,
}: {
  observation: GameObservation;
  regionId: string;
  onEnterPlace: (nodeId: string) => void;
}) {
  const region = regionById(regionId);
  const nodes = nodesInRegion(observation.nodes, regionId);
  const hq = observation.nodes.find((node) => node.role === "hq");
  return (
    <article className="airmail-poster region-poster">
      <header className="chart-masthead">
        <p className="eyebrow">LANDING FIELD CHART / {region.code}</p>
        <h2>{region.label} and vicinity</h2>
        <span>Rev 03 · Shared green meridians</span>
      </header>
      <svg
        className="region-chart"
        style={CHART_STYLE}
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        aria-label={`${region.label} landing fields`}
      >
        <ChartDefs idPrefix={`region-${regionId}`} />
        <rect className="chart-water" width="100" height="100" />
        <rect width="100" height="100" fill={`url(#region-${regionId}-hatch)`} opacity="0.3" />
        <g clipPath={`url(#region-${regionId}-clip)`}>
          {LAND_MASSES.map((d, index) => (
            <path key={index} className="chart-land" d={d} />
          ))}
          <g className="chart-graticule" aria-hidden="true">
            {graticuleLines().map((line) => (
              <line key={line.key} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
            ))}
          </g>
          {REGION_HULLS.map((cell) => (
            <path
              key={cell.id}
              className={`region-cell-fill ${cell.id} ${cell.id === regionId ? "active" : "dim"}`}
              d={pointsToPath(regionFillPoints(cell.id))}
            />
          ))}
        </g>
        <path className="region-border-halo" d={meridianPath(WEST_MERIDIAN)} />
        <path className="region-border-halo" d={meridianPath(EAST_MERIDIAN)} />
        <path className="region-border" d={meridianPath(WEST_MERIDIAN)} />
        <path className="region-border" d={meridianPath(EAST_MERIDIAN)} />
        <rect className="chart-frame" x="1.5" y="2" width="97" height="96" />
        {hq && nodes.filter((node) => node.id !== hq.id && node.state !== "locked").map((node) => (
          <line key={`route-${node.id}`} className="airmail-route" x1={hq.x} y1={hq.y} x2={node.x} y2={node.y} />
        ))}
        {nodes.map((node) => {
          const locked = node.state === "locked";
          const facility = facilityForNode(observation.facilities, node);
          const title = locked
            ? "Uncharted facility"
            : node.role === "hq"
              ? "Tokyo HQ"
              : facility?.name ?? node.label;
          return (
            <g
              key={node.id}
              className={`landing-pin ${node.state}`}
              transform={`translate(${node.x} ${node.y})`}
              role="button"
              tabIndex={locked ? -1 : 0}
              aria-label={locked ? title : `${title} landing field`}
              aria-disabled={locked}
              onClick={() => {
                if (!locked) onEnterPlace(node.id);
              }}
              onKeyDown={activate(() => {
                if (!locked) onEnterPlace(node.id);
              })}
            >
              <circle className="pin-hit" r="4" />
              <AerodromeDot node={node} x={0} y={0} />
              <text className="pin-label" x="0" y={node.y > 88 ? -5 : 7} textAnchor="middle">
                {locked ? "·" : node.role === "hq" ? "HQ" : node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </article>
  );
}

function ChartDefs({ idPrefix }: { idPrefix: string }) {
  return (
    <defs>
      <clipPath id={`${idPrefix}-clip`}>
        <rect x="1.5" y="2" width="97" height="96" />
      </clipPath>
      <pattern id={`${idPrefix}-hatch`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(42)">
        <path d="M 0 0 L 0 3" stroke="rgba(80, 72, 58, 0.18)" strokeWidth="0.35" fill="none" />
      </pattern>
    </defs>
  );
}

function AerodromeDot({
  node,
  x,
  y,
}: {
  node: NetworkNode;
  x?: number;
  y?: number;
}) {
  const cx = x ?? node.x;
  const cy = y ?? node.y;
  const r = node.role === "hq" ? 1.7 : 1.15;
  return (
    <g className="aerodrome-mark" pointerEvents="none">
      {node.role === "hq" && (
        <>
          <line className="aerodrome-tick" x1={cx - 3.1} y1={cy} x2={cx + 3.1} y2={cy} />
          <line className="aerodrome-tick" x1={cx} y1={cy - 3.1} x2={cx} y2={cy + 3.1} />
        </>
      )}
      <circle
        className={`aerodrome ${node.state} ${node.role === "hq" ? "hq" : ""}`}
        cx={cx}
        cy={cy}
        r={r}
      />
    </g>
  );
}

function activate(fn: () => void) {
  return (event: KeyboardEvent<SVGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fn();
    }
  };
}
