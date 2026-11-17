"use client";

import type { PhotoSource } from "@/lib/mm/groceries";
import { BasketIcon } from "../_components/icons";
import { usePhotoSource } from "./ProductPhoto";

/**
 * A product's picture at chip size (28 px, the size of a shop's logo in a chip, ShopMark xs): the first supermarket picture that loads (photoSources /
 * shopPhotoSources), else a quiet basket tile. Always the product's own photo, never a shop's logo. Decorative: the words beside it are the label.
 * Inline-level, so it can sit in a line of text without breaking it.
 */
export function ProductMini({ sources }: { sources: readonly PhotoSource[] }) {
  const { current, fail } = usePhotoSource(sources);
  return (
    <span aria-hidden className={`inline-grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg align-middle ring-1 ring-inset ring-[var(--line)] ${current ? "bg-white" : "bg-[var(--fill)] text-muted"}`}>
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- the supermarket's own product picture (or our stored copy of it), decorative
        <img key={current.src} src={current.src} alt="" width={28} height={28} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} className="h-full w-full object-contain" />
      ) : (
        <BasketIcon className="h-4 w-4" />
      )}
    </span>
  );
}
