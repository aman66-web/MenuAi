"use client";

import { useState } from "react";
import { itemImageUrl } from "@/lib/mm/images";
import { useT } from "../_lib/i18n";

// The chain's own photo of an item, shown as published (resized only; see CLAUDE.md rule 2). It is decorative: the item's
// name is always plain text beside it, so it has an empty alt and is hidden from screen readers. If the file can't load
// the photo simply isn't there and the layout around it stays as it was.

/**
 * The small square beside a name in the menu list: soft corners in proportion to its size (between the logo tiles' 14 and 20 px),
 * no outline or shadow, so a photo on a white background floats on the white row.
 */
export function ItemThumb({ image }: { image: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : itemImageUrl(image);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- already resized and WebP-encoded by tools/uk_extract/images_common.py
    <img src={src} alt="" width={56} height={56} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-14 w-14 shrink-0 rounded-2xl bg-white object-cover" />
  );
}

/**
 * The large photo on the item page, shown whole at its own shape (never cropped or stretched), with where it comes from. It sits
 * just inside the top of the item's white card (8 px in) with soft 12 px corners that follow the card's 20 px ones, so a wide
 * photo nearly fills the width and a square or upright one sits centred on the white card, with no hard edge against the card's
 * rounded corners. The caption sits outside that inset so it lines up with the card's text.
 */
export function ItemPhotoHero({ image, chainName }: { image: string | undefined; chainName: string }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : itemImageUrl(image);
  if (!src) return null;
  return (
    <figure>
      <div className="px-2 pt-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- already resized and WebP-encoded by tools/uk_extract/images_common.py */}
        <img src={src} alt="" width={640} height={480} decoding="async" onError={() => setFailed(true)} className="mx-auto block h-auto max-h-[18rem] w-auto max-w-full rounded-[0.75rem] bg-white" />
      </div>
      <figcaption className="px-4 pt-2.5 text-[0.8125rem] font-medium leading-snug text-muted">{t("Photo from the {chain} website", { chain: chainName })}</figcaption>
    </figure>
  );
}
