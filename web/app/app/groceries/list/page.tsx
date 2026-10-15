"use client";

import Link from "next/link";
import { useState } from "react";
import { addToList, customItem, CUSTOM_RETAILER, formatPrice, groupName, itemCode, listAsText, listTotals, setQty, toggleDone, withoutDone, type ShoppingItem } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { nextToBuy } from "@/lib/mm/listRecipes";
import { shoppingStore } from "@/lib/mm/stores";
import { ArrowRightIcon, BasketIcon, CheckIcon, CopyIcon, MinusIcon, PlusIcon, PotIcon, ShareIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { Button, EmptyIcon, EmptyState, LinkButton } from "../../_components/ui";
import { useHydrated, useStore } from "../../_lib/hooks";
import { usePossessive, useT } from "../../_lib/i18n";
import { useListPhotos } from "../../_lib/listPhotos";
import { addMissing, useListRecipes } from "../../_lib/listRecipes";
import { useShopManifest } from "../../_lib/shopProducts";
import { Rich } from "../../_lib/Rich";
import { hasNative, nativeCall } from "@/lib/mm/native";
import { BackLink, CARD, LABEL, PILL_INPUT, TITLE } from "../PageBits";
import { ListThumb } from "../ProductPhoto";

// "Shopping list" (founder 2026-10-10, renamed from "My groceries" 2026-10-11): the shopping list, on this device only. Type anything in ("Milk"), or add products from Groceries and
// recipes; tick things off as they go in the basket. At the top: the recipes this list can make, and what one of them still needs. Share or
// copy it as text. Shelf prices are noted when products are added (a guide: never kept up to date).
// Looks follow Home (founder 2026-10-15): the compact title, a white pill to type in with a black Add pill, "What can I cook with this?" as the
// one lime tile on the screen, each shop's items under a small capital label in one white card (rows divided by a fine line, like a recipe's
// ingredients), each with a round tick and grey round − and + buttons.

export default function ShoppingListPage() {
  const t = useT();
  const poss = usePossessive();
  const hydrated = useHydrated();
  const list = useStore(shoppingStore);
  const [note, setNote] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const { state, matches } = useListRecipes(list);
  const photosOf = useListPhotos(list);
  const lists = useShopManifest();
  /** Where "Add more from {shop}" goes: that shop's own list of products, or (a shop with no list) the page that asks which shop. */
  const shopHref = (retailer: string) => (lists && !lists.retailers.some((r) => r.id === retailer) ? "/app/groceries" : `/app/groceries/shop?r=${encodeURIComponent(retailer)}`);
  const groups = new Map<string, ShoppingItem[]>();
  for (const i of list) groups.set(i.retailer, [...(groups.get(i.retailer) ?? []), i]);
  const ticked = list.filter((i) => i.done).length;
  const suggestion = matches ? nextToBuy(matches) : null;

  const share = async () => {
    const text = listAsText(list, t);
    if (hasNative()) {
      const r = await nativeCall("share", { title: t("Shopping list"), text }); // the iPhone's own share sheet
      if (r.done || r.error === "cancelled") return;
    }
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
  /** A round − or + : a 44 px tap area holding a 36 px grey circle, like Home's round actions. */
  const qtyButton = "group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95";
  const qtyCircle = "inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]";

  return (
    <div>
      <BackLink href="/app" label={t("Back to home")} />
      <h1 className={`mt-5 ${TITLE}`}>{t("Shopping list")}</h1>
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Your shopping list. Tick things off as they go in your basket.")}</p>

      {/* the field takes the row and Add sits beside it; at large text, when both no longer fit, Add moves under the field across its width */}
      <form onSubmit={addTyped} className="mt-5 flex flex-wrap gap-2.5">
        <label className="min-w-0 flex-[999_1_13rem]">
          <span className="sr-only">{t("Add something to your list")}</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("Add something, e.g. milk")} maxLength={60} enterKeyHint="done" autoComplete="off" className={`${PILL_INPUT} min-h-[3.25rem]`} />
        </label>
        <Button type="submit" className="min-h-[3.25rem] flex-[1_0_auto] px-5 disabled:bg-soft-strong disabled:text-muted disabled:opacity-100!" disabled={!typed.trim()}><PlusIcon className="h-5 w-5" />{t("Add")}</Button>
      </form>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 ps-1 text-sm font-medium text-accent">{note}</p>

      {!hydrated ? null : list.length === 0 ? (
        <div className="mt-2"><EmptyState icon={<EmptyIcon><BasketIcon /></EmptyIcon>} title={t("Your list is empty.")} body={t("Type what you need above, or add products from Groceries and recipes.")} action={<div className="flex flex-wrap justify-center gap-2.5"><Link href="/app/groceries" className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-[15px] font-bold text-background transition active:scale-[0.97]">{t("Browse groceries")}</Link><Link href="/app/recipes" className="glass inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-semibold transition active:scale-[0.97] hover:bg-soft-strong">{t("See recipes")}</Link></div>} /></div>
      ) : (
        <>
          {/* At the top, as asked: what this list can make (its own products, matched by the recipes' rules). The one lime tile on the screen. */}
          {/* at large text the round pot steps aside (a container query) so the words keep their room */}
          <Link href="/app/groceries/list/recipes" className="bg-sun lift group @container mt-2 flex min-h-[4.75rem] items-center gap-3.5 rounded-[1.25rem] p-3.5 text-on-accent">
            <span aria-hidden className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-on-accent @[19rem]:inline-flex"><PotIcon className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <span className="block text-[1.0625rem] font-[800] leading-snug tracking-[-0.01em]">{t("What can I cook with this?")}</span>
              <span className="app-numbers mt-0.5 block text-[0.9375rem] leading-snug">
                {matches === null ? (state?.status === "error" ? t("See recipes that use what's on your list.") : t("Looking through the recipes…")) : matches.length === 0 ? t("No recipe uses these yet. See all recipes.") : matches.length === 1 ? t("1 recipe uses something on your list") : t("{n} recipes use something on your list", { n: matches.length })}
              </span>
            </span>
            <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
          </Link>

          {[...groups.entries()].map(([retailer, items]) => {
            const totals = listTotals(items);
            const sorted = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
            return (
              <section key={retailer} aria-label={groupName(retailer, t)} className="mt-8">
                <h2 className="kicker mb-3 flex min-h-7 items-center gap-2.5 ps-1">{retailer !== CUSTOM_RETAILER && <ShopMark shopId={retailer} size="xs" />}{groupName(retailer, t)}</h2>
                <ul className={`${CARD} overflow-hidden`}>
                  {sorted.map((i) => {
                    const code = itemCode(i);
                    const href = i.custom ? null : i.gtin ? `/app/groceries/product?code=${i.gtin}&r=${i.retailer}` : `/app/groceries/shop/item?r=${i.retailer}&id=${encodeURIComponent(i.shopId ?? "")}`;
                    const detail = [i.brand, i.size, i.price !== undefined ? formatPrice(i.price) : "", i.gtin].filter(Boolean).join(" · ");
                    const body = (
                      <>
                        <span className={`block text-base font-semibold leading-snug [overflow-wrap:anywhere] ${i.done ? "text-muted line-through decoration-1" : ""}`}>{i.name}</span>
                        {detail && <span className="app-numbers mt-0.5 block truncate text-sm text-muted">{detail}</span>}
                      </>
                    );
                    const thumb = <ListThumb sources={photosOf(i)} />;
                    return (
                      <li key={code + i.retailer} className="relative flex min-h-[4.5rem] items-start gap-x-1.5 px-2 py-2 pe-2.5 before:pointer-events-none before:absolute before:end-0 before:start-[3.25rem] before:top-0 before:h-px before:bg-[var(--line)] first:before:hidden">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={!!i.done}
                          aria-label={i.done ? t("{name}: in the basket", { name: i.name }) : t("{name}: still to get", { name: i.name })}
                          onClick={() => shoppingStore.update((l) => toggleDone(l, code, i.retailer))}
                          className="mt-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
                        >
                          <span aria-hidden className={`inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-full border-2 transition ${i.done ? "bg-sun border-transparent text-on-accent" : "border-[color-mix(in_srgb,var(--foreground)_28%,transparent)]"}`}>{i.done && <CheckIcon className="h-[15px] w-[15px]" strokeWidth={3} />}</span>
                        </button>
                        {/* the picture sits beside the name; what's left of the row under it is the quantity (a long name no longer squeezes against − and +) */}
                        <div className="flex min-w-0 flex-1 items-start gap-3 py-1">
                          {/* the picture opens the product too; the name beside it is the link a screen reader and the keyboard use */}
                          {href ? <Link href={href} tabIndex={-1} aria-hidden className="shrink-0">{thumb}</Link> : thumb}
                          <div className="min-w-0 flex-1">
                            {href ? <Link href={href} className="block py-0.5">{body}</Link> : <div className="py-0.5">{body}</div>}
                            <div className="mt-1 flex items-center justify-end">
                              <button type="button" aria-label={t("One fewer {name}", { name: i.name })} onClick={() => shoppingStore.update((l) => setQty(l, code, i.retailer, i.qty - 1))} className={qtyButton}><span aria-hidden className={qtyCircle}><MinusIcon className="h-[18px] w-[18px]" /></span></button>
                              <span className="app-numbers w-7 text-center font-mono text-base" aria-label={t("Quantity {n}", { n: i.qty })}>{i.qty}</span>
                              <button type="button" aria-label={t("One more {name}", { name: i.name })} onClick={() => shoppingStore.update((l) => setQty(l, code, i.retailer, i.qty + 1))} className={qtyButton}><span aria-hidden className={qtyCircle}><PlusIcon className="h-[18px] w-[18px]" /></span></button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {/* as the last row of each shop's card, like "New reminder" at the foot of a list: more from the same shop (founder 2026-10-15) */}
                  {retailer !== CUSTOM_RETAILER && (
                    <li className="relative before:pointer-events-none before:absolute before:end-0 before:start-[3.25rem] before:top-0 before:h-px before:bg-[var(--line)]">
                      <Link href={shopHref(retailer)} className="flex min-h-14 items-center gap-1.5 px-2 pe-3 transition hover:bg-[var(--fill)] active:bg-soft-strong">
                        <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center"><span className="bg-sun inline-flex h-[1.625rem] w-[1.625rem] items-center justify-center rounded-full text-on-accent"><PlusIcon className="h-[15px] w-[15px]" strokeWidth={3} /></span></span>
                        <span className="min-w-0 flex-1 py-2 text-base font-semibold leading-snug [overflow-wrap:anywhere]">{t("Add more from {shop}", { shop: groupName(retailer, t) })}</span>
                      </Link>
                    </li>
                  )}
                </ul>
                {retailer !== CUSTOM_RETAILER && totals.priced > 0 && (
                  <p className="app-numbers mt-3 px-1 text-sm leading-relaxed text-muted">
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
          {/* and a way to another shop: the page that asks "Which shop?" */}
          <LinkButton href="/app/groceries" variant="secondary" full className="mt-8 min-h-12"><BasketIcon className="h-5 w-5" />{[...groups.keys()].some((r) => r !== CUSTOM_RETAILER) ? t("Add from another shop") : t("Add products from a shop")}</LinkButton>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-2.5">
            <Button className="min-h-12" onClick={share}><ShareIcon className="h-5 w-5" />{t("Share list")}</Button>
            <Button variant="secondary" className="min-h-12" onClick={copy}><CopyIcon className="h-5 w-5" />{t("Copy")}</Button>
            {ticked > 0 && <Button variant="secondary" className="min-h-12" onClick={() => { shoppingStore.update(withoutDone); setNote(null); }}>{t("Remove ticked ({n})", { n: ticked })}</Button>}
            <Button variant="ghost" className={`min-h-12 ${ticked > 0 ? "" : "col-span-full"}`} onClick={() => { shoppingStore.set([]); setNote(null); }}>{t("Clear")}</Button>
          </div>
          {suggestion && state?.status === "ready" && (
            <section aria-labelledby="suggest-heading" className={`${CARD} mt-8 p-5`}>
              <h2 id="suggest-heading" className={LABEL}>{t("You might also need")}</h2>
              <p className="mt-2 text-[0.9375rem] leading-snug">
                <Rich text={t("To make {recipe}, you'd also need:")} values={{ recipe: <Link href={`/app/recipes/view?id=${suggestion.recipe.id}&r=${state.file.retailer}`} className="font-bold text-accent underline underline-offset-4">{t(suggestion.recipe.name)}</Link> }} />
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {suggestion.missing.map((i) => {
                  const label = suggestion.resolved.picks[i]?.spec.label ?? suggestion.recipe.ingredients[i]!.label;
                  return <li key={i} className="rounded-full border border-[color-mix(in_srgb,var(--foreground)_22%,transparent)] px-3.5 py-1.5 text-sm font-medium">{t(label)}</li>;
                })}
              </ul>
              <Button variant="secondary" className="mt-4" onClick={() => { const n = addMissing(suggestion, state.file); setSuggestNote(n === 1 ? t("Added 1 product to your {shop} list.", { shop: state.file.name }) : t("Added {n} products to your {shop} list.", { n, shop: state.file.name })); }}>
                <PlusIcon className="h-5 w-5" />{suggestion.missing.length === 1 ? t("Add it to my list") : t("Add them to my list")}
              </Button>
              <p role="status" aria-live="polite" className="mt-2 text-sm font-medium text-accent empty:mt-0">{suggestNote}</p>
            </section>
          )}

        </>
      )}
    </div>
  );
}
