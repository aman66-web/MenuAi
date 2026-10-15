"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/mm/groceries";
import { nutritionBasis, shopPhotoSources, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { ChevronRightIcon } from "../../_components/icons";
import { useT } from "../../_lib/i18n";
import { NutritionChips } from "../NutritionChips";
import { ROW } from "../PageBits";
import { PhotoTile } from "../ProductPhoto";

/** A product in a shop's full list: the shop's own picture (decorative), its name, price, price per kg or litre, any card price and, where we have read its page, the numbers per 100 g or ml. */
export function ShopProductRow({ file, product }: { file: ShopFile; product: ShopProduct }) {
  const t = useT();
  const href = `/app/groceries/shop/item?r=${file.retailer}&id=${encodeURIComponent(product.id)}`;
  return (
    <Link href={href} prefetch={false} className={ROW}>
      <PhotoTile sources={shopPhotoSources(file, product)} />
      <span className="min-w-[9rem] flex-1 py-0.5">
        <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]">{product.name}</span>
        <span className="app-numbers mt-1 block text-[0.9375rem] leading-snug">
          {product.price !== null ? <span className="font-bold text-accent">{formatPrice(product.price)}</span> : <span className="font-semibold">{t("Price in store")}</span>}
          {product.unitPrice !== null && product.unit && <span className="text-muted"> · {formatPrice(product.unitPrice)} {product.unit}</span>}
        </span>
        {product.member && <span className="app-numbers block text-sm leading-snug text-muted">{t("{price} with {scheme}", { price: formatPrice(product.member.amount), scheme: product.member.scheme.replace(/ price$/i, "") })}</span>}
        {product.nutrition && <NutritionChips kcal={product.nutrition.kcal} protein={product.nutrition.protein} basis={nutritionBasis(product.nutrition, t)} />}
      </span>
      <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-muted" />
    </Link>
  );
}
