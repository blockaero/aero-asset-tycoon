import { z } from "zod";
import type { GameCommand } from "../sim/types.ts";

const condition = z.enum(["NE", "NS", "OH", "SV", "RP", "AR", "BER", "SCRAP"]);

export const gameCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("purchase_listing"),
    listingId: z.number().int().positive(),
    destinationFacilityId: z.string().min(1),
  }),
  z.object({
    type: z.literal("send_to_shop"),
    assetId: z.number().int().positive(),
    shopId: z.string().min(1),
    workscope: z.enum(["min", "oh"]),
  }),
  z.object({
    type: z.literal("submit_quote"),
    rfqId: z.number().int().positive(),
    unitIds: z.array(z.number().int().positive()).min(1).refine(
      (ids) => new Set(ids).size === ids.length,
      "duplicate_asset_ids",
    ),
    price: z.number().int().positive(),
    tx: z.enum(["outright", "exchange"]),
  }),
  z.object({
    type: z.literal("set_buying_strategy"),
    patch: z.object({
      enabled: z.boolean().optional(),
      maxAccPerUnit: z.number().int().nonnegative().optional(),
      minPackageDiscount: z.number().min(0).max(1).optional(),
      targetStock: z.number().int().nonnegative().optional(),
      accFloor: z.number().int().nonnegative().optional(),
      maxInventoryUnits: z.number().int().positive().max(1000).optional(),
      maxPackageUnits: z.number().int().positive().max(100).optional(),
      conditions: z.array(condition).optional(),
      category: z.enum(["llp", "rotable", "repairable", "expendable", "consumable", "standard", "any"]).optional(),
    }).strict(),
  }),
  z.object({
    type: z.literal("set_sales_strategy"),
    patch: z.object({
      minMargin: z.number().min(-0.5).max(5).optional(),
      reserveStock: z.number().int().nonnegative().optional(),
      minCondition: condition.optional(),
      exchangeBias: z.number().min(0).max(1).optional(),
      allocation: z.enum(["lowest_value_first", "highest_value_first"]).optional(),
    }).strict(),
  }),
  z.object({
    type: z.literal("accept_network_opportunity"),
    opportunityId: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("sign_network_agreement"),
    opportunityId: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("sign_pbh"),
    contractId: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("open_opportunity"),
    opportunityId: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("visit_node"),
    nodeId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("invest_knowledge"),
    nodeId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("hire_team_member"),
    candidateId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("release_team_member"),
    memberId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("set_identity"),
    companyName: z.string().min(1).max(48),
    founderName: z.string().min(1).max(48),
    portraitId: z.string().min(1).max(64),
  }),
]);

export function parseGameCommand(value: unknown): GameCommand {
  return gameCommandSchema.parse(value) as GameCommand;
}
