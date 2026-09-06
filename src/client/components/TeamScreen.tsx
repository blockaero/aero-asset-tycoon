/* ==========================================================================
   TeamScreen — the portrait video-call monitor beside the three-monitor desk.

   The framing device is a single portrait-oriented call window: whoever the
   founder is looking at is "on the line". With nobody hired the founder is
   alone on the call, which is the whole point of the screen.

   Below and beside it sit the two lists that matter: the roster the company
   pays every pulse, and the candidates currently reachable. Each person is
   described in plain words — what they take off the founder's desk, which ATA
   chapters they actually know, what they cost a week — because this is a
   staffing decision, not a pull.

   Pure presentational. Every number comes from the GameObservation it is
   handed; the only state is who is on the call, which release is awaiting
   confirmation, and which portrait files failed to load. The single effect
   (Escape to close) cleans up after itself.

   Colour comes only from the tokens in styles.css. The one drawn mark, the
   close glyph, inherits currentColor.
   ========================================================================== */
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ataLabel } from "../../sim/ata.ts";
import { completedEffects } from "../../sim/knowledge.ts";
import { BASE_TEAM_CAP, TEAM_ROLE_DEFS, canHire, weeklySalaryCost } from "../../sim/team.ts";
import type { GameObservation } from "../../sim/observation.ts";
import type { KnowledgeEffect, RegionCode, TeamCandidate, TeamMember } from "../../sim/types.ts";
import "./TeamScreen.css";

/* ---------------------------------------------------------------- *
 * Contract
 * ---------------------------------------------------------------- */

export type TeamScreenProps = {
  observation: GameObservation;
  /** Take a candidate off the board and on to the payroll. */
  onHire: (candidateId: string) => void;
  /** Take a member off the payroll. The screen asks twice before calling this. */
  onRelease: (memberId: string) => void;
  onClose: () => void;
};

/* ---------------------------------------------------------------- *
 * Constants
 * ---------------------------------------------------------------- */

/** Portraits live beside every other generated plate. Absent until the art pass runs. */
const PORTRAIT_DIR = "assets/gen";

/** Plain words for the machine reasons canHire returns. */
const HIRE_BLOCK_TEXT: Record<string, string> = {
  unknown_candidate: "This candidate has left the board.",
  unknown_role: "The company does not staff this role.",
  candidate_expired: "The hiring window has closed.",
  already_hired: "Already on the payroll.",
  team_at_cap: "Every seat is taken. Open another in Tribal Knowledge, or release someone.",
  salary_unaffordable: "ACC on hand will not cover the payroll runway this hire needs.",
};

/** Who is on the call. Ids are resolved against the live observation every render. */
type CallSelection =
  | { kind: "founder" }
  | { kind: "member"; id: string }
  | { kind: "candidate"; id: string };

/** Everything the call window needs, resolved from the selection and the observation. */
type CallSubject = {
  kind: "founder" | "member" | "candidate";
  /** Id of the person on the call, so the matching card can show as selected. */
  id: string | null;
  name: string;
  portraitId: string;
  roleLabel: string;
  status: string;
  blurb: string;
  meta: { label: string; value: string }[];
};

/* ---------------------------------------------------------------- *
 * Component
 * ---------------------------------------------------------------- */

export function TeamScreen({ observation, onHire, onRelease, onClose }: TeamScreenProps): ReactNode {
  const headingId = useId();
  const [selection, setSelection] = useState<CallSelection>({ kind: "founder" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  /* Escape closes the monitor. Registered once, removed on unmount. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const company = observation.company;
  const team = useMemo<TeamMember[]>(() => company?.team ?? [], [company]);
  const candidates = useMemo<TeamCandidate[]>(() => company?.candidates ?? [], [company]);
  const tick = observation.tick;
  const accBalance = observation.firm.accBalance;

  const regionName = useCallback(
    (code: RegionCode): string =>
      observation.regions?.find((entry) => entry.code === code)?.name ?? code,
    [observation.regions],
  );

  /**
   * Seats the company can fill.
   *
   * The cap counts the founder, so BASE_TEAM_CAP of 2 is the founder plus one
   * hire. Only Tribal Knowledge raises it — no hireable role carries a team_cap
   * effect — so the earned knowledge effects in the observation are the whole
   * story, and this matches what the engine itself computes.
   */
  const teamCap = useMemo(() => {
    let extra = 0;
    for (const effect of completedEffects(company?.knowledge ?? [])) {
      if (effect.kind === "team_cap") extra += effect.value;
    }
    return Math.max(1, BASE_TEAM_CAP + Math.round(extra));
  }, [company]);

  const seatsFilled = team.length + 1; // the founder holds one
  const seatsOpen = Math.max(0, teamCap - seatsFilled);

  const payroll = weeklySalaryCost(team);
  const lastPulse = observation.pulses.length > 0 ? observation.pulses[observation.pulses.length - 1] : null;
  /* Overhead is booked negative by the engine; payroll is already inside it. */
  const overhead = lastPulse ? Math.abs(lastPulse.overhead) : null;
  const payrollShare = overhead !== null && overhead > 0 ? payroll / overhead : null;
  /* The share can read over 100% for one pulse after a hire, before the new
     salary has been booked into overhead. The bar clamps; the number does not. */
  const sharePercent = payrollShare === null ? null : Math.round(payrollShare * 100);

  const subject = useMemo(
    () => resolveCall(selection, team, candidates, observation, regionName),
    [selection, team, candidates, observation, regionName],
  );

  /* Taken from the resolved subject, not the raw selection, so the highlighted
     card is always the person actually on the call. */
  const selectedId = subject.id;

  return (
    <section className="teamscreen" aria-labelledby={headingId}>
      <div className="teamscreen-bezel" aria-hidden="true" />

      {/* ---- Header ---------------------------------------------------- */}
      <header className="teamscreen-head">
        <div className="teamscreen-head-text">
          <p className="teamscreen-eyebrow">Block Aero · Staffing</p>
          <h2 className="teamscreen-title" id={headingId}>
            The Team
          </h2>
          <p className="teamscreen-subtitle">
            {company?.identity?.companyName ?? "The company"} · week {tick} · who the founder can
            call, and what the payroll is doing to the burn.
          </p>
        </div>
        <button
          type="button"
          className="teamscreen-close"
          onClick={onClose}
          aria-label="Close the team monitor"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M4 4 L12 12 M12 4 L4 12" />
          </svg>
        </button>
      </header>

      <div className="teamscreen-stats">
        <div className="teamscreen-stat">
          <p className="teamscreen-stat-label">Seats filled</p>
          <p className="teamscreen-stat-value">
            {seatsFilled}
            <span className="teamscreen-stat-of"> of {teamCap}</span>
          </p>
          <p className="teamscreen-stat-note">
            Founder holds one ·{" "}
            {seatsOpen === 0
              ? "no seat open"
              : `${seatsOpen} ${seatsOpen === 1 ? "seat" : "seats"} open`}
          </p>
        </div>

        <div className="teamscreen-stat">
          <p className="teamscreen-stat-label">Weekly payroll</p>
          <p className="teamscreen-stat-value">
            {formatAcc(payroll)}
            <span className="teamscreen-stat-of"> ACC</span>
          </p>
          <p className="teamscreen-stat-note">
            {team.length === 0
              ? "Nobody on the payroll"
              : `${team.length} ${team.length === 1 ? "salary" : "salaries"}, paid every pulse`}
          </p>
        </div>

        <div className="teamscreen-stat">
          <p className="teamscreen-stat-label">Payroll share of overhead</p>
          <p className="teamscreen-stat-value">
            {sharePercent === null ? "—" : `${sharePercent}%`}
          </p>
          <div
            className="teamscreen-share"
            role="progressbar"
            aria-label="Payroll share of last pulse overhead"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={sharePercent === null ? 0 : Math.min(100, Math.max(0, sharePercent))}
            aria-valuetext={
              sharePercent === null
                ? "No pulse resolved yet"
                : `${sharePercent} percent of overhead`
            }
          >
            <span
              className="teamscreen-share-fill"
              style={{ width: `${ratioPercent(payrollShare ?? 0, 1)}%` }}
            />
          </div>
          <p className="teamscreen-stat-note">
            {lastPulse === null || overhead === null
              ? "No pulse resolved yet"
              : `Against ${formatAcc(overhead)} ACC of overhead in week ${lastPulse.tick}`}
          </p>
        </div>

        <div className="teamscreen-stat">
          <p className="teamscreen-stat-label">ACC on hand</p>
          <p className="teamscreen-stat-value">{formatAcc(accBalance)}</p>
          <p className="teamscreen-stat-note">Hiring is judged on runway, not this week</p>
        </div>
      </div>

      <div className="teamscreen-body">
        {/* ---- 1. The call window ------------------------------------- */}
        <aside className="teamscreen-call" aria-label="Call window">
          <div className="teamscreen-call-frame">
            <Portrait
              className="teamscreen-call-portrait"
              portraitId={subject.portraitId}
              name={subject.name}
            />
            <p className="teamscreen-call-status">
              <ConnectedDot />
              <span>{subject.status}</span>
            </p>
          </div>
          <div className="teamscreen-call-plate">
            <p className="teamscreen-call-name">{subject.name}</p>
            <p className="teamscreen-call-role">{subject.roleLabel}</p>
            <p className="teamscreen-call-blurb">{subject.blurb}</p>
            {subject.meta.length > 0 ? (
              <dl className="teamscreen-call-meta">
                {subject.meta.map((entry) => (
                  <div className="teamscreen-call-meta-row" key={entry.label}>
                    <dt>{entry.label}</dt>
                    <dd>{entry.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </aside>

        {/* ---- 2. Roster ---------------------------------------------- */}
        <section className="teamscreen-column" aria-labelledby={`${headingId}-roster`}>
          <header className="teamscreen-column-head">
            <h3 className="teamscreen-column-title" id={`${headingId}-roster`}>
              Roster
            </h3>
            <p className="teamscreen-column-count">
              {team.length} on payroll · {formatAcc(payroll)} ACC a week
            </p>
          </header>

          {team.length === 0 ? (
            <p className="teamscreen-empty">
              Nobody is on the payroll. Every desk in the building is the founder&rsquo;s, and every
              hour spent sourcing is an hour not spent selling.
            </p>
          ) : (
            <ul className="teamscreen-list">
              {team.map((member) => (
                <li key={member.id}>
                  <article className="teamscreen-card" data-selected={selectedId === member.id ? "true" : undefined}>
                    <PersonHead
                      person={member}
                      selected={selectedId === member.id}
                      onSelect={() => setSelection({ kind: "member", id: member.id })}
                    />
                    <PersonFacts person={member} regionName={regionName} />
                    <AtaChips codes={member.ataAffinity} />
                    <EffectList person={member} regionName={regionName} />
                    <p className="teamscreen-card-tenure">
                      On the payroll since week {member.hiredTick}
                    </p>

                    {confirmingId === member.id ? (
                      <div
                        className="teamscreen-confirm"
                        role="group"
                        aria-label={`Confirm releasing ${member.name}`}
                      >
                        <p className="teamscreen-confirm-text">
                          Release {member.name}? The salary stops, the seat opens, and what they
                          know goes with them.
                        </p>
                        <div className="teamscreen-confirm-actions">
                          <button
                            type="button"
                            className="teamscreen-release-confirm"
                            onClick={() => {
                              setConfirmingId(null);
                              onRelease(member.id);
                            }}
                          >
                            Confirm release
                          </button>
                          <button
                            type="button"
                            className="teamscreen-release-cancel"
                            onClick={() => setConfirmingId(null)}
                          >
                            Keep {firstName(member.name)}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="teamscreen-card-actions">
                        <button
                          type="button"
                          className="teamscreen-release"
                          onClick={() => setConfirmingId(member.id)}
                        >
                          Release
                        </button>
                      </div>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- 3. Candidates ------------------------------------------ */}
        <section className="teamscreen-column" aria-labelledby={`${headingId}-candidates`}>
          <header className="teamscreen-column-head">
            <h3 className="teamscreen-column-title" id={`${headingId}-candidates`}>
              Candidates
            </h3>
            <p className="teamscreen-column-count">
              {candidates.length} reachable ·{" "}
              {seatsOpen === 0 ? "no seat open" : `${seatsOpen} can be seated`}
            </p>
          </header>

          <p className="teamscreen-provenance">
            Candidates come off the map — the operators, MROs and brokers the founder actually
            visits — and out of Tribal Knowledge memberships such as ISTAT, which put the company in
            the room where these conversations happen. Travel more, and better people take the call.
          </p>

          {candidates.length === 0 ? (
            <p className="teamscreen-empty">
              Nobody is available this pulse. Work the map and the memberships, and the board fills
              back up.
            </p>
          ) : (
            <ul className="teamscreen-list">
              {candidates.map((candidate) => {
                const weeksLeft = candidate.availableUntilTick - tick;
                /* canHire is called exactly as specified, without the optional tick, so
                   the expiry read stays here where the countdown is computed. */
                const check = canHire(candidate, team, teamCap, accBalance);
                const expired = weeksLeft < 0;
                const blocked = expired ? "candidate_expired" : check.ok ? null : check.reason ?? "unknown";
                const reasonId = `${headingId}-why-${candidate.id}`;
                return (
                  <li key={candidate.id}>
                    <article
                      className="teamscreen-card"
                      data-selected={selectedId === candidate.id ? "true" : undefined}
                      data-expired={expired ? "true" : undefined}
                    >
                      <PersonHead
                        person={candidate}
                        selected={selectedId === candidate.id}
                        onSelect={() => setSelection({ kind: "candidate", id: candidate.id })}
                      />
                      <PersonFacts person={candidate} regionName={regionName} />
                      <AtaChips codes={candidate.ataAffinity} />
                      <EffectList person={candidate} regionName={regionName} />

                      <p className="teamscreen-window" data-urgent={weeksLeft <= 1 ? "true" : undefined}>
                        {windowText(weeksLeft)}
                      </p>

                      <div className="teamscreen-card-actions">
                        <button
                          type="button"
                          className="teamscreen-hire"
                          disabled={blocked !== null}
                          aria-describedby={blocked === null ? undefined : reasonId}
                          onClick={() => onHire(candidate.id)}
                        >
                          Hire · {formatAcc(candidate.salary)} ACC a week
                        </button>
                        {blocked === null ? null : (
                          <p className="teamscreen-why" id={reasonId}>
                            {HIRE_BLOCK_TEXT[blocked] ?? "Not available right now."}
                          </p>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- *
 * Small parts
 * ---------------------------------------------------------------- */

/**
 * A portrait plate. The CSS holds a token-coloured gradient block underneath, so
 * a missing art file leaves the layout exactly as it was, with initials on it.
 */
function Portrait({
  portraitId,
  name,
  className,
}: {
  portraitId: string;
  name: string;
  className?: string;
}): ReactNode {
  const [broken, setBroken] = useState(false);

  /* A new portrait deserves a fresh attempt at loading its file. */
  useEffect(() => {
    setBroken(false);
  }, [portraitId]);

  return (
    <span className={className ? `teamscreen-portrait ${className}` : "teamscreen-portrait"}>
      <span className="teamscreen-portrait-fallback" aria-hidden="true">
        {initials(name)}
      </span>
      {broken ? null : (
        <img
          src={`${import.meta.env.BASE_URL}${PORTRAIT_DIR}/${portraitId}.svg`}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}

/** The green pinprick that says the line is up. Status only, never decoration. */
function ConnectedDot(): ReactNode {
  return <span className="teamscreen-dot" aria-hidden="true" />;
}

/** Thumb, name and role: the clickable head of a roster or candidate card. */
function PersonHead({
  person,
  selected,
  onSelect,
}: {
  person: TeamCandidate;
  selected: boolean;
  onSelect: () => void;
}): ReactNode {
  const def = TEAM_ROLE_DEFS[person.role];
  return (
    <button
      type="button"
      className="teamscreen-card-head"
      aria-pressed={selected}
      aria-label={`Put ${person.name}, ${def?.label ?? person.role}, in the call window`}
      onClick={onSelect}
    >
      <Portrait className="teamscreen-thumb" portraitId={person.portraitId} name={person.name} />
      <span className="teamscreen-card-head-text">
        <span className="teamscreen-card-name">{person.name}</span>
        <span className="teamscreen-card-role">{def?.label ?? person.role}</span>
      </span>
    </button>
  );
}

/** Skill, salary and region as a compact definition list. */
function PersonFacts({
  person,
  regionName,
}: {
  person: TeamCandidate;
  regionName: (code: RegionCode) => string;
}): ReactNode {
  return (
    <dl className="teamscreen-facts">
      <div className="teamscreen-fact">
        <dt>Skill</dt>
        <dd>{person.skill}</dd>
      </div>
      <div className="teamscreen-fact">
        <dt>Weekly</dt>
        <dd>{formatAcc(person.salary)} ACC</dd>
      </div>
      {person.regionCode ? (
        <div className="teamscreen-fact">
          <dt>Based in</dt>
          <dd>{regionName(person.regionCode)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** The ATA chapters this person actually knows. */
function AtaChips({ codes }: { codes: number[] }): ReactNode {
  if (codes.length === 0) {
    return <p className="teamscreen-chips-empty">No ATA chapter claimed</p>;
  }
  return (
    <ul className="teamscreen-chips" aria-label="ATA chapters known">
      {codes.map((code) => (
        <li className="teamscreen-chip" key={code}>
          {ataLabel(code)}
        </li>
      ))}
    </ul>
  );
}

/** What this person does, in plain words rather than raw numbers. */
function EffectList({
  person,
  regionName,
}: {
  person: TeamCandidate;
  regionName: (code: RegionCode) => string;
}): ReactNode {
  const lines = effectSentences(person, regionName);
  if (lines.length === 0) return null;
  return (
    <ul className="teamscreen-effects">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- *
 * Pure helpers
 * ---------------------------------------------------------------- */

/**
 * Resolve the selection against the live observation.
 *
 * A hired candidate, a released member or an expired tile simply stops matching,
 * and the call falls back to the first person on the roster, then to the founder
 * alone. No effect, no stale id.
 */
function resolveCall(
  selection: CallSelection,
  team: TeamMember[],
  candidates: TeamCandidate[],
  observation: GameObservation,
  regionName: (code: RegionCode) => string,
): CallSubject {
  if (selection.kind === "member") {
    const member = team.find((entry) => entry.id === selection.id);
    if (member) return memberSubject(member, observation.tick, regionName);
  }
  if (selection.kind === "candidate") {
    const candidate = candidates.find((entry) => entry.id === selection.id);
    if (candidate) return candidateSubject(candidate, observation.tick, regionName);
  }
  const first = team[0];
  if (first) return memberSubject(first, observation.tick, regionName);
  return founderSubject(observation);
}

function memberSubject(
  member: TeamMember,
  tick: number,
  regionName: (code: RegionCode) => string,
): CallSubject {
  const def = TEAM_ROLE_DEFS[member.role];
  const weeks = Math.max(0, tick - member.hiredTick);
  const meta: { label: string; value: string }[] = [
    { label: "Skill", value: `${member.skill}` },
    { label: "Weekly salary", value: `${formatAcc(member.salary)} ACC` },
    { label: "Chapters", value: member.ataAffinity.map((code) => ataLabel(code)).join(" · ") || "—" },
  ];
  if (member.regionCode) meta.push({ label: "Based in", value: regionName(member.regionCode) });
  return {
    kind: "member",
    id: member.id,
    name: member.name,
    portraitId: member.portraitId,
    roleLabel: def?.label ?? member.role,
    status: weeks === 0 ? "Connected · first week" : `Connected · ${weeks} ${weeks === 1 ? "week" : "weeks"} in`,
    blurb: def?.blurb ?? member.blurb,
    meta,
  };
}

function candidateSubject(
  candidate: TeamCandidate,
  tick: number,
  regionName: (code: RegionCode) => string,
): CallSubject {
  const def = TEAM_ROLE_DEFS[candidate.role];
  const weeksLeft = candidate.availableUntilTick - tick;
  const meta: { label: string; value: string }[] = [
    { label: "Skill", value: `${candidate.skill}` },
    { label: "Asking", value: `${formatAcc(candidate.salary)} ACC a week` },
    {
      label: "Chapters",
      value: candidate.ataAffinity.map((code) => ataLabel(code)).join(" · ") || "—",
    },
  ];
  if (candidate.regionCode) meta.push({ label: "Based in", value: regionName(candidate.regionCode) });
  return {
    kind: "candidate",
    id: candidate.id,
    name: candidate.name,
    portraitId: candidate.portraitId,
    roleLabel: def?.label ?? candidate.role,
    status: weeksLeft < 0 ? "Line closed · window passed" : `Interview line · ${windowText(weeksLeft)}`,
    blurb: candidate.blurb,
    meta,
  };
}

function founderSubject(observation: GameObservation): CallSubject {
  const identity = observation.company?.identity;
  return {
    kind: "founder",
    id: null,
    name: identity?.founderName ?? "The founder",
    portraitId: identity?.portraitId ?? "founder-white-woman",
    roleLabel: "Founder · every desk",
    status: "Connected · nobody else on the line",
    blurb:
      "One person, one call window. The first hire is not a bonus; it is the hour of the week the founder stops spending on somebody else's job.",
    meta: [{ label: "Company", value: identity?.companyName ?? "—" }],
  };
}

/** "3 weeks left" — a candidate is still hireable on the tick they expire. */
function windowText(weeksLeft: number): string {
  if (weeksLeft < 0) return "Window closed";
  if (weeksLeft === 0) return "Last pulse on the board";
  return `${weeksLeft} ${weeksLeft === 1 ? "week" : "weeks"} left on the board`;
}

/**
 * What this person contributes, said in plain words.
 *
 * Mirrors the engine: numeric effects scale by skill/100, the ATA-scoped kinds
 * are read against the person's own chapters, and reach is binary because a
 * regional manager either lives in the market or does not.
 */
function effectSentences(
  person: TeamCandidate,
  regionName: (code: RegionCode) => string,
): string[] {
  const def = TEAM_ROLE_DEFS[person.role];
  if (!def) return [];
  const factor = Math.min(1, Math.max(0, person.skill / 100));
  const chapters = joinWords(person.ataAffinity.map((code) => ataLabel(code)));
  const lines: string[] = [];
  for (const effect of def.effects) {
    const line = effectText(effect, factor, chapters, person.regionCode, regionName);
    if (line) lines.push(line);
  }
  return lines;
}

function effectText(
  effect: KnowledgeEffect,
  factor: number,
  chapters: string,
  regionCode: RegionCode | null,
  regionName: (code: RegionCode) => string,
): string {
  switch (effect.kind) {
    case "buy_discount":
      return `Buys ${pct(effect.value * factor)} cheaper on ${chapters}`;
    case "sell_premium":
      return `Sells ${pct(effect.value * factor)} higher on ${chapters}`;
    case "repair_tat":
      return `Shop turn time ${pct(effect.value * factor)} shorter on ${chapters}`;
    case "ber_accuracy":
      return `Calls beyond-economic-repair ${pct(effect.value * factor)} more accurately`;
    case "reach_region":
      return `Puts the company on the ground in ${regionName(regionCode ?? effect.regionCode)}, so its operators and shops become reachable`;
    case "unlock_facility":
      return `Opens ${effect.facilityKind.replace(/_/g, " ")} facilities on the map`;
    case "rc_income":
      return `Earns ${decimal(effect.value * factor)} more relationship capital every pulse`;
    case "time_income":
      return `Hands the founder back ${decimal(effect.value * factor)} hours every pulse`;
    case "team_cap":
      return `Opens ${decimal(effect.value)} more seats on the team`;
    case "intel":
      return `Reads the market ${pct(effect.value * factor)} more clearly`;
    case "event_access":
      return `${pct(effect.value * factor)} more introductions at industry events`;
    case "logistics_cost":
      return `Freight costs ${pct(effect.value * factor)} less`;
    case "warehouse_capacity":
      return `Adds ${decimal(effect.value * factor)} units of warehouse capacity`;
    case "quote_quality":
      return `Turns a bare price into a quote that lands ${pct(effect.value * factor)} better`;
    case "buyer_ceiling":
      return `Reaches buyers ${pct(effect.value * factor)} further up the market`;
  }
}

/** "Landing Gear", "Landing Gear and Engine", "A, B and C". */
function joinWords(words: string[]): string {
  if (words.length === 0) return "general airframe work";
  if (words.length === 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Improvement fractions are always positive. Never shows a bare 0%. */
function pct(value: number): string {
  const rounded = Math.round(value * 100);
  if (rounded <= 0) return "under 1%";
  return `${rounded}%`;
}

/** One decimal, with the trailing .0 dropped. */
function decimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function ratioPercent(value: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

function firstName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? name;
}

function formatAcc(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1_000)}K`;
  return Math.round(value).toLocaleString("en-US");
}
