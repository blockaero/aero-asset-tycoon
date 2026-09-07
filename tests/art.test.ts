import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOUNDER_SHOT,
  HQ_BOUND_SHOTS,
  MISSING_GEN_SHOTS,
  cssImageUrl,
  hqBackdropShot,
  initialShotSrc,
  shotCandidates,
} from "../src/client/art.ts";

describe("shot-id art loader", () => {
  it("resolves bound HQ plates to gen/<id>.webp first", () => {
    for (const id of HQ_BOUND_SHOTS) {
      expect(shotCandidates(id)[0]).toMatch(new RegExp(`/assets/gen/${id}\\.webp$`));
      expect(initialShotSrc(id)).toMatch(new RegExp(`/assets/gen/${id}\\.webp$`));
      expect(MISSING_GEN_SHOTS.has(id)).toBe(false);
    }
  });

  it("uses the default founder as the HQ full-plate swap", () => {
    expect(hqBackdropShot()).toBe(DEFAULT_FOUNDER_SHOT);
    expect(DEFAULT_FOUNDER_SHOT).toBe("hq-founder-asian-man");
    expect(initialShotSrc(DEFAULT_FOUNDER_SHOT)).toMatch(/\/assets\/gen\/hq-founder-asian-man\.webp$/);
  });

  it("falls back missing mixed-man and idle without starting on a 404", () => {
    expect(shotCandidates("hq-founder-mixed-man")[0]).toMatch(/\/assets\/gen\/hq-founder-mixed-man\.webp$/);
    expect(initialShotSrc("hq-founder-mixed-man")).toMatch(/\/assets\/gen\/hq-founder-mixed-woman\.webp$/);
    expect(initialShotSrc("hq-founder-idle")).toMatch(/\/assets\/gen\/hq-room\.webp$/);
  });

  it("uses legacy world-map underlay because no region-* gen tiles exist", () => {
    expect(shotCandidates("world-map")[0]).toMatch(/\/assets\/gen\/world-map\.webp$/);
    expect(initialShotSrc("world-map")).toMatch(/\/assets\/world-map\.webp$/);
    expect(shotCandidates("world-map")).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/assets\/world-map\.webp$/),
        expect.stringMatching(/\/assets\/world-map-solarpunk\.webp$/),
      ]),
    );
    expect(initialShotSrc("region-kanto")).toMatch(/\/assets\/world-map\.webp$/);
    expect(cssImageUrl("world-map")).toContain("assets/world-map.webp");
  });
});
