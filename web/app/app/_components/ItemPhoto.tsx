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
    <img src={src} alt="" width={56} height={56} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-14 w-14 shrink-0 rounded-xl border border-line bg-white object-cover" />
  );
}

/** The large photo on the item page, shown whole (never cropped by the layout), with where it comes from. */
export function ItemPhotoHero({ image, chainName }: { image: string | undefined; chainName: string }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : itemImageUrl(image);
  if (!src) return null;
  return (
    <figure className="glass mt-5 overflow-hidden rounded-3xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- already resized and WebP-encoded by tools/uk_extract/images_common.py */}
      <img src={src} alt="" width={640} height={480} decoding="async" onError={() => setFailed(true)} className="mx-auto h-auto max-h-[28rem] w-full bg-white object-contain" />
      <figcaption className="px-4 py-2 text-xs text-muted">Photo from the {chainName} website</figcaption>
    </figure>
  );
}
