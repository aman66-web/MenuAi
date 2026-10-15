"use client";

import { useState } from "react";
import { photoCaption, type PhotoSource } from "@/lib/mm/groceries";
import { BasketIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";

/**
 * The picture to show from an ordered list of places (photoSources): the first one, and when it fails to load the next, and so on.
 * `current` is undefined when none is left. A new list starts again from the first.
 */
export function usePhotoSource(sources: readonly PhotoSource[]): { current: PhotoSource | undefined; fail: () => void } {
  const key = sources.map((s) => s.src).join("\n");
  const [failed, setFailed] = useState<{ key: string; n: number }>({ key, n: 0 });
  const n = failed.key === key ? failed.n : 0;
  return { current: sources[n], fail: () => setFailed({ key, n: n + 1 }) };
}

/**
 * The large picture at the top of a product's card, with its credit under it and a fine line below that; nothing at all when no supermarket's
 * picture loads. It sits inside the card's padding (p-5) and reaches its edges, so the photo, the name and the price read as one card.
 */
export function ProductPhotoFigure({ sources }: { sources: readonly PhotoSource[] }) {
  const t = useT();
  const { current, fail } = usePhotoSource(sources);
  if (!current) return null;
  return (
    <figure className="-mx-5 -mt-5 mb-5 border-b border-line bg-white px-5 pb-3 pt-5">
      {/* eslint-disable-next-line @next/next/no-img-element -- our stored copy of the supermarket's own photo, or the supermarket's own picture; decorative */}
      <img key={current.src} src={current.src} alt="" width={400} height={400} decoding="async" referrerPolicy="no-referrer" onError={fail} className="mx-auto h-auto max-h-52 w-full object-contain" />
      <figcaption className="mt-3 text-center text-xs text-muted">{photoCaption(current, t)}</figcaption>
    </figure>
  );
}

/** The small square picture in a list row: the first supermarket picture that loads, else a quiet "no photo" tile. Decorative either way (the name is plain text beside it). */
export function PhotoTile({ sources }: { sources: readonly PhotoSource[] }) {
  const t = useT();
  const { current, fail } = usePhotoSource(sources);
  return (
    <span className={`grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[0.875rem] ${current ? "bg-white" : "bg-[var(--fill)]"}`}>
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- the supermarket's own product picture, decorative
        <img key={current.src} src={current.src} alt="" width={64} height={64} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} className="h-full w-full object-contain" />
      ) : (
        <span aria-hidden className="flex flex-col items-center gap-0.5 text-muted">
          <BasketIcon className="h-5 w-5" />
          <span className="text-[0.6875rem] font-medium leading-none">{t("no photo")}</span>
        </span>
      )}
    </span>
  );
}

/**
 * The picture beside an item on the shopping list (founder 2026-10-15, "the image should be next to it too"): the first supermarket picture that loads, else a quiet
 * basket tile (typed-in items have none, and neither do products whose shop shows no picture). Decorative either way: the item's name is plain text beside it.
 */
export function ListThumb({ sources }: { sources: readonly PhotoSource[] }) {
  const { current, fail } = usePhotoSource(sources);
  return (
    <span aria-hidden className={`grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[0.875rem] ring-1 ring-inset ring-[var(--line)] ${current ? "bg-white" : "bg-[var(--fill)] text-muted"}`}>
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- the supermarket's own product picture (or our stored copy of it), decorative
        <img key={current.src} src={current.src} alt="" width={56} height={56} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} className="h-full w-full object-contain" />
      ) : (
        <BasketIcon className="h-5 w-5" />
      )}
    </span>
  );
}
