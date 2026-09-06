import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LiveSnapshot } from "../live/runner.ts";
import type { GameObservation } from "../sim/observation.ts";
import type {
  KnowledgeBranch,
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
import { NewGame } from "./components/NewGame.tsx";
import { OfficeHQ } from "./components/OfficeHQ.tsx";
import { PulseWheel } from "./components/PulseWheel.tsx";
import { NetworkMapV2 } from "./components/NetworkMapV2.tsx";
import { FinanceMonitor } from "./components/FinanceMonitor.tsx";
import { FleetManager } from "./components/FleetManager.tsx";
import { tickDurationMs } from "../sim/balance.ts";
import { KNOWLEDGE_NODES, canInvest, nodesInBranch } from "../sim/knowledge.ts";
import { TEAM_ROLE_DEFS, weeklySalaryCost } from "../sim/team.ts";

/**
 * The office is the shell. Everything else is a surface opened from it: three
 * monitors on the desk, the certificate wall behind it, and the team screen beside it.
 * Buying and selling strategy are no longer places you visit; they are a drawer
 * inside the fleet manager.
 */
type View = "hq" | "map" | "finance" | "fleet" | "intel" | "wall" | "team" | "market" | "pbh";
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
    setPulseBeat(null);
  }, [view]);

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
      <NewGameScreen
        busy={busy}
        error={error}
        onStart={async (input) => {
          setBusy(true);
          try {
            setSnapshot(await createCampaign(input));
            setView("hq");
            setError("");
            startMusic();
          } catch (cause) {
            setError(messageOf(cause));
          } finally {
            setBusy(false);
          }
        }}
        onLoad={async (saveId) => {
          setBusy(true);
          try {
            const loaded = await loadCampaign(saveId, "fast");
            setSnapshot(loaded);
            setView("hq");
            setError("");
            setNotice(`Loaded ${saveId} at week ${loaded.observation.tick}.`);
            startMusic();
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
          ["hq", "Office HQ"],
          ["map", "Network Map"],
          ["finance", "Finance"],
          ["fleet", "Fleet Manager"],
          ["intel", "Intelligence"],
          ["wall", "Tribal Knowledge"],
          ["team", "Team"],
          ["market", "Marketplace"],
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
          <OfficeHQ
            observation={observation}
            onOpenMonitor={(which) =>
              setView(which === "finance" ? "finance" : which === "fleet" ? "fleet" : "intel")
            }
            onOpenWall={() => setView("wall")}
            onOpenTeam={() => setView("team")}
            onOpenMap={() => setView("map")}
          />
        )}
        {view === "map" && (
          <NetworkMapV2
            observation={observation}
            onInspectNode={(id) => setInspect({ kind: "node", id })}
            onOpenOpportunity={(opportunityId) =>
              command({ type: "open_opportunity", opportunityId }, "Opportunity")
            }
            onVisitNode={(nodeId) => command({ type: "visit_node", nodeId }, "Site visit")}
            onOpenListing={(listingId) => {
              setMarketFocus(listingId);
              setView("market");
            }}
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
        {view === "fleet" && (
          <FleetManager
            observation={observation}
            onCommand={command}
            onInspectAsset={(id) => setInspect({ kind: "asset", id })}
          />
        )}
        {view === "finance" && (
          <FinanceMonitor observation={observation} onClose={() => setView("hq")} />
        )}
        {view === "intel" && <IntelPanel observation={observation} />}
        {view === "wall" && <WallPanel observation={observation} onCommand={command} />}
        {view === "team" && <TeamPanel observation={observation} onCommand={command} />}
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

/** Thin wrapper: the NewGame component is presentational, so saves are fetched here. */
function NewGameScreen({
  busy,
  error,
  onStart,
  onLoad,
}: {
  busy: boolean;
  error: string;
  onStart: (input: {
    seed: number;
    pace: LivePace;
    ticks: number;
    scenario: "prototype" | "full";
    companyName: string;
    founderName: string;
    portraitId: string;
  }) => void;
  onLoad: (saveId: string) => void;
}) {
  const [saves, setSaves] = useState<
    { id: string; savedAt: string; tick: number; seed: number }[]
  >([]);
  useEffect(() => {
    void listSaves().then(setSaves).catch(() => setSaves([]));
  }, []);
  useEffect(() => {
    // Browsers block audio until a gesture; the first pointer press starts the theme.
    const kick = () => startMusic();
    window.addEventListener("pointerdown", kick, { once: true });
    return () => window.removeEventListener("pointerdown", kick);
  }, []);
  return <NewGame busy={busy} error={error} saves={saves} onStart={onStart} onLoad={onLoad} />;
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
  const pendingCount = observation.pendingCommands.length;
  return (
    <header className="ledger-header">
      <div className="brand">
        <span className="eyebrow">{observation.company.identity.companyName.toUpperCase()}</span>
        <strong>Office HQ</strong>
      </div>
      <div className="acc-balance">
        <span>ACC BALANCE</span>
        <strong>{formatAcc(observation.firm.accBalance)}</strong>
      </div>
      <div className={`pulse-delta ${(pulse?.delta ?? 0) >= 0 ? "positive" : "negative"}`}>
        <span>WEEK {pulse?.tick ?? 0} PULSE</span>
        <strong>{signedAcc(pulse?.delta ?? 0)}</strong>
      </div>
      <div className="clock-actions">
        <button disabled={busy} onClick={onSave}>Save</button>
        <MusicToggle />
      </div>
      <PulseWheel
        calendar={observation.calendar}
        progress={pulseProgress(snapshot)}
        paused={snapshot.status !== "running"}
        busy={busy}
        pendingCount={pendingCount}
        pace={snapshot.pace}
        budget={observation.company.budget}
        lastDelta={pulse?.delta ?? null}
        onPulse={() => onAction("step")}
        onPause={() => onAction(snapshot.status === "running" ? "pause" : "resume")}
        onPace={onPace}
      />
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


/** 0..1 through the current live pulse, derived from the runner's remaining time. */
function pulseProgress(snapshot: LiveSnapshot): number {
  const total = tickDurationMs(snapshot.pace);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - snapshot.remainingMs / total));
}

/**
 * Market intelligence. The fog covers the economy as well as the map: shock detail
 * stays hidden until the player earns the intel to see it.
 */
function IntelPanel({ observation }: { observation: GameObservation }) {
  const market = observation.market;
  const funnel = observation.funnel;
  const total = funnel.tam + funnel.sam + funnel.som;
  return (
    <Sheet title="Market Intelligence" code="INT / MKT / 01">
      <div className="live-breakdown">
        <span>Price index {market.priceIndex.toFixed(3)}</span>
        <span>Demand index {market.demandIndex.toFixed(3)}</span>
        <span>Tracked assets {market.trackedAssets.toLocaleString("en-US")}</span>
        <span>World fleet {market.worldAssets.toLocaleString("en-US")}</span>
        <span>Growth {(market.growthRate * 100).toFixed(0)}%/yr</span>
        <span>Retirement {(market.retireRate * 100).toFixed(0)}%/yr</span>
      </div>
      <p className="lead compact">
        The engine tracks a scaled slice of the world fleet. Everything outside your
        reach exists as statistics, not as serial numbers.
      </p>
      <h3>Reach</h3>
      <div className="live-breakdown">
        <span>TAM {funnel.tam} sites, exist but unseen</span>
        <span>SAM {funnel.sam} sites, visible, not established</span>
        <span>SOM {funnel.som} sites, ready to trade</span>
        <span>{total} sites total</span>
      </div>
      <h3>Known shocks</h3>
      {market.knownShocks.length === 0 ? (
        <p className="lead compact">
          No shock intelligence. The AI branch of Tribal Knowledge and an analyst on
          the team both reveal what the market is doing before it shows up in prices.
        </p>
      ) : (
        <ul className="plain-list">
          {market.knownShocks.map((shock) => (
            <li key={shock.id}>
              <strong>{shock.label}</strong> — weeks {shock.startTick} to {shock.endTick},
              price {(shock.priceImpact * 100).toFixed(0)}%, demand{" "}
              {(shock.demandImpact * 100).toFixed(0)}%
              {shock.ata !== null ? ` · ATA ${shock.ata}` : ""}
              {shock.regionCode ? ` · ${shock.regionCode}` : ""}
            </li>
          ))}
        </ul>
      )}
      <h3>Where the fleet sits</h3>
      <ul className="plain-list">
        {market.byRegion.slice(0, 8).map((row) => (
          <li key={row.code}>
            {row.name}: {row.count.toLocaleString("en-US")} tracked
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** The certificate wall: Tribal Knowledge. */
function WallPanel({
  observation,
  onCommand,
}: {
  observation: GameObservation;
  onCommand: (command: unknown, label: string) => void;
}) {
  const progress = observation.company.knowledge;
  const earned = progress.filter((entry) => entry.completedTick !== null).length;
  const branches: KnowledgeBranch[] = ["certification", "asset", "operations"];
  return (
    <Sheet title="Tribal Knowledge" code="TK / WALL / 01">
      <p className="lead compact">
        {earned} of {KNOWLEDGE_NODES.length} earned. Certifications and memberships hang
        on the wall; asset knowledge is organised by ATA chapter; company operations
        cover sales, operations and AI.
      </p>
      {branches.map((branch) => (
        <section key={branch}>
          <h3>
            {branch === "certification"
              ? "Certifications and memberships"
              : branch === "asset"
                ? "Asset knowledge by ATA chapter"
                : "Company operations"}
          </h3>
          <ul className="plain-list">
            {nodesInBranch(branch).map((node) => {
              const entry = progress.find((candidate) => candidate.nodeId === node.id);
              const done = entry?.completedTick !== null && entry !== undefined;
              const gate = canInvest(node.id, progress, observation.firm.accBalance);
              return (
                <li key={node.id}>
                  <strong>{node.shortTitle}</strong> — {node.blurb}
                  <br />
                  <small>
                    {formatAcc(node.accCost)} ACC · {node.timeCost} h/wk ·{" "}
                    {node.ticksToComplete} weeks
                    {node.ataCodes.length > 0 ? ` · ATA ${node.ataCodes.join(", ")}` : ""}
                  </small>{" "}
                  {done ? (
                    <em>Earned</em>
                  ) : entry ? (
                    <em>
                      In progress {entry.investedTicks}/{node.ticksToComplete}
                    </em>
                  ) : (
                    <button
                      type="button"
                      disabled={!gate.ok}
                      title={gate.reason ?? "Begin studying"}
                      onClick={() =>
                        onCommand({ type: "invest_knowledge", nodeId: node.id }, node.shortTitle)
                      }
                    >
                      Invest
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}

/** The side screen: Team. */
function TeamPanel({
  observation,
  onCommand,
}: {
  observation: GameObservation;
  onCommand: (command: unknown, label: string) => void;
}) {
  const { team, candidates } = observation.company;
  const payroll = weeklySalaryCost(team);
  return (
    <Sheet title="Team" code="TEAM / CALL / 01">
      <p className="lead compact">
        {team.length} hired. Weekly payroll {formatAcc(payroll)} ACC. Candidates come
        from the map and from memberships such as ISTAT.
      </p>
      <h3>Roster</h3>
      {team.length === 0 ? (
        <p className="lead compact">
          Just you, so far. Every hire buys back founder hours or opens something you
          cannot reach alone.
        </p>
      ) : (
        <ul className="plain-list">
          {team.map((member) => (
            <li key={member.id}>
              <strong>{member.name}</strong> — {TEAM_ROLE_DEFS[member.role].label}, skill{" "}
              {member.skill}, {formatAcc(member.salary)} ACC/wk
              {member.ataAffinity.length > 0 ? ` · ATA ${member.ataAffinity.join(", ")}` : ""}
              <br />
              <small>{TEAM_ROLE_DEFS[member.role].blurb}</small>{" "}
              <button
                type="button"
                onClick={() =>
                  onCommand({ type: "release_team_member", memberId: member.id }, "Release")
                }
              >
                Release
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>Candidates</h3>
      <ul className="plain-list">
        {candidates.map((candidate) => (
          <li key={candidate.id}>
            <strong>{candidate.name}</strong> — {TEAM_ROLE_DEFS[candidate.role].label}, skill{" "}
            {candidate.skill}, {formatAcc(candidate.salary)} ACC/wk
            <br />
            <small>
              {candidate.blurb} · available {Math.max(0, candidate.availableUntilTick - observation.tick)} more weeks
            </small>{" "}
            <button
              type="button"
              onClick={() =>
                onCommand({ type: "hire_team_member", candidateId: candidate.id }, "Hire")
              }
            >
              Hire
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
