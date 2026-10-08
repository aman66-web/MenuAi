"use client";

import { useState } from "react";
import { photoCaption, type PhotoSource } from "@/lib/mm/groceries";

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

/** The large picture on the product page with its credit; nothing at all when no place has a picture that loads. */
export function ProductPhotoFigure({ sources }: { sources: readonly PhotoSource[] }) {
  const { current, fail } = usePhotoSource(sources);
  if (!current) return null;
  return (
    <figure className="glass mt-5 overflow-hidden rounded-3xl bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- our stored copy, or a third-party product photo (the supermarket's own, or Open Food Facts, CC BY-SA), decorative */}
      <img key={current.src} src={current.src} alt="" width={400} height={400} decoding="async" referrerPolicy="no-referrer" onError={fail} className="mx-auto h-auto max-h-80 w-full object-contain" />
      <figcaption className="bg-background px-4 py-2 text-xs text-muted">{photoCaption(current)}</figcaption>
    </figure>
  );
}
