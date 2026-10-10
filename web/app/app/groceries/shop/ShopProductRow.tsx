"use client";

import Link from "next/link";
import { formatPrice, productLine } from "@/lib/mm/groceries";
import { nutritionBasis, shopPhotoUrl, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { ChevronRightIcon } from "../../_components/icons";
import { useT } from "../../_lib/i18n";
import { PhotoTile } from "../ProductPhoto";

/** A product in a shop's full list: the shop's own picture (decorative), its name, price, price per kg or litre, any card price and, where we have read its page, the numbers per 100 g or ml. */
export function ShopProductRow({ file, product }: { file: ShopFile; product: ShopProduct }) {
  const t = useT();
  const src = shopPhotoUrl(file, product);
  const href = `/app/groceries/shop/item?r=${file.retailer}&id=${encodeURIComponent(product.id)}`;
  return (
    <Link href={href} prefetch={false} className="glass flex min-h-20 items-center gap-3 rounded-3xl p-3 transition active:scale-[0.99] hover:bg-soft-strong">
      <PhotoTile sources={src ? [{ src, from: "retailer", shop: file.retailer }] : []} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-snug tracking-tight">{product.name}</span>
        <span className="app-numbers mt-0.5 block text-sm">
          <span className="font-semibold text-accent">{formatPrice(product.price)}</span>
          {product.unitPrice !== null && product.unit && <span className="text-muted"> · {formatPrice(product.unitPrice)} {product.unit}</span>}
        </span>
        {product.member && <span className="app-numbers block text-sm text-muted">{t("{price} with {scheme}", { price: formatPrice(product.member.amount), scheme: product.member.scheme.replace(/ price$/i, "") })}</span>}
        {product.nutrition && (
          <span className="app-numbers block text-sm text-muted">{productLine(product.nutrition, t)} <span className="whitespace-nowrap">{nutritionBasis(product.nutrition, t)}</span></span>
        )}
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  );
}
