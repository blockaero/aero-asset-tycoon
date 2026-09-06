import type { Condition, OrganizationKind, PartMaster } from "./types.ts";

export function allowedListingConditions(
  source: OrganizationKind,
  part: PartMaster,
): Condition[] {
  if (source === "manufacturer") return ["NE", "NS"];
  if (["expendable", "consumable", "standard"].includes(part.category)) return ["NE", "NS"];
  if (source === "mro") return part.repairable ? ["OH", "RP", "SV"] : ["SV"];
  if (source === "airline") return part.repairable || part.category === "llp" ? ["SV", "AR"] : ["NS"];
  return part.repairable ? ["OH", "SV", "RP", "AR"] : ["NE", "NS", "SV", "AR"];
}

export function exchangeEligible(part: PartMaster): boolean {
  return part.repairable && (part.category === "rotable" || part.category === "repairable");
}
