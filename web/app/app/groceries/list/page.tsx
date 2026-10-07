"use client";

import Link from "next/link";
import { useState } from "react";
import { listAsText, retailerName, setQty, type ShoppingItem } from "@/lib/mm/groceries";
import { shoppingStore } from "@/lib/mm/stores";
import { ChevronLeftIcon, CopyIcon, MinusIcon, PlusIcon, ShareIcon } from "../../_components/icons";
import { Button, EmptyState } from "../../_components/ui";
import { useHydrated, useStore } from "../../_lib/hooks";

// The shopping list: on this device only. Share or copy it as text (grouped by supermarket); later it can feed recipe ideas.
export default function ShoppingListPage() {
  const hydrated = useHydrated();
  const list = useStore(shoppingStore);
  const [note, setNote] = useState<string | null>(null);
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of list) groups.set(i.retailer, [...(groups.get(i.retailer) ?? []), i]);

  const share = async () => {
    const text = listAsText(list);
    try {
      if (navigator.share) await navigator.share({ title: "Shopping list", text });
      else { await navigator.clipboard.writeText(text); setNote("Copied."); }
    } catch { /* cancelled */ }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(listAsText(list)); setNote("Copied."); } catch { setNote("Couldn't copy."); } };

  return (
    <div>
      <Link href="/app/groceries" aria-label="Back to groceries" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight">Shopping <span className="serif-em sun-text pr-0.5">list</span></h1>
      {!hydrated ? null : list.length === 0 ? (
        <div className="mt-6"><EmptyState title="Your list is empty." body="Open a product and tap Add to build a list for each supermarket." action={<Link href="/app/groceries" className="btn-sun inline-flex min-h-11 items-center rounded-full px-5 font-bold text-on-accent">Browse groceries</Link>} /></div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={share}><ShareIcon className="h-5 w-5" />Share list</Button>
            <Button variant="secondary" onClick={copy}><CopyIcon className="h-5 w-5" />Copy</Button>
            <Button variant="ghost" onClick={() => { shoppingStore.set([]); setNote(null); }}>Clear</Button>
          </div>
          <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm font-medium text-accent">{note}</p>
          {[...groups.entries()].map(([retailer, items]) => (
            <section key={retailer} aria-label={retailerName(retailer)} className="mt-5">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">{retailerName(retailer)}</h2>
              <ul className="space-y-2">
                {items.map((i) => (
                  <li key={i.gtin + i.retailer} className="glass flex items-center gap-3 rounded-3xl p-3 pl-4">
                    <Link href={`/app/groceries/product?code=${i.gtin}&r=${i.retailer}`} className="min-w-0 flex-1">
                      <span className="block font-bold leading-snug tracking-tight">{i.name}</span>
                      <span className="app-numbers block truncate text-sm text-muted">{[i.brand, i.size].filter(Boolean).join(" · ")} · {i.gtin}</span>
                    </Link>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label={`One fewer ${i.name}`} onClick={() => shoppingStore.update((l) => setQty(l, i.gtin, i.retailer, i.qty - 1))} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full"><MinusIcon className="h-5 w-5" /></button>
                      <span className="app-numbers w-6 text-center font-bold" aria-label={`Quantity ${i.qty}`}>{i.qty}</span>
                      <button type="button" aria-label={`One more ${i.name}`} onClick={() => shoppingStore.update((l) => setQty(l, i.gtin, i.retailer, i.qty + 1))} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full"><PlusIcon className="h-5 w-5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
