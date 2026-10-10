"use client";

import { useState } from "react";
import { itemImageUrl } from "@/lib/mm/images";

// The chain's own photo of an item, shown as published (resized only; see CLAUDE.md rule 2). It is decorative: the item's
// name is always plain text beside it, so it has an empty alt and is hidden from screen readers. If the file can't load
// the photo simply isn't there and the layout around it stays as it was.

/** The small square beside a name in the menu list. */
export function ItemThumb({ image }: { image: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : itemImageUrl(image);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- already resized and WebP-encoded by tools/uk_extract/images_common.py
    <img src={src} alt="" width={56} height={56} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-14 w-14 shrink-0 rounded-2xl border border-line bg-white object-cover shadow-[0_4px_10px_-6px_rgba(0,0,0,0.3)]" />
  );
}

/**
 * The large photo on the item page, shown whole (never cropped by the layout), with where it comes from. It sits at the top
 * of the item's hero card on a plain white tile (transparent cut-outs look right in dark mode too).
 */
export function ItemPhotoHero({ image, chainName }: { image: string | undefined; chainName: string }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : itemImageUrl(image);
  if (!src) return null;
  return (
    <figure className="p-2 pb-0">
      <div className="overflow-hidden rounded-[1.6rem] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- already resized and WebP-encoded by tools/uk_extract/images_common.py */}
        <img src={src} alt="" width={640} height={480} decoding="async" onError={() => setFailed(true)} className="mx-auto h-auto max-h-[18rem] w-full object-contain" />
      </div>
      <figcaption className="px-4 pt-2 text-xs text-muted">Photo from the {chainName} website</figcaption>
    </figure>
  );
}
