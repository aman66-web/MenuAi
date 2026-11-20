"use client";

import Link from "next/link";
import { forRetailer, perLabel, photoSources, retailerName, type ListedProduct } from "@/lib/mm/groceries";
import { ChevronRightIcon } from "../_components/icons";
import { useT } from "../_lib/i18n";
import { NutritionChips } from "./NutritionChips";
import { ROW } from "./PageBits";
import { PhotoTile } from "./ProductPhoto";
import { ShopPrices } from "./ShopPrices";

/** A product in a list: photo (our stored copy of the supermarket's own, else its own picture, else "no photo"; decorative), name, size, each shop that sells it with its price, per-100 g numbers (the same order as a shop's own list). */
export function ProductRow({ product: listed, retailer }: { product: ListedProduct; retailer: string | null }) {
  const t = useT();
  // Under a supermarket filter the row reads as that supermarket lists it (its own name, size and numbers).
  const product = forRetailer(listed, retailer);
  const sellers = Object.entries(product.prices)
    .sort(([a, pa], [b, pb]) => Number(b === retailer) - Number(a === retailer) || pa.amount - pb.amount || a.localeCompare(b))
    .map(([shop, p]) => ({ shop, name: retailerName(shop), price: p.amount, member: p.member ?? null }));
  const href = `/app/groceries/product?code=${product.gtin}${retailer ? `&r=${retailer}` : ""}`;
  return (
    <Link href={href} prefetch={false} className={ROW}>
      <PhotoTile sources={photoSources(listed, retailer)} />
      <span className="min-w-[9rem] flex-1 py-0.5">
        <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]">{product.name}</span>
        <span className="mt-0.5 block truncate text-sm text-muted">{[product.brand, product.size].filter(Boolean).join(" · ")}</span>
        {/* every shop that sells this barcode by its logo with its price (founder 2026-11-18: "add the prices next to the logos on other screens too"); under a
            supermarket filter that shop first, then the cheapest */}
        {sellers.length > 0 && <span className="mt-1.5 block"><ShopPrices items={sellers} /></span>}
        <NutritionChips kcal={product.kcal} protein={product.protein} basis={perLabel(product, t)} />
      </span>
      <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-ink" />
    </Link>
  );
}
