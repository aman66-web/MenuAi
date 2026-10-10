"use client";

import Link from "next/link";
import { useState } from "react";
import { addToList, customItem, CUSTOM_RETAILER, formatPrice, groupName, itemCode, listAsText, listTotals, setQty, toggleDone, withoutDone, type ShoppingItem } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { nextToBuy } from "@/lib/mm/listRecipes";
import { shoppingStore } from "@/lib/mm/stores";
import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, CopyIcon, MinusIcon, PlusIcon, PotIcon, ShareIcon } from "../../_components/icons";
import { Button, EmptyState, inputClass } from "../../_components/ui";
import { useHydrated, useStore } from "../../_lib/hooks";
import { usePossessive, useT } from "../../_lib/i18n";
import { addMissing, useListRecipes } from "../../_lib/listRecipes";
import { Rich } from "../../_lib/Rich";

// "My groceries" (founder 2026-10-10): the shopping list, on this device only. Type anything in ("Milk"), or add products from Groceries and
// recipes; tick things off as they go in the basket. At the top: the recipes this list can make, and what one of them still needs. Share or
// copy it as text. Shelf prices are noted when products are added (a guide: never kept up to date).
export default function ShoppingListPage() {
  const t = useT();
  const poss = usePossessive();
  const hydrated = useHydrated();
  const list = useStore(shoppingStore);
  const [note, setNote] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const { state, matches } = useListRecipes(list);
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of list) groups.set(i.retailer, [...(groups.get(i.retailer) ?? []), i]);
  const ticked = list.filter((i) => i.done).length;
  const suggestion = matches ? nextToBuy(matches) : null;

  const share = async () => {
    const text = listAsText(list, t);
    try {
      if (navigator.share) await navigator.share({ title: t("Shopping list"), text });
      else { await navigator.clipboard.writeText(text); setNote(t("Copied.")); }
    } catch { /* cancelled */ }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(listAsText(list, t)); setNote(t("Copied.")); } catch { setNote(t("Couldn't copy.")); } };
  const addTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const item = customItem(typed);
    if (!item) return;
    shoppingStore.update((l) => addToList(l, item));
    setTyped("");
    setNote(t("Added “{name}”.", { name: item.name }));
  };

  return (
    <div>
      <Link href="/app" aria-label={t("Back to home")} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight"><Rich text={t("My {groceries}")} values={{ groceries: <span className="serif-em sun-text pe-0.5">{t("groceries")}</span> }} /></h1>
      <p className="mt-1 text-[15px] text-muted">{t("Your shopping list. Tick things off as they go in your basket.")}</p>

      <form onSubmit={addTyped} className="mt-4 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("Add something to your list")}</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("Add something, e.g. milk")} maxLength={60} enterKeyHint="done" autoComplete="off" className={`${inputClass} min-h-14 text-lg`} />
        </label>
        <Button type="submit" className="min-h-14 px-5" disabled={!typed.trim()}><PlusIcon className="h-5 w-5" />{t("Add")}</Button>
      </form>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm font-medium text-accent">{note}</p>

      {!hydrated ? null : list.length === 0 ? (
        <div className="mt-2"><EmptyState title={t("Your list is empty.")} body={t("Type what you need above, or add products from Groceries and recipes.")} action={<div className="flex flex-wrap justify-center gap-2"><Link href="/app/groceries" className="btn-sun inline-flex min-h-11 items-center rounded-full px-5 font-bold text-on-accent">{t("Browse groceries")}</Link><Link href="/app/recipes" className="glass inline-flex min-h-11 items-center rounded-full px-5 font-bold">{t("See recipes")}</Link></div>} /></div>
      ) : (
        <>
          {/* At the top, as asked: what this list can make (its own products, matched by the recipes' rules). */}
          <Link href="/app/groceries/list/recipes" className="glass lift group mt-1 flex min-h-[4.25rem] items-center gap-3 rounded-[1.5rem] p-2.5 ps-3 hover:bg-soft-strong">
            <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 rounded-2xl"><PotIcon className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="block font-extrabold leading-snug tracking-tight">{t("What can I cook with this?")}</span>
              <span className="app-numbers block text-sm text-muted">
                {matches === null ? (state?.status === "error" ? t("See recipes that use what's on your list.") : t("Looking through the recipes…")) : matches.length === 0 ? t("No recipe uses these yet. See all recipes.") : matches.length === 1 ? t("1 recipe uses something on your list") : t("{n} recipes use something on your list", { n: matches.length })}
              </span>
            </span>
            <span aria-hidden className="icon-bubble-soft h-10 w-10 shrink-0 transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
          </Link>

          {[...groups.entries()].map(([retailer, items]) => {
            const totals = listTotals(items);
            const sorted = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
            return (
              <section key={retailer} aria-label={groupName(retailer, t)} className="mt-5">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">{groupName(retailer, t)}</h2>
                <ul className="space-y-2">
                  {sorted.map((i) => {
                    const code = itemCode(i);
                    const href = i.custom ? null : i.gtin ? `/app/groceries/product?code=${i.gtin}&r=${i.retailer}` : `/app/groceries/shop/item?r=${i.retailer}&id=${encodeURIComponent(i.shopId ?? "")}`;
                    const detail = [i.brand, i.size, i.price !== undefined ? formatPrice(i.price) : "", i.gtin].filter(Boolean).join(" · ");
                    const body = (
                      <>
                        <span className={`block font-bold leading-snug tracking-tight [overflow-wrap:anywhere] ${i.done ? "text-muted line-through" : ""}`}>{i.name}</span>
                        {detail && <span className="app-numbers block truncate text-sm text-muted">{detail}</span>}
                      </>
                    );
                    return (
                      <li key={code + i.retailer} className={`glass flex flex-wrap items-center gap-x-2 gap-y-2 rounded-3xl p-2.5 ${i.done ? "opacity-70" : ""}`}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={!!i.done}
                          aria-label={i.done ? t("{name}: in the basket", { name: i.name }) : t("{name}: still to get", { name: i.name })}
                          onClick={() => shoppingStore.update((l) => toggleDone(l, code, i.retailer))}
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                        >
                          <span aria-hidden className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${i.done ? "bg-sun border-transparent text-on-accent" : "border-line"}`}>{i.done && <CheckIcon className="h-5 w-5" strokeWidth={3} />}</span>
                        </button>
                        {href ? <Link href={href} className="min-w-[7rem] flex-1">{body}</Link> : <div className="min-w-[7rem] flex-1">{body}</div>}
                        <div className="ms-auto flex items-center gap-1">
                          <button type="button" aria-label={t("One fewer {name}", { name: i.name })} onClick={() => shoppingStore.update((l) => setQty(l, code, i.retailer, i.qty - 1))} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full"><MinusIcon className="h-5 w-5" /></button>
                          <span className="app-numbers w-6 text-center font-bold" aria-label={t("Quantity {n}", { n: i.qty })}>{i.qty}</span>
                          <button type="button" aria-label={t("One more {name}", { name: i.name })} onClick={() => shoppingStore.update((l) => setQty(l, code, i.retailer, i.qty + 1))} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full"><PlusIcon className="h-5 w-5" /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {retailer !== CUSTOM_RETAILER && totals.priced > 0 && (
                  <p className="app-numbers mt-2 px-1 text-sm text-muted">
                    <Rich
                      text={totals.priced === totals.count
                        ? (totals.oldest
                          ? t("{total} for the items with a price, at {shopPossessive} prices checked {date}. Prices change: check in store.", { shopPossessive: poss(groupName(retailer, t)), date: formatDate(totals.oldest, t) })
                          : t("{total} for the items with a price, at {shopPossessive} prices. Prices change: check in store.", { shopPossessive: poss(groupName(retailer, t)) }))
                        : (totals.oldest
                          ? t("{total} for the {priced} of {count} items with a price, at {shopPossessive} prices checked {date}. Prices change: check in store.", { priced: totals.priced, count: totals.count, shopPossessive: poss(groupName(retailer, t)), date: formatDate(totals.oldest, t) })
                          : t("{total} for the {priced} of {count} items with a price, at {shopPossessive} prices. Prices change: check in store.", { priced: totals.priced, count: totals.count, shopPossessive: poss(groupName(retailer, t)) }))}
                      values={{ total: <span className="font-bold text-foreground">{formatPrice(totals.total)}</span> }}
                    />
                  </p>
                )}
              </section>
            );
          })}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={share}><ShareIcon className="h-5 w-5" />{t("Share list")}</Button>
            <Button variant="secondary" onClick={copy}><CopyIcon className="h-5 w-5" />{t("Copy")}</Button>
            {ticked > 0 && <Button variant="secondary" onClick={() => { shoppingStore.update(withoutDone); setNote(null); }}>{t("Remove ticked ({n})", { n: ticked })}</Button>}
            <Button variant="ghost" onClick={() => { shoppingStore.set([]); setNote(null); }}>{t("Clear")}</Button>
          </div>
          {suggestion && state?.status === "ready" && (
            <section aria-labelledby="suggest-heading" className="glass mt-6 rounded-3xl p-4">
              <h2 id="suggest-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{t("You might also need")}</h2>
              <p className="mt-1.5 text-[15px] leading-snug">
                <Rich text={t("To make {recipe}, you'd also need:")} values={{ recipe: <Link href={`/app/recipes/view?id=${suggestion.recipe.id}&r=${state.file.retailer}`} className="font-bold text-accent underline underline-offset-2">{t(suggestion.recipe.name)}</Link> }} />
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {suggestion.missing.map((i) => {
                  const label = suggestion.resolved.picks[i]?.spec.label ?? suggestion.recipe.ingredients[i]!.label;
                  return <li key={i} className="tile rounded-full px-3 py-1 text-sm font-semibold">{t(label)}</li>;
                })}
              </ul>
              <Button variant="secondary" className="mt-3" onClick={() => { const n = addMissing(suggestion, state.file); setSuggestNote(n === 1 ? t("Added 1 product to your {shop} list.", { shop: state.file.name }) : t("Added {n} products to your {shop} list.", { n, shop: state.file.name })); }}>
                <PlusIcon className="h-5 w-5" />{suggestion.missing.length === 1 ? t("Add it to my list") : t("Add them to my list")}
              </Button>
              <p role="status" aria-live="polite" className="mt-1 min-h-5 text-sm font-medium text-accent">{suggestNote}</p>
            </section>
          )}

        </>
      )}
    </div>
  );
}
