import type { Rng } from "./rng.ts";
import type { Condition } from "./types.ts";

export type CounterInput = Partial<{
  tsn: number;
  csn: number;
  tsr: number;
  csr: number;
  tso: number;
  cso: number;
}>;

export function coherentCounters(
  rng: Rng,
  serialized: boolean,
  condition: Condition,
  input: CounterInput = {},
): { tsn: number; csn: number; tsr: number; csr: number; tso: number; cso: number } {
  if (!serialized || condition === "NE" || condition === "NS") {
    return { tsn: 0, csn: 0, tsr: 0, csr: 0, tso: 0, cso: 0 };
  }
  const tsn = nonnegative(input.tsn ?? rng.int(800, 14_000));
  const csn = Math.min(tsn, nonnegative(input.csn ?? rng.int(400, Math.max(400, Math.round(tsn * 0.8)))));
  const priorTso = Math.min(tsn, nonnegative(input.tso ?? rng.int(0, Math.max(0, tsn))));
  const priorCso = Math.min(csn, nonnegative(input.cso ?? rng.int(0, Math.max(0, csn))));

  if (condition === "OH") {
    return { tsn, csn, tsr: 0, csr: 0, tso: 0, cso: 0 };
  }
  if (condition === "RP") {
    return { tsn, csn, tsr: 0, csr: 0, tso: priorTso, cso: priorCso };
  }
  return {
    tsn,
    csn,
    tsr: Math.min(tsn, nonnegative(input.tsr ?? rng.int(0, Math.max(0, tsn)))),
    csr: Math.min(csn, nonnegative(input.csr ?? rng.int(0, Math.max(0, csn)))),
    tso: priorTso,
    cso: priorCso,
  };
}

function nonnegative(value: number): number {
  return Math.max(0, Math.round(value));
}
