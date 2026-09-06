import type { Rng } from "./rng.ts";
import { allowedListingConditions } from "./condition-rules.ts";
import type {
  AgreementKind,
  NetworkAgreement,
  NetworkNode,
  NetworkOpportunity,
  World,
} from "./types.ts";
import { anchorPrice, mrpFor, nextId, relationshipScore } from "./util.ts";

export function updateNetworkReach(world: World): void {
  const player = world.firms.find((firm) => firm.id === "firm-0");
  if (!player) return;
  for (const node of world.networkNodes) {
    if (node.role === "hq") continue;
    const relationship = relationshipScore(world, node.organizationId);
    if (node.state === "locked" && player.globalReputation >= node.reputationRequired) {
      node.state = "lead";
      world.events.push({
        tick: world.tick,
        kind: "network_lead_unlocked",
        payload: { nodeId: node.id, organizationId: node.organizationId },
      });
      if (!world.opportunities.some((opportunity) => opportunity.nodeId === node.id && opportunity.kind === "introduction" && !opportunity.accepted)) {
        world.opportunities.push({
          id: nextId(world),
          nodeId: node.id,
          kind: "introduction",
          title: `Introduction to ${node.label}`,
          description: "Accept the introduction to establish a working relationship.",
          referenceId: null,
          agreementKind: null,
          expiresTick: world.tick + 12,
          accepted: false,
        });
      }
    }
    else if (node.state === "lead" && relationship >= Math.max(15, node.relationshipRequired)) {
      node.state = "known";
      world.events.push({
        tick: world.tick,
        kind: "network_node_known",
        payload: { nodeId: node.id, organizationId: node.organizationId },
      });
    }
    if (node.state === "known" && relationship >= 45) {
      node.state = "partner";
      world.events.push({
        tick: world.tick,
        kind: "network_partner",
        payload: { nodeId: node.id, organizationId: node.organizationId },
      });
    }
  }
}

export function adjustRelationship(
  world: World,
  organizationId: string,
  delta: number,
  onTime: boolean,
  recordDelivery = true,
): void {
  let relationship = world.relationships.find((candidate) => candidate.organizationId === organizationId);
  if (!relationship) {
    relationship = {
      organizationId,
      score: 0,
      onTimeDeliveries: 0,
      missedDeliveries: 0,
    };
    world.relationships.push(relationship);
  }
  relationship.score = Math.max(0, Math.min(100, relationship.score + delta));
  if (recordDelivery) {
    if (onTime) relationship.onTimeDeliveries += 1;
    else relationship.missedDeliveries += 1;
  }
  const player = world.firms.find((firm) => firm.id === "firm-0");
  if (player) {
    player.globalReputation = Math.max(0, Math.min(100, player.globalReputation + Math.sign(delta)));
  }
  updateNetworkReach(world);
}

export function acceptNetworkOpportunity(
  world: World,
  opportunityId: number,
): { ok: true; opportunity: NetworkOpportunity } | { ok: false; reason: string } {
  const opportunity = world.opportunities.find((candidate) => candidate.id === opportunityId);
  if (!opportunity || opportunity.accepted || opportunity.expiresTick < world.tick) {
    return { ok: false, reason: "opportunity_unavailable" };
  }
  const node = world.networkNodes.find((candidate) => candidate.id === opportunity.nodeId);
  if (!node || node.state === "locked") return { ok: false, reason: "network_node_locked" };
  opportunity.accepted = true;
  world.events.push({
    tick: world.tick,
    kind: "network_opportunity_accepted",
    payload: { opportunityId, nodeId: opportunity.nodeId, opportunityKind: opportunity.kind },
  });
  if (opportunity.kind === "introduction") {
    adjustRelationship(world, node.organizationId, 15, true, false);
  }
  return { ok: true, opportunity };
}

export function signNetworkAgreement(
  world: World,
  opportunityId: number,
): { ok: true; agreement: NetworkAgreement } | { ok: false; reason: string } {
  const result = acceptNetworkOpportunity(world, opportunityId);
  if (!result.ok) return result;
  const opportunity = result.opportunity;
  if (opportunity.kind !== "agreement" || !opportunity.agreementKind) {
    opportunity.accepted = false;
    return { ok: false, reason: "not_an_agreement" };
  }
  const node = world.networkNodes.find((candidate) => candidate.id === opportunity.nodeId);
  if (!node) return { ok: false, reason: "network_node_missing" };
  const relationship = relationshipScore(world, node.organizationId);
  if (relationship < 35) {
    opportunity.accepted = false;
    return { ok: false, reason: "relationship_too_low" };
  }
  const player = world.firms.find((firm) => firm.id === "firm-0");
  const activeAgreements = world.agreements.filter((agreement) => agreement.active).length;
  const slots = (player?.globalReputation ?? 0) >= 60 ? 3 : 1;
  if (activeAgreements >= slots) {
    opportunity.accepted = false;
    return { ok: false, reason: "agreement_slot_unavailable" };
  }
  const agreement: NetworkAgreement = {
    id: nextId(world),
    nodeId: node.id,
    organizationId: node.organizationId,
    kind: opportunity.agreementKind,
    startTick: world.tick,
    endTick: world.tick + 52,
    active: true,
    cadenceTicks: opportunity.agreementKind === "repair_capacity" ? 1 : 4,
    nextTick: world.tick + 1,
    benefit: opportunity.agreementKind === "repair_capacity" ? 1 : 0.12,
  };
  world.agreements.push(agreement);
  world.events.push({
    tick: world.tick,
    kind: "network_agreement_signed",
    payload: { agreementId: agreement.id, nodeId: node.id, agreementKind: agreement.kind },
  });
  return { ok: true, agreement };
}

export function tickNetworkAgreements(world: World, rng: Rng): void {
  for (const agreement of world.agreements) {
    if (!agreement.active) continue;
    if (world.tick > agreement.endTick) {
      agreement.active = false;
      continue;
    }
    if (world.tick < agreement.nextTick) continue;
    agreement.nextTick += agreement.cadenceTicks;
    if (agreement.kind === "supplier_allocation") {
      const part = rng.pick(world.parts);
      const node = world.networkNodes.find((candidate) => candidate.id === agreement.nodeId);
      const facilityId = node?.facilityIds[0];
      if (!node || !facilityId) continue;
      const source = world.organizations.find(
        (organization) => organization.id === agreement.organizationId,
      );
      const condition = rng.pick(
        allowedListingConditions(source?.kind ?? "asset_manager", part),
      );
      const listingId = nextId(world);
      world.listings.push({
        id: listingId,
        nodeId: node.id,
        sellerOrganizationId: agreement.organizationId,
        sellerFacilityId: facilityId,
        kind: "single_asset",
        title: `Allocated ${part.name} · ${condition}`,
        items: [{
          partId: part.id,
          condition,
          quantity: 1,
          tsn: rng.int(1_000, 12_000),
          csn: rng.int(500, 7_000),
          tsr: rng.int(100, 4_000),
          csr: rng.int(50, 2_500),
        }],
        totalPrice: Math.round(anchorPrice(part, condition) * (1 - agreement.benefit)),
        expiresTick: world.tick + 4,
        status: "open",
        exclusive: true,
      });
      world.opportunities.push({
        id: nextId(world),
        nodeId: node.id,
        kind: "listing",
        title: `Reserved allocation: ${part.name}`,
        description: "Partner-only inventory allocation.",
        referenceId: listingId,
        agreementKind: null,
        expiresTick: world.tick + 4,
        accepted: false,
      });
    } else if (agreement.kind === "preferred_vendor") {
      const airline = world.airlines.find(
        (candidate) => candidate.organizationId === agreement.organizationId,
      );
      if (!airline) continue;
      const stockedPartIds = world.units
        .filter((unit) => unit.ownerFirmId === "firm-0")
        .map((unit) => unit.partId);
      const candidates = world.parts.filter((part) => stockedPartIds.includes(part.id));
      const part = rng.pick(candidates.length ? candidates : world.parts);
      world.rfqs.push({
        id: nextId(world),
        createdTick: world.tick,
        airlineId: airline.id,
        buyerOrganizationId: airline.organizationId,
        destinationFacilityId: airline.facilityId,
        partId: part.id,
        kind: "oncondition",
        minCondition: airline.procurement === "cost_driven" ? "SV" : "OH",
        qty: 1,
        maxPrice: Math.round(mrpFor(world, part.id) * 1.08),
        aog: false,
        expireTick: world.tick + 4,
        filled: 0,
        sourceCohortId: null,
        pbhContractId: null,
        pbhBreachRecorded: false,
        preferredFirmId: "firm-0",
      });
      for (const firm of world.firms) firm.rfqsSeen += 1;
      world.events.push({
        tick: world.tick,
        kind: "preferred_vendor_demand",
        payload: { agreementId: agreement.id, airlineId: airline.id, partId: part.id },
      });
    }
  }
}

export function repairCapacityBenefit(world: World, organizationId: string): number {
  return world.agreements.some(
    (agreement) =>
      agreement.active &&
      agreement.organizationId === organizationId &&
      agreement.kind === "repair_capacity",
  )
    ? 1
    : 0;
}

export function projectNetworkNode(world: World, node: NetworkNode): NetworkNode {
  const playerWarehouse = world.facilities.find(
    (facility) => facility.id === "fac-player-warehouse",
  );
  const target = world.facilities.find((facility) => facility.id === node.facilityIds[0]);
  const routeTat =
    node.role === "hq"
      ? 0
      : Math.max(
          1,
          Math.round(
            ((playerWarehouse?.logisticsTatTicks ?? 1) +
              (target?.logisticsTatTicks ?? node.logisticsTatTicks)) /
              2,
          ),
        );
  if (node.state !== "locked") {
    return { ...node, logisticsTatTicks: routeTat, facilityIds: [...node.facilityIds] };
  }
  return {
    ...node,
    organizationId: "locked",
    facilityIds: [],
    logisticsTatTicks: routeTat,
    hiddenDetail: "",
  };
}

export function agreementLabel(kind: AgreementKind): string {
  if (kind === "supplier_allocation") return "Supplier allocation";
  if (kind === "preferred_vendor") return "Preferred vendor";
  return "Reserved repair capacity";
}
