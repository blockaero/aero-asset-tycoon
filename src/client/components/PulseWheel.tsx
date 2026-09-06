import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { GameCalendar, LivePace, Season, TurnBudget } from "../../sim/types.ts";
import "./PulseWheel.css";

/* ------------------------------------------------------------------ *
 * Geometry. One circular control replaces the header pulse button, the
 * pace select and the pulse trail. Everything is laid out in a 148px
 * square so the SVG viewBox and the CSS agree without magic numbers.
 * ------------------------------------------------------------------ */

const SIZE = 148;
const CENTRE = SIZE / 2;
/** Outer timer arc. */
const TIMER_RADIUS = 66;
/** Inner budget-pressure arc. Quieter, thinner, set well inside the timer. */
const BUDGET_RADIUS = 55;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;
const BUDGET_CIRCUMFERENCE = 2 * Math.PI * BUDGET_RADIUS;
/** Where the radial menu items sit, measured from the centre. */
const MENU_RADIUS = 98;
const LONG_PRESS_MS = 450;
const FLASH_MS = 1100;

/** Seasonal hue for the disc wash. Kept desaturated in CSS so the face stays readable. */
const SEASON_HUE: Record<Season, number> = {
  winter: 210,
  spring: 160,
  summer: 45,
  autumn: 28,
};

const SEASON_LABEL: Record<Season, string> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
};

const PACE_ORDER: readonly LivePace[] = ["fast", "medium", "slow"];

const PACE_LABEL: Record<LivePace, string> = {
  fast: "Fast",
  medium: "Medium",
  slow: "Slow",
};

const PACE_HINT: Record<LivePace, string> = {
  fast: "Short pulse",
  medium: "Standard pulse",
  slow: "Long pulse",
};

/** Disc face texture. Absent until the art pass runs, so the aluminium block shows through. */
const FACE_ART = "assets/gen/pulse-wheel-face.svg";

export type PulseWheelProps = {
  calendar: GameCalendar;
  /** 0..1 through the current live pulse. Driven from outside; never timed in here. */
  progress: number;
  paused: boolean;
  busy: boolean;
  pendingCount: number;
  pace: LivePace;
  budget: TurnBudget;
  /** ACC change from the last resolved pulse. Flashes the ring once per change. */
  lastDelta: number | null;
  onPulse: () => void;
  onPause: () => void;
  onPace: (pace: LivePace) => void;
};

export function PulseWheel({
  calendar,
  progress,
  paused,
  busy,
  pendingCount,
  pace,
  budget,
  lastDelta,
  onPulse,
  onPause,
  onPace,
}: PulseWheelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const discRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const previousDelta = useRef<number | null>(lastDelta);
  const flashNonce = useRef(0);

  const [menuOpen, setMenuOpen] = useState(false);
  const [artBroken, setArtBroken] = useState(false);
  const [flash, setFlash] = useState<{ tone: "gain" | "loss"; nonce: number } | null>(null);

  const describedBy = useId();
  const menuId = useId();

  const fraction = clamp01(progress);
  const daylight = daylightCurve(fraction);
  const timeRatio = ratio(budget.timeSpent, budget.timeTotal);
  const unit = periodUnit(calendar.periodsPerYear);
  const seasonLabel = SEASON_LABEL[calendar.season];

  /* ---- one flash per lastDelta change, not per render ---- */
  useEffect(() => {
    if (lastDelta === previousDelta.current) return;
    previousDelta.current = lastDelta;
    if (lastDelta === null) {
      setFlash(null);
      return;
    }
    flashNonce.current += 1;
    setFlash({ tone: lastDelta >= 0 ? "gain" : "loss", nonce: flashNonce.current });
  }, [lastDelta]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  /* ---- long press ---- */
  const cancelPress = useCallback(() => {
    if (pressTimer.current === null) return;
    window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }, []);

  useEffect(() => cancelPress, [cancelPress]);

  const closeMenu = useCallback(
    (returnFocus: boolean) => {
      setMenuOpen(false);
      if (returnFocus) discRef.current?.focus();
    },
    [],
  );

  /* ---- dismiss the radial menu ---- */
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeMenu(true);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      closeMenu(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menuOpen]);

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    longPressFired.current = false;
    cancelPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      longPressFired.current = true;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  }

  function handleDiscClick() {
    cancelPress();
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (busy) return;
    onPulse();
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    cancelPress();
    longPressFired.current = true;
    setMenuOpen(true);
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const navigation = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!navigation.includes(event.key)) return;
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (buttons.length === 0) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1 + buttons.length) % buttons.length;
    else next = (current - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  const status: "busy" | "paused" | "running" = busy ? "busy" : paused ? "paused" : "running";
  const periodLine = `${unit.short} ${calendar.period} / ${calendar.periodsPerYear}`;
  const phaseLine = `Q${calendar.quarter} · ${seasonLabel}`;
  const discLabel = pendingCount > 0
    ? `Resolve ${unit.long} ${calendar.period} of ${calendar.year}. ${pendingCount} ${pendingCount === 1 ? "command" : "commands"} queued.`
    : `Resolve ${unit.long} ${calendar.period} of ${calendar.year}.`;

  const rootStyle: CSSProperties & Record<string, string | number> = {
    "--season-hue": String(SEASON_HUE[calendar.season]),
    "--daylight": daylight.toFixed(3),
    "--pw-light-x": `${(12 + 76 * fraction).toFixed(1)}%`,
    "--pw-light-y": `${(74 - 52 * Math.sin(Math.PI * fraction)).toFixed(1)}%`,
  };

  const menuItems: MenuItem[] = [
    {
      key: "hold",
      label: paused ? "Resume" : "Pause",
      hint: paused ? "Restart the clock" : "Hold the clock",
      role: "menuitem",
      checked: null,
      onSelect: onPause,
    },
    ...PACE_ORDER.map<MenuItem>((value) => ({
      key: value,
      label: PACE_LABEL[value],
      hint: PACE_HINT[value],
      role: "menuitemradio",
      checked: value === pace,
      onSelect: () => onPace(value),
    })),
  ];

  return (
    <div
      ref={rootRef}
      className={`pulsewheel${paused ? " is-paused" : ""}${busy ? " is-busy" : ""}${menuOpen ? " is-open" : ""}`}
      style={rootStyle}
    >
      <svg
        className="pulsewheel-ring"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
        focusable="false"
      >
        <circle className="pulsewheel-bezel" cx={CENTRE} cy={CENTRE} r={70.5} />
        <g transform={`rotate(-90 ${CENTRE} ${CENTRE})`}>
          <circle className="pulsewheel-track" cx={CENTRE} cy={CENTRE} r={TIMER_RADIUS} />
          <circle
            className="pulsewheel-timer"
            cx={CENTRE}
            cy={CENTRE}
            r={TIMER_RADIUS}
            strokeDasharray={`${(TIMER_CIRCUMFERENCE * fraction).toFixed(2)} ${TIMER_CIRCUMFERENCE.toFixed(2)}`}
          />
          <circle className="pulsewheel-budget-track" cx={CENTRE} cy={CENTRE} r={BUDGET_RADIUS} />
          <circle
            className={`pulsewheel-budget${timeRatio >= 1 ? " is-spent" : timeRatio >= 0.85 ? " is-tight" : ""}`}
            cx={CENTRE}
            cy={CENTRE}
            r={BUDGET_RADIUS}
            strokeDasharray={`${(BUDGET_CIRCUMFERENCE * timeRatio).toFixed(2)} ${BUDGET_CIRCUMFERENCE.toFixed(2)}`}
          />
        </g>
        {flash && (
          <circle
            key={flash.nonce}
            className={`pulsewheel-flash pulsewheel-flash--${flash.tone}`}
            cx={CENTRE}
            cy={CENTRE}
            r={TIMER_RADIUS}
          />
        )}
      </svg>

      <span className="pulsewheel-status" data-state={status} aria-hidden="true" />

      <button
        ref={discRef}
        type="button"
        className="pulsewheel-disc"
        disabled={busy}
        aria-label={discLabel}
        aria-describedby={describedBy}
        aria-busy={busy}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onClick={handleDiscClick}
        onContextMenu={handleContextMenu}
      >
        <span className="pulsewheel-face" aria-hidden="true" />
        <span className="pulsewheel-season" aria-hidden="true" />
        <span className="pulsewheel-night" aria-hidden="true" />
        <span className="pulsewheel-sun" aria-hidden="true" />
        {!artBroken && (
          <img
            className="pulsewheel-art"
            src={`${import.meta.env.BASE_URL}${FACE_ART}`}
            alt=""
            aria-hidden="true"
            draggable={false}
            onError={() => setArtBroken(true)}
          />
        )}
        <span className="pulsewheel-plate" aria-hidden="true" />
        <span className="pulsewheel-readout">
          <span className="pulsewheel-period">{periodLine}</span>
          <span className="pulsewheel-year">{calendar.year}</span>
          <span className="pulsewheel-phase">{phaseLine}</span>
        </span>
      </button>

      {pendingCount > 0 && (
        <span className="pulsewheel-badge" aria-hidden="true">
          {pendingCount > 99 ? "99+" : pendingCount}
        </span>
      )}

      <button
        type="button"
        className="pulsewheel-more"
        aria-label="Pulse controls: pause and pace"
        title="Pulse controls — pause and pace"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => (menuOpen ? closeMenu(false) : setMenuOpen(true))}
      >
        <svg viewBox="0 0 18 6" width="18" height="6" aria-hidden="true" focusable="false">
          <circle cx="3" cy="3" r="1.6" />
          <circle cx="9" cy="3" r="1.6" />
          <circle cx="15" cy="3" r="1.6" />
        </svg>
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          id={menuId}
          className="pulsewheel-menu"
          role="menu"
          aria-label="Pulse controls"
          onKeyDown={handleMenuKeyDown}
        >
          {menuItems.map((item, index) => {
            const angle = (-120 + index * 80) * (Math.PI / 180);
            const style: CSSProperties = {
              left: `${CENTRE + MENU_RADIUS * Math.sin(angle)}px`,
              top: `${CENTRE - MENU_RADIUS * Math.cos(angle)}px`,
            };
            return (
              <button
                key={item.key}
                type="button"
                className="pulsewheel-menu-item"
                role={item.role}
                aria-checked={item.checked === null ? undefined : item.checked}
                style={style}
                onClick={() => {
                  item.onSelect();
                  closeMenu(true);
                }}
              >
                <span className="pulsewheel-menu-label">{item.label}</span>
                <span className="pulsewheel-menu-hint">{item.hint}</span>
              </button>
            );
          })}
        </div>
      )}

      <span id={describedBy} className="pulsewheel-sr">
        {`${statusSentence(status)} Pulse ${Math.round(fraction * 100)} percent elapsed. `}
        {`Founder time ${tidy(budget.timeSpent)} of ${tidy(budget.timeTotal)} spent. `}
        {`Relationship capital ${tidy(budget.rcSpent)} of ${tidy(budget.rcTotal)} spent. `}
        {`Pace ${PACE_LABEL[pace].toLowerCase()}. Long press or right click the wheel for pulse controls.`}
      </span>
    </div>
  );
}

type MenuItem = {
  key: string;
  label: string;
  hint: string;
  role: "menuitem" | "menuitemradio";
  checked: boolean | null;
  onSelect: () => void;
};

export type PulseWheelLegendProps = {
  /** Extra class for the host layout. The legend brings no margins of its own. */
  className?: string;
};

/** First-run hint naming the two arcs so the wheel reads without a tooltip. */
export function PulseWheelLegend({ className }: PulseWheelLegendProps) {
  return (
    <dl className={className ? `pulsewheel-legend ${className}` : "pulsewheel-legend"}>
      <div className="pulsewheel-legend-row">
        <dt>
          <span className="pulsewheel-legend-swatch pulsewheel-legend-swatch--timer" aria-hidden="true" />
          Outer arc
        </dt>
        <dd>Time left in this pulse. Fills clockwise, then the week resolves.</dd>
      </div>
      <div className="pulsewheel-legend-row">
        <dt>
          <span className="pulsewheel-legend-swatch pulsewheel-legend-swatch--budget" aria-hidden="true" />
          Inner arc
        </dt>
        <dd>Founder hours spent this turn. It turns amber as the budget runs out.</dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function ratio(spent: number, total: number): number {
  if (!Number.isFinite(spent) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, spent / total));
}

/**
 * Dawn to noon to dusk to night across one pulse. Floored so the disc never goes
 * fully black and the readout stays legible at every point in the cycle.
 */
function daylightCurve(fraction: number): number {
  const lit = Math.sin(Math.PI * fraction) ** 0.7;
  return 0.05 + 0.95 * (Number.isFinite(lit) ? lit : 0);
}

function periodUnit(periodsPerYear: number): { short: string; long: string } {
  if (periodsPerYear >= 52) return { short: "WK", long: "week" };
  if (periodsPerYear === 12) return { short: "MO", long: "month" };
  if (periodsPerYear === 4) return { short: "QTR", long: "quarter" };
  return { short: "P", long: "period" };
}

function statusSentence(status: "busy" | "paused" | "running"): string {
  if (status === "busy") return "Resolving.";
  if (status === "paused") return "Clock held.";
  return "Clock running.";
}

function tidy(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
