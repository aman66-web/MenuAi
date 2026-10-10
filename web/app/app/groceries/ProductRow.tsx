"use client";

import Link from "next/link";
import { forRetailer, formatPrice, perLabel, photoSources, productLine, retailerName, type ListedProduct } from "@/lib/mm/groceries";
import { ChevronRightIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";
import { PhotoTile } from "./ProductPhoto";

/** A product in a list: photo (our stored copy of the supermarket's own, else its own picture, else "no photo"; decorative), name, size, per-100 g numbers, price when we have one. */
export function ProductRow({ product: listed, retailer }: { product: ListedProduct; retailer: string | null }) {
  const t = useT();
  // Under a supermarket filter the row reads as that supermarket lists it (its own name, size and numbers).
  const product = forRetailer(listed, retailer);
  const shown = retailer && product.prices[retailer] ? product.prices[retailer] : Object.values(product.prices)[0];
  const priceFrom = shown ? Object.entries(product.prices).find(([, v]) => v === shown)?.[0] : undefined;
  const href = `/app/groceries/product?code=${product.gtin}${retailer ? `&r=${retailer}` : ""}`;
  return (
    <Link href={href} prefetch={false} className="glass flex min-h-20 flex-wrap items-center gap-3 rounded-3xl p-3 transition active:scale-[0.99] hover:bg-soft-strong">
      <PhotoTile sources={photoSources(listed, retailer)} />
      <span className="min-w-[9rem] flex-1">
        <span className="block text-[15px] font-bold leading-snug tracking-tight">{product.name}</span>
        <span className="block truncate text-sm text-muted">{[product.brand, product.size].filter(Boolean).join(" · ")}</span>
        <span className="app-numbers block text-sm text-muted">
          {productLine(product, t)} <span className="whitespace-nowrap">{perLabel(product, t)}</span>
        </span>
        {shown && (
          <span className="app-numbers mt-0.5 block text-sm font-semibold text-accent">
            {formatPrice(shown.amount)} <span className="font-normal text-muted">{shown.member ? t("at {shop} · {price} with {scheme}", { shop: retailerName(priceFrom ?? ""), price: formatPrice(shown.member.amount), scheme: shown.member.scheme.replace(/ price$/i, "") }) : t("at {shop}", { shop: retailerName(priceFrom ?? "") })}</span>
          </span>
        )}
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  );
}
