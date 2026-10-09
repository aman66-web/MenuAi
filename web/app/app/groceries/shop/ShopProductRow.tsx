"use client";

import Link from "next/link";
import { formatPrice, productLine } from "@/lib/mm/groceries";
import { nutritionBasis, shopPhotoUrl, type ShopFile, type ShopProduct } from "@/lib/mm/shopProducts";
import { ChevronRightIcon } from "../../_components/icons";
import { usePhotoSource } from "../ProductPhoto";

/** A product in a shop's full list: the shop's own picture (decorative), its name, price, price per kg or litre, any card price and, where we have read its page, the numbers per 100 g or ml. */
export function ShopProductRow({ file, product }: { file: ShopFile; product: ShopProduct }) {
  const src = shopPhotoUrl(file, product);
  const { current, fail } = usePhotoSource(src ? [{ src, from: "retailer", shop: file.retailer }] : []);
  const href = `/app/groceries/shop/item?r=${file.retailer}&id=${encodeURIComponent(product.id)}`;
  return (
    <Link href={href} prefetch={false} className="glass flex min-h-20 items-center gap-3 rounded-3xl p-3 transition active:scale-[0.99] hover:bg-soft-strong">
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- the supermarket's own product picture, decorative: the name is plain text beside it */}
        {current ? <img key={current.src} src={current.src} alt="" width={64} height={64} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} className="h-full w-full object-contain" /> : <span aria-hidden className="text-xs text-muted">no photo</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-snug tracking-tight">{product.name}</span>
        <span className="app-numbers mt-0.5 block text-sm">
          <span className="font-semibold text-accent">{formatPrice(product.price)}</span>
          {product.unitPrice !== null && product.unit && <span className="text-muted"> · {formatPrice(product.unitPrice)} {product.unit}</span>}
        </span>
        {product.member && <span className="app-numbers block text-sm text-muted">{formatPrice(product.member.amount)} with {product.member.scheme.replace(/ price$/i, "")}</span>}
        {product.nutrition && (
          <span className="app-numbers block text-sm text-muted">{productLine(product.nutrition)} <span className="whitespace-nowrap">{nutritionBasis(product.nutrition)}</span></span>
        )}
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  );
}
