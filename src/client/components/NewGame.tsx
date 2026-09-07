import { useId, useState, type ReactNode } from "react";
import {
  FOUNDER_PORTRAITS,
  MAX_IDENTITY_LENGTH,
  rollCompanyName,
  rollFounderName,
  sanitizeIdentity,
  seedFromCompanyName,
  type PortraitOption,
} from "../../sim/identity.ts";
import { Rng } from "../../sim/rng.ts";
import type { LivePace } from "../../sim/types.ts";
import "./NewGame.css";
import { useArtSource } from "../art/ArtImage.tsx";
import { EmptyArt } from "../art/ShotArt.tsx";

/** One row of the save list the shell hands down. */
export type NewGameSave = {
  id: string;
  savedAt: string;
  tick: number;
  seed: number;
};

/** Everything the shell needs to open a campaign. */
export type NewGameStartInput = {
  seed: number;
  pace: LivePace;
  ticks: number;
  scenario: "prototype" | "full";
  companyName: string;
  founderName: string;
  portraitId: string;
};

export type NewGameProps = {
  busy: boolean;
  error: string;
  saves: NewGameSave[];
  onStart: (input: NewGameStartInput) => void;
  onLoad: (saveId: string) => void;
};

/** Campaign lengths, in weekly pulses. */
const PROTOTYPE_TICKS = 24;
const FULL_TICKS = 100;

/** Seconds of wall clock per weekly pulse, matching the live runner. */
const PACE_SECONDS: Record<LivePace, number> = { fast: 25, medium: 50, slow: 75 };

const PACE_LABELS: Record<LivePace, string> = {
  fast: "Fast",
  medium: "Measured",
  slow: "Deliberate",
};

/**
 * Base for the roll Rng. Every roll seeds a fresh Rng from this plus a counter
 * the component keeps in state, so two clicks give two names and the component
 * never reaches for Math.random or Date.now.
 */
const ROLL_SEED_BASE = 0x5ea51de5;

/** Channel separates the company roll from the founder roll at the same count. */
function rollSeed(counter: number, channel: number): number {
  return (ROLL_SEED_BASE + counter * 0x9e3779b1 + channel * 0x85ebca6b) >>> 0;
}

const PRESENTATION_WORD: Record<PortraitOption["presentation"], string> = {
  feminine: "feminine-presenting",
  masculine: "masculine-presenting",
};

const HERITAGE_WORD: Record<PortraitOption["heritage"], string> = {
  white: "white",
  black: "Black",
  asian: "Asian",
  mixed: "mixed heritage",
};

function describePortrait(portrait: PortraitOption): string {
  return `${portrait.label}, ${PRESENTATION_WORD[portrait.presentation]} founder, ${HERITAGE_WORD[portrait.heritage]}`;
}

/**
 * The opening screen: name the company, name the founder, begin. Three steps on
 * one sheet, no wizard. Everything a developer needs and a player does not is
 * folded away behind the advanced disclosure.
 *
 * Pure presentation. No fetching, no timers, no effects — the shell owns the
 * save list and the campaign lifecycle.
 */
export function NewGame({ busy, error, saves, onStart, onLoad }: NewGameProps): ReactNode {
  const ids = useId();
  const companyId = `${ids}-company`;
  const founderId = `${ids}-founder`;
  const seedId = `${ids}-seed`;
  const derivedId = `${ids}-derived`;

  const [seeded] = useState(() => sanitizeIdentity({}, new Rng(rollSeed(0, 1))));
  const [rolls, setRolls] = useState(1);
  const [companyName, setCompanyName] = useState(seeded.companyName);
  const [founderName, setFounderName] = useState(seeded.founderName);
  const [portraitId, setPortraitId] = useState(seeded.portraitId);

  const [seedOverride, setSeedOverride] = useState("");
  const [pace, setPace] = useState<LivePace>("fast");
  const [ticks, setTicks] = useState<number>(PROTOTYPE_TICKS);

  const company = companyName.trim();
  const founder = founderName.trim();
  const derivedSeed = seedFromCompanyName(company);
  const override = normalizeSeed(seedOverride);
  const seed = override ?? derivedSeed;

  const problem = validate(company, founder);
  const canBegin = problem === null && !busy;
  const scenario: "prototype" | "full" = ticks === PROTOTYPE_TICKS ? "prototype" : "full";
  const minutes = Math.round((ticks * PACE_SECONDS[pace]) / 60);

  function rollCompany(): void {
    const rng = new Rng(rollSeed(rolls, 1));
    setCompanyName(rollCompanyName(rng));
    setRolls(rolls + 1);
  }

  /** The founder dice rolls a name and a portrait together, from one Rng. */
  function rollFounder(): void {
    const rng = new Rng(rollSeed(rolls, 2));
    setFounderName(rollFounderName(rng));
    setPortraitId(rng.pick(FOUNDER_PORTRAITS).id);
    setRolls(rolls + 1);
  }

  function submit(): void {
    if (!canBegin) return;
    const identity = sanitizeIdentity({ companyName, founderName, portraitId }, new Rng(seed));
    onStart({
      seed,
      pace,
      ticks,
      scenario,
      companyName: identity.companyName,
      founderName: identity.founderName,
      portraitId: identity.portraitId,
    });
  }

  return (
    <main className="newgame">
      <div className="newgame-inner">
        <header className="newgame-masthead">
          <h1 className="newgame-wordmark">Aero Asset Tycoon</h1>
          <p className="newgame-tagline">
            An aviation aftermarket book, built one asset at a time. Name the house, name
            yourself, and set up shop.
          </p>
        </header>

        <div className="newgame-body">
          <form
            className="newgame-form"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {/* --- STEP 1 --------------------------------------------------- */}
            <section className="newgame-step">
              <div className="newgame-step-head">
                <span className="newgame-step-index" aria-hidden="true">01</span>
                <label className="newgame-step-title" htmlFor={companyId}>
                  Name your company
                </label>
              </div>
              <div className="newgame-namerow">
                <input
                  id={companyId}
                  className="newgame-input newgame-input--hero"
                  type="text"
                  value={companyName}
                  maxLength={MAX_IDENTITY_LENGTH}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Meridian Rotables Inc."
                  aria-describedby={`${companyId}-note`}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
                <DiceButton label="Roll a company name" onClick={rollCompany} size="hero" />
              </div>
              <p className="newgame-note" id={`${companyId}-note`}>
                The name is the world. Type the same one again and the market deals the same
                opening hand.
                <span className="newgame-count" aria-hidden="true">
                  {company.length}/{MAX_IDENTITY_LENGTH}
                </span>
              </p>
            </section>

            {/* --- STEP 2 --------------------------------------------------- */}
            <section className="newgame-step">
              <div className="newgame-step-head">
                <span className="newgame-step-index" aria-hidden="true">02</span>
                <label className="newgame-step-title" htmlFor={founderId}>
                  Name your founder
                </label>
              </div>
              <div className="newgame-namerow">
                <input
                  id={founderId}
                  className="newgame-input newgame-input--founder"
                  type="text"
                  value={founderName}
                  maxLength={MAX_IDENTITY_LENGTH}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Rosa Okafor"
                  onChange={(event) => setFounderName(event.target.value)}
                />
                <DiceButton label="Roll a founder name and portrait" onClick={rollFounder} size="normal" />
              </div>

              <div
                className="newgame-portraits"
                role="group"
                aria-label="Founder portrait"
              >
                {FOUNDER_PORTRAITS.map((portrait, index) => (
                  <PortraitCard
                    key={portrait.id}
                    portrait={portrait}
                    index={index}
                    selected={portrait.id === portraitId}
                    onSelect={() => setPortraitId(portrait.id)}
                  />
                ))}
              </div>
              <p className="newgame-note">
                The portrait is cosmetic. It carries no bonus, no penalty and no hidden
                weighting — nothing in the simulation ever reads it.
                <span className="newgame-count" aria-hidden="true">
                  {founder.length}/{MAX_IDENTITY_LENGTH}
                </span>
              </p>
            </section>

            {/* --- STEP 3 --------------------------------------------------- */}
            <section className="newgame-step newgame-step--begin">
              <div className="newgame-step-head">
                <span className="newgame-step-index" aria-hidden="true">03</span>
                <span className="newgame-step-title">Begin</span>
              </div>
              <button className="newgame-begin" type="submit" disabled={!canBegin}>
                {busy ? "Setting up shop…" : "Set up shop"}
              </button>
              {/* Live region carries only what changed and matters: the blocking
                  problem, or whatever the shell reported. The settings echo below
                  it stays outside, so typing a name does not narrate itself. */}
              <div className="newgame-status" role="status" aria-live="polite">
                {error ? (
                  <span className="newgame-status--error">{error}</span>
                ) : problem ? (
                  <span className="newgame-status--warn">{problem}</span>
                ) : null}
              </div>
              <p className="newgame-summary">
                {scenario === "prototype" ? "Prototype" : "Full campaign"} · {ticks} weekly
                pulses · {PACE_LABELS[pace].toLowerCase()} pace
              </p>
            </section>

            {/* --- ADVANCED ------------------------------------------------- */}
            <details className="newgame-advanced">
              <summary className="newgame-advanced-summary">Advanced (developer)</summary>
              <div className="newgame-advanced-grid">
                <div className="newgame-field">
                  <label className="newgame-field-label" htmlFor={derivedId}>
                    Seed derived from company name
                  </label>
                  <input
                    id={derivedId}
                    className="newgame-input newgame-input--mono"
                    type="text"
                    value={String(derivedSeed)}
                    readOnly
                  />
                  <p className="newgame-field-help">
                    Used unless the override below is filled in.
                  </p>
                </div>

                <div className="newgame-field">
                  <label className="newgame-field-label" htmlFor={seedId}>
                    World seed override
                  </label>
                  <div className="newgame-seedrow">
                    <input
                      id={seedId}
                      className="newgame-input newgame-input--mono"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={seedOverride}
                      placeholder={String(derivedSeed)}
                      onChange={(event) => setSeedOverride(event.target.value)}
                    />
                    <button
                      className="newgame-ghost"
                      type="button"
                      disabled={override === null}
                      onClick={() => setSeedOverride("")}
                    >
                      Clear
                    </button>
                  </div>
                  <p className="newgame-field-help">
                    Active seed: <strong>{seed}</strong>
                    {override === null ? " (derived)" : " (override)"}
                  </p>
                </div>

                <fieldset className="newgame-fieldset">
                  <legend className="newgame-field-label">Campaign length</legend>
                  <label className="newgame-radio">
                    <input
                      type="radio"
                      name={`${ids}-length`}
                      checked={ticks === PROTOTYPE_TICKS}
                      onChange={() => setTicks(PROTOTYPE_TICKS)}
                    />
                    <span>Prototype · {PROTOTYPE_TICKS} weeks</span>
                  </label>
                  <label className="newgame-radio">
                    <input
                      type="radio"
                      name={`${ids}-length`}
                      checked={ticks === FULL_TICKS}
                      onChange={() => setTicks(FULL_TICKS)}
                    />
                    <span>Full · {FULL_TICKS} weeks</span>
                  </label>
                </fieldset>

                <fieldset className="newgame-fieldset">
                  <legend className="newgame-field-label">Pulse pace</legend>
                  {(["fast", "medium", "slow"] as LivePace[]).map((value) => (
                    <label className="newgame-radio" key={value}>
                      <input
                        type="radio"
                        name={`${ids}-pace`}
                        checked={pace === value}
                        onChange={() => setPace(value)}
                      />
                      <span>
                        {PACE_LABELS[value]} · {PACE_SECONDS[value]}s per pulse
                      </span>
                    </label>
                  ))}
                  <p className="newgame-field-help">
                    Roughly {minutes} minutes of live clock, plus pause time.
                  </p>
                </fieldset>
              </div>
            </details>
          </form>

          {/* --- SAVES ------------------------------------------------------ */}
          <aside className="newgame-aside" aria-labelledby={`${ids}-saves`}>
            <h2 className="newgame-aside-title" id={`${ids}-saves`}>
              Continue
            </h2>
            {saves.length === 0 ? (
              <div className="newgame-empty">
                <EmptyArt which="saves" />
                <p>No saved campaigns on this machine yet.</p>
              </div>
            ) : (
              <ul className="newgame-saves">
                {saves.map((save) => (
                  <li key={save.id}>
                    <button
                      className="newgame-save"
                      type="button"
                      disabled={busy}
                      onClick={() => onLoad(save.id)}
                    >
                      <span className="newgame-save-id">{save.id}</span>
                      <span className="newgame-save-meta">
                        Week {save.tick} · seed {save.seed}
                      </span>
                      <span className="newgame-save-meta">{formatSavedAt(save.savedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="newgame-legal">
              Real aircraft and engine nomenclature; fictional organizations, part numbers,
              prices and outcomes. Not affiliated with any OEM, operator or airport.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

/**
 * A portrait card. The art may not have been generated yet, so a failed load
 * drops the <img> and the frame's token gradient plus the plate number carries
 * the layout on its own.
 */
function PortraitCard({
  portrait,
  index,
  selected,
  onSelect,
}: {
  portrait: PortraitOption;
  index: number;
  selected: boolean;
  onSelect: () => void;
}): ReactNode {
  const art = useArtSource(portrait.id);
  return (
    <button
      className="newgame-portrait"
      type="button"
      aria-pressed={selected}
      aria-label={`Select ${describePortrait(portrait)}`}
      onClick={onSelect}
    >
      <span className="newgame-portrait-frame" data-missing={art.exhausted ? "true" : undefined}>
        <span className="newgame-portrait-fallback" aria-hidden="true">
          {index + 1}
        </span>
        {art.exhausted ? null : (
          <img src={art.src} alt="" draggable={false} onError={art.onError} />
        )}
      </span>
      <span className="newgame-portrait-label">{portrait.label}</span>
    </button>
  );
}

/** Icon-only roll control. The die is drawn inline so it inherits currentColor. */
function DiceButton({
  label,
  onClick,
  size,
}: {
  label: string;
  onClick: () => void;
  size: "hero" | "normal";
}): ReactNode {
  return (
    <button
      className={`newgame-dice newgame-dice--${size}`}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect
          x="3.5"
          y="3.5"
          width="17"
          height="17"
          rx="3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
        <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" />
        <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" />
      </svg>
    </button>
  );
}

/** Null when the field is untouched or unusable, so the derived seed wins. */
function normalizeSeed(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.abs(Math.floor(value)) >>> 0;
}

/** The one blocking problem to report, or null when the form is good to go. */
function validate(company: string, founder: string): string | null {
  if (company === "") return "Name your company before you begin.";
  if (company.length > MAX_IDENTITY_LENGTH) {
    return `Company name is over ${MAX_IDENTITY_LENGTH} characters.`;
  }
  if (founder === "") return "Name your founder before you begin.";
  if (founder.length > MAX_IDENTITY_LENGTH) {
    return `Founder name is over ${MAX_IDENTITY_LENGTH} characters.`;
  }
  return null;
}

function formatSavedAt(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  return at.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
