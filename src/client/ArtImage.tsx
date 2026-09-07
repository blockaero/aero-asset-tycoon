import { useEffect, useMemo, useState } from "react";
import { initialShotSrc, shotCandidates } from "./art.ts";

export function ArtImage({
  shot,
  alt,
  className,
}: {
  shot: string;
  alt: string;
  className?: string;
}) {
  const candidates = useMemo(() => shotCandidates(shot), [shot]);
  const [index, setIndex] = useState(() => startIndex(shot, candidates));

  useEffect(() => {
    setIndex(startIndex(shot, candidates));
  }, [shot, candidates]);

  const src = candidates[Math.min(index, Math.max(0, candidates.length - 1))] ?? "";

  return (
    <img
      className={["art-image", className].filter(Boolean).join(" ")}
      src={src}
      alt={alt}
      data-shot={shot}
      draggable={false}
      onError={() => {
        setIndex((current) => Math.min(current + 1, Math.max(0, candidates.length - 1)));
      }}
    />
  );
}

function startIndex(shot: string, candidates: readonly string[]): number {
  const preferred = initialShotSrc(shot);
  const found = candidates.indexOf(preferred);
  return found === -1 ? 0 : found;
}
