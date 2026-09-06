import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LiveSnapshot } from "../live/runner.ts";
import type { GameObservation } from "../sim/observation.ts";
import type {
  LivePace,
  MarketListing,
  NetworkOpportunity,
  Rfq,
  Unit,
} from "../sim/types.ts";
import {
  campaignAction,
  createCampaign,
  listSaves,
  loadCampaign,
  saveCampaign,
  sendCommand,
  setCampaignPace,
  subscribeCampaign,
} from "./api.ts";
import { musicOn, startMusic, subscribeMusic, toggleMusic } from "./music.ts";

type View = "hq" | "map" | "market" | "strategy" | "sales" | "assets" | "kpis" | "pbh";
type InspectTarget =
  | { kind: "asset"; id: number }
  | { kind: "part"; id: string }
  | { kind: "node"; id: string }
  | null;

export function App() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [view, setView] = useState<View>("hq");
  const [inspect, setInspect] = useState<InspectTarget>(null);
  const [marketFocus, setMarketFocus] = useState<number | null>(null);
  const [notice, setNotice] = useState("The desk is live. The market is listening.");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pulseBeat, setPulseBeat] = useState<GameObservation["pulses"][number] | null>(null);
  const feedbackKey = useRef("");

  useEffect(() => {
    if (!snapshot?.id) return;
    return subscribeCampaign(
      snapshot.id,
      (next) => {
        setSnapshot(next);
        setError("");
        const feedback = latestFeedbackEvent(next.observation.events);
        if (feedback) {
          const key = `${feedback.tick}:${feedback.kind}:${JSON.stringify(feedback.payload)}`;
          if (feedbackKey.current !== key) {
            feedbackKey.current = key;
            setNotice(feedbackMessage(feedback.kind, feedback.payload));
          }
        }
      },
      () => setError("Campaign session lost. Reload to start again."),
    );
  }, [snapshot?.id]);

  async function runAction(action: "pause" | "resume" | "step") {
    if (!snapshot) return;
    setBusy(true);
    try {
      const next = await campaignAction(snapshot.id, action);
      setSnapshot(next);
      if (action === "step") {
        const feedback = latestFeedbackEvent(next.observation.events);
        setNotice(
          feedback
            ? feedbackMessage(feedback.kind, feedback.payload)
            : "One weekly pulse resolved.",
        );
        setPulseBeat(next.observation.pulses.at(-1) ?? null);
      } else {
        setNotice(`Campaign ${action}d.`);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function command(value: unknown, success: string) {
    if (!snapshot) return;
    setBusy(true);
    try {
      await sendCommand(snapshot.id, value);
      setNotice(`${success} Queued for the next pulse.`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) {
    return (
      <CampaignStart
        busy={busy}
        error={error}
        onStart={async (input) => {
          startMusic();
          setBusy(true);
          try {
            const created = await createCampaign(input);
            setSnapshot(created);
            setView("hq");
            setError("");
            setNotice("Opening inventory is positioned. The first demand pulse is approaching.");
          } catch (cause) {
            setError(messageOf(cause));
          } finally {
            setBusy(false);
          }
        }}
        onLoad={async (saveId, pace) => {
          startMusic();
          setBusy(true);
          try {
            const loaded = await loadCampaign(saveId, pace);
            setSnapshot(loaded);
            setView("hq");
            setError("");
            setNotice(`Loaded ${saveId} at week ${loaded.observation.tick}.`);
          } catch (cause) {
            setError(messageOf(cause));
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  const observation = snapshot.observation;
  const lastPulse = observation.pulses.at(-1);
  const finished = snapshot.status === "finished";

  return (
    <div className="app-shell">
      <LedgerHeader
        snapshot={snapshot}
        busy={busy}
        onAction={runAction}
        onPace={async (pace) => {
          setSnapshot(await setCampaignPace(snapshot.id, pace));
        }}
        onSave={async () => {
          setBusy(true);
          try {
            const saved = await saveCampaign(snapshot.id);
            setNotice(`Saved as ${saved.id}.`);
          } catch (cause) {
            setError(messageOf(cause));
          } finally {
            setBusy(false);
          }
        }}
      />

      <nav className="view-tabs" aria-label="Headquarters">
        {([
          ["hq", "Operations Desk"],
          ["map", "Network Map"],
          ["market", "Marketplace"],
          ["strategy", "Buying Strategy"],
          ["sales", "Sales Office"],
          ["assets", "Asset Control"],
          ["kpis", "KPI Index"],
          ["pbh", "PBH"],
        ] as [View, string][]).map(([id, label]) => (
          <button key={id} className={view === id ? "active" : ""} onClick={() => {
            if (id === "market") setMarketFocus(null);
            setView(id);
          }}>
            {label}
          </button>
        ))}
      </nav>

      {(error || notice) && (
        <div className={`notice ${error ? "error" : ""}`} role="status">
          {error || notice}
        </div>
      )}

      <main className="workspace">
        {view === "hq" && (
          <Headquarters
            observation={observation}
            onOpen={setView}
            lastPulse={lastPulse}
          />
        )}
        {view === "map" && (
          <NetworkMap
            observation={observation}
            onHq={() => setView("hq")}
            onInspect={(id) => setInspect({ kind: "node", id })}
            onOpenListing={(listingId) => {
              setMarketFocus(listingId);
              setView("market");
            }}
            onCommand={command}
          />
        )}
        {view === "market" && (
          <Marketplace
            observation={observation}
            focusListingId={marketFocus}
            onBuy={(listing) =>
              command(
                {
                  type: "purchase_listing",
                  listingId: listing.id,
                  destinationFacilityId: observation.firm.warehouseFacilityId,
                },
                `${listing.kind === "package" ? "Package" : "Asset"} purchase`,
              )
            }
            onInspectPart={(id) => setInspect({ kind: "part", id })}
          />
        )}
        {view === "strategy" && (
          <StrategySheet observation={observation} onCommand={command} />
        )}
        {view === "sales" && (
          <SalesOffice observation={observation} onCommand={command} />
        )}
        {view === "assets" && (
          <AssetControl
            observation={observation}
            onCommand={command}
            onInspect={(id) => setInspect({ kind: "asset", id })}
          />
        )}
        {view === "kpis" && <KpiIndex />}
        {view === "pbh" && <PbhDesk observation={observation} onCommand={command} />}
      </main>

      {inspect && (
        <InspectSheet
          target={inspect}
          observation={observation}
          onClose={() => setInspect(null)}
          onCommand={command}
        />
      )}
      {pulseBeat && <PulseBeat pulse={pulseBeat} onClose={() => setPulseBeat(null)} />}
      {finished && <EndSheet observation={observation} />}
    </div>
  );
}

function CampaignStart({
  busy,
  error,
  onStart,
  onLoad,
}: {
  busy: boolean;
  error: string;
  onStart: (input: { seed: number; pace: LivePace; ticks: number; scenario: "prototype" | "full" }) => void;
  onLoad: (saveId: string, pace: LivePace) => void;
}) {
  const [seed, setSeed] = useState(20260906);
  const [pace, setPace] = useState<LivePace>("fast");
  const [length, setLength] = useState<24 | 100>(24);
  const [saves, setSaves] = useState<{ id: string; savedAt: string; tick: number; seed: number }[]>([]);
  useEffect(() => {
    void listSaves().then(setSaves).catch(() => setSaves([]));
  }, []);
  useEffect(() => {
    const kick = () => startMusic();
    window.addEventListener("pointerdown", kick, { once: true });
    return () => window.removeEventListener("pointerdown", kick);
  }, []);
  const seconds = length * ({ fast: 25, medium: 50, slow: 75 }[pace]);
  return (
    <main className="start-screen">
      <section className="title-block">
        <p className="eyebrow">AAT / CAMPAIGN BRIEF / REV 02</p>
        <h1>Aero Asset Tycoon</h1>
        <p className="lead">
          Build an aviation aftermarket book without letting inventory consume the company.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onStart({ seed, pace, ticks: length, scenario: length === 24 ? "prototype" : "full" });
          }}
        >
          <label>
            World seed
            <input type="number" value={seed} onChange={(event) => setSeed(Number(event.target.value))} />
          </label>
          <fieldset>
            <legend>Campaign</legend>
            <label><input type="radio" checked={length === 24} onChange={() => setLength(24)} /> Founder’s first 24 weeks</label>
            <label><input type="radio" checked={length === 100} onChange={() => setLength(100)} /> Open market · 100 weeks</label>
          </fieldset>
          <fieldset>
            <legend>Weekly pulse</legend>
            {(["fast", "medium", "slow"] as LivePace[]).map((value) => (
              <label key={value}>
                <input type="radio" checked={pace === value} onChange={() => setPace(value)} />
                {capitalize(value)} · {{ fast: 25, medium: 50, slow: 75 }[value]}s
              </label>
            ))}
          </fieldset>
          <p className="session-estimate">
            Live duration: approximately {Math.round(seconds / 60)} minutes plus pause time.
          </p>
          {error && <p className="form-error">{error}</p>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Establishing operations…" : "Enter Operations Desk"}
          </button>
          {saves.length > 0 && (
            <div className="load-saves">
              <span>Continue saved campaign</span>
              {saves.slice(0, 3).map((save) => (
                <button type="button" key={save.id} disabled={busy} onClick={() => onLoad(save.id, pace)}>
                  {save.id} · W{save.tick} · seed {save.seed}
                </button>
              ))}
            </div>
          )}
        </form>
        <small>
          Real aircraft/engine nomenclature; fictional organizations, P/Ns, prices, reliability and outcomes.
          Not affiliated with any OEM, airline or airport.
        </small>
      </section>
    </main>
  );
}

function LedgerHeader({
  snapshot,
  busy,
  onAction,
  onPace,
  onSave,
}: {
  snapshot: LiveSnapshot;
  busy: boolean;
  onAction: (action: "pause" | "resume" | "step") => void;
  onPace: (pace: LivePace) => void;
  onSave: () => void;
}) {
  const { observation } = snapshot;
  const pulse = observation.pulses.at(-1);
  const seconds = useCountdown(snapshot.remainingMs, snapshot.status);
  const pendingCount = observation.pendingCommands.length;
  return (
    <header className="ledger-header">
      <div className="brand">
        <span className="eyebrow">AERO ASSET PARTNERS</span>
        <strong>Operations Desk</strong>
      </div>
      <div className="acc-balance">
        <span>ACC BALANCE</span>
        <strong>{formatAcc(observation.firm.accBalance)}</strong>
      </div>
      <div className={`pulse-delta ${(pulse?.delta ?? 0) >= 0 ? "positive" : "negative"}`}>
        <span>WEEK {pulse?.tick ?? 0} PULSE</span>
        <strong>{signedAcc(pulse?.delta ?? 0)}</strong>
      </div>
      <PulseTrail pulses={observation.pulses} />
      <div className="clock">
        <span>WEEK {observation.tick}</span>
        <strong>{snapshot.status === "running" ? `${seconds}s` : snapshot.status.toUpperCase()}</strong>
      </div>
      <div className="clock-actions">
        <select value={snapshot.pace} onChange={(event) => onPace(event.target.value as LivePace)} aria-label="Pulse speed">
          <option value="fast">25s</option>
          <option value="medium">50s</option>
          <option value="slow">75s</option>
        </select>
        <button disabled={busy || snapshot.status === "finished"} onClick={() => onAction(snapshot.status === "running" ? "pause" : "resume")}>
          {snapshot.status === "running" ? "Pause" : "Resume"}
        </button>
        <button
          className="hero-pulse"
          disabled={busy || snapshot.status === "running" || snapshot.status === "finished"}
          onClick={() => onAction("step")}
          title={pendingCount > 0 ? `${pendingCount} command(s) queued` : "Resolve weekly pulse"}
        >
          Pulse
        </button>
        <button disabled={busy} onClick={onSave}>Save</button>
        <MusicToggle />
      </div>
    </header>
  );
}

function MusicToggle() {
  const on = useSyncExternalStore(subscribeMusic, musicOn);
  return (
    <button
      type="button"
      onClick={toggleMusic}
      aria-pressed={on}
      title="Hangar theme — warm industrial loop"
    >
      {on ? "♪ Music" : "♪ Muted"}
    </button>
  );
}

function PulseTrail({ pulses }: { pulses: GameObservation["pulses"] }) {
  const recent = pulses.slice(-10);
  const max = Math.max(1, ...recent.map((pulse) => Math.abs(pulse.delta)));
  return (
    <div className="pulse-trail" aria-label="Trailing ACC pulses">
      {recent.length === 0 && <span className="empty-bars">Awaiting first pulse</span>}
      {recent.map((pulse) => (
        <span
          key={pulse.tick}
          className={pulse.delta >= 0 ? "gain" : "loss"}
          style={{ height: `${8 + (Math.abs(pulse.delta) / max) * 26}px` }}
          title={`Week ${pulse.tick}: ${signedAcc(pulse.delta)}`}
        />
      ))}
    </div>
  );
}

function Headquarters({
  observation,
  onOpen,
  lastPulse,
}: {
  observation: GameObservation;
  onOpen: (view: View) => void;
  lastPulse: GameObservation["pulses"][number] | undefined;
}) {
  const available = observation.inventory.filter((asset) => asset.facilityId === observation.firm.warehouseFacilityId).length;
  const inTransit = observation.inventory.filter((asset) => asset.transferId !== null).length;
  const reachableNodes = observation.nodes.filter((node) => node.state !== "locked").length;
  return (
    <section className="hq-scene" aria-label="Operations desk overlooking a global aviation network">
      <div className="hq-backdrop" aria-hidden="true" />
      <div className="hq-overlay" aria-hidden="true" />
      <div className="office-copy">
        <p className="eyebrow">OPERATIONS DESK / GLOBAL NETWORK</p>
        <h2>The book is moving.</h2>
        <p>
          {lastPulse
            ? `Week ${lastPulse.tick} pulse: ${signedAcc(lastPulse.delta)}. ${available} assets ready; ${inTransit} in transit.`
            : "Opening inventory is positioned. The first demand pulse is approaching."}
        </p>
      </div>
      {lastPulse && (
        <div className="live-breakdown" aria-label="Latest ACC pulse breakdown">
          <span>Sales {signedAcc(lastPulse.sales)}</span>
          <span>Purchases {signedAcc(lastPulse.purchases)}</span>
          <span>Repair {signedAcc(lastPulse.repair)}</span>
          <span>Logistics {signedAcc(lastPulse.logistics)}</span>
          <span>Overhead {signedAcc(lastPulse.overhead)}</span>
          {lastPulse.contracts !== 0 && <span>Contracts {signedAcc(lastPulse.contracts)}</span>}
          {lastPulse.penalties !== 0 && <span>Penalties {signedAcc(lastPulse.penalties)}</span>}
        </div>
      )}
      <div className="founder-objectives">
        <span className={observation.pulses.length > 0 ? "complete" : ""}>1 · Resolve first pulse</span>
        <span className={observation.firm.manualAcquisitions > 0 ? "complete" : ""}>2 · Acquire an asset</span>
        <span className={observation.firm.repairsCompleted > 0 ? "complete" : ""}>3 · Complete a repair</span>
        <span className={observation.nodes.some((node) => node.state === "partner" && node.role !== "hq") ? "complete" : ""}>4 · Establish a partner</span>
        <span className={observation.pbhContracts.some((contract) => contract.status === "active" || contract.status === "completed") ? "complete" : ""}>5 · Operate PBH</span>
      </div>
      <button className="hotspot monitors" onClick={() => onOpen("market")}>
        <span>Connected monitors</span>
        <strong>Open Marketplace</strong>
      </button>
      <button className="hotspot phone" onClick={() => onOpen("sales")}>
        <span>Buyer line</span>
        <strong>Sales Office</strong>
      </button>
      <button className="hotspot manifest" onClick={() => onOpen("assets")}>
        <span>Asset manifest</span>
        <strong>{available} in warehouse</strong>
      </button>
      <button className="hotspot strategy-board" onClick={() => onOpen("strategy")}>
        <span>Acquisition policy</span>
        <strong>Buying Strategy</strong>
      </button>
      <button className="hotspot map-window" onClick={() => onOpen("map")}>
        <span>Network reach</span>
        <strong>{reachableNodes} reachable nodes</strong>
      </button>
    </section>
  );
}

function NetworkMap({
  observation,
  onHq,
  onInspect,
  onOpenListing,
  onCommand,
}: {
  observation: GameObservation;
  onHq: () => void;
  onInspect: (id: string) => void;
  onOpenListing: (listingId: number) => void;
  onCommand: (command: unknown, message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState("node-hq");
  const selected = observation.nodes.find((node) => node.id === selectedId) ?? observation.nodes[0];
  const hq = observation.nodes.find((node) => node.role === "hq");
  const opportunities = observation.opportunities.filter((opportunity) => opportunity.nodeId === selected?.id);
  return (
    <Sheet title="Network Map" code="NET / GLOBAL / 01">
      <div className="map-layout">
        <div className="network-map" role="img" aria-label="Global aviation aftermarket network">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="smallGrid" width="5" height="5" patternUnits="userSpaceOnUse">
                <path d="M 5 0 L 0 0 0 5" fill="none" className="grid-line" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#smallGrid)" opacity="0.3" />
            {hq && observation.nodes.filter((node) => node.id !== hq.id).map((node) => (
              <line key={`route-${node.id}`} x1={hq.x} y1={hq.y} x2={node.x} y2={node.y} className={`route ${node.state}`} />
            ))}
            {observation.nodes.map((node) => {
              const edgeLabelX = node.x < 20 ? 5 : node.x > 80 ? -5 : 0;
              const labelAnchor = node.x < 20 ? "start" : node.x > 80 ? "end" : "middle";
              const labelY =
                node.y > 86 ||
                (node.role === "customer" && node.y < 30) ||
                (node.role === "mro" && node.x > 75)
                  ? -6
                  : node.role === "hq"
                    ? 9
                    : 7;
              return (
                <g
                  key={node.id}
                  className={`map-node ${node.state} ${selectedId === node.id ? "selected" : ""}`}
                  transform={`translate(${node.x} ${node.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.label}; ${node.state}`}
                  onClick={() => {
                    if (node.role === "hq") onHq();
                    else setSelectedId(node.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (node.role === "hq") onHq();
                      else setSelectedId(node.id);
                    }
                  }}
                >
                  <circle r={node.role === "hq" ? 5 : 3.8} />
                  <text x={edgeLabelX} y={labelY} textAnchor={labelAnchor}>{node.label}</text>
                  {observation.opportunities.some((item) => item.nodeId === node.id) && <circle className="opportunity-dot" cx="4" cy="-4" r="1.6" />}
                </g>
              );
            })}
          </svg>
        </div>
        <aside className="node-sheet">
          {selected ? (
            <>
              <p className="eyebrow">{selected.role.toUpperCase()} / {selected.state.toUpperCase()}</p>
              <h3>{selected.label}</h3>
              <Metric label="Logistics TAT" value={`${selected.logisticsTatTicks} wk`} />
              <Metric label="Reputation required" value={String(selected.reputationRequired)} />
              <Metric
                label="Relationship"
                value={String(observation.relationships.find((relationship) => relationship.organizationId === selected.organizationId)?.score ?? 0)}
              />
              {selected.state === "locked" && <p className="locked-note">Needs reputation {selected.reputationRequired}. Private terms remain hidden.</p>}
              {selected.state !== "locked" && (
                <>
                  <button className="secondary" onClick={() => onInspect(selected.id)}>Inspect organization</button>
                  <h4>Opportunities</h4>
                  {opportunities.length === 0 && <Empty>No active opportunity at this node.</Empty>}
                  {opportunities.map((opportunity) => (
                    <OpportunityRow key={opportunity.id} opportunity={opportunity} onCommand={onCommand} onOpenListing={onOpenListing} />
                  ))}
                </>
              )}
            </>
          ) : <Empty>Select a node.</Empty>}
        </aside>
      </div>
    </Sheet>
  );
}

function OpportunityRow({
  opportunity,
  onCommand,
  onOpenListing,
}: {
  opportunity: NetworkOpportunity;
  onCommand: (command: unknown, message: string) => void;
  onOpenListing?: (listingId: number) => void;
}) {
  return (
    <article className="opportunity-row">
      <strong>{opportunity.title}</strong>
      <p>{opportunity.description}</p>
      {opportunity.kind === "agreement" && (
        <button
          onClick={() => onCommand(
            { type: "sign_network_agreement", opportunityId: opportunity.id },
            "Network agreement",
          )}
        >
          Sign agreement
        </button>
      )}
      {opportunity.kind === "introduction" && (
        <button
          onClick={() => onCommand(
            { type: "accept_network_opportunity", opportunityId: opportunity.id },
            "Network introduction",
          )}
        >
          Accept introduction
        </button>
      )}
      {opportunity.kind === "listing" && opportunity.referenceId !== null && onOpenListing && (
        <button onClick={() => onOpenListing(opportunity.referenceId!)}>Open in Marketplace</button>
      )}
    </article>
  );
}

function Marketplace({
  observation,
  focusListingId,
  onBuy,
  onInspectPart,
}: {
  observation: GameObservation;
  focusListingId: number | null;
  onBuy: (listing: MarketListing) => void;
  onInspectPart: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "single_asset" | "package">("all");
  const listings = observation.listings
    .filter((listing) => filter === "all" || listing.kind === filter)
    .sort((a, b) =>
      a.id === focusListingId ? -1 : b.id === focusListingId ? 1 : 0,
    );
  const pendingListings = new Set(
    observation.pendingCommands
      .filter((envelope) => envelope.command.type === "purchase_listing")
      .map((envelope) =>
        envelope.command.type === "purchase_listing" ? envelope.command.listingId : -1,
      ),
  );
  return (
    <Sheet title="Marketplace" code="ACQ / LIVE / 01">
      <div className="toolbar">
        <div className="segmented">
          {(["all", "single_asset", "package"] as const).map((value) => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {value === "single_asset" ? "Single assets" : capitalize(value)}
            </button>
          ))}
        </div>
        <span>{listings.length} actionable listings</span>
      </div>
      {focusListingId !== null && (
        <p className="focus-banner">Opened from the network opportunity · listing #{focusListingId}</p>
      )}
      <div className="card-grid">
        {listings.map((listing) => {
          const quantity = listing.items.reduce((sum, item) => sum + item.quantity, 0);
          const node = observation.nodes.find((candidate) => candidate.id === listing.nodeId);
          const logistics = quantity * (node?.logisticsTatTicks ?? 1) * 180;
          const marketValue = listing.items.reduce(
            (sum, item) => sum + (observation.mrp[item.partId] ?? 0) * item.quantity,
            0,
          );
          const repairExposure = listing.items.reduce((sum, item) => {
            const part = observation.parts.find((candidate) => candidate.id === item.partId);
            return sum + (item.condition === "AR" && part?.repairable ? part.listPrice * 0.28 * item.quantity : 0);
          }, 0);
          const landed = listing.totalPrice + logistics;
          const expectedSpread = marketValue - landed - repairExposure;
          const demandUnits = observation.rfqs
            .filter((rfq) => listing.items.some((item) => item.partId === rfq.partId))
            .reduce((sum, rfq) => sum + rfq.qty - rfq.filled, 0);
          return (
            <article className={`listing-card ${listing.id === focusListingId ? "focused" : ""}`} key={listing.id}>
              <div className="card-heading">
                <span className={`stamp ${listing.kind}`}>{listing.kind === "package" ? "PACKAGE" : "SINGLE"}</span>
                {listing.exclusive && <span className="stamp exclusive">NETWORK</span>}
              </div>
              <h3>{listing.title}</h3>
              <p>{quantity} asset{quantity === 1 ? "" : "s"} · expires W{listing.expiresTick}</p>
              <ul className="manifest-list">
                {listing.items.map((item, index) => {
                  const part = observation.parts.find((candidate) => candidate.id === item.partId);
                  return (
                    <li key={`${item.partId}-${index}`}>
                      <button className="text-button" onClick={() => onInspectPart(item.partId)}>{part?.name ?? item.partId}</button>
                      <span>{item.quantity} × <Condition value={item.condition} /></span>
                    </li>
                  );
                })}
              </ul>
              <div className="listing-metrics">
                <Metric label="Market reference" value={formatAcc(marketValue)} />
                <Metric label="Landed cost" value={formatAcc(landed)} />
                <Metric label="Repair exposure" value={formatAcc(repairExposure)} />
                <Metric label="Expected spread" value={signedAcc(expectedSpread)} />
                <Metric label="Visible demand" value={`${demandUnits} units`} />
                <Metric label="Logistics TAT" value={`${node?.logisticsTatTicks ?? 1} wk`} />
              </div>
              <div className="purchase-line">
                <strong>{formatAcc(listing.totalPrice)} ACC</strong>
                <button disabled={pendingListings.has(listing.id)} className="primary small" onClick={() => onBuy(listing)}>
                  {pendingListings.has(listing.id) ? "Purchase queued" : listing.kind === "package" ? "Buy package" : "Buy asset"}
                </button>
              </div>
            </article>
          );
        })}
        {listings.length === 0 && <Empty>No listings match this drawing index.</Empty>}
      </div>
    </Sheet>
  );
}

function StrategySheet({
  observation,
  onCommand,
}: {
  observation: GameObservation;
  onCommand: (command: unknown, message: string) => void;
}) {
  const current = observation.firm.buyingStrategy;
  const sales = observation.firm.salesStrategy;
  const [enabled, setEnabled] = useState(current.enabled);
  const [maxAcc, setMaxAcc] = useState(current.maxAccPerUnit);
  const [target, setTarget] = useState(current.targetStock);
  const [accFloor, setAccFloor] = useState(current.accFloor);
  const [maxInventory, setMaxInventory] = useState(current.maxInventoryUnits);
  const [maxPackage, setMaxPackage] = useState(current.maxPackageUnits);
  const [minMargin, setMinMargin] = useState(Math.round(sales.minMargin * 100));
  const [reserve, setReserve] = useState(sales.reserveStock);
  const acquisitionUnlocked = observation.firm.manualAcquisitions > 0;
  return (
    <Sheet title="Buying & Sales Strategy" code="POL / REV / 02">
      <div className="strategy-grid">
        <form
          className="policy-card"
          onSubmit={(event) => {
            event.preventDefault();
            onCommand({
              type: "set_buying_strategy",
              patch: {
                enabled,
                maxAccPerUnit: maxAcc,
                targetStock: target,
                accFloor,
                maxInventoryUnits: maxInventory,
                maxPackageUnits: maxPackage,
              },
            }, "Buying strategy");
          }}
        >
          <p className="eyebrow">ACQUISITIONS OFFICE</p>
          <h3>Standing acquisition</h3>
          {!acquisitionUnlocked && <p className="locked-note">Complete one manual marketplace acquisition to unlock automatic buying.</p>}
          <label className="switch-line"><input disabled={!acquisitionUnlocked} type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enable automatic acquisition</label>
          <label>Maximum ACC / asset<input type="number" value={maxAcc} onChange={(event) => setMaxAcc(Number(event.target.value))} /></label>
          <label>Target stock / P/N<input type="number" min="0" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>
          <label>ACC floor<input type="number" value={accFloor} onChange={(event) => setAccFloor(Number(event.target.value))} /></label>
          <label>Maximum inventory units<input type="number" min="1" value={maxInventory} onChange={(event) => setMaxInventory(Number(event.target.value))} /></label>
          <label>Maximum package units<input type="number" min="1" value={maxPackage} onChange={(event) => setMaxPackage(Number(event.target.value))} /></label>
          <button className="primary" type="submit">Issue buying policy</button>
        </form>
        <form
          className="policy-card"
          onSubmit={(event) => {
            event.preventDefault();
            onCommand({
              type: "set_sales_strategy",
              patch: { minMargin: minMargin / 100, reserveStock: reserve },
            }, "Sales strategy");
          }}
        >
          <p className="eyebrow">SALES OFFICE</p>
          <h3>Automatic fulfillment</h3>
          <label>Minimum margin %<input type="number" value={minMargin} onChange={(event) => setMinMargin(Number(event.target.value))} /></label>
          <label>Reserve stock / P/N<input type="number" min="0" value={reserve} onChange={(event) => setReserve(Number(event.target.value))} /></label>
          <Metric label="Condition floor" value={sales.minCondition} />
          <Metric label="Allocation" value={sales.allocation.replaceAll("_", " ")} />
          <button className="primary" type="submit">Issue sales policy</button>
        </form>
      </div>
    </Sheet>
  );
}

function SalesOffice({
  observation,
  onCommand,
}: {
  observation: GameObservation;
  onCommand: (command: unknown, message: string) => void;
}) {
  const recentSales = observation.events.filter((event) => event.kind === "deal_accepted").slice(-5).reverse();
  return (
    <Sheet title="Sales Office" code="RFQ / FULFILL / 03">
      <div className="sales-summary">
        <Metric label="RFQs seen" value={String(observation.firm.rfqsSeen)} />
        <Metric label="RFQs filled" value={String(observation.firm.rfqsFilled)} />
        <Metric label="Automatic reserve" value={String(observation.firm.salesStrategy.reserveStock)} />
        <Metric label="Minimum margin" value={`${Math.round(observation.firm.salesStrategy.minMargin * 100)}%`} />
      </div>
      <h3>Open buyer needs</h3>
      <div className="rfq-list">
        {observation.rfqs.map((rfq) => (
          <RfqRow key={rfq.id} rfq={rfq} observation={observation} onCommand={onCommand} />
        ))}
        {observation.rfqs.length === 0 && <Empty>No unmatched buyer need this week.</Empty>}
      </div>
      <h3>Recent automatic shipments</h3>
      <div className="event-list">
        {recentSales.map((event, index) => (
          <div key={`${event.tick}-${index}`}>
            <strong>Week {event.tick}</strong>
            <span>{String(event.payload.qty)} asset · {formatAcc(Number(event.payload.priceEach))} ACC · {String(event.payload.tx)}</span>
          </div>
        ))}
        {recentSales.length === 0 && <Empty>The opening pulse will populate this register.</Empty>}
      </div>
    </Sheet>
  );
}

function RfqRow({
  rfq,
  observation,
  onCommand,
}: {
  rfq: Rfq;
  observation: GameObservation;
  onCommand: (command: unknown, message: string) => void;
}) {
  const part = observation.parts.find((candidate) => candidate.id === rfq.partId);
  const eligible = observation.inventory.filter(
    (asset) =>
      asset.partId === rfq.partId &&
      asset.facilityId === observation.firm.warehouseFacilityId &&
      asset.transferId === null &&
      isServiceable(asset.condition) &&
      clientMeetsCondition(asset.condition, rfq.minCondition),
  );
  const [price, setPrice] = useState(Math.max(1, Math.min(rfq.maxPrice, Math.round((part?.listPrice ?? rfq.maxPrice) * 0.72))));
  const [tx, setTx] = useState<"outright" | "exchange">("outright");
  return (
    <article className={`rfq-row ${rfq.aog ? "aog" : ""}`}>
      <div>
        <div className="card-heading">
          <span className="stamp">{rfq.kind.toUpperCase()}</span>
          {rfq.aog && <span className="stamp alert">AOG</span>}
        </div>
        <strong>{part?.name ?? rfq.partId}</strong>
        <p>Need {rfq.qty - rfq.filled} · minimum <Condition value={rfq.minCondition} /> · expires W{rfq.expireTick}</p>
      </div>
      <div className="quote-controls">
        <label>ACC / asset<input type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label>
        <select value={tx} onChange={(event) => setTx(event.target.value as "outright" | "exchange")}>
          <option value="outright">Outright</option>
          <option value="exchange" disabled={!part?.repairable}>Exchange{part?.repairable ? ` · core charge ${formatAcc((part.listPrice ?? 0) * 0.45)}` : " · ineligible"}</option>
        </select>
        <button
          disabled={eligible.length === 0}
          onClick={() => onCommand({
            type: "submit_quote",
            rfqId: rfq.id,
            unitIds: eligible.slice(0, rfq.qty - rfq.filled).map((asset) => asset.id),
            price,
            tx,
          }, "Buyer offer")}
        >
          Make deal ({eligible.length} ready)
        </button>
      </div>
    </article>
  );
}

function AssetControl({
  observation,
  onCommand,
  onInspect,
}: {
  observation: GameObservation;
  onCommand: (command: unknown, message: string) => void;
  onInspect: (id: number) => void;
}) {
  const warehouse = observation.inventory.filter((asset) => asset.facilityId === observation.firm.warehouseFacilityId);
  const inTransit = observation.inventory.filter((asset) => asset.transferId !== null);
  return (
    <Sheet title="Asset Control" code="INV / FAC / 04">
      <div className="sales-summary">
        <Metric label="Warehouse assets" value={String(warehouse.length)} />
        <Metric label="In transit" value={String(inTransit.length)} />
        <Metric label="Repair jobs" value={String(observation.jobs.length)} />
        <Metric label="Inventory at mark" value={`${formatAcc(inventoryMark(observation))} ACC`} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>P/N · Asset</th><th>Condition</th><th>TSN / CSN</th><th>TSR / CSR</th><th>Facility state</th><th /></tr>
          </thead>
          <tbody>
            {observation.inventory.map((asset) => {
              const part = observation.parts.find((candidate) => candidate.id === asset.partId);
              return (
                <tr key={asset.id}>
                  <td><button className="text-button" onClick={() => onInspect(asset.id)}>{asset.partId}<br /><small>{part?.name}</small></button></td>
                  <td><Condition value={asset.condition} /></td>
                  <td>{part?.serialized ? `${asset.tsn.toLocaleString()} / ${asset.csn.toLocaleString()}` : "—"}</td>
                  <td>{part?.serialized ? `${asset.tsr.toLocaleString()} / ${asset.csr.toLocaleString()}` : "—"}</td>
                  <td>{asset.transferId ? "IN TRANSIT" : asset.facilityId ?? "ALLOCATED"}</td>
                  <td>
                    {asset.condition === "AR" && part?.repairable && asset.facilityId === observation.firm.warehouseFacilityId && (
                      <RepairAction
                        asset={asset}
                        shops={observation.shops}
                        facilities={observation.facilities}
                        part={part}
                        onCommand={onCommand}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3>Facility pipeline</h3>
      <div className="pipeline">
        {observation.transfers.map((transfer) => (
          <article key={transfer.id}>
            <span className="stamp">{transfer.purpose.replaceAll("_", " ")}</span>
            <strong>{transfer.assetIds.length} asset{transfer.assetIds.length === 1 ? "" : "s"}</strong>
            <p>{facilityName(observation, transfer.fromFacilityId)} → {facilityName(observation, transfer.toFacilityId)}</p>
            <progress value={observation.tick - transfer.departTick} max={Math.max(1, transfer.arriveTick - transfer.departTick)} />
            <small>Arrival W{transfer.arriveTick}</small>
          </article>
        ))}
        {observation.jobs.map((job) => (
          <article key={job.id}>
            <span className="stamp">REPAIR TAT</span>
            <strong>Asset #{job.unitId} · {job.workscope}</strong>
            <p>{job.shopId} · {job.status}</p>
            <small>Repair {job.repairTatTicks} wk · logistics {job.logisticsTatTicks} wk · complete W{job.doneTick}</small>
          </article>
        ))}
      </div>
      <h3>Recent arrivals</h3>
      <div className="event-list">
        {observation.events.filter((event) => event.kind === "transfer_arrived").slice(-6).reverse().map((event, index) => (
          <div key={`${event.tick}-${String(event.payload.transferId)}-${index}`}>
            <strong>Week {event.tick}</strong>
            <span>{String(event.payload.purpose).replaceAll("_", " ")} arrived at {facilityName(observation, String(event.payload.toFacilityId))}</span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function RepairAction({
  asset,
  shops,
  facilities,
  part,
  onCommand,
}: {
  asset: Unit;
  shops: GameObservation["shops"];
  facilities: GameObservation["facilities"];
  part: GameObservation["parts"][number] | undefined;
  onCommand: (command: unknown, message: string) => void;
}) {
  const [shopId, setShopId] = useState(shops[0]?.id ?? "shop-mid");
  const [workscope, setWorkscope] = useState<"min" | "oh">("min");
  return (
    <div className="repair-action">
      <select aria-label={`MRO for asset ${asset.id}`} value={shopId} onChange={(event) => setShopId(event.target.value)}>
        {shops.map((shop) => {
          const facility = facilities.find((candidate) => candidate.id === shop.facilityId);
          return <option key={shop.id} value={shop.id}>{shop.name} · {facility?.baseTatTicks ?? "?"}wk · {shop.costMult.toFixed(2)}×</option>;
        })}
      </select>
      <select aria-label={`Workscope for asset ${asset.id}`} value={workscope} onChange={(event) => setWorkscope(event.target.value as "min" | "oh")}>
        <option value="min">Repair</option>
        <option value="oh">Overhaul</option>
      </select>
      <button
        onClick={() => onCommand({
          type: "send_to_shop",
          assetId: asset.id,
          shopId,
          workscope,
        }, "Repair order")}
      >
        Send · {formatAcc((part?.listPrice ?? 0) * (workscope === "oh" ? 0.48 : 0.28))}
      </button>
    </div>
  );
}

function KpiIndex() {
  const entries = [
    ["MTBR", "Mean Time Between Removals", "Expected operating time between removals; the broad reliability interval."],
    ["MTBUR", "Mean Time Between Unscheduled Removals", "Use when the interval specifically excludes scheduled removals."],
    ["MTBO", "Mean Time Between Overhauls", "Expected operating interval between overhaul events."],
    ["Repair TAT", "Repair Turnaround Time", "Weeks from repair-shop receipt to completed workscope."],
    ["Logistics TAT", "Logistics Turnaround Time", "Weeks required to move an asset between facilities."],
    ["TSN / CSN", "Time / Cycles Since New", "Total accumulated operating hours and cycles."],
    ["TSR / CSR", "Time / Cycles Since Repair", "Operating counters accumulated since the last repair."],
    ["TSO / CSO", "Time / Cycles Since Overhaul", "Operating counters accumulated since the last overhaul."],
    ["NE / NS", "New / New Surplus", "Unused material; NS is unused stock released as surplus from an existing inventory position."],
    ["OH", "Overhauled", "Asset completed an overhaul workscope."],
    ["SV / RP", "Serviceable / Repaired", "Eligible for use after inspection or repair within the game model."],
    ["AR", "As Removed", "Removed from service and not yet restored to serviceable condition."],
    ["BER", "Beyond Economical Repair", "Technically or economically unsuitable for a normal repair decision."],
  ];
  return (
    <Sheet title="Aviation KPI Index" code="REF / OPS / 05">
      <div className="definition-grid">
        {entries.map(([code, title, description]) => (
          <article key={code}>
            <span className="definition-code">{code}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </Sheet>
  );
}

function PbhDesk({
  observation,
  onCommand,
}: {
  observation: GameObservation;
  onCommand: (command: unknown, message: string) => void;
}) {
  return (
    <Sheet title="Power-by-the-Hour" code="PBH / SLA / 06">
        <p className="lead compact">
          Contracted ACC revenue in return for condition-qualified availability. Repair and logistics TAT still decide whether the SLA survives. Every strand is a promise.
        </p>
      <div className="card-grid">
        {observation.pbhContracts.map((contract) => {
          const airline = observation.airlines.find((candidate) => candidate.id === contract.airlineId);
          const coverageByPart = contract.partIds.map((partId) => ({
            partId,
            name: observation.parts.find((part) => part.id === partId)?.name ?? partId,
            count: observation.inventory.filter(
              (asset) =>
                asset.partId === partId &&
                isServiceable(asset.condition) &&
                asset.facilityId === observation.firm.warehouseFacilityId,
            ).length,
          }));
          const coverage = coverageByPart.reduce((sum, item) => sum + item.count, 0);
          const airlineNode = observation.nodes.find(
            (node) => node.organizationId === airline?.organizationId,
          );
          const airlineRelationship = observation.relationships.find(
            (relationship) => relationship.organizationId === airline?.organizationId,
          )?.score ?? 0;
          const preferredAgreement = observation.agreements.some(
            (agreement) =>
              agreement.organizationId === airline?.organizationId &&
              agreement.kind === "preferred_vendor",
          );
          const eligible =
            observation.firm.globalReputation >= 50 &&
            airlineRelationship >= 45 &&
            airlineNode?.state === "partner" &&
            preferredAgreement &&
            coverageByPart.every((item) => item.count > 0);
          return (
            <article className="listing-card" key={contract.id}>
              <div className="card-heading"><span className={`stamp ${contract.status}`}>{contract.status.toUpperCase()}</span></div>
              <h3>{airline?.name ?? contract.airlineId}</h3>
              <p>{contract.seriesId} · {contract.partIds.length} covered P/Ns</p>
              <Metric label="PBH rate" value={`${contract.ratePerFh} ACC / FH`} />
              <Metric label="Weekly floor" value={`${formatAcc(contract.minimumWeeklyRate)} ACC`} />
              <Metric label="Serviceable coverage" value={String(coverage)} />
              <Metric label="SLA / misses" value={`${contract.slaTicks} wk / ${contract.misses} of ${contract.maxMisses}`} />
              <Metric label="Airline relationship" value={`${airlineRelationship} / 45`} />
              <ul className="manifest-list">
                {coverageByPart.map((item) => (
                  <li key={item.partId}><span>{item.name}</span><strong>{item.count} ready</strong></li>
                ))}
              </ul>
              {contract.status === "offered" && (
                <button disabled={!eligible} className="primary" onClick={() => onCommand({ type: "sign_pbh", contractId: contract.id }, "PBH contract")}>
                  {eligible ? "Sign PBH" : "Needs airline partner, preferred-vendor agreement, reputation 50, and ≥1 of each P/N"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </Sheet>
  );
}

function InspectSheet({
  target,
  observation,
  onClose,
  onCommand,
}: {
  target: Exclude<InspectTarget, null>;
  observation: GameObservation;
  onClose: () => void;
  onCommand: (command: unknown, message: string) => void;
}) {
  let body: ReactNode;
  if (target.kind === "asset") {
    const asset = observation.inventory.find((candidate) => candidate.id === target.id);
    const part = observation.parts.find((candidate) => candidate.id === asset?.partId);
    body = asset ? (
      <>
        <p className="eyebrow">SERIALIZED ASSET / #{asset.id}</p>
        <h2>{part?.name}</h2>
        <div className="metric-grid">
          <Metric label="P/N" value={asset.partId} />
          <Metric label="Condition" value={asset.condition} />
          <Metric label="MTBR" value={`${part?.mtbrFh.toLocaleString()} FH`} />
          <Metric label="MTBUR" value={part?.mtburFh ? `${part.mtburFh.toLocaleString()} FH` : "N/A"} />
          <Metric label="MTBO" value={part?.mtboFh ? `${part.mtboFh.toLocaleString()} FH` : "N/A"} />
          <Metric label="TSN / CSN" value={`${asset.tsn.toLocaleString()} / ${asset.csn.toLocaleString()}`} />
          <Metric label="TSR / CSR" value={`${asset.tsr.toLocaleString()} / ${asset.csr.toLocaleString()}`} />
          <Metric label="TSO / CSO" value={`${asset.tso.toLocaleString()} / ${asset.cso.toLocaleString()}`} />
          <Metric label="Acquisition" value={`${formatAcc(asset.acquisitionCost)} ACC`} />
          <Metric label="Facility" value={asset.transferId ? "In transit" : asset.facilityId ?? "Allocated"} />
        </div>
      </>
    ) : <Empty>Asset not found.</Empty>;
  } else if (target.kind === "part") {
    const part = observation.parts.find((candidate) => candidate.id === target.id);
    const assets = observation.inventory.filter((asset) => asset.partId === target.id);
    body = part ? (
      <>
        <p className="eyebrow">PART MASTER / ATA {part.ata}</p>
        <h2>{part.name}</h2>
        <div className="metric-grid">
          <Metric label="Fictional P/N" value={part.id} />
          <Metric label="Removal model" value={part.removalMode} />
          <Metric label="MTBR" value={`${part.mtbrFh.toLocaleString()} FH`} />
          <Metric label="MTBUR" value={part.mtburFh ? `${part.mtburFh.toLocaleString()} FH` : "N/A"} />
          <Metric label="MTBO" value={part.mtboFh ? `${part.mtboFh.toLocaleString()} FH` : "N/A"} />
          <Metric label="Game list" value={`${formatAcc(part.listPrice)} ACC`} />
          <Metric label="Owned" value={String(assets.length)} />
        </div>
      </>
    ) : <Empty>Part not found.</Empty>;
  } else {
    const node = observation.nodes.find((candidate) => candidate.id === target.id);
    const relationship = observation.relationships.find((candidate) => candidate.organizationId === node?.organizationId);
    const opportunities = observation.opportunities.filter((candidate) => candidate.nodeId === node?.id);
    body = node ? (
      <>
        <p className="eyebrow">{node.role.toUpperCase()} / {node.state.toUpperCase()}</p>
        <h2>{node.label}</h2>
        <div className="metric-grid">
          <Metric label="Relationship" value={String(relationship?.score ?? 0)} />
          <Metric label="On-time deliveries" value={String(relationship?.onTimeDeliveries ?? 0)} />
          <Metric label="Misses" value={String(relationship?.missedDeliveries ?? 0)} />
          <Metric label="Logistics TAT" value={`${node.logisticsTatTicks} wk`} />
        </div>
        {opportunities.map((opportunity) => (
          <OpportunityRow key={opportunity.id} opportunity={opportunity} onCommand={onCommand} />
        ))}
      </>
    ) : <Empty>Node not found.</Empty>;
  }
  return (
    <div className="inspect-backdrop" role="dialog" aria-modal="true">
      <section className="inspect-sheet">
        <button className="close-button" onClick={onClose} aria-label="Close inspection">×</button>
        {body}
      </section>
    </div>
  );
}

function EndSheet({ observation }: { observation: GameObservation }) {
  const totalDelta = observation.pulses.reduce((sum, pulse) => sum + pulse.delta, 0);
  const sources = [
    ["Sales", observation.pulses.reduce((sum, pulse) => sum + pulse.sales, 0)],
    ["PBH / contracts", observation.pulses.reduce((sum, pulse) => sum + pulse.contracts, 0)],
    ["Asset purchases", observation.pulses.reduce((sum, pulse) => sum + pulse.purchases, 0)],
    ["Repair", observation.pulses.reduce((sum, pulse) => sum + pulse.repair, 0)],
    ["Logistics", observation.pulses.reduce((sum, pulse) => sum + pulse.logistics, 0)],
    ["Overhead", observation.pulses.reduce((sum, pulse) => sum + pulse.overhead, 0)],
    ["Penalties", observation.pulses.reduce((sum, pulse) => sum + pulse.penalties, 0)],
  ] as const;
  const maxSource = Math.max(1, ...sources.map(([, value]) => Math.abs(value)));
  return (
    <div className="inspect-backdrop" role="dialog" aria-modal="true">
      <section className="inspect-sheet end-sheet">
        <p className="eyebrow">CAMPAIGN CLOSED / WEEK {observation.tick}</p>
        <h2>{observation.firm.insolvent ? "The book ran out of ACC." : "You kept the metal flying."}</h2>
        <div className="metric-grid">
          <Metric label="ACC result" value={signedAcc(totalDelta)} />
          <Metric label="Ending ACC" value={formatAcc(observation.firm.accBalance)} />
          <Metric label="NAV" value={formatAcc(observation.firm.nav)} />
          <Metric label="Fill rate" value={`${Math.round(observation.firm.fillRate * 100)}%`} />
          <Metric label="Reputation" value={String(observation.firm.globalReputation)} />
          <Metric label="Network agreements" value={String(observation.agreements.length)} />
        </div>
        <h3>ACC pulse-source waterfall</h3>
        <div className="pulse-waterfall">
          {sources.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <i className={value >= 0 ? "positive" : "negative"} style={{ width: `${Math.max(2, Math.abs(value) / maxSource * 100)}%` }} />
              <strong>{signedAcc(value)}</strong>
            </div>
          ))}
        </div>
        <p>Reload the page to establish a new seeded world. Your latest save stays in this browser. The book remembers.</p>
      </section>
    </div>
  );
}

function PulseBeat({ pulse, onClose }: { pulse: GameObservation["pulses"][number]; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 1400);
    return () => window.clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="pulse-beat" role="status" aria-live="polite">
      <div className="pulse-beat-card">
        <p className="eyebrow">WEEK {pulse.tick} / PULSE RESOLVED</p>
        <strong className={pulse.delta >= 0 ? "positive" : "negative"}>{signedAcc(pulse.delta)}</strong>
        <span>The market moved while you slept.</span>
      </div>
    </div>
  );
}

function Sheet({ title, code, children }: { title: string; code: string; children: ReactNode }) {
  return (
    <section className="paper-sheet">
      <header className="sheet-header">
        <div><p className="eyebrow">{code}</p><h2>{title}</h2></div>
        <span className="revision">REV<br /><strong>01</strong></span>
      </header>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Condition({ value }: { value: string }) {
  return <span className={`condition condition-${value.toLowerCase()}`}>{value}</span>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

function useCountdown(remainingMs: number, status: string): number {
  const [seconds, setSeconds] = useState(Math.ceil(remainingMs / 1000));
  useEffect(() => {
    setSeconds(Math.ceil(remainingMs / 1000));
    if (status !== "running") return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((remainingMs - (Date.now() - started)) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [remainingMs, status]);
  return seconds;
}

function inventoryMark(observation: GameObservation): number {
  return observation.firm.inventoryAtMark;
}

function facilityName(observation: GameObservation, facilityId: string): string {
  return observation.facilities.find((facility) => facility.id === facilityId)?.name ?? facilityId;
}

function isServiceable(condition: Unit["condition"]): boolean {
  return ["NE", "NS", "OH", "SV", "RP"].includes(condition);
}

function clientMeetsCondition(have: Unit["condition"], minimum: Unit["condition"]): boolean {
  const rank: Record<Unit["condition"], number> = {
    NE: 0,
    NS: 0,
    OH: 1,
    SV: 2,
    RP: 2,
    AR: 3,
    BER: 4,
    SCRAP: 5,
  };
  return rank[have] <= rank[minimum];
}

function formatAcc(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1_000)}K`;
  return Math.round(value).toLocaleString("en-US");
}

function signedAcc(value: number): string {
  return `${value >= 0 ? "+" : "−"}${formatAcc(Math.abs(value))} ACC`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Something went wrong";
}

function feedbackMessage(
  kind: string,
  payload: Record<string, number | string | boolean | null>,
): string {
  if (kind === "command_rejected") return `Action rejected: ${String(payload.reason).replaceAll("_", " ")}.`;
  if (kind === "listing_purchased") {
    return `Purchase accepted: ${formatAcc(Number(payload.acc))} ACC + ${formatAcc(Number(payload.logisticsCost))} logistics; arrival in ${payload.logisticsTat} week(s).`;
  }
  if (kind === "repair_ordered") {
    return `Repair accepted: ${formatAcc(Number(payload.fee))} ACC; repair TAT ${payload.repairTat} week(s).`;
  }
  if (kind === "network_agreement_signed") return `Network agreement signed: ${String(payload.agreementKind).replaceAll("_", " ")}.`;
  if (kind === "network_opportunity_accepted") return "A new thread joins the network.";
  if (kind === "pbh_signed") return `PBH signed: ${payload.ratePerFh} ACC/FH; ${formatAcc(Number(payload.minimumWeeklyRate))} weekly floor.`;
  if (kind === "pbh_sla_miss") return `PBH SLA missed: ${formatAcc(Number(payload.penalty))} ACC penalty.`;
  if (kind === "transfer_arrived") return `Shipment arrived at ${String(payload.toFacilityId)}.`;
  return kind.replaceAll("_", " ");
}

function latestFeedbackEvent(events: GameObservation["events"]) {
  const newest = [...events].reverse();
  return (
    newest.find((event) =>
      [
        "command_rejected",
        "listing_purchased",
        "repair_ordered",
        "network_agreement_signed",
        "network_opportunity_accepted",
        "pbh_signed",
        "pbh_sla_miss",
      ].includes(event.kind),
    ) ??
    newest.find((event) =>
      [
        "transfer_arrived",
      ].includes(event.kind),
    )
  );
}
