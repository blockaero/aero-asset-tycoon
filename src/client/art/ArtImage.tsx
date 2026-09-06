/**
 * Art loader.
 *
 * Every image in the game is addressed by a stable ID from the shot list in
 * .claude/skills/aero-asset-tycoon-graphics/references/shot-list.md, never by path.
 *
 * Resolution order for an ID:
 *   1. assets/gen/<id>.webp   — the real render (Gemini pass)
 *   2. assets/gen/<id>.svg    — the deterministic procedural stand-in
 *   3. a token-coloured gradient block sized to the ratio
 *
 * That order is the whole point: a finished render dropped into public/assets/gen/
 * replaces its stand-in with no code change, and a missing file never breaks layout.
 */

import { useEffect, useState } from "react";
import "./ArtImage.css";

export type ArtRatio = "1:1" | "3:4" | "4:3" | "3:2" | "16:9" | "21:9" | "9:16";

const ASPECT: Record<ArtRatio, string> = {
  "1:1": "1 / 1",
  "3:4": "3 / 4",
  "4:3": "4 / 3",
  "3:2": "3 / 2",
  "16:9": "16 / 9",
  "21:9": "21 / 9",
  "9:16": "9 / 16",
};

function sourcesFor(id: string): string[] {
  const base = import.meta.env.BASE_URL;
  return [`${base}assets/gen/${id}.webp`, `${base}assets/gen/${id}.svg`];
}

export type ArtImageProps = {
  /** Shot-list ID, e.g. "founder-asian-woman" or "hq-room". No extension, no path. */
  id: string;
  alt: string;
  ratio?: ArtRatio;
  className?: string;
  /** Decorative layers in the Office HQ stack should not be announced. */
  decorative?: boolean;
};

export function ArtImage({
  id,
  alt,
  ratio = "1:1",
  className = "",
  decorative = false,
}: ArtImageProps) {
  const [attempt, setAttempt] = useState(0);
  const sources = sourcesFor(id);

  // A new ID restarts the ladder at the preferred format.
  useEffect(() => {
    setAttempt(0);
  }, [id]);

  const exhausted = attempt >= sources.length;
  const style = { aspectRatio: ASPECT[ratio] };

  if (exhausted) {
    return (
      <div
        className={`art-image art-image--placeholder ${className}`}
        style={style}
        role={decorative ? "presentation" : "img"}
        aria-label={decorative ? undefined : alt}
        aria-hidden={decorative || undefined}
        data-art-id={id}
      />
    );
  }

  return (
    <img
      className={`art-image ${className}`}
      style={style}
      src={sources[attempt]}
      alt={decorative ? "" : alt}
      aria-hidden={decorative || undefined}
      loading="lazy"
      decoding="async"
      data-art-id={id}
      onError={() => setAttempt((current) => current + 1)}
    />
  );
}

/**
 * Background-image form, for layers that must sit behind content rather than in flow.
 * Returns a CSS value with the same fallback ladder, so a missing render degrades to
 * the stand-in and then to a gradient without a flash of nothing.
 */
export function artBackground(id: string): string {
  const [webp, svg] = sourcesFor(id);
  return `image-set(url("${webp}") type("image/webp"), url("${svg}") type("image/svg+xml"))`;
}

/** Plain URL for the preferred format. Use when you handle your own fallback. */
export function artUrl(id: string): string {
  return sourcesFor(id)[0]!;
}
