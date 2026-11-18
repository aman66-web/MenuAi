"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPrice, groupName, type ShoppingItem } from "@/lib/mm/groceries";
import { packLabel, shopListItem, shopPhotoSources, similarProducts } from "@/lib/mm/shopProducts";
import { ErrorBox, Sheet, Spinner } from "../../_components/ui";
import { usePossessive, useT } from "../../_lib/i18n";
import { useShopProducts } from "../../_lib/shopProducts";
import { CARD } from "../PageBits";
import { ListThumb } from "../ProductPhoto";

// "Swap" on a shopping list row (founder 2026-11-18: "if they're in the shopping list, they can always swap out ingredients when they're at the supermarket and
// they can't find something"): similar products at the same shop (lib/mm/shopProducts.ts similarProducts), each with its photo, name, price and pack size;
// tapping one puts it on the list in the item's place (same quantity, not ticked, the same list). The shop's list of products is loaded only when Swap is tapped.

export function SwapSheet({ item, onClose, onSwap, moreHref }: { item: ShoppingItem | null; onClose: () => void; onSwap: (to: Omit<ShoppingItem, "qty" | "addedAt" | "list">) => void; moreHref: (retailer: string) => string }) {
  const t = useT();
  const poss = usePossessive();
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(item ? item.retailer : null, retry);
  const options = useMemo(() => (item && state.status === "ready" ? similarProducts(state.products, item) : []), [item, state]);
  const shop = item ? (state.status === "ready" ? state.file.name : groupName(item.retailer, t)) : "";

  return (
    <Sheet open={!!item} onClose={onClose} title={item ? t("Swap {name}", { name: item.name }) : t("Swap")}>
      {item && (
        <div className="pb-2 pt-1">
          <p className="text-[0.9375rem] leading-snug text-muted">{t("Can't find it? Choose something similar at {shop} instead. It takes its place on your list.", { shop })}</p>
          {state.status === "loading" ? (
            <Spinner label={t("Finding similar products")} />
          ) : state.status === "error" ? (
            <div className="mt-4"><ErrorBox message={t("Couldn't load {shopPossessive} products. Check your connection.", { shopPossessive: poss(shop) })} onRetry={() => setRetry((n) => n + 1)} /></div>
          ) : state.status !== "ready" || options.length === 0 ? (
            <div className="mt-4">
              <p className="text-base leading-snug">{t("We couldn't find anything similar at {shop}.", { shop })}</p>
              <Link href={moreHref(item.retailer)} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-[0.9375rem] font-bold text-background transition active:scale-[0.97]">{t("Add more from {shop}", { shop })}</Link>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {options.map((p) => {
                const size = packLabel(p.name);
                const detail = [p.price !== null ? formatPrice(p.price) : t("Price in store"), size ?? "", p.unitPrice !== null && p.unit ? `${formatPrice(p.unitPrice)} ${p.unit}` : ""].filter(Boolean).join(" · ");
                return (
                  <li key={p.id}>
                    {/* the photo first on screen, the words first for a screen reader (the button's name starts with the product's name) */}
                    <button type="button" onClick={() => onSwap(shopListItem(state.file, p))} className={`${CARD} flex w-full flex-wrap items-center gap-3 p-3 text-start transition active:scale-[0.99] hover:bg-soft-strong`}>
                      <span className="order-1 min-w-0 flex-1 basis-[9rem]">
                        <span className="block text-[0.9375rem] font-semibold leading-snug [overflow-wrap:anywhere]">{p.name}</span>
                        <span className="app-numbers mt-0.5 block text-[0.8125rem] leading-snug text-muted [overflow-wrap:anywhere]">{detail}</span>
                      </span>
                      <span className="order-first shrink-0"><ListThumb sources={shopPhotoSources(state.file, p)} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}
