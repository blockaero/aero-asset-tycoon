import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATA_CHAPTERS } from "../src/sim/ata.ts";

/**
 * Art arrives from other sessions as .webp files dropped into public/assets/gen.
 * When a batch lands with ids nothing knows about, nothing breaks and nothing shows:
 * the loader asks for an id the delivery never used, or no surface asks at all. That
 * has already happened twice — the founder portraits and the region relief tiles.
 *
 * These are the two cheap guards against it: every delivered file must be a shot the
 * generator publishes, and every role that has renders must have a consumer in src.
 */

const GEN = new URL("../public/assets/gen/", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("../public/assets/manifest.json", import.meta.url), "utf8"),
) as { assets: { id: string; role: string; generated: string }[] };

const ids = new Set(manifest.assets.map((shot) => shot.id));

describe("delivered art is registered", () => {
  it("has a published shot for every rendered file on disk", () => {
    const orphans = readdirSync(GEN)
      .filter((file) => file.endsWith(".webp"))
      .map((file) => file.replace(/\.webp$/, ""))
      .filter((id) => !ids.has(id));
    // Register the id in scripts/generate-art.mjs, then wire a surface to draw it.
    expect(orphans).toEqual([]);
  });

  it("marks those files as rendered rather than still awaited", () => {
    const onDisk = new Set(
      readdirSync(GEN).filter((f) => f.endsWith(".webp")).map((f) => f.replace(/\.webp$/, "")),
    );
    const mislabelled = manifest.assets
      .filter((shot) => onDisk.has(shot.id) && shot.generated !== "gemini")
      .map((shot) => shot.id);
    expect(mislabelled).toEqual([]);
  });
});

describe("every art role has something that draws it", () => {
  const walk = (dir: string): string[] =>
    readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(`${dir}/${entry.name}`)
        : [readFileSync(new URL(`../${dir}/${entry.name}`, import.meta.url), "utf8")],
    );
  const code = walk("src").join("\n");

  it("builds the ATA glyph id the way the generator names it", () => {
    expect(code).toContain("`ata-ch-${String(code).padStart(2, \"0\")}`");
    for (const chapter of ATA_CHAPTERS.slice(0, 3)) {
      expect(ids.has(`ata-ch-${String(chapter.code).padStart(2, "0")}`)).toBe(true);
    }
  });

  it("draws the region relief tiles", () => {
    expect(code).toContain("assets/gen/region-");
  });

  it("draws the condition badges, the group plates and the opportunity cards", () => {
    expect(code).toContain("`condition-${condition.toLowerCase()}`");
    expect(code).toContain("`ata-${group.toLowerCase()");
    expect(code).toContain("opportunityCardShotId");
    for (const id of ["condition-sv", "ata-propulsion", "card-opp-listing"]) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
