import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The Office HQ hotspots are transparent buttons positioned over painted scenery.
 * Nothing at runtime notices when the two disagree: the button still works, it just
 * sits over the wrong part of the picture. That is exactly the bug that shipped when
 * the certificate wall moved off the back wall onto the left pier and its click
 * target stayed behind on the glazing.
 *
 * scripts/generate-art.mjs publishes the regions it painted into the manifest, so the
 * art is the source of truth and drift fails here instead of reaching a player.
 */

type Rect = { top: number; left: number; width: number; height: number };

const manifest = JSON.parse(
  readFileSync(new URL("../public/assets/manifest.json", import.meta.url), "utf8"),
) as { regions?: Record<string, Rect> };

const css = readFileSync(
  new URL("../src/client/components/OfficeHQ.css", import.meta.url),
  "utf8",
);

/** Pull the four percentage offsets out of a single CSS rule. */
function cssRect(selector: string): Rect {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`no rule for ${selector}`);
  const read = (property: string): number => {
    const found = new RegExp(`(?:^|;|\\s)${property}:\\s*([0-9.]+)%`).exec(block[1]!);
    if (!found) throw new Error(`${selector} has no ${property} in percent`);
    return Number(found[1]);
  };
  return { top: read("top"), left: read("left"), width: read("width"), height: read("height") };
}

/** How far outside the painted subject a click target may sprawl, in stage percent. */
const SLACK = 2.5;

describe("Office HQ hotspots line up with the art", () => {
  it("publishes the regions it painted", () => {
    expect(manifest.regions).toBeDefined();
    expect(manifest.regions?.wall).toBeDefined();
  });

  it("covers the certificate wall without sprawling off it", () => {
    const art = manifest.regions!.wall!;
    const hotspot = cssRect(".officehq-hotspot--wall");

    // Covers every frame in the grid.
    expect(hotspot.left).toBeLessThanOrEqual(art.left);
    expect(hotspot.top).toBeLessThanOrEqual(art.top);
    expect(hotspot.left + hotspot.width).toBeGreaterThanOrEqual(art.left + art.width);
    expect(hotspot.top + hotspot.height).toBeGreaterThanOrEqual(art.top + art.height);

    // And does not reach far beyond them onto neighbouring scenery.
    expect(art.left - hotspot.left).toBeLessThanOrEqual(SLACK);
    expect(art.top - hotspot.top).toBeLessThanOrEqual(SLACK);
    expect(hotspot.left + hotspot.width - (art.left + art.width)).toBeLessThanOrEqual(SLACK);
    expect(hotspot.top + hotspot.height - (art.top + art.height)).toBeLessThanOrEqual(SLACK);
  });

  it("keeps the wall clear of the founder and the glazing behind them", () => {
    const hotspot = cssRect(".officehq-hotspot--wall");
    // The founder's head inset sits at 46.6% across; the wall must stay well left of
    // it so the area behind the founder reads as open glass.
    expect(hotspot.left + hotspot.width).toBeLessThan(40);
  });
});
