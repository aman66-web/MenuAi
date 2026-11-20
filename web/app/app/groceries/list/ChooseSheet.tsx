"use client";

import { useMemo, useState } from "react";
import { formatPrice, type ShoppingItem } from "@/lib/mm/groceries";
import { packLabel, shopListItem, shopPhotoSources, typedMatches } from "@/lib/mm/shopProducts";
import { ShopMark } from "../../_components/ChainMark";
import { ChoiceMark, ErrorBox, Sheet, Spinner } from "../../_components/ui";
import { usePossessive, useT } from "../../_lib/i18n";
import { useShopProducts } from "../../_lib/shopProducts";
import { CARD } from "../PageBits";
import { ListThumb } from "../ProductPhoto";

// "Choose a product" on something typed onto the shopping list (usability test 2026-11-19: Joan typed milk and bread, and they had no price): products at one
// of the person's shops with those words in the name (lib/mm/shopProducts.ts typedMatches), each with its photo, name, price and pack size; tapping one puts it
// on the list in the typed item's place (same quantity, not ticked, the same list), with its price. A shop's products load only when the sheet opens.

export function ChooseSheet({ item, shops, onClose, onChoose }: { item: ShoppingItem | null; shops: ReadonlyArray<{ id: string; name: string }>; onClose: () => void; onChoose: (to: Omit<ShoppingItem, "qty" | "addedAt" | "list">) => void }) {
  const t = useT();
  const poss = usePossessive();
  const [asked, setAsked] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const shop = shops.find((s) => s.id === asked) ?? shops[0] ?? null;
  const state = useShopProducts(item && shop ? shop.id : null, retry);
  const options = useMemo(() => (item && shop && state.status === "ready" ? typedMatches(state.products, item.name, shop.id) : []), [item, shop, state]);

  return (
    <Sheet open={!!item} onClose={onClose} title={item ? t("Choose a product for “{name}”", { name: item.name }) : t("Choose a product")}>
      {item && shop && (
        <div className="pb-2 pt-1">
          <p className="text-[0.9375rem] leading-snug text-muted">{t("Pick the one you want. It takes the place of “{name}” on your list, with its price.", { name: item.name })}</p>
          {shops.length > 1 && (
            <div role="radiogroup" aria-label={t("Shop")} className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
              {shops.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={s.id === shop.id} onClick={() => setAsked(s.id)}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-[1.5px] ps-2 pe-4 text-[0.9375rem] transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${s.id === shop.id ? "border-on-sun bg-sun font-bold text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card font-semibold text-foreground hover:bg-background"}`}>
                  <ChoiceMark on={s.id === shop.id} /><ShopMark shopId={s.id} size="xs" />{s.name}
                </button>
              ))}
            </div>
          )}
          {state.status === "loading" ? (
            <Spinner label={t("Looking at {shopPossessive} products", { shopPossessive: poss(shop.name) })} />
          ) : state.status === "error" ? (
            <div className="mt-4"><ErrorBox message={t("Couldn't load {shopPossessive} products. Check your connection.", { shopPossessive: poss(shop.name) })} onRetry={() => setRetry((n) => n + 1)} /></div>
          ) : options.length === 0 ? (
            <p className="mt-4 text-base leading-snug">{t("Nothing at {shop} has “{name}” in its name. Try another shop, or keep it as you typed it.", { shop: shop.name, name: item.name })}</p>
          ) : (
            <ul className="mt-3 space-y-2" aria-label={t("Products at {shop}", { shop: shop.name })}>
              {state.status === "ready" && options.map((p) => {
                const size = packLabel(p.name);
                const detail = [p.price !== null ? formatPrice(p.price) : t("Price in store"), size ?? "", p.unitPrice !== null && p.unit ? `${formatPrice(p.unitPrice)} ${p.unit}` : ""].filter(Boolean).join(" · ");
                return (
                  <li key={p.id}>
                    {/* the photo first on screen, the words first for a screen reader (the button's name starts with the product's name) */}
                    <button type="button" onClick={() => onChoose(shopListItem(state.file, p))} className={`${CARD} flex w-full flex-wrap items-center gap-3 p-3 text-start transition active:scale-[0.99] hover:bg-background`}>
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
