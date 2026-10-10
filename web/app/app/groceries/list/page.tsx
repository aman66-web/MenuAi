"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPrice, itemCode, listAsText, listTotals, retailerName, setQty, type ShoppingItem } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { possessive } from "@/lib/mm/shopProducts";
import { shoppingStore } from "@/lib/mm/stores";
import { ChevronLeftIcon, CopyIcon, MinusIcon, PlusIcon, ShareIcon } from "../../_components/icons";
import { Button, EmptyState } from "../../_components/ui";
import { useHydrated, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { Rich } from "../../_lib/Rich";

// The shopping list: on this device only. Share or copy it as text (grouped by supermarket). Recipes add their ingredients here, with the shelf price
// noted when they were added (a guide: never kept up to date).
export default function ShoppingListPage() {
  const t = useT();
  const hydrated = useHydrated();
  const list = useStore(shoppingStore);
  const [note, setNote] = useState<string | null>(null);
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of list) groups.set(i.retailer, [...(groups.get(i.retailer) ?? []), i]);

  const share = async () => {
    const text = listAsText(list);
    try {
      if (navigator.share) await navigator.share({ title: t("Shopping list"), text });
      else { await navigator.clipboard.writeText(text); setNote(t("Copied.")); }
    } catch { /* cancelled */ }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(listAsText(list)); setNote(t("Copied.")); } catch { setNote(t("Couldn't copy.")); } };

  return (
    <div>
      <Link href="/app/groceries" aria-label={t("Back to groceries")} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight"><Rich text={t("Shopping {list}")} values={{ list: <span className="serif-em sun-text pe-0.5">{t("list")}</span> }} /></h1>
      {!hydrated ? null : list.length === 0 ? (
        <div className="mt-6"><EmptyState title={t("Your list is empty.")} body={t("Open a product and tap Add, or add a recipe's ingredients in one go.")} action={<div className="flex flex-wrap justify-center gap-2"><Link href="/app/groceries" className="btn-sun inline-flex min-h-11 items-center rounded-full px-5 font-bold text-on-accent">{t("Browse groceries")}</Link><Link href="/app/recipes" className="glass inline-flex min-h-11 items-center rounded-full px-5 font-bold">{t("See recipes")}</Link></div>} /></div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={share}><ShareIcon className="h-5 w-5" />{t("Share list")}</Button>
            <Button variant="secondary" onClick={copy}><CopyIcon className="h-5 w-5" />{t("Copy")}</Button>
            <Button variant="ghost" onClick={() => { shoppingStore.set([]); setNote(null); }}>{t("Clear")}</Button>
          </div>
          <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm font-medium text-accent">{note}</p>
          {[...groups.entries()].map(([retailer, items]) => {
            const totals = listTotals(items);
            return (
              <section key={retailer} aria-label={retailerName(retailer)} className="mt-5">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">{retailerName(retailer)}</h2>
                <ul className="space-y-2">
                  {items.map((i) => {
                    const code = itemCode(i);
                    const href = i.gtin ? `/app/groceries/product?code=${i.gtin}&r=${i.retailer}` : `/app/groceries/shop/item?r=${i.retailer}&id=${encodeURIComponent(i.shopId ?? "")}`;
                    const detail = [i.brand, i.size, i.price !== undefined ? formatPrice(i.price) : "", i.gtin].filter(Boolean).join(" · ");
                    return (
                      <li key={code + i.retailer} className="glass flex items-center gap-3 rounded-3xl p-3 ps-4">
                        <Link href={href} className="min-w-0 flex-1">
                          <span className="block font-bold leading-snug tracking-tight [overflow-wrap:anywhere]">{i.name}</span>
                          {detail && <span className="app-numbers block truncate text-sm text-muted">{detail}</span>}
                        </Link>
                        <div className="flex items-center gap-1">
                          <button type="button" aria-label={t("One fewer {name}", { name: i.name })} onClick={() => shoppingStore.update((l) => setQty(l, code, i.retailer, i.qty - 1))} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full"><MinusIcon className="h-5 w-5" /></button>
                          <span className="app-numbers w-6 text-center font-bold" aria-label={t("Quantity {n}", { n: i.qty })}>{i.qty}</span>
                          <button type="button" aria-label={t("One more {name}", { name: i.name })} onClick={() => shoppingStore.update((l) => setQty(l, code, i.retailer, i.qty + 1))} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full"><PlusIcon className="h-5 w-5" /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {totals.priced > 0 && (
                  <p className="app-numbers mt-2 px-1 text-sm text-muted">
                    <Rich
                      text={totals.priced === totals.count
                        ? (totals.oldest
                          ? t("{total} for the items with a price, at {shopPossessive} prices checked {date}. Prices change: check in store.", { shopPossessive: possessive(retailerName(retailer)), date: formatDate(totals.oldest, t) })
                          : t("{total} for the items with a price, at {shopPossessive} prices. Prices change: check in store.", { shopPossessive: possessive(retailerName(retailer)) }))
                        : (totals.oldest
                          ? t("{total} for the {priced} of {count} items with a price, at {shopPossessive} prices checked {date}. Prices change: check in store.", { priced: totals.priced, count: totals.count, shopPossessive: possessive(retailerName(retailer)), date: formatDate(totals.oldest, t) })
                          : t("{total} for the {priced} of {count} items with a price, at {shopPossessive} prices. Prices change: check in store.", { priced: totals.priced, count: totals.count, shopPossessive: possessive(retailerName(retailer)) }))}
                      values={{ total: <span className="font-bold text-foreground">{formatPrice(totals.total)}</span> }}
                    />
                  </p>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
