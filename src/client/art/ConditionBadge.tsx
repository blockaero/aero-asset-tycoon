/**
 * The condition badge.
 *
 * Condition sits on every chip, listing and unit row, and the two-letter code alone
 * does not let you scan a shelf. The badge is the mark; the code stays beside it so
 * the meaning never depends on the art loading, and a condition with no render yet
 * simply draws the code as before.
 */

import { useArtSource } from "./ArtImage.tsx";
import "./ConditionBadge.css";

export function conditionBadgeId(condition: string): string {
  return `condition-${condition.toLowerCase()}`;
}

export function ConditionBadge({ condition, className = "" }: { condition: string; className?: string }) {
  const art = useArtSource(conditionBadgeId(condition));
  if (art.exhausted) return null;
  return (
    <img
      className={`condition-badge ${className}`.trim()}
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
