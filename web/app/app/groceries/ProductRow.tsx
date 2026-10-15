"use client";

import Link from "next/link";
import { forRetailer, formatPrice, perLabel, photoSources, retailerName, type ListedProduct } from "@/lib/mm/groceries";
import { ChevronRightIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";
import { NutritionChips } from "./NutritionChips";
import { ROW } from "./PageBits";
import { PhotoTile } from "./ProductPhoto";

/** A product in a list: photo (our stored copy of the supermarket's own, else its own picture, else "no photo"; decorative), name, size, price when we have one, per-100 g numbers (the same order as a shop's own list). */
export function ProductRow({ product: listed, retailer }: { product: ListedProduct; retailer: string | null }) {
  const t = useT();
  // Under a supermarket filter the row reads as that supermarket lists it (its own name, size and numbers).
  const product = forRetailer(listed, retailer);
  const shown = retailer && product.prices[retailer] ? product.prices[retailer] : Object.values(product.prices)[0];
  const priceFrom = shown ? Object.entries(product.prices).find(([, v]) => v === shown)?.[0] : undefined;
  const href = `/app/groceries/product?code=${product.gtin}${retailer ? `&r=${retailer}` : ""}`;
  return (
    <Link href={href} prefetch={false} className={ROW}>
      <PhotoTile sources={photoSources(listed, retailer)} />
      <span className="min-w-[9rem] flex-1 py-0.5">
        <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]">{product.name}</span>
        <span className="mt-0.5 block truncate text-sm text-muted">{[product.brand, product.size].filter(Boolean).join(" · ")}</span>
        {shown && (
          <span className="app-numbers mt-1 block text-[0.9375rem] leading-snug">
            <span className="font-bold text-accent">{formatPrice(shown.amount)}</span> <span className="text-muted">{shown.member ? t("at {shop} · {price} with {scheme}", { shop: retailerName(priceFrom ?? ""), price: formatPrice(shown.member.amount), scheme: shown.member.scheme.replace(/ price$/i, "") }) : t("at {shop}", { shop: retailerName(priceFrom ?? "") })}</span>
          </span>
        )}
        <NutritionChips kcal={product.kcal} protein={product.protein} basis={perLabel(product, t)} />
      </span>
      <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
    </Link>
  );
}
