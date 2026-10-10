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

/** The large picture on the product page with its credit; nothing at all when no supermarket's picture loads. */
export function ProductPhotoFigure({ sources }: { sources: readonly PhotoSource[] }) {
  const t = useT();
  const { current, fail } = usePhotoSource(sources);
  if (!current) return null;
  return (
    <figure className="glass mt-5 overflow-hidden rounded-3xl bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- our stored copy of the supermarket's own photo, or the supermarket's own picture; decorative */}
      <img key={current.src} src={current.src} alt="" width={400} height={400} decoding="async" referrerPolicy="no-referrer" onError={fail} className="mx-auto h-auto max-h-80 w-full object-contain" />
      <figcaption className="bg-background px-4 py-2 text-xs text-muted">{photoCaption(current, t)}</figcaption>
    </figure>
  );
}

/** The small square picture in a list row: the first supermarket picture that loads, else a quiet "no photo" tile. Decorative either way (the name is plain text beside it). */
export function PhotoTile({ sources }: { sources: readonly PhotoSource[] }) {
  const t = useT();
  const { current, fail } = usePhotoSource(sources);
  return (
    <span className={`grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line ${current ? "bg-white" : "bg-soft"}`}>
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- the supermarket's own product picture, decorative
        <img key={current.src} src={current.src} alt="" width={64} height={64} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} className="h-full w-full object-contain" />
      ) : (
        <span aria-hidden className="flex flex-col items-center gap-0.5 text-muted">
          <BasketIcon className="h-5 w-5 opacity-60" />
          <span className="text-[11px] leading-none">{t("no photo")}</span>
        </span>
      )}
    </span>
  );
}
