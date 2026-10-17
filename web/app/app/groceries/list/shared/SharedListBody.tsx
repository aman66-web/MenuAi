"use client";

import { useState } from "react";
import { addToList, CUSTOM_RETAILER, formatPrice, groupName, itemCode, itemPhotoSources, type ShoppingItem } from "@/lib/mm/groceries";
import type { SharedEntry } from "@/lib/mm/shareList";
import { shoppingStore } from "@/lib/mm/stores";
import { ShopMark } from "../../../_components/ChainMark";
import { BasketIcon, CheckIcon } from "../../../_components/icons";
import { Button, ErrorBox, LinkButton, Spinner } from "../../../_components/ui";
import { useHiddenLogos } from "../../../_lib/hiddenLogos";
import { useT } from "../../../_lib/i18n";
import { useSharedList } from "../../../_lib/sharedList";
import { CARD } from "../../PageBits";
import { ListThumb } from "../../ProductPhoto";

// The products of a shopping list somebody shared, read back and shown (founder 2026-10-15), then "Add all to my shopping list". Two screens use it: a list that
// arrived as a link (this folder's page) and a list a friend sent through Community (the inbox). The list is only references (lib/mm/shareList.ts); the shops'
// own lists give the names, pictures and prices, so what is shown is today's. Looks follow the Shopping list: the shop under a small capital label in one white
// card, a picture beside each name, the quantity at the end (here read-only).

/** The list that was added is kept for this tab (on this device only): Back from "Open my shopping list" returns to the page, and it must not offer "Add all" again, which would double every quantity. */
const ADDED_KEY = "mm.sharedAdded";
const readAdded = (): string | null => {
  if (typeof window === "undefined") return null;
  try { return sessionStorage.getItem(ADDED_KEY); } catch { return null; }
};
const writeAdded = (code: string) => {
  try { sessionStorage.setItem(ADDED_KEY, code); } catch { /* storage blocked: the page just forgets */ }
};

/** `code` is the list's payload: "Added" belongs to the list that was added, so a different list opened in this same tab starts as not added. `intro` is the line under the heading once the list has loaded. */
export function SharedListBody({ entries, code, intro }: { entries: readonly SharedEntry[]; code: string; intro: string }) {
  const t = useT();
  const [retry, setRetry] = useState(0);
  const state = useSharedList(entries, retry);
  useHiddenLogos(); // a shop taken down at its owner's request (public/logos/hidden.json) shows none of its pictures, also when that list arrives after the page opens
  const [addedFor, setAddedFor] = useState<string | null>(readAdded);
  const added = addedFor === code;

  if (state.status === "loading") return <Spinner label={t("Opening the list")} />;
  if (state.status === "error") return <div className="mt-4"><ErrorBox message={t("Couldn't open this list. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>;

  const { items, missing } = state;
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of items) groups.set(i.retailer, [...(groups.get(i.retailer) ?? []), i]);
  const addAll = () => {
    shoppingStore.update((list) => items.reduce((l, { qty, addedAt: _addedAt, ...item }) => addToList(l, item, new Date(), qty), list)); // eslint-disable-line @typescript-eslint/no-unused-vars
    setAddedFor(code);
    writeAdded(code);
  };

  return (
    <>
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted [overflow-wrap:anywhere]">{intro}</p>

      {items.length === 0 ? (
        <div className="mt-4"><ErrorBox message={t("None of the products in this list could be found in the shops' lists any more.")} /></div>
      ) : (
        <>
          {[...groups.entries()].map(([retailer, rows]) => (
            <section key={retailer} aria-label={groupName(retailer, t)} className="mt-7">
              <h2 className="kicker mb-3 flex min-h-7 items-center gap-2.5 ps-1">{retailer !== CUSTOM_RETAILER && <ShopMark shopId={retailer} size="xs" />}{groupName(retailer, t)}</h2>
              <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
                {rows.map((i) => {
                  const detail = [i.brand, i.size, i.price !== undefined ? formatPrice(i.price) : ""].filter(Boolean).join(" · ");
                  return (
                    <li key={itemCode(i) + i.retailer} className="flex min-h-[4.5rem] items-center gap-3 px-3 py-2.5">
                      <ListThumb sources={itemPhotoSources(i)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold leading-snug [overflow-wrap:anywhere]">{i.name}</span>
                        {detail && <span className="app-numbers mt-0.5 block text-sm text-muted [overflow-wrap:anywhere]">{detail}</span>}
                      </span>
                      <span className="app-numbers shrink-0 font-mono text-base" aria-label={t("Quantity {n}", { n: i.qty })}>×{i.qty}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {missing > 0 && <p className="mt-4 px-1 text-sm leading-snug text-muted">{missing === 1 ? t("1 product from this list couldn't be found in the shops' lists any more.") : t("{n} products from this list couldn't be found in the shops' lists any more.", { n: missing })}</p>}

          <div className="mt-7">
            {added ? (
              <>
                <p role="status" className="flex items-center gap-2 px-1 text-base font-semibold text-accent"><CheckIcon className="h-5 w-5" strokeWidth={3} />{t("Added to your shopping list.")}</p>
                <LinkButton href="/app/groceries/list" full className="mt-3 min-h-12 text-base"><BasketIcon className="h-5 w-5" />{t("Open my shopping list")}</LinkButton>
              </>
            ) : (
              <Button full className="min-h-12 text-base" onClick={addAll}>{t("Add all to my shopping list")}</Button>
            )}
          </div>
          <p className="mt-3 px-1 text-sm leading-snug text-muted">{t("Prices are what each shop showed on its website, and they change: check in store.")}</p>
        </>
      )}
    </>
  );
}
