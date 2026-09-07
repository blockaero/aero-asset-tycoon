import { useState, type CSSProperties, type ReactNode } from "react";
import { ATA_GROUP_LABELS, ataGroupOf, ataLabel, ataTitle } from "../../sim/ata.ts";
import type { GameObservation } from "../../sim/observation.ts";
import type { Season } from "../../sim/types.ts";
import "./OfficeHQ.css";
import { useArtSource } from "../art/ArtImage.tsx";

/** Which surface a hotspot opens. Monitors map straight onto onOpenMonitor. */
export type OfficeHQMonitor = "finance" | "fleet" | "intel";

type HotspotId = OfficeHQMonitor | "wall" | "team";

export type OfficeHQProps = {
  observation: GameObservation;
  onOpenMonitor: (which: OfficeHQMonitor) => void;
  onOpenWall: () => void;
  onOpenTeam: () => void;
  onOpenMap: () => void;
};

/** Frames hung on the certificate wall art. Drives the empty/filled cross-fade. */
const WALL_FRAMES = 12;

/**
 * Desks the founder can staff before Tribal Knowledge widens the room. The
 * operations branch raises the ceiling one node at a time, so the display cap
 * tracks completed knowledge until the engine publishes a cap of its own.
 */
const BASE_TEAM_CAP = 2;

/**
 * Sky tint per season. All four sit in the cool corporate band except autumn,
 * which warms toward late afternoon. No foliage, no seasonal greenery.
 */
const SEASON_HUE: Record<Season, number> = {
  winter: 214,
  spring: 202,
  summer: 196,
  autumn: 28,
};

export function OfficeHQ({
  observation,
  onOpenMonitor,
  onOpenWall,
  onOpenTeam,
  onOpenMap,
}: OfficeHQProps): ReactNode {
  const [active, setActive] = useState<HotspotId | null>(null);

  const identity = observation.company?.identity;
  const companyName = identity?.companyName ?? "Unnamed Holdings";
  const founderName = identity?.founderName ?? "Founder";
  const portraitId = identity?.portraitId ?? "founder-white-woman";

  const knowledge = observation.company?.knowledge ?? [];
  const certifications = knowledge.filter((entry) => entry.completedTick !== null).length;
  const wallFill = Math.min(1, Math.max(0, certifications / WALL_FRAMES));

  const team = observation.company?.team ?? [];
  const teamCap = Math.max(team.length, BASE_TEAM_CAP + certifications);

  const season = observation.calendar?.season ?? "winter";
  const inventory = observation.inventory ?? [];
  const ataRollup = observation.ataInventory ?? [];
  const topAta = ataRollup[0];
  const demandIndex = observation.market?.demandIndex ?? 1;

  const hotspots: { id: HotspotId; label: string; stat: string }[] = [
    {
      id: "finance",
      label: "Finance",
      stat: `${formatAcc(observation.firm.accBalance)} ACC on hand`,
    },
    {
      id: "fleet",
      label: "Fleet Manager",
      stat: topAta
        ? `${inventory.length.toLocaleString("en-US")} units · ${ataLabel(topAta.code)} leads by value`
        : `${inventory.length.toLocaleString("en-US")} units · no ATA chapters held yet`,
    },
    {
      id: "intel",
      label: "Market Intelligence",
      stat: `Demand index ${demandIndex.toFixed(2)}`,
    },
    {
      id: "wall",
      label: "Tribal Knowledge",
      stat: `${certifications} of ${WALL_FRAMES} certifications earned`,
    },
    {
      id: "team",
      label: "Team",
      stat: `${team.length} of ${teamCap} seats filled`,
    },
  ];

  const monitorsLit = active === "finance" || active === "fleet" || active === "intel";

  const stageStyle = {
    "--officehq-season-hue": String(SEASON_HUE[season]),
    "--officehq-wall-fill": String(wallFill),
  } as CSSProperties;

  function openHotspot(id: HotspotId): void {
    if (id === "wall") {
      onOpenWall();
      return;
    }
    if (id === "team") {
      onOpenTeam();
      return;
    }
    onOpenMonitor(id);
  }

  function hold(id: HotspotId): void {
    setActive(id);
  }

  function release(id: HotspotId): void {
    setActive((current) => (current === id ? null : current));
  }

  return (
    <div className="officehq">
      <div className="officehq-stage" style={stageStyle}>
        <HqLayer modifier="window" name="hq-window" alt="">
          <span className="officehq-sweep" aria-hidden="true" />
        </HqLayer>

        <HqLayer modifier="room" name="hq-room" alt="" />

        {/* The office turns over once per six-minute ambient cycle: the night plate
            cross-fades in and back out on the same 360s loop as everything else, and
            holds at zero under reduced motion. */}
        <HqLayer modifier="room-night" name="hq-room-night" alt="" />

        <HqLayer modifier="wall-empty" name="hq-wall-empty" alt="" />
        <HqLayer
          modifier="wall-filled"
          name="hq-wall-filled"
          alt=""
          style={{ opacity: wallFill }}
        />

        <HqLayer
          modifier="monitors"
          name="hq-monitors-idle"
          alt=""
          behind={
            <>
              <span className="officehq-screen officehq-screen--left" aria-hidden="true" />
              <span className="officehq-screen officehq-screen--centre" aria-hidden="true" />
              <span className="officehq-screen officehq-screen--right" aria-hidden="true" />
            </>
          }
        >
          <span className="officehq-glow officehq-glow--left" aria-hidden="true" />
          <span className="officehq-glow officehq-glow--centre" aria-hidden="true" />
          <span className="officehq-glow officehq-glow--right" aria-hidden="true" />
          <svg
            className="officehq-chart"
            viewBox="0 0 100 48"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path className="officehq-chart-line" d={chartPath(observation.market?.history)} pathLength={100} />
          </svg>
          <span className="officehq-readout" aria-hidden="true">
            {ataRollup.slice(0, 3).map((row) => (
              <span key={row.code} className="officehq-readout-row">
                <b>ATA {String(row.code).padStart(2, "0")}</b>
                <i>{ataTitle(row.code)}</i>
              </span>
            ))}
            {ataRollup.length === 0 ? (
              <span className="officehq-readout-row">
                <b>ATA —</b>
                <i>No chapters held</i>
              </span>
            ) : null}
          </span>
        </HqLayer>

        <HqLayer
          modifier="monitors-lit"
          name="hq-monitors-lit"
          alt=""
          style={{ opacity: monitorsLit ? 1 : 0 }}
        />

        {/* Prefer a back view of the chosen avatar standing at the desk. Until that
            art exists the generic silhouette stands in, and only then does the face
            inset appear: on a real back view a floating portrait would read as a
            face on the back of a head. */}
        <HqLayer
          modifier="founder"
          name={[founderShot(portraitId), "hq-founder-idle"]}
          alt=""
          renderBehind={(idIndex) =>
            idIndex > 0 ? (
              <HqArt
                className="officehq-portrait"
                name={portraitId}
                alt={`${founderName}, founder`}
              />
            ) : null
          }
        />

        <HqLayer
          modifier="side-screen"
          name="hq-side-screen"
          alt=""
          behind={<span className="officehq-screen officehq-screen--side" aria-hidden="true" />}
        >
          <span className="officehq-call-dot" aria-hidden="true" />
        </HqLayer>

        <HqLayer modifier="foreground" name="hq-foreground" alt="">
          <svg
            className="officehq-steam"
            viewBox="0 0 24 40"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M8 38 C 4 28, 12 24, 8 14 C 6 8, 10 4, 9 0" />
            <path d="M15 38 C 12 30, 19 25, 15 15 C 13 9, 17 5, 16 1" />
          </svg>
          <span className="officehq-phone-light" aria-hidden="true" />
        </HqLayer>

        <div className="officehq-nameplate">
          <span className="officehq-nameplate-company">{companyName}</span>
          <span className="officehq-nameplate-founder">{founderName} · Founder</span>
        </div>

        {hotspots.map((spot) => (
          <button
            key={spot.id}
            type="button"
            className={`officehq-hotspot officehq-hotspot--${spot.id}`}
            data-active={active === spot.id ? "true" : undefined}
            aria-label={`${spot.label}. ${spot.stat}`}
            onClick={() => openHotspot(spot.id)}
            onMouseEnter={() => hold(spot.id)}
            onMouseLeave={() => release(spot.id)}
            onFocus={() => hold(spot.id)}
            onBlur={() => release(spot.id)}
          >
            <span className="officehq-chip" aria-hidden="true">
              <span className="officehq-chip-label">{spot.label}</span>
              <span className="officehq-chip-stat">{spot.stat}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="officehq-strip">
        {hotspots.map((spot) => (
          <button
            key={spot.id}
            type="button"
            className="officehq-strip-button"
            data-active={active === spot.id ? "true" : undefined}
            onClick={() => openHotspot(spot.id)}
            onMouseEnter={() => hold(spot.id)}
            onMouseLeave={() => release(spot.id)}
            onFocus={() => hold(spot.id)}
            onBlur={() => release(spot.id)}
          >
            <span className="officehq-strip-label">{spot.label}</span>
            <span className="officehq-strip-stat">{spot.stat}</span>
          </button>
        ))}
        <button type="button" className="officehq-strip-button officehq-strip-button--map" onClick={onOpenMap}>
          <span className="officehq-strip-label">Network Map</span>
          <span className="officehq-strip-stat">
            {topAta
              ? `Step away from the desk · ${ATA_GROUP_LABELS[ataGroupOf(topAta.code)]} focus`
              : "Step away from the desk"}
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * One parallax plate. The art may not exist yet, so a missing file drops the
 * <img> and lets the layer's token-coloured gradient fallback carry the layout.
 */
function HqLayer({
  modifier,
  name,
  alt,
  style,
  behind,
  children,
  renderBehind,
}: {
  modifier: string;
  /** A shot id, or a preference list tried in order before giving up. */
  name: string | string[];
  alt: string;
  style?: CSSProperties;
  behind?: ReactNode;
  children?: ReactNode;
  /** Behind-content that depends on which shot in the list actually loaded. */
  renderBehind?: (idIndex: number) => ReactNode;
}): ReactNode {
  const art = useArtSource(name);
  return (
    <div
      className={`officehq-layer officehq-layer--${modifier}`}
      style={style}
      data-missing={art.exhausted ? "true" : undefined}
    >
      {behind}
      {renderBehind?.(art.idIndex)}
      {art.exhausted ? null : (
        <img
          className="officehq-art"
          src={art.src}
          alt={alt}
          draggable={false}
          onError={art.onError}
        />
      )}
      {children}
    </div>
  );
}

/**
 * The back-view shot for a chosen avatar. Portrait ids are `founder-<who>`; the
 * matching scene shot is `hq-founder-<who>`, so the two stay obviously paired.
 */
function founderShot(portraitId: string): string {
  return `hq-founder-${portraitId.replace(/^founder-/, "")}`;
}

/** A single piece of art that vanishes rather than breaking the layout. */
function HqArt({
  className,
  name,
  alt,
}: {
  className: string;
  name: string;
  alt: string;
}): ReactNode {
  // Prefers a real .webp render, falls back to the procedural .svg, then to the
  // CSS plate keyed off data-missing.
  const art = useArtSource(name);
  return (
    <span className={className} data-missing={art.exhausted ? "true" : undefined}>
      {art.exhausted ? null : (
        <img src={art.src} alt={alt} draggable={false} onError={art.onError} />
      )}
    </span>
  );
}

/** Demand history as a normalised polyline for the centre monitor. */
function chartPath(history: GameObservation["market"]["history"] | undefined): string {
  const points = (history ?? []).slice(-18);
  if (points.length < 2) return "M 0 30 L 50 26 L 100 30";
  const values = points.map((point) => point.demandIndex);
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 44 - ((point.demandIndex - low) / span) * 36;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function formatAcc(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1_000)}K`;
  return Math.round(value).toLocaleString("en-US");
}
