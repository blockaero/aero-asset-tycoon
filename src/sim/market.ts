import {
  CORE_BER_P_EXTRA,
  CORE_NO_RETURN_P,
  EXCHANGE_CORE_TICKS,
  LOGISTICS_COST_PER_UNIT_TICK,
  STORAGE_COST_PER_UNIT,
  WEEKLY_OVERHEAD,
} from "./balance.ts";
import { coherentCounters } from "./counters.ts";
import { allowedListingConditions, exchangeEligible } from "./condition-rules.ts";
import { completeScheduledReplacement } from "./demand.ts";
import { adjustRelationship, repairCapacityBenefit } from "./network.ts";
import type { Rng } from "./rng.ts";
import type {
  AccPulse,
  Condition,
  Firm,
  MarketListing,
  Quote,
  Rfq,
  Shop,
  StandingPolicy,
  Transfer,
  TxKind,
  Unit,
  World,
} from "./types.ts";
import {
  anchorPrice,
  logisticsTat,
  meetsCondition,
  mrpFor,
  navOf,
  nextId,
  serviceable,
} from "./util.ts";

export type PulseAccumulator = Omit<AccPulse, "tick" | "opening" | "closing" | "delta">;

export function emptyPulseAccumulator(): PulseAccumulator {
  return {
    sales: 0,
    purchases: 0,
    repair: 0,
    logistics: 0,
    overhead: 0,
    penalties: 0,
    contracts: 0,
  };
}

export function processArrivalsAndJobs(world: World, rng: Rng): void {
  processTransfers(world);
  completeJobs(world, rng);
  expireMarket(world);
}

function processTransfers(world: World): void {
  const pending: Transfer[] = [];
  for (const transfer of world.transfers) {
    if (transfer.arriveTick > world.tick) {
      pending.push(transfer);
      continue;
    }
    const destination = world.facilities.find((facility) => facility.id === transfer.toFacilityId);
    if (destination?.kind === "warehouse") {
      const occupied = world.units.filter((unit) => unit.facilityId === destination.id).length;
      if (occupied + transfer.assetIds.length > destination.capacity) {
        transfer.arriveTick += 1;
        pending.push(transfer);
        world.events.push({
          tick: world.tick,
          kind: "transfer_capacity_delay",
          payload: {
            transferId: transfer.id,
            facilityId: destination.id,
            nextArrivalTick: transfer.arriveTick,
          },
        });
        continue;
      }
    }
    for (const assetId of transfer.assetIds) {
      const asset = world.units.find((candidate) => candidate.id === assetId);
      if (!asset) continue;
      asset.facilityId = transfer.toFacilityId;
      asset.transferId = null;
    }
    if (transfer.purpose === "repair_out" && transfer.relatedId !== null) {
      const job = world.jobs.find((candidate) => candidate.id === transfer.relatedId);
      if (job) job.status = "working";
    }
    if (transfer.purpose === "sale" && transfer.relatedId !== null) {
      const deal = world.deals.find((candidate) => candidate.id === transfer.relatedId);
      if (deal) {
        deal.status = "fulfilled";
        if (deal.sellerFirmId === "firm-0") {
          adjustRelationship(world, deal.buyerOrganizationId, 4, true);
        }
      }
    }
    if (transfer.purpose === "sale" && transfer.cohortId) {
      completeScheduledReplacement(
        world,
        transfer.cohortId,
        transfer.rfqId,
        transfer.assetIds.length,
      );
    }
    world.events.push({
      tick: world.tick,
      kind: "transfer_arrived",
      payload: {
        transferId: transfer.id,
        purpose: transfer.purpose,
        toFacilityId: transfer.toFacilityId,
      },
    });
  }
  world.transfers = pending;
}

function completeJobs(world: World, rng: Rng): void {
  const pending = [];
  for (const job of world.jobs) {
    if (job.doneTick > world.tick || job.status !== "working") {
      pending.push(job);
      continue;
    }
    const shop = world.shops.find((candidate) => candidate.id === job.shopId);
    const unit = world.units.find((candidate) => candidate.id === job.unitId);
    const firm = world.firms.find((candidate) => candidate.id === job.firmId);
    if (!shop || !unit || !firm) continue;
    const part = world.parts.find((candidate) => candidate.id === unit.partId);
    if (!part) continue;
    if (rng.chance(shop.failP + (unit.condition === "AR" ? part.berBase * 0.25 : 0))) {
      const supplementalRepair = Math.round(part.listPrice * rng.float(0.2, 1));
      const serviceableReplacement = anchorPrice(part, "SV");
      unit.condition = supplementalRepair > serviceableReplacement * 0.85 ? "BER" : "AR";
    } else {
      unit.condition = job.workscope === "oh" ? "OH" : "RP";
      unit.tsr = 0;
      unit.csr = 0;
      if (job.workscope === "oh") {
        unit.tso = 0;
        unit.cso = 0;
      }
    }
    unit.listed = serviceable(unit.condition);
    firm.repairsCompleted += 1;
    if (firm.id === "firm-0") {
      adjustRelationship(world, shop.organizationId, 4, true, false);
    }
    const fromFacility = shop.facilityId;
    const toFacility = firm.warehouseFacilityId;
    const tat = logisticsTat(world, fromFacility, toFacility);
    const transferId = nextId(world);
    const transfer: Transfer = {
      id: transferId,
      assetIds: [unit.id],
      fromFacilityId: fromFacility,
      toFacilityId: toFacility,
      departTick: world.tick,
      arriveTick: world.tick + tat,
      purpose: "repair_return",
      relatedId: job.id,
      rfqId: null,
      cohortId: null,
    };
    unit.facilityId = null;
    unit.transferId = transferId;
    world.transfers.push(transfer);
    world.events.push({
      tick: world.tick,
      kind: "repair_complete",
      payload: {
        jobId: job.id,
        assetId: unit.id,
        condition: unit.condition,
        logisticsTat: tat,
      },
    });
  }
  world.jobs = pending;
}

export function settleExchanges(
  world: World,
  rng: Rng,
  pulse: PulseAccumulator,
): void {
  const pending = [];
  for (const exchange of world.exchanges) {
    if (exchange.dueTick > world.tick) {
      pending.push(exchange);
      continue;
    }
    const firm = world.firms.find((candidate) => candidate.id === exchange.firmId);
    const airline = world.airlines.find((candidate) => candidate.id === exchange.airlineId);
    const part = world.parts.find((candidate) => candidate.id === exchange.partId);
    if (!firm || !airline || !part) continue;
    if (rng.chance(CORE_NO_RETURN_P)) {
      firm.accBalance += exchange.coreCharge;
      if (firm.id === "firm-0") pulse.sales += exchange.coreCharge;
      world.events.push({
        tick: world.tick,
        kind: "core_lost",
        payload: {
          firmId: firm.id,
          partId: exchange.partId,
          airlineId: airline.id,
          coreCharge: exchange.coreCharge,
        },
      });
      if (firm.id === "firm-0") adjustRelationship(world, airline.organizationId, -5, false);
      continue;
    }
    const condition: Condition = rng.chance(part.berBase + CORE_BER_P_EXTRA) ? "BER" : "AR";
    if (condition === "BER") {
      const berCharge = Math.round(exchange.coreCharge * 0.75);
      firm.accBalance += berCharge;
      if (firm.id === "firm-0") pulse.sales += berCharge;
    }
    const unit = createOwnedUnit(world, rng, {
      firm,
      partId: part.id,
      facilityId: airline.facilityId,
      condition,
      acquisitionCost: Math.round(part.listPrice * 0.12),
    });
    const tat = logisticsTat(world, airline.facilityId, firm.warehouseFacilityId);
    const transferId = nextId(world);
    unit.facilityId = null;
    unit.transferId = transferId;
    world.transfers.push({
      id: transferId,
      assetIds: [unit.id],
      fromFacilityId: airline.facilityId,
      toFacilityId: firm.warehouseFacilityId,
      departTick: world.tick,
      arriveTick: world.tick + tat,
      purpose: "core_return",
      relatedId: exchange.id,
      rfqId: null,
      cohortId: null,
    });
    world.events.push({
      tick: world.tick,
      kind: "core_dispatched",
      payload: {
        exchangeId: exchange.id,
        condition,
        logisticsTat: tat,
        coreCharge: condition === "BER" ? Math.round(exchange.coreCharge * 0.75) : 0,
      },
    });
  }
  world.exchanges = pending;
}

function expireMarket(world: World): void {
  for (const listing of world.listings) {
    if (listing.status === "open" && listing.expiresTick < world.tick) listing.status = "expired";
  }
  for (const deal of world.deals) {
    if (deal.status === "offered" && deal.expireTick < world.tick) deal.status = "expired";
  }
}

export function generateMarketListings(world: World, rng: Rng): void {
  const openCount = world.listings.filter((listing) => listing.status === "open").length;
  if (openCount >= 12 || (world.tick % 3 !== 0 && openCount >= 6)) return;
  const nodes = world.networkNodes.filter(
    (node) => node.role === "supplier" || node.role === "customer" || node.role === "rival",
  );
  if (!nodes.length || !world.parts.length) return;
  const node = rng.pick(nodes);
  const part = rng.pick(world.parts);
  const sourceOrganization = world.organizations.find(
    (organization) => organization.id === node.organizationId,
  );
  const condition = rng.pick(
    allowedListingConditions(sourceOrganization?.kind ?? "asset_manager", part),
  );
  const items = [{
    partId: part.id,
    condition,
    quantity: 1,
    tsn: rng.int(500, 15_000),
    csn: rng.int(300, 9_000),
    tsr: rng.int(50, 4_500),
    csr: rng.int(20, 2_800),
  }];
  if (world.tick % 6 === 0) {
    for (let i = 0; i < 2; i++) {
      const extra = rng.pick(world.parts);
      items.push({
        partId: extra.id,
        condition: rng.pick(
          allowedListingConditions(sourceOrganization?.kind ?? "asset_manager", extra),
        ),
        quantity: rng.int(1, 2),
        tsn: rng.int(500, 15_000),
        csn: rng.int(300, 9_000),
        tsr: rng.int(50, 4_500),
        csr: rng.int(20, 2_800),
      });
    }
  }
  const kind = items.length > 1 ? "package" : "single_asset";
  const totalAnchor = items.reduce((sum, item) => {
    const itemPart = world.parts.find((candidate) => candidate.id === item.partId)!;
    return sum + anchorPrice(itemPart, item.condition) * item.quantity;
  }, 0);
  const listing: MarketListing = {
    id: nextId(world),
    nodeId: node.id,
    sellerOrganizationId: node.organizationId,
    sellerFacilityId: node.facilityIds[0] ?? "fac-factory",
    kind,
    title: kind === "package" ? `${node.label} mixed asset package` : `${part.name} · ${condition}`,
    items,
    totalPrice: Math.round(totalAnchor * (kind === "package" ? rng.float(0.72, 0.9) : rng.float(0.88, 1.08))),
    expiresTick: world.tick + rng.int(4, 8),
    status: "open",
    exclusive: node.state === "partner",
  };
  world.listings.push(listing);
  world.events.push({
    tick: world.tick,
    kind: "market_listing_posted",
    payload: { listingId: listing.id, nodeId: node.id, listingKind: listing.kind },
  });
}

export function purchaseListing(
  world: World,
  rng: Rng,
  firmId: string,
  listingId: number,
  destinationFacilityId: string,
  pulse: PulseAccumulator,
  manual = false,
): { ok: true; assetIds: number[] } | { ok: false; reason: string } {
  const firm = world.firms.find((candidate) => candidate.id === firmId);
  const listing = world.listings.find((candidate) => candidate.id === listingId);
  const destination = world.facilities.find((facility) => facility.id === destinationFacilityId);
  if (!firm || !listing || listing.status !== "open" || listing.expiresTick < world.tick) {
    return { ok: false, reason: "listing_unavailable" };
  }
  if (!destination || destination.organizationId !== firm.organizationId || destination.kind !== "warehouse") {
    return { ok: false, reason: "invalid_destination" };
  }
  const node = world.networkNodes.find((candidate) => candidate.id === listing.nodeId);
  if (firmId === "firm-0" && node?.state === "locked") {
    return { ok: false, reason: "network_node_locked" };
  }
  const quantity = listing.items.reduce((sum, item) => sum + item.quantity, 0);
  const occupied = world.units.filter(
    (unit) => unit.facilityId === destinationFacilityId && unit.ownerFirmId === firm.id,
  ).length;
  const incoming = world.transfers
    .filter((transfer) => transfer.toFacilityId === destinationFacilityId)
    .reduce((sum, transfer) => sum + transfer.assetIds.length, 0);
  if (occupied + incoming + quantity > destination.capacity) {
    return { ok: false, reason: "warehouse_capacity_exceeded" };
  }
  const tat = logisticsTat(world, listing.sellerFacilityId, destinationFacilityId);
  const logisticsCost = quantity * tat * LOGISTICS_COST_PER_UNIT_TICK;
  const total = listing.totalPrice + logisticsCost;
  if (firm.accBalance - total < 0) return { ok: false, reason: "insufficient_acc" };

  firm.accBalance -= total;
  if (firmId === "firm-0") {
    pulse.purchases -= listing.totalPrice;
    pulse.logistics -= logisticsCost;
  }
  listing.status = "sold";
  for (const opportunity of world.opportunities) {
    if (opportunity.kind === "listing" && opportunity.referenceId === listing.id) {
      opportunity.accepted = true;
    }
  }
  if (manual) firm.manualAcquisitions += 1;
  if (firm.id === "firm-0") {
    adjustRelationship(world, listing.sellerOrganizationId, 4, true, false);
  }
  const assetIds: number[] = [];
  for (const item of listing.items) {
    const perUnitCost = Math.round(listing.totalPrice / Math.max(1, quantity));
    for (let i = 0; i < item.quantity; i++) {
      const unit = createOwnedUnit(world, rng, {
        firm,
        partId: item.partId,
        facilityId: listing.sellerFacilityId,
        condition: item.condition,
        acquisitionCost: perUnitCost,
        tsn: item.tsn,
        csn: item.csn,
        tsr: item.tsr,
        csr: item.csr,
      });
      assetIds.push(unit.id);
    }
  }
  const transferId = nextId(world);
  for (const assetId of assetIds) {
    const asset = world.units.find((unit) => unit.id === assetId)!;
    asset.facilityId = null;
    asset.transferId = transferId;
  }
  world.transfers.push({
    id: transferId,
    assetIds,
    fromFacilityId: listing.sellerFacilityId,
    toFacilityId: destinationFacilityId,
    departTick: world.tick,
    arriveTick: world.tick + tat,
    purpose: "purchase",
    relatedId: listing.id,
    rfqId: null,
    cohortId: null,
  });
  world.events.push({
    tick: world.tick,
    kind: "listing_purchased",
    payload: {
      listingId,
      firmId,
      listingKind: listing.kind,
      acc: listing.totalPrice,
      logisticsCost,
      logisticsTat: tat,
    },
  });
  return { ok: true, assetIds };
}

function createOwnedUnit(
  world: World,
  rng: Rng,
  input: {
    firm: Firm;
    partId: string;
    facilityId: string | null;
    condition: Condition;
    acquisitionCost: number;
    tsn?: number;
    csn?: number;
    tsr?: number;
    csr?: number;
    tso?: number;
    cso?: number;
  },
): Unit {
  const part = world.parts.find((candidate) => candidate.id === input.partId);
  const counters = coherentCounters(rng, part?.serialized ?? true, input.condition, input);
  const unit: Unit = {
    id: nextId(world),
    partId: input.partId,
    ownerFirmId: input.firm.id,
    ownerOrganizationId: input.firm.organizationId,
    facilityId: input.facilityId,
    transferId: null,
    condition: input.condition,
    trace: "none",
    ...counters,
    acquiredTick: world.tick,
    acquisitionCost: input.acquisitionCost,
    listed: true,
    reservedForRfq: null,
  };
  world.units.push(unit);
  return unit;
}

export function sendAssetToShop(
  world: World,
  firmId: string,
  assetId: number,
  shopId: string,
  workscope: "min" | "oh",
  pulse: PulseAccumulator,
): { ok: true; jobId: number } | { ok: false; reason: string } {
  const firm = world.firms.find((candidate) => candidate.id === firmId);
  const unit = world.units.find((candidate) => candidate.id === assetId);
  const shop = world.shops.find((candidate) => candidate.id === shopId);
  if (!firm || !unit || !shop || unit.ownerFirmId !== firmId) return { ok: false, reason: "asset_or_shop_missing" };
  const shopNode = world.networkNodes.find((node) => node.organizationId === shop.organizationId);
  if (firmId === "firm-0" && shopNode?.state === "locked") {
    return { ok: false, reason: "network_node_locked" };
  }
  if (unit.facilityId !== firm.warehouseFacilityId || unit.transferId !== null) return { ok: false, reason: "asset_not_in_warehouse" };
  const part = world.parts.find((candidate) => candidate.id === unit.partId);
  if (!part?.repairable || !["AR", "BER"].includes(unit.condition)) return { ok: false, reason: "asset_not_repairable" };
  if (unit.condition === "BER") return { ok: false, reason: "asset_is_ber" };
  const fee = Math.round(part.listPrice * (workscope === "oh" ? 0.48 : 0.28) * shop.costMult);
  const outTat = logisticsTat(world, firm.warehouseFacilityId, shop.facilityId);
  const reservedCapacity = repairCapacityBenefit(world, shop.organizationId);
  const shopFacility = world.facilities.find((facility) => facility.id === shop.facilityId);
  const activeJobs = world.jobs.filter((job) => job.shopId === shop.id).length;
  const queueDelay = Math.floor(activeJobs / Math.max(1, shopFacility?.capacity ?? 1));
  const repairTat =
    Math.max(
      shopFacility?.baseTatTicks ?? 2,
      Math.round((workscope === "oh" ? part.shopTurnMax : part.shopTurnMin) * shop.turnMult) - reservedCapacity,
    ) + queueDelay;
  const logisticsCost = outTat * LOGISTICS_COST_PER_UNIT_TICK;
  if (firm.accBalance - fee - logisticsCost < 0) return { ok: false, reason: "insufficient_acc" };
  firm.accBalance -= fee + logisticsCost;
  if (firmId === "firm-0") {
    pulse.repair -= fee;
    pulse.logistics -= logisticsCost;
  }
  const jobId = nextId(world);
  world.jobs.push({
    id: jobId,
    firmId,
    unitId: unit.id,
    shopId,
    orderedTick: world.tick,
    arriveTick: world.tick + outTat,
    doneTick: world.tick + outTat + repairTat,
    repairTatTicks: repairTat,
    logisticsTatTicks: outTat,
    workscope,
    fee,
    status: "queued",
  });
  const transferId = nextId(world);
  unit.facilityId = null;
  unit.transferId = transferId;
  unit.listed = false;
  world.transfers.push({
    id: transferId,
    assetIds: [unit.id],
    fromFacilityId: firm.warehouseFacilityId,
    toFacilityId: shop.facilityId,
    departTick: world.tick,
    arriveTick: world.tick + outTat,
    purpose: "repair_out",
    relatedId: jobId,
    rfqId: null,
    cohortId: null,
  });
  world.events.push({
    tick: world.tick,
    kind: "repair_ordered",
    payload: { jobId, assetId, shopId, repairTat, logisticsTat: outTat, queueDelay, fee },
  });
  return { ok: true, jobId };
}

export function submitQuote(
  world: World,
  firmId: string,
  rfqId: number,
  unitIds: number[],
  price: number,
  tx: TxKind,
  submitted: number,
): { ok: true; quote: Quote } | { ok: false; reason: string } {
  const rfq = world.rfqs.find((candidate) => candidate.id === rfqId);
  if (!rfq || rfq.expireTick < world.tick || rfq.filled >= rfq.qty) return { ok: false, reason: "rfq_unavailable" };
  if (rfq.pbhContractId !== null) return { ok: false, reason: "rfq_reserved_for_pbh" };
  if (rfq.preferredFirmId !== null && rfq.preferredFirmId !== firmId) {
    return { ok: false, reason: "rfq_preferred_supplier_only" };
  }
  if (price <= 0 || price > rfq.maxPrice * 1.05) return { ok: false, reason: "price_outside_buyer_limit" };
  const quotedPart = world.parts.find((candidate) => candidate.id === rfq.partId);
  if (tx === "exchange" && (!quotedPart || !exchangeEligible(quotedPart))) {
    return { ok: false, reason: "exchange_not_eligible" };
  }
  if (new Set(unitIds).size !== unitIds.length) return { ok: false, reason: "duplicate_asset_ids" };
  if (firmId === "firm-0") {
    const node = world.networkNodes.find(
      (candidate) => candidate.organizationId === rfq.buyerOrganizationId,
    );
    if (node?.state === "locked") return { ok: false, reason: "network_node_locked" };
  }
  const available = unitIds
    .map((id) => world.units.find((unit) => unit.id === id))
    .filter((unit): unit is Unit =>
      Boolean(
        unit &&
        unit.ownerFirmId === firmId &&
        unit.partId === rfq.partId &&
        unit.facilityId !== null &&
        unit.transferId === null &&
        unit.reservedForRfq === null &&
        unit.listed &&
        serviceable(unit.condition) &&
        meetsCondition(unit.condition, rfq.minCondition),
      ),
    );
  if (!available.length) return { ok: false, reason: "no_eligible_assets" };
  const selected = available.slice(0, rfq.qty - rfq.filled);
  for (const unit of selected) unit.reservedForRfq = rfq.id;
  const quote: Quote = {
    id: nextId(world),
    rfqId,
    firmId,
    price: Math.round(price),
    tx,
    submitted,
    unitIds: selected.map((unit) => unit.id),
  };
  world.quotes.push(quote);
  return { ok: true, quote };
}

export function queueAutomaticPurchases(
  world: World,
  rng: Rng,
  firm: Firm,
  pulse: PulseAccumulator,
  policy?: StandingPolicy,
): void {
  if (!firm.buyingStrategy.enabled || firm.insolvent) return;
  const demandScore = (listing: MarketListing) => {
    const arrivalTick =
      world.tick +
      logisticsTat(world, listing.sellerFacilityId, firm.warehouseFacilityId);
    return listing.items.reduce((sum, item) => {
      if (!serviceable(item.condition)) return sum;
      return (
        sum +
        world.rfqs
          .filter((rfq) => {
            if (
              rfq.partId !== item.partId ||
              rfq.filled >= rfq.qty ||
              rfq.expireTick < arrivalTick ||
              rfq.pbhContractId !== null ||
              (rfq.preferredFirmId !== null && rfq.preferredFirmId !== firm.id) ||
              !meetsCondition(item.condition, rfq.minCondition)
            ) {
              return false;
            }
            if (firm.id === "firm-0") {
              const buyerNode = world.networkNodes.find(
                (node) => node.organizationId === rfq.buyerOrganizationId,
              );
              if (buyerNode?.state === "locked") return false;
            }
            return true;
          })
          .reduce((quantity, rfq) => quantity + rfq.qty - rfq.filled, 0)
      );
    }, 0);
  };
  const listings = world.listings
    .filter((listing) => listing.status === "open" && listing.expiresTick >= world.tick)
    .sort((a, b) => demandScore(b) - demandScore(a) || a.totalPrice - b.totalPrice);
  for (const listing of listings) {
    const itemCount = listing.items.reduce((sum, item) => sum + item.quantity, 0);
    const currentInventory = world.units.filter((unit) => unit.ownerFirmId === firm.id).length;
    if (currentInventory + itemCount > firm.buyingStrategy.maxInventoryUnits) continue;
    if (listing.kind === "package" && itemCount > firm.buyingStrategy.maxPackageUnits) continue;
    const average = listing.totalPrice / Math.max(1, itemCount);
    if (average > firm.buyingStrategy.maxAccPerUnit) continue;
    if (policy) {
      const marketAnchor = listing.items.reduce(
        (sum, item) => sum + mrpFor(world, item.partId) * item.quantity,
        0,
      );
      if (listing.totalPrice > marketAnchor * policy.replenishPriceCeil) continue;
    }
    if (listing.kind === "package") {
      const anchor = listing.items.reduce((sum, item) => {
        const part = world.parts.find((candidate) => candidate.id === item.partId);
        return sum + (part ? anchorPrice(part, item.condition) * item.quantity : 0);
      }, 0);
      const discount = anchor > 0 ? 1 - listing.totalPrice / anchor : 0;
      if (discount < firm.buyingStrategy.minPackageDiscount) continue;
    }
    if (!listing.items.every((item) => firm.buyingStrategy.conditions.includes(item.condition))) continue;
    if (
      firm.buyingStrategy.category !== "any" &&
      !listing.items.every((item) => world.parts.find((part) => part.id === item.partId)?.category === firm.buyingStrategy.category)
    ) continue;
    const neededUnits = listing.items.reduce((needed, item) => {
      const stock = world.units.filter(
        (unit) => unit.ownerFirmId === firm.id && unit.partId === item.partId && serviceable(unit.condition),
      ).length;
      const part = world.parts.find((candidate) => candidate.id === item.partId);
      const policyTarget =
        part && ["expendable", "consumable", "standard"].includes(part.category)
          ? policy?.targetStockExpendable
          : policy?.targetStockRotable;
      const target = Math.max(firm.buyingStrategy.targetStock, policyTarget ?? 0);
      return needed + Math.max(0, Math.min(item.quantity, target - stock));
    }, 0);
    if (
      neededUnits === 0 ||
      (listing.kind === "package" && neededUnits / itemCount < 0.5) ||
      firm.accBalance - listing.totalPrice < firm.buyingStrategy.accFloor
    ) continue;
    const currentDemand = demandScore(listing);
    const recentSignal = listing.items.some((item) =>
      (world.removalHistory[item.partId] ?? [])
        .slice(-8)
        .reduce((sum, quantity) => sum + quantity, 0) >= 2,
    );
    if (
      currentDemand === 0 &&
      (!recentSignal || currentInventory >= firm.buyingStrategy.maxInventoryUnits * 0.6)
    ) {
      continue;
    }
    const result = purchaseListing(world, rng, firm.id, listing.id, firm.warehouseFacilityId, pulse);
    if (result.ok) break;
  }
}

export function createAutomaticQuotes(
  world: World,
  policies: Record<string, StandingPolicy>,
  submissionStart: number,
): number {
  let sequence = submissionStart;
  for (const firm of world.firms) {
    if (firm.insolvent) continue;
    const policy = policies[firm.id] ?? policies["firm-0"];
    const margin = firm.salesStrategy.minMargin ?? policy?.autoAcceptMargin ?? 0.2;
    for (const rfq of world.rfqs) {
      if (rfq.filled >= rfq.qty || rfq.expireTick < world.tick) continue;
      if (rfq.pbhContractId !== null) continue;
      if (rfq.preferredFirmId !== null && rfq.preferredFirmId !== firm.id) continue;
      if (firm.id === "firm-0") {
        const node = world.networkNodes.find(
          (candidate) => candidate.organizationId === rfq.buyerOrganizationId,
        );
        if (node?.state === "locked") continue;
      }
      if (world.quotes.some((quote) => quote.rfqId === rfq.id && quote.firmId === firm.id)) continue;
      const candidates = world.units
        .filter(
          (unit) =>
            unit.ownerFirmId === firm.id &&
            unit.partId === rfq.partId &&
            unit.facilityId === firm.warehouseFacilityId &&
            unit.transferId === null &&
            unit.reservedForRfq === null &&
            unit.listed &&
            serviceable(unit.condition) &&
            meetsCondition(unit.condition, firm.salesStrategy.minCondition) &&
            meetsCondition(unit.condition, rfq.minCondition),
        )
        .sort((a, b) => {
          const partA = world.parts.find((part) => part.id === a.partId)!;
          const partB = world.parts.find((part) => part.id === b.partId)!;
          const direction = firm.salesStrategy.allocation === "lowest_value_first" ? 1 : -1;
          return direction * (anchorPrice(partA, a.condition) - anchorPrice(partB, b.condition));
        });
      const reserve = firm.salesStrategy.reserveStock;
      if (candidates.length <= reserve) continue;
      const selected = candidates.slice(0, Math.min(rfq.qty - rfq.filled, candidates.length - reserve));
      if (!selected.length) continue;
      const part = world.parts.find((candidate) => candidate.id === rfq.partId);
      if (!part) continue;
      const basis = Math.max(anchorPrice(part, selected[0]!.condition), mrpFor(world, part.id) * 0.7);
      let price = Math.round(basis * (1 + margin));
      if (rfq.aog) price = Math.round(price * (1 + (policy?.aogAggressiveness ?? 0.4)));
      if (price > rfq.maxPrice) continue;
      const tx: TxKind = exchangeEligible(part) && firm.salesStrategy.exchangeBias >= 0.5 ? "exchange" : "outright";
      const quotedPrice = tx === "exchange" ? Math.round(price * 0.62) : price;
      submitQuote(world, firm.id, rfq.id, selected.map((unit) => unit.id), quotedPrice, tx, sequence++);
    }
  }
  return sequence;
}

export function resolveQuotes(
  world: World,
  pulse: PulseAccumulator,
): void {
  const byRfq = new Map<number, Quote[]>();
  for (const quote of world.quotes) {
    const list = byRfq.get(quote.rfqId) ?? [];
    list.push(quote);
    byRfq.set(quote.rfqId, list);
  }
  for (const rfq of world.rfqs) {
    if (rfq.pbhContractId !== null) continue;
    const quotes = (byRfq.get(rfq.id) ?? []).sort(
      (a, b) => a.price - b.price || a.submitted - b.submitted,
    );
    for (const quote of quotes) {
      if (rfq.filled >= rfq.qty) break;
      const firm = world.firms.find((candidate) => candidate.id === quote.firmId);
      if (!firm || firm.insolvent) continue;
      if (rfq.preferredFirmId !== null && rfq.preferredFirmId !== firm.id) continue;
      const units = quote.unitIds
        .filter((id, index, ids) => ids.indexOf(id) === index)
        .map((id) => world.units.find((unit) => unit.id === id))
        .filter(
          (unit): unit is Unit =>
            Boolean(
              unit &&
              unit.partId === rfq.partId &&
              unit.reservedForRfq === rfq.id,
            ),
        )
        .slice(0, rfq.qty - rfq.filled);
      if (!units.length) continue;
      const tat = logisticsTat(world, firm.warehouseFacilityId, rfq.destinationFacilityId);
      const logisticsCost = units.length * tat * LOGISTICS_COST_PER_UNIT_TICK;
      firm.accBalance += quote.price * units.length - logisticsCost;
      if (firm.id === "firm-0") {
        pulse.sales += quote.price * units.length;
        pulse.logistics -= logisticsCost;
      }
      const dealId = nextId(world);
      world.deals.push({
        id: dealId,
        rfqId: rfq.id,
        buyerOrganizationId: rfq.buyerOrganizationId,
        sellerFirmId: firm.id,
        unitIds: units.map((unit) => unit.id),
        priceEach: quote.price,
        tx: quote.tx,
        status: "accepted",
        expireTick: rfq.expireTick,
      });
      const transferId = nextId(world);
      for (const unit of units) {
        unit.ownerFirmId = null;
        unit.ownerOrganizationId = rfq.buyerOrganizationId;
        unit.facilityId = null;
        unit.transferId = transferId;
        unit.reservedForRfq = null;
        unit.listed = false;
        if (quote.tx === "exchange") {
          world.exchanges.push({
            id: nextId(world),
            firmId: firm.id,
            airlineId: rfq.airlineId,
            partId: rfq.partId,
            dueTick: world.tick + EXCHANGE_CORE_TICKS,
            coreExpected: true,
            coreCharge: Math.round(
              (world.parts.find((part) => part.id === rfq.partId)?.listPrice ?? quote.price) * 0.45,
            ),
          });
        }
      }
      world.transfers.push({
        id: transferId,
        assetIds: units.map((unit) => unit.id),
        fromFacilityId: firm.warehouseFacilityId,
        toFacilityId: rfq.destinationFacilityId,
        departTick: world.tick,
        arriveTick: world.tick + tat,
        purpose: "sale",
        relatedId: dealId,
        rfqId: rfq.id,
        cohortId:
          rfq.kind === "hardtime" || rfq.kind === "overhaul"
            ? rfq.sourceCohortId
            : null,
      });
      rfq.filled += units.length;
      firm.rfqsFilled += units.length;
      world.events.push({
        tick: world.tick,
        kind: "deal_accepted",
        payload: {
          dealId,
          firmId: firm.id,
          rfqId: rfq.id,
          qty: units.length,
          priceEach: quote.price,
          tx: quote.tx,
          logisticsTat: tat,
        },
      });
    }
  }
  for (const unit of world.units) {
    if (unit.reservedForRfq !== null) unit.reservedForRfq = null;
  }
  world.quotes = [];
}

export function applyWeeklyCosts(world: World, pulse: PulseAccumulator): void {
  for (const firm of world.firms) {
    if (firm.insolvent) continue;
    const units = world.units.filter((unit) => unit.ownerFirmId === firm.id).length;
    const cost = WEEKLY_OVERHEAD + units * STORAGE_COST_PER_UNIT;
    const paid = Math.min(firm.accBalance, cost);
    firm.accBalance -= paid;
    if (firm.id === "firm-0") pulse.overhead -= paid;
    if (paid < cost) {
      firm.insolvent = true;
      world.events.push({
        tick: world.tick,
        kind: "insolvent",
        payload: { firmId: firm.id, unpaid: cost - paid },
      });
    }
    firm.navHistory.push(navOf(world, firm.id));
  }
}

export function autoRepairAssets(
  world: World,
  policies: Record<string, StandingPolicy>,
  pulse: PulseAccumulator,
): void {
  for (const firm of world.firms) {
    const policy = policies[firm.id] ?? policies["firm-0"];
    if (!policy || firm.insolvent || !firm.autoRepairEnabled) continue;
    const candidate = world.units.find(
      (unit) =>
        unit.ownerFirmId === firm.id &&
        unit.facilityId === firm.warehouseFacilityId &&
        unit.condition === "AR" &&
        unit.transferId === null,
    );
    if (!candidate) continue;
    const part = world.parts.find((item) => item.id === candidate.partId);
    if (!part?.repairable) continue;
    const shop: Shop | undefined = world.shops.find((item) => item.id === "shop-mid") ?? world.shops[0];
    if (!shop) continue;
    const estimated = part.listPrice * 0.28 * shop.costMult;
    if (estimated > part.listPrice * policy.autoRepairCeil) continue;
    if (firm.accBalance - estimated < policy.cashFloor) continue;
    sendAssetToShop(world, firm.id, candidate.id, shop.id, "min", pulse);
  }
}
