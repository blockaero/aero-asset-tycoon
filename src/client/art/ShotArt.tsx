/**
 * Generic art slots for the families that are one image per enum member.
 *
 * Each renders nothing when the shot is missing, so a partially delivered family
 * leaves the surface exactly as it read before the art existed.
 */

import { useArtSource } from "./ArtImage.tsx";
import "./ShotArt.css";

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function Shot({ id, className }: { id: string; className: string }) {
  const art = useArtSource(id);
  if (art.exhausted) return null;
  return (
    <img
      className={className}
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

/** The illustration on a market shock card, one per shock kind. */
export function ShockArt({ kind }: { kind: string }) {
  return <Shot id={`card-shock-${slug(kind)}`} className="shot-art shot-art--shock" />;
}

/**
 * The plate on an empty state. `which` is the surface that is empty —
 * inventory, knowledge, opportunities, saves, shocks or team.
 */
export function EmptyArt({ which }: { which: string }) {
  return <Shot id={`empty-${slug(which)}`} className="shot-art shot-art--empty" />;
}

/** Tribal Knowledge: the plate on an ATA-group root, or an operations area. */
export function KnowledgeArt({ root, ops }: { root?: string; ops?: string }) {
  const id = root ? `knowledge-root-${slug(root)}` : `knowledge-ops-${slug(ops ?? "")}`;
  return <Shot id={id} className="shot-art shot-art--knowledge" />;
}

/** Asset-class mark: airframe, engine, component or LLP. */
export function AssetClassMark({ assetClass }: { assetClass: string }) {
  return <Shot id={`class-${slug(assetClass)}`} className="shot-art shot-art--mark" />;
}

/** Part-category mark: rotable, repairable, expendable, consumable, LLP, standard. */
export function CategoryMark({ category }: { category: string }) {
  return <Shot id={`category-${slug(category)}`} className="shot-art shot-art--mark" />;
}

/** Aircraft or engine series mark, keyed by the catalog's series id. */
export function SeriesMark({ seriesId }: { seriesId: string }) {
  return <Shot id={`series-${slug(seriesId)}`} className="shot-art shot-art--series" />;
}

/** The Block Aero mark. Callers pass their inline SVG as the fallback. */
export function BrandMark({ wordmark = false, className = "" }: { wordmark?: boolean; className?: string }) {
  return <Shot id={wordmark ? "brand-wordmark" : "brand-mark"} className={`shot-art shot-art--brand ${className}`.trim()} />;
}
