/* ==========================================================================
   FleetManager — the centre monitor.

   The asset inventory read as an ATA CHAPTER BOARD. Thousands of serialized
   units collapse into a few dozen chips, one per (ATA chapter, condition)
   pair, filed under their ATA group with a subtotal on every heading. The
   chapter is the primary axis of the whole screen: it is how an asset trader
   thinks about stock, so it is what the monitor shows first.

   Clicking a chip expands it in place into the serialized units behind it,
   where bulk repair orders and buyer offers are raised. The old Buying
   Strategy and Sales Office tabs are gone: they now live in one standing
   orders drawer, framed as the desk's own mechanic rather than a place the
   founder walks to.

   Pure presentational. Everything drawn comes from the GameObservation it is
   handed; every action leaves through onCommand / onInspectAsset. No fetching,
   no global state, no timer that outlives the component.
   ========================================================================== */
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ATA_GROUPS,
  ATA_GROUP_LABELS,
  ataGroupOf,
  ataLabel,
  ataTitle,
  partNumberAta,
} from "../../sim/ata.ts";
import { CONDITION_MULT } from "../../sim/balance.ts";
import type { GameObservation } from "../../sim/observation.ts";
import type {
  AtaGroup,
  BuyingStrategy,
  Category,
  Condition,
  GameCommand,
  PartMaster,
  Rfq,
  SalesStrategy,
  Unit,
} from "../../sim/types.ts";
import { formatAcc, meetsCondition, serviceable } from "../../sim/util.ts";
import "./FleetManager.css";
import { useArtSource } from "../art/ArtImage.tsx";

/* ---------------------------------------------------------------- *
 * Constants
 * ---------------------------------------------------------------- */

/** Hard ceiling on commands raised by a single click. */
const MAX_COMMANDS = 25;
/** Serialized rows drawn in an expanded chip before the table asks for more. */
const ROW_PAGE = 40;

const NUMBER = new Intl.NumberFormat("en-US");

const CONDITIONS: readonly Condition[] = ["NE", "NS", "OH", "SV", "RP", "AR", "BER", "SCRAP"];

const CONDITION_TITLE: Record<Condition, string> = {
  NE: "New",
  NS: "New surplus",
  OH: "Overhauled",
  SV: "Serviceable",
  RP: "Repaired",
  AR: "As removed",
  BER: "Beyond economical repair",
  SCRAP: "Scrap",
};

const CATEGORIES: readonly (Category | "any")[] = [
  "any",
  "llp",
  "rotable",
  "repairable",
  "expendable",
  "consumable",
  "standard",
];

const ALLOCATIONS: readonly SalesStrategy["allocation"][] = [
  "lowest_value_first",
  "highest_value_first",
];

/* ---------------------------------------------------------------- *
 * Derived shapes
 * ---------------------------------------------------------------- */

type ChipRow = { unit: Unit; part: PartMaster | undefined; code: number };

type Chip = {
  key: string;
  code: number;
  condition: Condition;
  rows: ChipRow[];
  value: number;
};

type Section = {
  group: AtaGroup;
  chips: Chip[];
  count: number;
  value: number;
};

type SaleOrder = { rfqId: number; unitIds: number[]; price: number };

type SalePlan = {
  orders: SaleOrder[];
  units: number;
  unmatched: number;
  capped: boolean;
};

export type FleetManagerProps = {
  observation: GameObservation;
  onCommand: (command: GameCommand, label: string) => void;
  onInspectAsset: (assetId: number) => void;
};

/* ================================================================== *
 * FleetManager
 * ================================================================== */

export function FleetManager({
  observation,
  onCommand,
  onInspectAsset,
}: FleetManagerProps): ReactNode {
  const [groupFilter, setGroupFilter] = useState<AtaGroup | "all">("all");
  const [conditionFilter, setConditionFilter] = useState<Condition | "all">("all");
  const [search, setSearch] = useState("");
  const [openChipKey, setOpenChipKey] = useState<string | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<number>>(() => new Set<number>());
  const [rowLimit, setRowLimit] = useState(ROW_PAGE);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const drawerButton = useRef<HTMLButtonElement | null>(null);
  const boardId = useId();

  const partsById = useMemo(
    () => new Map(observation.parts.map((part) => [part.id, part] as const)),
    [observation.parts],
  );

  const inShop = useMemo(
    () => new Set(observation.jobs.map((job) => job.unitId)),
    [observation.jobs],
  );

  /* -- 1. Filter, then fold the inventory into (chapter, condition) chips -- */

  const sections = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const chips = new Map<string, Chip>();
    for (const unit of observation.inventory) {
      const part = partsById.get(unit.partId);
      const code = part?.ata ?? partNumberAta(unit.partId) ?? 0;
      if (conditionFilter !== "all" && unit.condition !== conditionFilter) continue;
      if (groupFilter !== "all" && ataGroupOf(code) !== groupFilter) continue;
      if (
        needle.length > 0 &&
        !unit.partId.toLowerCase().includes(needle) &&
        !(part?.name ?? "").toLowerCase().includes(needle)
      ) continue;
      const key = `${code}|${unit.condition}`;
      const chip = chips.get(key) ?? { key, code, condition: unit.condition, rows: [], value: 0 };
      chip.rows.push({ unit, part, code });
      chip.value += markOf(part, unit.condition, observation.mrp);
      chips.set(key, chip);
    }
    const byGroup = new Map<AtaGroup, Chip[]>();
    for (const chip of chips.values()) {
      const group = ataGroupOf(chip.code);
      const bucket = byGroup.get(group);
      if (bucket) bucket.push(chip);
      else byGroup.set(group, [chip]);
    }
    const built: Section[] = [];
    for (const group of ATA_GROUPS) {
      const bucket = byGroup.get(group);
      if (!bucket || bucket.length === 0) continue;
      bucket.sort((a, b) => b.value - a.value || a.code - b.code);
      built.push({
        group,
        chips: bucket,
        count: bucket.reduce((sum, chip) => sum + chip.rows.length, 0),
        value: bucket.reduce((sum, chip) => sum + chip.value, 0),
      });
    }
    built.sort((a, b) => b.value - a.value);
    return built;
  }, [conditionFilter, groupFilter, observation.inventory, observation.mrp, partsById, search]);

  const chipCount = sections.reduce((sum, section) => sum + section.chips.length, 0);
  const shownUnits = sections.reduce((sum, section) => sum + section.count, 0);
  const heaviestChip = sections.reduce(
    (top, section) => Math.max(top, section.chips[0]?.value ?? 0),
    0,
  );

  const openChip = useMemo(() => {
    if (openChipKey === null) return null;
    for (const section of sections) {
      for (const chip of section.chips) if (chip.key === openChipKey) return chip;
    }
    return null;
  }, [openChipKey, sections]);

  /* -- 2. Selection lives on the open chip only -- */

  const openChipInner = useCallback(
    (key: string) => {
      setOpenChipKey((current) => (current === key ? null : key));
      setSelection(new Set<number>());
      setRowLimit(ROW_PAGE);
    },
    [],
  );

  const toggleUnit = useCallback((id: number) => {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const dropFromSelection = useCallback((ids: readonly number[]) => {
    setSelection((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  /* -- 3. Bulk actions -- */

  const sendToShop = useCallback(
    (units: readonly Unit[], shopId: string, shopName: string, workscope: "min" | "oh") => {
      if (units.length === 0 || shopId.length === 0) return;
      const batch = units.slice(0, MAX_COMMANDS);
      const capped = units.length > batch.length;
      const label =
        `Repair order · ${batch.length} asset${batch.length === 1 ? "" : "s"} to ${shopName}` +
        ` (${workscope === "oh" ? "overhaul" : "repair"})` +
        (capped ? ` — capped at ${MAX_COMMANDS} of ${units.length}; click again for the rest.` : "");
      for (const unit of batch) {
        onCommand({ type: "send_to_shop", assetId: unit.id, shopId, workscope }, label);
      }
      dropFromSelection(batch.map((unit) => unit.id));
    },
    [dropFromSelection, onCommand],
  );

  const listForSale = useCallback(
    (plan: SalePlan) => {
      if (plan.orders.length === 0) return;
      const label =
        `Buyer offer · ${plan.units} asset${plan.units === 1 ? "" : "s"} into ` +
        `${plan.orders.length} buyer need${plan.orders.length === 1 ? "" : "s"}` +
        (plan.capped ? ` — capped at ${MAX_COMMANDS} offers; click again for the rest.` : "");
      const spent: number[] = [];
      for (const order of plan.orders) {
        onCommand(
          { type: "submit_quote", rfqId: order.rfqId, unitIds: order.unitIds, price: order.price, tx: "outright" },
          label,
        );
        spent.push(...order.unitIds);
      }
      dropFromSelection(spent);
    },
    [dropFromSelection, onCommand],
  );

  /* -- 4. Render -- */

  const buying = observation.firm.buyingStrategy;
  const held = observation.inventory.length;
  const inTransit = observation.inventory.filter((unit) => unit.transferId !== null).length;
  const chapters = new Set(sections.flatMap((section) => section.chips.map((chip) => chip.code))).size;

  return (
    <section className="fleetmgr" aria-label="Fleet manager">
      <header className="fleetmgr-head">
        <div className="fleetmgr-head-title">
          <p className="fleetmgr-eyebrow">INV / ATA / 01</p>
          <h2>Fleet Manager</h2>
          <p className="fleetmgr-lede">
            Every asset you own, filed by ATA chapter and condition. One chip is one chapter in one
            condition; open it to reach the serialized units underneath.
          </p>
        </div>
        <ArtPlate name="fleet-chip-board" alt="" />
        <div className="fleetmgr-head-actions">
          <button
            ref={drawerButton}
            type="button"
            className="fleetmgr-drawer-open"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <span className="fleetmgr-drawer-open-label">Standing orders</span>
            <span
              className="fleetmgr-status"
              data-state={buying.enabled ? "on" : "off"}
            >
              {buying.enabled ? "BUY SIDE RUNNING" : "BUY SIDE IDLE"}
            </span>
          </button>
        </div>
      </header>

      <div className="fleetmgr-summary">
        <Metric label="Assets held" value={NUMBER.format(held)} />
        <Metric label="ATA chapters" value={NUMBER.format(chapters)} />
        <Metric label="Chips" value={NUMBER.format(chipCount)} />
        <Metric label="Inventory at mark" value={`${formatAcc(observation.firm.inventoryAtMark)} ACC`} />
        <Metric label="In transit" value={NUMBER.format(inTransit)} />
        <Metric label="In shop" value={NUMBER.format(observation.jobs.length)} />
      </div>

      <div className="fleetmgr-filters" role="search">
        <label className="fleetmgr-field">
          <span>ATA group</span>
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value as AtaGroup | "all")}
          >
            <option value="all">All groups</option>
            {ATA_GROUPS.map((group) => (
              <option key={group} value={group}>{ATA_GROUP_LABELS[group]}</option>
            ))}
          </select>
        </label>
        <label className="fleetmgr-field">
          <span>Condition</span>
          <select
            value={conditionFilter}
            onChange={(event) => setConditionFilter(event.target.value as Condition | "all")}
          >
            <option value="all">All conditions</option>
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {condition} · {CONDITION_TITLE[condition]}
              </option>
            ))}
          </select>
        </label>
        <label className="fleetmgr-field fleetmgr-field--grow">
          <span>Search</span>
          <input
            type="search"
            value={search}
            placeholder="Part name or part number"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <p className="fleetmgr-filter-count" aria-live="polite">
          {NUMBER.format(shownUnits)} of {NUMBER.format(held)} assets · {NUMBER.format(chipCount)} chips
        </p>
      </div>

      {held === 0 ? (
        <p className="fleetmgr-empty">
          No assets on the books yet. Buy a package or a single asset from the map and it will appear
          here as an ATA chip within the pulse.
        </p>
      ) : sections.length === 0 ? (
        <p className="fleetmgr-empty">
          Nothing matches this filter. Widen the ATA group, the condition, or the search text.
        </p>
      ) : (
        <div className="fleetmgr-board" id={boardId}>
          {sections.map((section) => (
            <section key={section.group} className="fleetmgr-group" aria-label={ATA_GROUP_LABELS[section.group]}>
              <h3 className="fleetmgr-group-head">
                <span className="fleetmgr-group-name">{ATA_GROUP_LABELS[section.group]}</span>
                <span className="fleetmgr-group-sub">
                  {NUMBER.format(section.chips.length)} chip{section.chips.length === 1 ? "" : "s"} ·{" "}
                  {NUMBER.format(section.count)} asset{section.count === 1 ? "" : "s"} ·{" "}
                  {formatAcc(section.value)} ACC
                </span>
              </h3>
              <div className="fleetmgr-chips">
                {section.chips.map((chip) => {
                  const expanded = openChipKey === chip.key;
                  const panelId = `${boardId}-${chip.key.replace("|", "-")}`;
                  return (
                    <Fragment key={chip.key}>
                      <button
                        type="button"
                        className="fleetmgr-chip"
                        data-open={expanded ? "true" : undefined}
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        aria-label={
                          `${ataLabel(chip.code)}, condition ${chip.condition}, ` +
                          `${NUMBER.format(chip.rows.length)} asset${chip.rows.length === 1 ? "" : "s"}, ` +
                          `${formatAcc(chip.value)} ACC at mark`
                        }
                        onClick={() => openChipInner(chip.key)}
                      >
                        <span className="fleetmgr-chip-code">{chip.code.toString().padStart(2, "0")}</span>
                        <span className="fleetmgr-chip-title">{ataTitle(chip.code)}</span>
                        <span className="fleetmgr-chip-foot">
                          <ConditionTag condition={chip.condition} />
                          <span className="fleetmgr-chip-count">{NUMBER.format(chip.rows.length)}</span>
                        </span>
                        <span className="fleetmgr-chip-value">{formatAcc(chip.value)} ACC</span>
                        <span
                          className="fleetmgr-chip-bar"
                          style={{ "--fleetmgr-fill": `${share(chip.value, heaviestChip)}%` } as CSSProperties}
                          aria-hidden="true"
                        />
                      </button>
                      {expanded && openChip !== null && (
                        <ChipDetail
                          id={panelId}
                          chip={openChip}
                          observation={observation}
                          partsById={partsById}
                          inShop={inShop}
                          selection={selection}
                          rowLimit={rowLimit}
                          onShowMore={() => setRowLimit((current) => current + ROW_PAGE)}
                          onToggleUnit={toggleUnit}
                          onSetSelection={setSelection}
                          onInspectAsset={onInspectAsset}
                          onSendToShop={sendToShop}
                          onListForSale={listForSale}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {drawerOpen && (
        <StandingOrders
          observation={observation}
          onCommand={onCommand}
          onClose={() => {
            setDrawerOpen(false);
            drawerButton.current?.focus();
          }}
        />
      )}
    </section>
  );
}

/* ================================================================== *
 * Expanded chip — the serialized units behind one (chapter, condition)
 * ================================================================== */

function ChipDetail({
  id,
  chip,
  observation,
  partsById,
  inShop,
  selection,
  rowLimit,
  onShowMore,
  onToggleUnit,
  onSetSelection,
  onInspectAsset,
  onSendToShop,
  onListForSale,
}: {
  id: string;
  chip: Chip;
  observation: GameObservation;
  partsById: ReadonlyMap<string, PartMaster>;
  inShop: ReadonlySet<number>;
  selection: ReadonlySet<number>;
  rowLimit: number;
  onShowMore: () => void;
  onToggleUnit: (id: number) => void;
  onSetSelection: (next: ReadonlySet<number>) => void;
  onInspectAsset: (assetId: number) => void;
  onSendToShop: (
    units: readonly Unit[],
    shopId: string,
    shopName: string,
    workscope: "min" | "oh",
  ) => void;
  onListForSale: (plan: SalePlan) => void;
}): ReactNode {
  const [shopChoice, setShopChoice] = useState("");
  const [workscope, setWorkscope] = useState<"min" | "oh">("min");
  const [margin, setMargin] = useState(() =>
    Math.round(observation.firm.salesStrategy.minMargin * 100),
  );

  const shop =
    observation.shops.find((candidate) => candidate.id === shopChoice) ?? observation.shops[0];

  const visible = chip.rows.slice(0, rowLimit);
  const selected = chip.rows.filter((row) => selection.has(row.unit.id));
  const shopReady = selected
    .filter((row) => canGoToShop(row.unit, row.part, inShop))
    .map((row) => row.unit);
  const saleReady = selected.filter((row) => canBeOffered(row.unit)).map((row) => row.unit);
  const plan = planSale(saleReady, observation.rfqs, partsById, observation.mrp, margin);

  const allShownSelected = visible.length > 0 && visible.every((row) => selection.has(row.unit.id));
  const someShownSelected = visible.some((row) => selection.has(row.unit.id));

  return (
    <div className="fleetmgr-detail" id={id} role="region" aria-label={`${ataLabel(chip.code)} · ${chip.condition}`}>
      <div className="fleetmgr-detail-head">
        <h4>
          {ataLabel(chip.code)} · <ConditionTag condition={chip.condition} />
        </h4>
        <p className="fleetmgr-detail-sub">
          {NUMBER.format(chip.rows.length)} serialized asset{chip.rows.length === 1 ? "" : "s"} ·{" "}
          {formatAcc(chip.value)} ACC at mark · {NUMBER.format(selected.length)} selected
        </p>
      </div>

      <div className="fleetmgr-bulk">
        <div className="fleetmgr-bulk-block">
          <p className="fleetmgr-bulk-title">Send to shop</p>
          <div className="fleetmgr-bulk-controls">
            <label className="fleetmgr-field">
              <span>Shop</span>
              <select
                value={shop?.id ?? ""}
                disabled={observation.shops.length === 0}
                onChange={(event) => setShopChoice(event.target.value)}
              >
                {observation.shops.length === 0 && <option value="">No shop in reach</option>}
                {observation.shops.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} · {candidate.costMult.toFixed(2)}× cost · {candidate.turnMult.toFixed(2)}× TAT
                  </option>
                ))}
              </select>
            </label>
            <label className="fleetmgr-field">
              <span>Workscope</span>
              <select
                value={workscope}
                onChange={(event) => setWorkscope(event.target.value === "oh" ? "oh" : "min")}
              >
                <option value="min">Repair</option>
                <option value="oh">Overhaul</option>
              </select>
            </label>
            <button
              type="button"
              className="fleetmgr-action"
              disabled={shopReady.length === 0 || !shop}
              onClick={() => shop && onSendToShop(shopReady, shop.id, shop.name, workscope)}
            >
              Send {NUMBER.format(Math.min(shopReady.length, MAX_COMMANDS))} to shop
            </button>
          </div>
          <p className="fleetmgr-hint">
            {shopReady.length === 0
              ? "Select repairable assets that are sitting at a facility to raise a repair order."
              : `${NUMBER.format(shopReady.length)} of ${NUMBER.format(selected.length)} selected can go now.` +
                (shopReady.length > MAX_COMMANDS
                  ? ` One click raises at most ${MAX_COMMANDS} orders; click again for the rest.`
                  : "")}
          </p>
        </div>

        <div className="fleetmgr-bulk-block">
          <p className="fleetmgr-bulk-title">List for sale</p>
          <div className="fleetmgr-bulk-controls">
            <label className="fleetmgr-field fleetmgr-field--narrow">
              <span>Margin over mark</span>
              <input
                type="number"
                value={margin}
                min={-50}
                max={400}
                step={1}
                onChange={(event) => setMargin(clampInt(event.target.value, -50, 400))}
              />
            </label>
            <button
              type="button"
              className="fleetmgr-action fleetmgr-action--primary"
              disabled={plan.orders.length === 0}
              onClick={() => onListForSale(plan)}
            >
              Offer {NUMBER.format(plan.units)} to {NUMBER.format(plan.orders.length)} buyer
              {plan.orders.length === 1 ? "" : "s"}
            </button>
          </div>
          <p className="fleetmgr-hint">
            {saleReady.length === 0
              ? "Select serviceable assets that are in stock and not already promised to raise an offer."
              : plan.orders.length === 0
                ? "No open buyer need matches these part numbers this week. Your standing sell orders will place them as needs appear."
                : `Priced at mark plus ${margin}%, capped at each buyer's ceiling.` +
                  (plan.unmatched > 0
                    ? ` ${NUMBER.format(plan.unmatched)} selected asset${plan.unmatched === 1 ? " has" : "s have"} no open need yet.`
                    : "") +
                  (plan.capped ? ` Capped at ${MAX_COMMANDS} offers a click.` : "")}
          </p>
        </div>
      </div>

      <div className="fleetmgr-table-wrap">
        <table className="fleetmgr-table">
          <thead>
            <tr>
              <th scope="col" className="fleetmgr-cell-check">
                <input
                  type="checkbox"
                  checked={allShownSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = someShownSelected && !allShownSelected;
                  }}
                  aria-label={`Select all ${visible.length} shown assets in ATA ${chip.code} ${chip.condition}`}
                  onChange={(event) => {
                    const next = new Set(selection);
                    for (const row of visible) {
                      if (event.target.checked) next.add(row.unit.id);
                      else next.delete(row.unit.id);
                    }
                    onSetSelection(next);
                  }}
                />
              </th>
              <th scope="col">ID</th>
              <th scope="col">Part</th>
              <th scope="col">Cond</th>
              <th scope="col" className="fleetmgr-cell-num">TSN</th>
              <th scope="col" className="fleetmgr-cell-num">CSN</th>
              <th scope="col" className="fleetmgr-cell-num">TSR</th>
              <th scope="col" className="fleetmgr-cell-num">CSR</th>
              <th scope="col">Facility</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.unit.id} data-selected={selection.has(row.unit.id) ? "true" : undefined}>
                <td className="fleetmgr-cell-check">
                  <input
                    type="checkbox"
                    checked={selection.has(row.unit.id)}
                    aria-label={`Select asset ${row.unit.id}`}
                    onChange={() => onToggleUnit(row.unit.id)}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="fleetmgr-link"
                    onClick={() => onInspectAsset(row.unit.id)}
                  >
                    #{row.unit.id}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="fleetmgr-link fleetmgr-link--part"
                    onClick={() => onInspectAsset(row.unit.id)}
                  >
                    <span className="fleetmgr-part-name">{row.part?.name ?? row.unit.partId}</span>
                    <span className="fleetmgr-part-number">{row.unit.partId}</span>
                  </button>
                </td>
                <td><ConditionTag condition={row.unit.condition} /></td>
                <td className="fleetmgr-cell-num">{NUMBER.format(Math.round(row.unit.tsn))}</td>
                <td className="fleetmgr-cell-num">{NUMBER.format(Math.round(row.unit.csn))}</td>
                <td className="fleetmgr-cell-num">{NUMBER.format(Math.round(row.unit.tsr))}</td>
                <td className="fleetmgr-cell-num">{NUMBER.format(Math.round(row.unit.csr))}</td>
                <td className="fleetmgr-cell-place">
                  {placeOf(row.unit, observation, inShop)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chip.rows.length > visible.length && (
        <div className="fleetmgr-more">
          <span>
            Showing {NUMBER.format(visible.length)} of {NUMBER.format(chip.rows.length)}
          </span>
          <button type="button" className="fleetmgr-action" onClick={onShowMore}>
            Show {NUMBER.format(Math.min(ROW_PAGE, chip.rows.length - visible.length))} more
          </button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== *
 * Standing orders — one drawer, two sides of the same mechanic
 * ================================================================== */

function StandingOrders({
  observation,
  onCommand,
  onClose,
}: {
  observation: GameObservation;
  onCommand: (command: GameCommand, label: string) => void;
  onClose: () => void;
}): ReactNode {
  const panel = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const buying = observation.firm.buyingStrategy;
  const selling = observation.firm.salesStrategy;
  const unlocked = observation.firm.manualAcquisitions > 0;

  const [enabled, setEnabled] = useState(buying.enabled);
  const [targetStock, setTargetStock] = useState(buying.targetStock);
  const [maxAccPerUnit, setMaxAccPerUnit] = useState(buying.maxAccPerUnit);
  const [minPackageDiscount, setMinPackageDiscount] = useState(
    Math.round(buying.minPackageDiscount * 100),
  );
  const [accFloor, setAccFloor] = useState(buying.accFloor);
  const [maxInventoryUnits, setMaxInventoryUnits] = useState(buying.maxInventoryUnits);
  const [maxPackageUnits, setMaxPackageUnits] = useState(buying.maxPackageUnits);
  const [conditions, setConditions] = useState<readonly Condition[]>(buying.conditions);
  const [category, setCategory] = useState<Category | "any">(buying.category);

  const [minMargin, setMinMargin] = useState(Math.round(selling.minMargin * 100));
  const [reserveStock, setReserveStock] = useState(selling.reserveStock);
  const [minCondition, setMinCondition] = useState<Condition>(selling.minCondition);
  const [exchangeBias, setExchangeBias] = useState(Math.round(selling.exchangeBias * 100));
  const [allocation, setAllocation] = useState<SalesStrategy["allocation"]>(selling.allocation);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  const buyPatch: Partial<BuyingStrategy> = {};
  if (enabled !== buying.enabled) buyPatch.enabled = enabled;
  if (targetStock !== buying.targetStock) buyPatch.targetStock = targetStock;
  if (maxAccPerUnit !== buying.maxAccPerUnit) buyPatch.maxAccPerUnit = maxAccPerUnit;
  if (minPackageDiscount !== Math.round(buying.minPackageDiscount * 100)) {
    buyPatch.minPackageDiscount = minPackageDiscount / 100;
  }
  if (accFloor !== buying.accFloor) buyPatch.accFloor = accFloor;
  if (maxInventoryUnits !== buying.maxInventoryUnits) buyPatch.maxInventoryUnits = maxInventoryUnits;
  if (maxPackageUnits !== buying.maxPackageUnits) buyPatch.maxPackageUnits = maxPackageUnits;
  if (conditionKey(conditions) !== conditionKey(buying.conditions)) {
    buyPatch.conditions = [...conditions];
  }
  if (category !== buying.category) buyPatch.category = category;

  const sellPatch: Partial<SalesStrategy> = {};
  if (minMargin !== Math.round(selling.minMargin * 100)) sellPatch.minMargin = minMargin / 100;
  if (reserveStock !== selling.reserveStock) sellPatch.reserveStock = reserveStock;
  if (minCondition !== selling.minCondition) sellPatch.minCondition = minCondition;
  if (exchangeBias !== Math.round(selling.exchangeBias * 100)) sellPatch.exchangeBias = exchangeBias / 100;
  if (allocation !== selling.allocation) sellPatch.allocation = allocation;

  const buyChanges = Object.keys(buyPatch).length;
  const sellChanges = Object.keys(sellPatch).length;

  return (
    <div className="fleetmgr-overlay">
      <button
        type="button"
        className="fleetmgr-scrim"
        aria-label="Close standing orders"
        onClick={onClose}
      />
      <div
        ref={panel}
        className="fleetmgr-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="fleetmgr-panel-head">
          <div>
            <p className="fleetmgr-eyebrow">POL / STANDING / 02</p>
            <h3 id={titleId}>Standing orders</h3>
            <p className="fleetmgr-lede">
              Not an office you visit. These are the rules the desk follows on its own while each
              weekly pulse resolves — what it buys without asking, and what it lets go.
            </p>
          </div>
          <button type="button" className="fleetmgr-panel-close" onClick={onClose} aria-label="Close standing orders">
            ✕
          </button>
        </header>

        <div className="fleetmgr-panel-body">
          {/* ---------------- Buy side ---------------- */}
          <form
            className="fleetmgr-side"
            onSubmit={(event) => {
              event.preventDefault();
              if (buyChanges === 0) return;
              onCommand({ type: "set_buying_strategy", patch: buyPatch }, "Buying standing order");
            }}
          >
            <h4 className="fleetmgr-side-head">Buy side</h4>
            <p className="fleetmgr-side-lede">
              When a package or single asset appears inside your reach, the desk tests it against
              these limits and takes it if every one passes.
            </p>

            <div className="fleetmgr-gate" data-state={unlocked ? "open" : "shut"}>
              <span className="fleetmgr-status" data-state={unlocked ? "on" : "off"}>
                {unlocked ? "UNLOCKED" : "LOCKED"}
              </span>
              <p>
                {unlocked
                  ? `${NUMBER.format(observation.firm.manualAcquisitions)} manual acquisition${observation.firm.manualAcquisitions === 1 ? "" : "s"} logged, so automatic buying can run.`
                  : "Buy one asset by hand first. Until that is on the books the engine rejects any order that switches automatic buying on."}
              </p>
            </div>

            <label className="fleetmgr-switch">
              <input
                type="checkbox"
                checked={enabled}
                disabled={!unlocked}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              <span>Buy without asking me</span>
            </label>
            <p className="fleetmgr-hint">Turns the whole buy side on. Everything below is ignored while it is off.</p>

            <NumberField
              label="Target stock per part number"
              hint="How many of each part number the desk wants on the shelf before it stops buying more."
              value={targetStock}
              min={0}
              max={999}
              onChange={setTargetStock}
            />
            <NumberField
              label="Maximum ACC per asset"
              hint="The most it will pay for one asset, averaged across a package."
              value={maxAccPerUnit}
              min={0}
              max={100_000_000}
              step={5_000}
              onChange={setMaxAccPerUnit}
            />
            <NumberField
              label="Minimum package discount"
              hint="A multi-asset package must come in at least this far below anchor value to be worth the paperwork."
              value={minPackageDiscount}
              min={0}
              max={100}
              suffix="%"
              onChange={setMinPackageDiscount}
            />
            <NumberField
              label="ACC floor"
              hint="Cash it will never spend below. The buy side stops rather than cross this line."
              value={accFloor}
              min={0}
              max={1_000_000_000}
              step={100_000}
              onChange={setAccFloor}
            />
            <NumberField
              label="Maximum inventory units"
              hint="Total assets you are willing to hold. Warehouse discipline, not a budget."
              value={maxInventoryUnits}
              min={1}
              max={1000}
              onChange={setMaxInventoryUnits}
            />
            <NumberField
              label="Maximum package units"
              hint="The largest package it will swallow in one go, so a lot of junk cannot arrive at once."
              value={maxPackageUnits}
              min={1}
              max={100}
              onChange={setMaxPackageUnits}
            />

            <fieldset className="fleetmgr-fieldset">
              <legend>Conditions it may buy</legend>
              <p className="fleetmgr-hint">Every asset in a package must be one of these grades, or the desk walks away.</p>
              <div className="fleetmgr-condition-set">
                {CONDITIONS.map((condition) => (
                  <label key={condition} className="fleetmgr-condition-pick">
                    <input
                      type="checkbox"
                      checked={conditions.includes(condition)}
                      onChange={(event) => {
                        setConditions((current) =>
                          event.target.checked
                            ? [...current, condition]
                            : current.filter((entry) => entry !== condition),
                        );
                      }}
                    />
                    <ConditionTag condition={condition} />
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="fleetmgr-field">
              <span>Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as Category | "any")}
              >
                {CATEGORIES.map((entry) => (
                  <option key={entry} value={entry}>{entry === "any" ? "Any category" : capitalise(entry)}</option>
                ))}
              </select>
            </label>
            <p className="fleetmgr-hint">Narrows the buy side to one class of material, such as rotables only.</p>

            <div className="fleetmgr-side-foot">
              <span className="fleetmgr-change-count" aria-live="polite">
                {buyChanges === 0 ? "No change" : `${buyChanges} change${buyChanges === 1 ? "" : "s"} ready`}
              </span>
              <button type="submit" className="fleetmgr-action fleetmgr-action--primary" disabled={buyChanges === 0}>
                Issue buy side
              </button>
            </div>
          </form>

          {/* ---------------- Sell side ---------------- */}
          <form
            className="fleetmgr-side"
            onSubmit={(event) => {
              event.preventDefault();
              if (sellChanges === 0) return;
              onCommand({ type: "set_sales_strategy", patch: sellPatch }, "Sales standing order");
            }}
          >
            <h4 className="fleetmgr-side-head">Sell side</h4>
            <p className="fleetmgr-side-lede">
              When a buyer need lands on a part number you hold, the desk quotes it under these rules
              without waiting for you.
            </p>

            <NumberField
              label="Minimum margin"
              hint="It will not sell for less than this much above the asset's mark value."
              value={minMargin}
              min={-50}
              max={500}
              suffix="%"
              onChange={setMinMargin}
            />
            <NumberField
              label="Reserve stock per part number"
              hint="Assets held back from automatic sale, so a part number is never stripped to zero."
              value={reserveStock}
              min={0}
              max={999}
              onChange={setReserveStock}
            />

            <label className="fleetmgr-field">
              <span>Minimum condition to release</span>
              <select
                value={minCondition}
                onChange={(event) => setMinCondition(event.target.value as Condition)}
              >
                {CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition} · {CONDITION_TITLE[condition]}
                  </option>
                ))}
              </select>
            </label>
            <p className="fleetmgr-hint">The worst grade the desk is allowed to ship against a buyer need.</p>

            <NumberField
              label="Exchange bias"
              hint="How readily it trades an exchange instead of an outright sale; at 50% and above it prefers exchanges on eligible parts."
              value={exchangeBias}
              min={0}
              max={100}
              suffix="%"
              onChange={setExchangeBias}
            />

            <label className="fleetmgr-field">
              <span>Allocation</span>
              <select
                value={allocation}
                onChange={(event) =>
                  setAllocation(
                    event.target.value === "highest_value_first" ? "highest_value_first" : "lowest_value_first",
                  )
                }
              >
                {ALLOCATIONS.map((entry) => (
                  <option key={entry} value={entry}>{entry.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <p className="fleetmgr-hint">Which asset leaves first when several could fill the same need: the cheapest on the shelf, or the best one.</p>

            <div className="fleetmgr-side-foot">
              <span className="fleetmgr-change-count" aria-live="polite">
                {sellChanges === 0 ? "No change" : `${sellChanges} change${sellChanges === 1 ? "" : "s"} ready`}
              </span>
              <button type="submit" className="fleetmgr-action fleetmgr-action--primary" disabled={sellChanges === 0}>
                Issue sell side
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== *
 * Small parts
 * ================================================================== */

function Metric({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="fleetmgr-metric">
      <span className="fleetmgr-metric-label">{label}</span>
      <strong className="fleetmgr-metric-value">{value}</strong>
    </div>
  );
}

function ConditionTag({ condition }: { condition: Condition }): ReactNode {
  return (
    <span
      className="fleetmgr-cond"
      data-status={conditionStatus(condition)}
      title={CONDITION_TITLE[condition]}
    >
      <span className="fleetmgr-cond-dot" aria-hidden="true" />
      {condition}
    </span>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (next: number) => void;
}): ReactNode {
  return (
    <div className="fleetmgr-number">
      <label className="fleetmgr-field">
        <span>{label}{suffix ? ` (${suffix})` : ""}</span>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(event) => onChange(clampInt(event.target.value, min, max))}
        />
      </label>
      <p className="fleetmgr-hint">{hint}</p>
    </div>
  );
}

/** A piece of art that never breaks the layout: the plate keeps its brushed fallback. */
function ArtPlate({ name, alt }: { name: string; alt: string }): ReactNode {
  const art = useArtSource(name);
  return (
    <span
      className="fleetmgr-plate"
      data-missing={art.exhausted ? "true" : undefined}
      aria-hidden={alt === "" ? true : undefined}
    >
      {art.exhausted ? null : (
        <img src={art.src} alt={alt} draggable={false} onError={art.onError} />
      )}
    </span>
  );
}

/* ================================================================== *
 * Pure helpers
 * ================================================================== */

/** Mark value of one unit: market reference price stepped down for condition. */
function markOf(
  part: PartMaster | undefined,
  condition: Condition,
  mrp: Record<string, number>,
): number {
  if (!part) return 0;
  return (mrp[part.id] ?? part.listPrice) * CONDITION_MULT[condition];
}

function conditionStatus(condition: Condition): "ready" | "work" | "dead" {
  if (serviceable(condition)) return "ready";
  return condition === "AR" ? "work" : "dead";
}

function conditionKey(conditions: readonly Condition[]): string {
  return [...conditions].sort().join(",");
}

function share(value: number, top: number): number {
  if (top <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round((value / top) * 100)));
}

function clampInt(raw: string, min: number, max: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** A unit can be shopped when a shop could actually take it this pulse. */
function canGoToShop(
  unit: Unit,
  part: PartMaster | undefined,
  inShop: ReadonlySet<number>,
): boolean {
  return Boolean(
    part?.repairable &&
    unit.facilityId !== null &&
    unit.transferId === null &&
    unit.reservedForRfq === null &&
    !inShop.has(unit.id),
  );
}

/** A unit can be offered when the engine would accept it on a quote. */
function canBeOffered(unit: Unit): boolean {
  return (
    unit.listed &&
    unit.facilityId !== null &&
    unit.transferId === null &&
    unit.reservedForRfq === null &&
    serviceable(unit.condition)
  );
}

function placeOf(
  unit: Unit,
  observation: GameObservation,
  inShop: ReadonlySet<number>,
): string {
  if (inShop.has(unit.id)) return "In shop";
  if (unit.transferId !== null) return "In transit";
  if (unit.reservedForRfq !== null) return "Promised";
  if (unit.facilityId === null) return "Allocated";
  return (
    observation.facilities.find((facility) => facility.id === unit.facilityId)?.name ??
    unit.facilityId
  );
}

/**
 * Turn a selection into buyer offers. Assets are matched against the open buyer
 * needs for their own part number, best ceiling first, and never more than the
 * command cap in one plan.
 */
function planSale(
  units: readonly Unit[],
  rfqs: readonly Rfq[],
  partsById: ReadonlyMap<string, PartMaster>,
  mrp: Record<string, number>,
  marginPct: number,
): SalePlan {
  const pools = new Map<string, Unit[]>();
  for (const unit of units) {
    const pool = pools.get(unit.partId);
    if (pool) pool.push(unit);
    else pools.set(unit.partId, [unit]);
  }
  const open = rfqs
    .filter((rfq) => pools.has(rfq.partId) && rfq.qty > rfq.filled)
    .sort((a, b) => b.maxPrice - a.maxPrice);

  const orders: SaleOrder[] = [];
  let placed = 0;
  let capped = false;
  for (const rfq of open) {
    if (orders.length >= MAX_COMMANDS) {
      capped = true;
      break;
    }
    const pool = pools.get(rfq.partId);
    if (!pool || pool.length === 0) continue;
    const need = rfq.qty - rfq.filled;
    const take: Unit[] = [];
    const rest: Unit[] = [];
    for (const unit of pool) {
      if (take.length < need && meetsCondition(unit.condition, rfq.minCondition)) take.push(unit);
      else rest.push(unit);
    }
    const first = take[0];
    if (!first) continue;
    pools.set(rfq.partId, rest);
    const part = partsById.get(rfq.partId);
    const mark = markOf(part, first.condition, mrp);
    const ask = mark > 0 ? Math.round(mark * (1 + marginPct / 100)) : Math.floor(rfq.maxPrice);
    const price = Math.max(1, Math.min(Math.floor(rfq.maxPrice), ask));
    orders.push({ rfqId: rfq.id, unitIds: take.map((unit) => unit.id), price });
    placed += take.length;
  }
  let unmatched = 0;
  for (const pool of pools.values()) unmatched += pool.length;
  return { orders, units: placed, unmatched, capped };
}
