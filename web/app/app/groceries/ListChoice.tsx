"use client";

import { useState, type ReactNode } from "react";
import { addToList, knownLists, listsForShop, type ShoppingItem, type ShoppingList } from "@/lib/mm/groceries";
import { shoppingStore } from "@/lib/mm/stores";
import { ShopMark } from "../_components/ChainMark";
import { BasketIcon } from "../_components/icons";
import { Sheet } from "../_components/ui";
import { useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// More than one shopping list (founder 2026-11-18: "shopping lists for like different shops ... and multiple of the same shop itself"). A product from a shop
// page or a product page goes on the main "Shopping list" as before when the person has no list of their own for that shop; when they have one or more, a small
// sheet asks "Add to which list?" (their lists for that shop, oldest first, then "Shopping list").

/** The shopping list page, showing one list ("" or absent = the main list). */
export const listHref = (id?: string | null): string => (id ? `/app/groceries/list?l=${encodeURIComponent(id)}` : "/app/groceries/list");

type Item = Omit<ShoppingItem, "qty" | "addedAt" | "list">;

/**
 * `add(item)` puts a product on a list, asking which one when the person has lists for its shop; `onAdded` is told where it went (null = the main list).
 * Render `sheet` once on the screen.
 */
export function useAddToList(onAdded: (list: ShoppingList | null, item: Item) => void): { add: (item: Item) => void; sheet: ReactNode } {
  const t = useT();
  const settings = useSettings();
  const items = useStore(shoppingStore);
  const [pending, setPending] = useState<Item | null>(null);
  const lists = pending ? listsForShop(knownLists(settings.shoppingLists, items), pending.retailer) : [];
  const put = (item: Item, list: ShoppingList | null) => {
    shoppingStore.update((l) => addToList(l, list ? { ...item, list: list.id } : item));
    onAdded(list, item);
  };
  const add = (item: Item) => {
    if (listsForShop(knownLists(settings.shoppingLists, shoppingStore.get()), item.retailer).length === 0) put(item, null);
    else setPending(item);
  };
  const choose = (list: ShoppingList | null) => {
    const item = pending;
    setPending(null);
    if (item) put(item, list);
  };
  const row = "flex min-h-14 w-full items-center gap-3 rounded-[1.25rem] p-2.5 text-start transition active:scale-[0.99] hover:bg-soft-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent glass";
  const sheet = (
    <Sheet open={!!pending} onClose={() => setPending(null)} title={t("Add to which list?")}>
      {pending && (
        <div className="pb-2 pt-1">
          <p className="text-[0.9375rem] leading-snug text-muted [overflow-wrap:anywhere]">{pending.name}</p>
          <ul className="mt-3 space-y-2">
            {lists.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => choose(l)} className={row}>
                  <ShopMark shopId={l.shop} size="sm" />
                  <span className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-snug [overflow-wrap:anywhere]">{l.name}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => choose(null)} className={row}>
                <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--fill)]"><BasketIcon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-snug [overflow-wrap:anywhere]">{t("Shopping list")}</span>
              </button>
            </li>
          </ul>
        </div>
      )}
    </Sheet>
  );
  return { add, sheet };
}
