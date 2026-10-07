"use client";

import Link from "next/link";
import { formatPrice, imageUrl, perLabel, productLine, retailerName, type ListedProduct } from "@/lib/mm/groceries";
import { ChevronRightIcon } from "../_components/icons";

/** A product in a list: photo (Open Food Facts, decorative), name, size, per-100 g numbers, price when we have one. */
export function ProductRow({ product, retailer }: { product: ListedProduct; retailer: string | null }) {
  const src = imageUrl(product.image, 100);
  const shown = retailer && product.prices[retailer] ? product.prices[retailer] : Object.values(product.prices)[0];
  const priceFrom = shown ? Object.entries(product.prices).find(([, v]) => v === shown)?.[0] : undefined;
  const href = `/app/groceries/product?code=${product.gtin}${retailer ? `&r=${retailer}` : ""}`;
  return (
    <Link href={href} prefetch={false} className="glass flex min-h-20 items-center gap-3 rounded-3xl p-3 transition active:scale-[0.99] hover:bg-soft-strong">
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- a third-party product photo, decorative: the name is plain text beside it */}
        {src ? <img src={src} alt="" width={64} height={64} loading="lazy" decoding="async" className="h-full w-full object-contain" /> : <span aria-hidden className="text-xs text-muted">no photo</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-snug tracking-tight">{product.name}</span>
        <span className="block truncate text-sm text-muted">{[product.brand, product.size].filter(Boolean).join(" · ")}</span>
        <span className="app-numbers block text-sm text-muted">
          {productLine(product)} <span className="whitespace-nowrap">{perLabel(product)}</span>
        </span>
        {shown && (
          <span className="app-numbers mt-0.5 block text-sm font-semibold text-accent">
            {formatPrice(shown.amount)} <span className="font-normal text-muted">at {retailerName(priceFrom ?? "")}</span>
          </span>
        )}
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  );
}
