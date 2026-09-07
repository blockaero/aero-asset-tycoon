/**
 * The ATA chapter glyph.
 *
 * ATA chapter is the primary axis of the whole game, so it gets a face: one small
 * mark per chapter, addressed as `ata-ch-<code>` on the usual art ladder. Chapters
 * without a render yet draw nothing at all rather than a stand-in — a half-illustrated
 * chip row reads as broken, an unillustrated one just reads as text.
 */

import type { AtaGroup } from "../../sim/types.ts";
import { useArtSource } from "./ArtImage.tsx";
import "./AtaGlyph.css";

export type AtaGlyphProps = {
  code: number;
  /** Visual weight. "chip" is the inline mark on a chip, "plate" the larger badge. */
  size?: "chip" | "plate";
  className?: string;
};

export function ataGlyphId(code: number): string {
  return `ata-ch-${String(code).padStart(2, "0")}`;
}

export function AtaGlyph({ code, size = "chip", className = "" }: AtaGlyphProps) {
  const art = useArtSource(ataGlyphId(code));
  if (art.exhausted) return null;
  return (
    <img
      className={`ata-glyph ata-glyph--${size} ${className}`.trim()}
      src={art.src}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={art.onError}
    />
  );
}

export function ataGroupPlateId(group: AtaGroup): string {
  return `ata-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** The tier above the chapter glyph: one plate per ATA group, on section headings. */
export function AtaGroupPlate({ group, className = "" }: { group: AtaGroup; className?: string }) {
  const art = useArtSource(ataGroupPlateId(group));
  if (art.exhausted) return null;
  return (
    <img
      className={`ata-group-plate ${className}`.trim()}
      src={art.src}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={art.onError}
    />
  );
}
