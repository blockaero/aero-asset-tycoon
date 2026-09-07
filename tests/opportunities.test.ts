import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_TEMPLATES,
  opportunityCardShotId,
} from "../src/sim/opportunities.ts";
import type { NetworkOpportunity } from "../src/sim/types.ts";

function stub(kind: NetworkOpportunity["kind"], title = "x"): NetworkOpportunity {
  return {
    id: 1,
    nodeId: "n",
    kind,
    title,
    description: "",
    referenceId: null,
    agreementKind: null,
    expiresTick: 10,
    accepted: false,
    timeCost: 1,
    rcCost: 0,
    accCost: 0,
    ataFocus: [32],
    easterEgg: kind === "easter_egg",
    reward: "",
  };
}

describe("opportunity card shots", () => {
  it("covers a unique shot id per template kind", () => {
    const ids = OPPORTUNITY_TEMPLATES.map((template) =>
      opportunityCardShotId(stub(template.kind)),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      "card-opp-listing",
      "card-opp-warehouse-rotables",
      "card-opp-warehouse-questionable",
      "card-opp-warehouse-as-removed",
    ]));
  });

  it("maps easter eggs by title to card-egg ids", () => {
    expect(opportunityCardShotId(stub("easter_egg", "Misfiled LLP consignment"))).toBe(
      "card-egg-misfiled-llp-consignment",
    );
  });
});
