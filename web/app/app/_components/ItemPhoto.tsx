"use client";

import { useState } from "react";
import { itemImageUrl, itemThumbUrl } from "@/lib/mm/images";
import { useT } from "../_lib/i18n";
import { ForkIcon } from "./icons";

// The chain's own photo of an item, shown as published (resized only; see CLAUDE.md rule 2). It is decorative: the item's
// name is always plain text beside it, so it has an empty alt and is hidden from screen readers. If the file can't load
// the photo simply isn't there: the menu list shows its grey fork tile in its place (so the row lines up with the rows that have
// a photo), and anywhere else the layout around it stays as it was.

/**
 * The small square beside a name in the menu list: soft corners in proportion to its size (between the logo tiles' 14 and 20 px),
 * no outline or shadow, so a photo on a white background floats on the white row.
 * `placeholder`: on a menu where some dishes have a photo, a dish without one (or whose file failed to load) gets a grey tile of the
 * same size with our own fork icon (never a food picture: CLAUDE.md rule 2), so every row's name starts at the same place.
 * It loads the photo's small copy (itemThumbUrl, at most 160 px) first; if that fails (not made yet for a new photo) it tries the full photo,
 * and if that fails too (offline in the iPhone app before the photo was ever seen) it shows the placeholder, or nothing.
 */
export function ItemThumb({ image, placeholder = false }: { image: string | undefined; placeholder?: boolean }) {
  // How many sources have failed for this photo: 0 = try the small copy, 1 = the full photo, 2 = neither. Kept with the photo it belongs to,
  // so a row that is given another dish starts again from the small copy.
  const [failed, setFailed] = useState<{ image: string | undefined; count: number }>({ image, count: 0 });
  const count = failed.image === image ? failed.count : 0;
  const src = count === 0 ? itemThumbUrl(image) : count === 1 ? itemImageUrl(image) : undefined;
  if (!src) {
    if (!placeholder) return null;
    return (
      <span aria-hidden className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--fill)] text-muted">
        <ForkIcon className="h-6 w-6" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- already resized and WebP-encoded by tools/uk_extract/make_thumbs.py and images_common.py
    <img key={src} src={src} alt="" width={56} height={56} loading="lazy" decoding="async" onError={() => setFailed({ image, count: count + 1 })} className="h-14 w-14 shrink-0 rounded-2xl bg-white object-cover" />
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
