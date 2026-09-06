/* ==========================================================================
   TribalKnowledge — the certificate WALL behind the founder's standing desk.

   The opening view is the wall itself: seven aluminium frames under picture
   lights, styled to sit with the hq-wall-filled art. Earned certifications
   carry an engraved plate; available frames are empty outlines; locked frames
   are dimmed and name the certificate that has to come first.

   Beneath the wall, three panels hold the rest of the capability register:
   the certification branch as cards, the asset branch as an ATA 100 tree, and
   the operations branch as three prerequisite chains.

   Pure presentational. Every number comes from the GameObservation it is
   handed; the only state is the selected node, the active panel, and whether
   the backdrop art loaded. The single effect (Escape to close) cleans up.

   Colour comes only from the tokens in styles.css. The one drawn mark, the
   close glyph, inherits currentColor.
   ========================================================================== */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ATA_GROUP_LABELS, ataGroupOf, ataLabel } from "../../sim/ata.ts";
import {
  KNOWLEDGE_NODES,
  canInvest,
  isUnlocked,
  knowledgeWallSlots,
  nodesInBranch,
} from "../../sim/knowledge.ts";
import type { GameObservation } from "../../sim/observation.ts";
import type {
  AtaGroup,
  FacilityKind,
  KnowledgeBranch,
  KnowledgeEffect,
  KnowledgeNode,
  KnowledgeProgress,
  RegionCode,
} from "../../sim/types.ts";
import "./TribalKnowledge.css";

/* ---------------------------------------------------------------- *
 * Contract
 * ---------------------------------------------------------------- */

export type TribalKnowledgeProps = {
  observation: GameObservation;
  /** Put this pulse's founder hours into a node. */
  onInvest: (nodeId: string) => void;
  onClose: () => void;
};

/* ---------------------------------------------------------------- *
 * Constants
 * ---------------------------------------------------------------- */

/** Wall backdrop. Absent until the art pass runs; the CSS fallback carries it. */
const WALL_ART = "assets/gen/hq-wall-filled.svg";

/** Picture lights hung over the frames. Decorative only. */
const PICTURE_LIGHTS = 4;

type NodeState = "earned" | "in_progress" | "available" | "locked";

const STATE_LABEL: Record<NodeState, string> = {
  earned: "Earned",
  in_progress: "In progress",
  available: "Available",
  locked: "Locked",
};

const BRANCH_LABEL: Record<KnowledgeBranch, string> = {
  certification: "Certifications and memberships",
  asset: "Asset knowledge",
  operations: "Company operations",
};

const PANELS: { branch: KnowledgeBranch; label: string; blurb: string }[] = [
  {
    branch: "certification",
    label: "Certifications and memberships",
    blurb:
      "The seven frames on the wall. Real accreditations and trade bodies, each audited or joined, each opening a door that money alone will not.",
  },
  {
    branch: "asset",
    label: "Asset knowledge",
    blurb:
      "The ATA 100 tree. A cheap fundamentals root per chapter group, then one expensive specialist per high-value chapter.",
  },
  {
    branch: "operations",
    label: "Company operations",
    blurb:
      "Three chains the founder has to walk in order: sales and marketing, operations, and AI.",
  },
];

/** Plain words for a facility an accreditation opens up. */
const FACILITY_LABEL: Record<FacilityKind, string> = {
  warehouse: "warehouse",
  hangar: "hangar",
  repair_shop: "repair shop",
  factory: "factory",
  engine_shop: "engine shop",
  component_shop: "component shop",
  teardown: "teardown and part-out",
  lessor: "lessor",
  broker: "broker",
  distribution: "distribution",
  conference: "conference",
};

/* ---------------------------------------------------------------- *
 * Tree shapes, derived once from the pure knowledge module
 * ---------------------------------------------------------------- */

type AssetGroupView = { group: AtaGroup; root: KnowledgeNode; children: KnowledgeNode[] };

/** Asset branch as an ATA tree: fundamentals root, then its chapter specialists. */
function buildAssetTree(): { groups: AssetGroupView[]; orphans: KnowledgeNode[] } {
  const nodes = nodesInBranch("asset");
  const roots = nodes.filter((node) => node.requires.length === 0);
  const claimed = new Set<string>(roots.map((root) => root.id));
  const groups = roots.map((root) => {
    const children = nodes
      .filter((node) => node.requires.includes(root.id))
      .sort((a, b) => (a.ataCodes[0] ?? 0) - (b.ataCodes[0] ?? 0));
    for (const child of children) claimed.add(child.id);
    return { group: ataGroupOf(root.ataCodes[0] ?? 0), root, children };
  });
  return { groups, orphans: nodes.filter((node) => !claimed.has(node.id)) };
}

/** Shallowest first, so a chain always reads in prerequisite order. */
function orderByPrerequisite(nodes: KnowledgeNode[]): KnowledgeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const cache = new Map<string, number>();
  function depthOf(id: string, seen: Set<string>): number {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = (byId.get(id)?.requires ?? []).filter((required) => byId.has(required));
    const depth = parents.length === 0 ? 0 : Math.max(...parents.map((p) => depthOf(p, seen))) + 1;
    cache.set(id, depth);
    return depth;
  }
  return [...nodes].sort(
    (a, b) => depthOf(a.id, new Set()) - depthOf(b.id, new Set()) || a.id.localeCompare(b.id),
  );
}

type ChainView = { key: string; label: string; blurb: string; nodes: KnowledgeNode[] };

const OPERATIONS_CHAIN_SPECS: { key: string; prefix: string; label: string; blurb: string }[] = [
  {
    key: "sales",
    prefix: "ops.sales.",
    label: "Sales and marketing",
    blurb: "Being in the room when a fleet plan changes.",
  },
  {
    key: "ops",
    prefix: "ops.ops.",
    label: "Operations",
    blurb: "Freight, goods inward, racking, and finally people in another time zone.",
  },
  {
    key: "ai",
    prefix: "ops.ai.",
    label: "AI",
    blurb: "Hand the repetitive judgement to software and buy the founder's hours back.",
  },
];

function buildOperationsChains(): ChainView[] {
  const nodes = nodesInBranch("operations");
  const claimed = new Set<string>();
  const chains = OPERATIONS_CHAIN_SPECS.map((spec) => {
    const members = nodes.filter((node) => node.id.startsWith(spec.prefix));
    for (const node of members) claimed.add(node.id);
    return { key: spec.key, label: spec.label, blurb: spec.blurb, nodes: orderByPrerequisite(members) };
  }).filter((chain) => chain.nodes.length > 0);
  const rest = nodes.filter((node) => !claimed.has(node.id));
  if (rest.length > 0) {
    chains.push({
      key: "other",
      label: "Other",
      blurb: "Operations work that does not sit in one of the three chains.",
      nodes: orderByPrerequisite(rest),
    });
  }
  return chains;
}

const ASSET_TREE = buildAssetTree();
const OPERATIONS_CHAINS = buildOperationsChains();
const CERTIFICATION_NODES = nodesInBranch("certification");

/* ---------------------------------------------------------------- *
 * Component
 * ---------------------------------------------------------------- */

export function TribalKnowledge({ observation, onInvest, onClose }: TribalKnowledgeProps): ReactNode {
  const headingId = useId();
  const [panel, setPanel] = useState<KnowledgeBranch>("certification");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [artBroken, setArtBroken] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* Escape closes the wall. Registered once, removed on unmount. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const progress = useMemo<KnowledgeProgress[]>(
    () => observation.company?.knowledge ?? [],
    [observation.company],
  );
  const accBalance = observation.firm.accBalance;
  const budget = observation.company?.budget;
  const hoursLeft = budget ? Math.max(0, budget.timeTotal - budget.timeSpent) : null;

  const regionName = useCallback(
    (code: RegionCode): string =>
      observation.regions?.find((region) => region.code === code)?.name ?? code,
    [observation.regions],
  );

  const slots = useMemo(() => knowledgeWallSlots(progress), [progress]);
  const earnedCount = useMemo(
    () => KNOWLEDGE_NODES.filter((node) => isUnlocked(node.id, progress)).length,
    [progress],
  );
  const certEarned = useMemo(
    () => CERTIFICATION_NODES.filter((node) => isUnlocked(node.id, progress)).length,
    [progress],
  );
  const chaptersHeld = useMemo(() => {
    const codes = new Set<number>();
    for (const node of nodesInBranch("asset")) {
      if (node.ataCodes.length !== 1) continue;
      if (isUnlocked(node.id, progress)) codes.add(node.ataCodes[0] ?? 0);
    }
    return codes.size;
  }, [progress]);

  const selected = selectedId === null ? null : (KNOWLEDGE_NODES.find((n) => n.id === selectedId) ?? null);

  const select = useCallback((node: KnowledgeNode): void => {
    setSelectedId(node.id);
    setPanel(node.branch);
  }, []);

  /* Roving arrow-key movement across the three panel tabs. */
  function onTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void {
    const last = PANELS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    const target = PANELS[next];
    if (!target) return;
    setPanel(target.branch);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="tk" aria-labelledby={headingId}>
      {/* ---- Header and progress ------------------------------------- */}
      <header className="tk-head">
        <div className="tk-head-text">
          <p className="tk-eyebrow">Block Aero · Capability Register</p>
          <h2 className="tk-title" id={headingId}>
            Tribal Knowledge
          </h2>
          <p className="tk-subtitle">
            {observation.company?.identity?.companyName ?? "The company"} · what the firm is
            accredited to do, what it understands, and how it runs.
          </p>
        </div>
        <button type="button" className="tk-close" onClick={onClose} aria-label="Close the certificate wall">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M4 4 L12 12 M12 4 L4 12" />
          </svg>
        </button>
      </header>

      <div className="tk-progress">
        <Meter
          label="Capability earned"
          value={earnedCount}
          total={KNOWLEDGE_NODES.length}
          note={`${KNOWLEDGE_NODES.length - earnedCount} still to study`}
        />
        <Meter
          label="Certifications hung"
          value={certEarned}
          total={CERTIFICATION_NODES.length}
          note={certEarned === CERTIFICATION_NODES.length ? "The wall is full" : "Frames on the wall"}
        />
        <div className="tk-stat">
          <p className="tk-stat-label">ACC on hand</p>
          <p className="tk-stat-value">{formatAcc(accBalance)}</p>
        </div>
        <div className="tk-stat">
          <p className="tk-stat-label">Founder hours left</p>
          <p className="tk-stat-value">{hoursLeft === null ? "—" : `${hoursLeft} h`}</p>
        </div>
        <div className="tk-stat">
          <p className="tk-stat-label">ATA chapters mastered</p>
          <p className="tk-stat-value">{chaptersHeld}</p>
        </div>
      </div>

      {/* ---- 1. The wall --------------------------------------------- */}
      <div className="tk-wall">
        {artBroken ? null : (
          <img
            className="tk-wall-art"
            src={`${import.meta.env.BASE_URL}${WALL_ART}`}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setArtBroken(true)}
          />
        )}
        <div className="tk-lights" aria-hidden="true">
          {Array.from({ length: PICTURE_LIGHTS }, (_, index) => (
            <span className="tk-light" key={index} />
          ))}
        </div>

        <ul className="tk-frames">
          {slots.map((slot) => {
            const entry = progress.find((candidate) => candidate.nodeId === slot.node.id);
            const invested = entry?.investedTicks ?? 0;
            const blockedBy = slot.node.requires
              .filter((required) => !isUnlocked(required, progress))
              .map((required) => shortTitleOf(required));
            return (
              <li className="tk-frame-cell" key={slot.node.id}>
                <button
                  type="button"
                  className="tk-frame"
                  data-state={slot.state}
                  data-selected={selectedId === slot.node.id ? "true" : undefined}
                  aria-pressed={selectedId === slot.node.id}
                  aria-label={frameLabel(slot.node, slot.state, invested, blockedBy)}
                  onClick={() => select(slot.node)}
                >
                  <span className="tk-frame-body" aria-hidden="true">
                    <span className="tk-frame-mat">
                      {slot.state === "earned" ? (
                        <>
                          <span className="tk-plate">{slot.node.shortTitle}</span>
                          <span className="tk-frame-note">Accredited</span>
                          <span className="tk-seal" />
                        </>
                      ) : slot.state === "in_progress" ? (
                        <>
                          <span className="tk-plate tk-plate--ghost">{slot.node.shortTitle}</span>
                          <span className="tk-frame-note">
                            {invested} of {slot.node.ticksToComplete} weeks
                          </span>
                          <span className="tk-frame-bar">
                            <span
                              className="tk-frame-bar-fill"
                              style={{ width: `${ratioPercent(invested, slot.node.ticksToComplete)}%` }}
                            />
                          </span>
                        </>
                      ) : slot.state === "available" ? (
                        <span className="tk-frame-empty">Frame empty · available</span>
                      ) : (
                        <span className="tk-frame-empty">
                          Requires {blockedBy.length > 0 ? blockedBy.join(", ") : "an earlier certificate"}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="tk-frame-caption" aria-hidden="true">
                    <span className="tk-frame-caption-name">{slot.node.shortTitle}</span>
                    <StatusDot state={slot.state} />
                  </span>
                </button>
              </li>
            );
          })}
          <li className="tk-frame-cell tk-frame-cell--plaque">
            <p className="tk-plaque">
              <span className="tk-plaque-count">
                {certEarned}/{CERTIFICATION_NODES.length}
              </span>
              <span className="tk-plaque-label">Certificates hung</span>
            </p>
          </li>
        </ul>
        <span className="tk-wall-rail" aria-hidden="true" />
      </div>

      {/* ---- 2 and 3. Panels beneath the wall, detail on the right ---- */}
      <div className="tk-body">
        <div className="tk-panels">
          <div className="tk-tabs" role="tablist" aria-label="Capability register">
            {PANELS.map((spec, index) => (
              <button
                key={spec.branch}
                type="button"
                role="tab"
                id={`${headingId}-tab-${spec.branch}`}
                aria-selected={panel === spec.branch}
                aria-controls={`${headingId}-panel-${spec.branch}`}
                tabIndex={panel === spec.branch ? 0 : -1}
                className="tk-tab"
                data-active={panel === spec.branch ? "true" : undefined}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                onClick={() => setPanel(spec.branch)}
              >
                <span className="tk-tab-label">{spec.label}</span>
                <span className="tk-tab-count">
                  {countEarned(spec.branch, progress)}/{nodesInBranch(spec.branch).length}
                </span>
              </button>
            ))}
          </div>

          {PANELS.map((spec) => (
            <div
              key={spec.branch}
              role="tabpanel"
              id={`${headingId}-panel-${spec.branch}`}
              aria-labelledby={`${headingId}-tab-${spec.branch}`}
              className="tk-panel"
              hidden={panel !== spec.branch}
            >
              <p className="tk-panel-blurb">{spec.blurb}</p>
              {spec.branch === "certification" ? (
                <CertificationPanel
                  progress={progress}
                  selectedId={selectedId}
                  regionName={regionName}
                  onSelect={select}
                />
              ) : spec.branch === "asset" ? (
                <AssetPanel progress={progress} selectedId={selectedId} onSelect={select} />
              ) : (
                <OperationsPanel progress={progress} selectedId={selectedId} onSelect={select} />
              )}
            </div>
          ))}
        </div>

        <aside className="tk-rail" aria-live="polite" aria-label="Selected capability">
          {selected ? (
            <NodeDetail
              node={selected}
              progress={progress}
              accBalance={accBalance}
              regionName={regionName}
              onInvest={onInvest}
            />
          ) : (
            <div className="tk-detail tk-detail--empty">
              <p className="tk-detail-kicker">Nothing selected</p>
              <p className="tk-detail-empty-text">
                Pick a frame on the wall, or any card below, to read what it costs, what has to
                come first, and exactly what it changes.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- *
 * Panel 1 — certifications and memberships
 * ---------------------------------------------------------------- */

function CertificationPanel({
  progress,
  selectedId,
  regionName,
  onSelect,
}: {
  progress: KnowledgeProgress[];
  selectedId: string | null;
  regionName: (code: RegionCode) => string;
  onSelect: (node: KnowledgeNode) => void;
}): ReactNode {
  return (
    <ul className="tk-cards">
      {CERTIFICATION_NODES.map((node) => {
        const state = nodeStateOf(node, progress);
        const entry = progress.find((candidate) => candidate.nodeId === node.id);
        return (
          <li key={node.id}>
            <article className="tk-card" data-selected={selectedId === node.id ? "true" : undefined}>
              <header className="tk-card-head">
                <h4 className="tk-card-title">
                  <button
                    type="button"
                    className="tk-card-open"
                    aria-pressed={selectedId === node.id}
                    onClick={() => onSelect(node)}
                  >
                    {node.title}
                  </button>
                </h4>
                <span className="tk-status" data-state={state}>
                  <StatusDot state={state} />
                  {STATE_LABEL[state]}
                </span>
              </header>
              <p className="tk-card-blurb">{node.blurb}</p>
              <CostRow node={node} />
              {entry && entry.completedTick === null ? (
                <ProgressBar invested={entry.investedTicks} total={node.ticksToComplete} />
              ) : null}
              <div className="tk-card-unlocks">
                <p className="tk-mini-label">What it unlocks</p>
                <ul className="tk-effects">
                  {node.effects.map((effect, index) => (
                    <li key={`${effect.kind}-${index}`}>{effectText(effect, regionName)}</li>
                  ))}
                </ul>
              </div>
              {node.requires.length > 0 ? (
                <p className="tk-card-requires">
                  Cannot be certified before {node.requires.map(shortTitleOf).join(", ")}.
                </p>
              ) : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- *
 * Panel 2 — asset knowledge, as an ATA tree
 * ---------------------------------------------------------------- */

function AssetPanel({
  progress,
  selectedId,
  onSelect,
}: {
  progress: KnowledgeProgress[];
  selectedId: string | null;
  onSelect: (node: KnowledgeNode) => void;
}): ReactNode {
  return (
    <div className="tk-tree">
      {ASSET_TREE.groups.map((view) => (
        <section className="tk-tree-group" key={view.root.id}>
          <header className="tk-tree-head">
            <p className="tk-tree-kicker">{ATA_GROUP_LABELS[view.group]}</p>
            <h4 className="tk-tree-title">
              <button
                type="button"
                className="tk-card-open"
                aria-pressed={selectedId === view.root.id}
                onClick={() => onSelect(view.root)}
              >
                {view.root.title}
              </button>
            </h4>
            <span className="tk-status" data-state={nodeStateOf(view.root, progress)}>
              <StatusDot state={nodeStateOf(view.root, progress)} />
              {STATE_LABEL[nodeStateOf(view.root, progress)]}
            </span>
            <p className="tk-tree-blurb">{view.root.blurb}</p>
            <CostRow node={view.root} />
            <p className="tk-tree-covers">
              Covers {view.root.ataCodes.length} chapters · gate on every specialist below
            </p>
          </header>
          <ul className="tk-tree-children">
            {view.children.map((child) => {
              const state = nodeStateOf(child, progress);
              return (
                <li key={child.id}>
                  <button
                    type="button"
                    className="tk-tree-child"
                    data-state={state}
                    data-selected={selectedId === child.id ? "true" : undefined}
                    aria-pressed={selectedId === child.id}
                    onClick={() => onSelect(child)}
                  >
                    <span className="tk-tree-child-head">
                      <span className="tk-ata">{ataLabel(child.ataCodes[0] ?? 0)}</span>
                      <span className="tk-status" data-state={state}>
                        <StatusDot state={state} />
                        {STATE_LABEL[state]}
                      </span>
                    </span>
                    <EdgeChips node={child} />
                    <span className="tk-tree-child-cost">
                      {formatAcc(child.accCost)} ACC · {child.timeCost} h per pulse ·{" "}
                      {child.ticksToComplete} weeks
                    </span>
                  </button>
                </li>
              );
            })}
            {view.children.length === 0 ? (
              <li className="tk-tree-none">No chapter specialists in this group yet.</li>
            ) : null}
          </ul>
        </section>
      ))}
      {ASSET_TREE.orphans.length > 0 ? (
        <section className="tk-tree-group">
          <header className="tk-tree-head">
            <p className="tk-tree-kicker">Unfiled</p>
            <h4 className="tk-tree-title">Chapters without a fundamentals root</h4>
          </header>
          <ul className="tk-tree-children">
            {ASSET_TREE.orphans.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className="tk-tree-child"
                  data-state={nodeStateOf(node, progress)}
                  data-selected={selectedId === node.id ? "true" : undefined}
                  aria-pressed={selectedId === node.id}
                  onClick={() => onSelect(node)}
                >
                  <span className="tk-ata">{ataLabel(node.ataCodes[0] ?? 0)}</span>
                  <EdgeChips node={node} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** The trading edge a chapter specialist grants, in four fixed slots. */
function EdgeChips({ node }: { node: KnowledgeNode }): ReactNode {
  const chips: { key: string; label: string; value: string; note: string }[] = [];
  for (const effect of node.effects) {
    if (effect.kind === "buy_discount") {
      chips.push({ key: "buy", label: "Buy", value: pct(effect.value), note: `Buy ${pct(effect.value)} cheaper` });
    } else if (effect.kind === "sell_premium") {
      chips.push({ key: "sell", label: "Sell", value: pct(effect.value), note: `Sell ${pct(effect.value)} higher` });
    } else if (effect.kind === "repair_tat") {
      chips.push({
        key: "repair",
        label: "Repair",
        value: pct(effect.value),
        note: `Repairs turn ${pct(effect.value)} faster`,
      });
    } else if (effect.kind === "ber_accuracy") {
      chips.push({
        key: "ber",
        label: "BER",
        value: pct(effect.value),
        note: `Beyond-economic-repair calls ${pct(effect.value)} more accurate`,
      });
    }
  }
  if (chips.length === 0) return null;
  return (
    <span className="tk-edges">
      {chips.map((chip) => (
        <span className="tk-edge" key={chip.key} title={chip.note}>
          <b>{chip.label}</b>
          <i>{chip.value}</i>
        </span>
      ))}
    </span>
  );
}

/* ---------------------------------------------------------------- *
 * Panel 3 — company operations
 * ---------------------------------------------------------------- */

function OperationsPanel({
  progress,
  selectedId,
  onSelect,
}: {
  progress: KnowledgeProgress[];
  selectedId: string | null;
  onSelect: (node: KnowledgeNode) => void;
}): ReactNode {
  return (
    <div className="tk-chains">
      {OPERATIONS_CHAINS.map((chain) => (
        <section className="tk-chain" key={chain.key}>
          <header className="tk-chain-head">
            <h4 className="tk-chain-title">{chain.label}</h4>
            <p className="tk-chain-blurb">{chain.blurb}</p>
          </header>
          <ol className="tk-chain-steps">
            {chain.nodes.map((node, index) => {
              const state = nodeStateOf(node, progress);
              return (
                <li className="tk-chain-step" key={node.id}>
                  <span className="tk-chain-rank" aria-hidden="true">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    className="tk-chain-button"
                    data-state={state}
                    data-selected={selectedId === node.id ? "true" : undefined}
                    aria-pressed={selectedId === node.id}
                    onClick={() => onSelect(node)}
                  >
                    <span className="tk-chain-line">
                      <span className="tk-chain-name">{node.title}</span>
                      <span className="tk-status" data-state={state}>
                        <StatusDot state={state} />
                        {STATE_LABEL[state]}
                      </span>
                    </span>
                    <span className="tk-chain-text">{node.blurb}</span>
                    <span className="tk-chain-cost">
                      {formatAcc(node.accCost)} ACC · {node.timeCost} h per pulse ·{" "}
                      {node.ticksToComplete} weeks
                    </span>
                    {node.requires.length > 0 ? (
                      <span className="tk-chain-gate">
                        After {node.requires.map(shortTitleOf).join(", ")}
                      </span>
                    ) : (
                      <span className="tk-chain-gate">Open from the start</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Node detail
 * ---------------------------------------------------------------- */

function NodeDetail({
  node,
  progress,
  accBalance,
  regionName,
  onInvest,
}: {
  node: KnowledgeNode;
  progress: KnowledgeProgress[];
  accBalance: number;
  regionName: (code: RegionCode) => string;
  onInvest: (nodeId: string) => void;
}): ReactNode {
  const entry = progress.find((candidate) => candidate.nodeId === node.id);
  const invested = entry?.investedTicks ?? 0;
  const state = nodeStateOf(node, progress);
  const gate = canInvest(node.id, progress, accBalance);
  const started = entry !== undefined;

  return (
    <div className="tk-detail" data-state={state}>
      <p className="tk-detail-kicker">
        {BRANCH_LABEL[node.branch]}
        <span className="tk-status" data-state={state}>
          <StatusDot state={state} />
          {STATE_LABEL[state]}
        </span>
      </p>
      <h3 className="tk-detail-title">{node.title}</h3>
      <p className="tk-detail-blurb">{node.blurb}</p>

      {node.ataCodes.length > 0 ? (
        <section className="tk-detail-block">
          <p className="tk-mini-label">
            ATA chapters covered <span className="tk-mini-count">{node.ataCodes.length}</span>
          </p>
          <p className="tk-ata-cloud">
            {node.ataCodes.map((code) => (
              <span className="tk-ata" key={code}>
                {ataLabel(code)}
              </span>
            ))}
          </p>
        </section>
      ) : null}

      <section className="tk-detail-block">
        <p className="tk-mini-label">Prerequisites</p>
        {node.requires.length === 0 ? (
          <p className="tk-detail-none">None. Open from the first pulse.</p>
        ) : (
          <ul className="tk-prereqs">
            {node.requires.map((required) => {
              const met = isUnlocked(required, progress);
              return (
                <li key={required} data-met={met ? "true" : "false"}>
                  <span className="tk-prereq-mark" aria-hidden="true">
                    {met ? "✓" : "○"}
                  </span>
                  <span className="tk-prereq-name">{shortTitleOf(required)}</span>
                  <span className="tk-prereq-state">{met ? "met" : "not yet earned"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="tk-detail-block">
        <p className="tk-mini-label">Cost</p>
        <dl className="tk-costs">
          <div>
            <dt>ACC cost</dt>
            <dd>{formatAcc(node.accCost)}</dd>
          </div>
          <div>
            <dt>Founder hours per pulse</dt>
            <dd>{node.timeCost} h</dd>
          </div>
          <div>
            <dt>Weeks to complete</dt>
            <dd>{node.ticksToComplete}</dd>
          </div>
        </dl>
        <p className="tk-detail-fineprint">
          {started
            ? "The ACC was charged in full when study began. From here it costs founder hours only."
            : "The ACC is charged in full on the pulse study begins. After that it costs founder hours only."}
        </p>
      </section>

      <section className="tk-detail-block">
        <p className="tk-mini-label">Progress</p>
        <ProgressBar invested={invested} total={node.ticksToComplete} />
      </section>

      <section className="tk-detail-block">
        <p className="tk-mini-label">What it changes</p>
        <ul className="tk-effects">
          {node.effects.map((effect, index) => (
            <li key={`${effect.kind}-${index}`}>{effectText(effect, regionName)}</li>
          ))}
          {node.effects.length === 0 ? <li>Nothing on its own. It is a gate on what comes next.</li> : null}
        </ul>
      </section>

      <div className="tk-invest">
        <button
          type="button"
          className="tk-invest-button"
          disabled={!gate.ok}
          title={gate.reason ?? "Put this pulse's founder hours into it"}
          onClick={() => onInvest(node.id)}
        >
          {state === "earned" ? "Earned" : started ? "Study another week" : "Begin studying"}
        </button>
        <p className="tk-invest-reason">
          {gate.ok
            ? `Spends ${node.timeCost} founder hours this pulse${started ? "" : ` and ${formatAcc(node.accCost)} ACC`}.`
            : (gate.reason ?? "Not available.")}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Small parts
 * ---------------------------------------------------------------- */

function Meter({
  label,
  value,
  total,
  note,
}: {
  label: string;
  value: number;
  total: number;
  note?: string;
}): ReactNode {
  return (
    <div className="tk-meter">
      <p className="tk-meter-label">{label}</p>
      <p className="tk-meter-value">
        <b>{value}</b>
        <span>of {total}</span>
      </p>
      <div
        className="tk-meter-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
        aria-valuetext={`${value} of ${total}`}
      >
        <span className="tk-meter-fill" style={{ width: `${ratioPercent(value, total)}%` }} />
      </div>
      {note ? <p className="tk-meter-note">{note}</p> : null}
    </div>
  );
}

function ProgressBar({ invested, total }: { invested: number; total: number }): ReactNode {
  return (
    <div className="tk-bar-row">
      <div
        className="tk-bar"
        role="progressbar"
        aria-label="Study progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={invested}
        aria-valuetext={`${invested} of ${total} weeks invested`}
      >
        <span className="tk-bar-fill" style={{ width: `${ratioPercent(invested, total)}%` }} />
      </div>
      <p className="tk-bar-text">
        <b>{invested}</b> of {total} weeks
      </p>
    </div>
  );
}

function StatusDot({ state }: { state: NodeState }): ReactNode {
  return <span className="tk-dot" data-state={state} aria-hidden="true" />;
}

function CostRow({ node }: { node: KnowledgeNode }): ReactNode {
  return (
    <p className="tk-costrow">
      <span>
        <b>{formatAcc(node.accCost)}</b> ACC
      </span>
      <span>
        <b>{node.timeCost}</b> h per pulse
      </span>
      <span>
        <b>{node.ticksToComplete}</b> weeks to complete
      </span>
    </p>
  );
}

/* ---------------------------------------------------------------- *
 * Pure helpers
 * ---------------------------------------------------------------- */

function nodeStateOf(node: KnowledgeNode, progress: KnowledgeProgress[]): NodeState {
  if (isUnlocked(node.id, progress)) return "earned";
  const entry = progress.find((candidate) => candidate.nodeId === node.id);
  if (entry && entry.investedTicks > 0) return "in_progress";
  const blocked = node.requires.some((required) => !isUnlocked(required, progress));
  return blocked ? "locked" : "available";
}

function countEarned(branch: KnowledgeBranch, progress: KnowledgeProgress[]): number {
  return nodesInBranch(branch).filter((node) => isUnlocked(node.id, progress)).length;
}

function shortTitleOf(id: string): string {
  return KNOWLEDGE_NODES.find((node) => node.id === id)?.shortTitle ?? id;
}

function frameLabel(
  node: KnowledgeNode,
  state: string,
  invested: number,
  blockedBy: string[],
): string {
  const head = `${node.shortTitle}. ${node.title}.`;
  if (state === "earned") return `${head} Earned and hung on the wall.`;
  if (state === "in_progress") return `${head} In progress, ${invested} of ${node.ticksToComplete} weeks.`;
  if (state === "available") return `${head} Frame empty, available to start.`;
  return `${head} Locked. Requires ${blockedBy.length > 0 ? blockedBy.join(", ") : "an earlier certificate"}.`;
}

/** Improvement fractions are always positive. See the knowledge module header. */
function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function scopeText(ata?: number, assetClass?: string): string {
  if (ata !== undefined) return ` on ${ataLabel(ata)}`;
  if (assetClass !== undefined) return ` on ${assetClass} assets`;
  return "";
}

function effectText(effect: KnowledgeEffect, regionName: (code: RegionCode) => string): string {
  switch (effect.kind) {
    case "buy_discount":
      return `Buy ${pct(effect.value)} cheaper${scopeText(effect.ata, effect.assetClass)}`;
    case "sell_premium":
      return `Sell ${pct(effect.value)} higher${scopeText(effect.ata, effect.assetClass)}`;
    case "repair_tat":
      return `Repairs turn ${pct(effect.value)} faster${scopeText(effect.ata)}`;
    case "ber_accuracy":
      return `Beyond-economic-repair calls ${pct(effect.value)} more accurate`;
    case "reach_region":
      return `Opens trading reach into ${regionName(effect.regionCode)}`;
    case "unlock_facility":
      return `Opens ${FACILITY_LABEL[effect.facilityKind]} facilities on the network map`;
    case "rc_income":
      return `+${effect.value} relationship capital every pulse`;
    case "time_income":
      return `+${effect.value} founder hours every pulse`;
    case "team_cap":
      return `+${effect.value} ${effect.value === 1 ? "seat" : "seats"} on the team`;
    case "intel":
      return `Market intelligence ${pct(effect.value)} sharper`;
    case "event_access":
      return `${pct(effect.value)} more introductions at industry events`;
    case "logistics_cost":
      return `Freight costs ${pct(effect.value)} less`;
    case "warehouse_capacity":
      return `+${effect.value.toLocaleString("en-US")} units of warehouse capacity`;
    case "quote_quality":
      return `Quotes land ${pct(effect.value)} better`;
    case "buyer_ceiling":
      return `Reaches buyers ${pct(effect.value)} further up the market`;
  }
}

function ratioPercent(value: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function formatAcc(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1_000)}K`;
  return Math.round(value).toLocaleString("en-US");
}
