import { describe, expect, it } from "vitest";
import {
  LIVE_TICK_SECONDS,
  TICKS_PER_MONTH,
  tickDurationMs,
} from "../src/sim/balance.ts";

describe("live weekly pulse clock", () => {
  it("paces a weekly pulse at 25, 50, or 75 seconds", () => {
    expect(LIVE_TICK_SECONDS.fast).toBe(25);
    expect(LIVE_TICK_SECONDS.medium).toBe(50);
    expect(LIVE_TICK_SECONDS.slow).toBe(75);
  });

  it("keeps four weekly ticks per month", () => {
    expect(TICKS_PER_MONTH).toBe(4);
    expect(tickDurationMs("fast")).toBe(25_000);
    expect(tickDurationMs("medium")).toBe(50_000);
    expect(tickDurationMs("slow")).toBe(75_000);
  });
});
