"use client";

import Link from "next/link";
import { builderHref, chainHref } from "@/lib/mm/routes";
import { useEffect, useRef, useState } from "react";
import { FREE_SAVED_ORDER_LIMIT } from "@/lib/mm/config";
import { formatGrams, formatInt, nutrientAriaLabel } from "@/lib/mm/format";
import type { T } from "@/lib/mm/i18n";
import type { Nutrients } from "@/lib/mm/types";
import { describeOrder, isOrderAvailable } from "@/lib/mm/order";
import { deleteSavedOrder, favoritesStore, restoreSavedOrder, savedStore } from "@/lib/mm/stores";
import type { SavedOrder } from "@/lib/mm/user-data";
import { ChainCard } from "../_components/ChainRow";
import { TrashIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { MacroSummary } from "../_components/Nutrition";
import { Badge, Button, EmptyState, LinkButton } from "../_components/ui";
import { useChainIndexes, useIsPro, useMenu, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

const CHIP = "inline-flex items-baseline gap-[0.25em] whitespace-nowrap rounded-md bg-[var(--fill)] px-1.5 py-[0.1875rem]";

/** A saved order's figures for its chips: calories, then protein, carbs and fat (only calories for a calories-only chain), rounded as macroLine does. */
function figures(n: Nutrients, t: T): Array<[string, string]> {
  const out: Array<[string, string]> = [[formatInt(n.calories), "kcal"]];
  if (n.protein === undefined || n.carbs === undefined || n.fat === undefined) return out;
  return [...out, [formatGrams(n.protein), t("protein")], [formatGrams(n.carbs), t("carbs")], [formatGrams(n.fat), t("fat")]];
}

// "My meals" › Restaurant meals: the restaurant meals the person saved, then their favourite restaurants.
// SPEC §7.7: most recent first. Pro: tap opens the builder. Free: read-only detail. A saved order whose item or
// ingredient left the menu says "No longer on the menu", keeps its saved numbers, and can't be edited.
// Styled like Home's cards (2026-10-15): white, 20 px corners, the restaurant and figures quiet under the name.
export function RestaurantMeals() {
  const t = useT();
  const saved = useStore(savedStore);
  const pro = useIsPro();
  const favorites = useStore(favoritesStore);
  const menu = useMenu();
  const favoriteChains = menu.chains.filter((c) => favorites.some((f) => f.chainId === c.id));
  const indexes = useChainIndexes(saved.map((o) => o.chainId));
  const [open, setOpen] = useState<string | null>(null);
  const [undo, setUndo] = useState<SavedOrder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function remove(order: SavedOrder) {
    deleteSavedOrder(order.id);
    setUndo(order);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 6000);
  }

  return (
    <div>
      {!pro && saved.length > 0 && (
        <p className="mb-3 text-[0.9375rem] text-muted">{t("{used} of {limit} free saved orders used.", { used: Math.min(saved.length, FREE_SAVED_ORDER_LIMIT), limit: FREE_SAVED_ORDER_LIMIT })}</p>
      )}

      {saved.length === 0 ? (
        <EmptyState icon={<Pip mood="wave" size={64} />} title={t("No saved orders yet")} body={t("Save an order from any menu item, or from the order builder.")} action={<LinkButton href="/app/eat-out" variant="secondary">{t("Find a restaurant")}</LinkButton>} />
      ) : (
        <ul className="space-y-3">
          {saved.map((o) => {
            const ix = indexes.get(o.chainId);
            const gone = ix === "missing" || (ix !== undefined && !isOrderAvailable(ix, o.lines));
            const expanded = open === o.id;
            return (
              <li key={o.id} className="glass rounded-[1.25rem] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[1.0625rem] font-bold leading-snug tracking-[-0.01em]">{o.name}</h3>
                    <p className="text-[0.9375rem] text-muted">{o.chainName}</p>
                  </div>
                  <button type="button" aria-label={t("Delete {name}", { name: o.name })} onClick={() => remove(o)} className="group -me-1.5 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-95">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--fill)] transition-colors group-hover:bg-soft-strong"><TrashIcon className="h-[18px] w-[18px]" /></span>
                  </button>
                </div>
                {/* the figures as the recipe cards' chips, across the card's full width: a bold number and a grey unit (the spaces keep the
                    text "640 kcal" for find-in-page and tests) */}
                <p className="app-numbers mt-2.5 flex flex-wrap gap-1 text-[0.8125rem]" aria-label={nutrientAriaLabel(o.name, o.nutrients, t)}>
                  {figures(o.nutrients, t).map(([n, unit]) => (
                    <span key={unit} className={CHIP}><span className="font-semibold">{n}</span> <span className="text-muted">{unit}</span></span>
                  ))}
                </p>
                {gone && <p className="mt-2"><Badge>{t("No longer on the menu")}</Badge></p>}
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {pro && !gone ? (
                    <LinkButton href={builderHref({ chain: o.chainId, saved: o.id })} className="flex-[3_1_auto]">{t("Open in builder")}</LinkButton>
                  ) : (
                    <Button variant="secondary" className="flex-[3_1_auto]" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : o.id)}>{expanded ? t("Hide details") : t("Details")}</Button>
                  )}
                  {!gone && <Link href={chainHref(o.chainId)} className="inline-flex min-h-11 flex-[1_1_auto] items-center justify-center rounded-full bg-[var(--fill)] px-5 text-[0.9375rem] font-bold transition active:scale-95 hover:bg-soft-strong">{t("Menu")}</Link>}
                </div>
                {expanded && (
                  <div className="mt-3 rounded-[1rem] bg-[var(--fill)] p-3.5">
                    <MacroSummary nutrients={o.nutrients} />
                    {ix && ix !== "missing" && !gone && <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{describeOrder(ix, o.lines)}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {favoriteChains.length > 0 && (
        <section aria-labelledby="fav-heading" className="mt-8">
          <h3 id="fav-heading" className="mb-3 text-xl font-[800] tracking-[-0.01em]">{t("Favourite restaurants")}</h3>
          <div className="grid grid-cols-2 gap-3">{favoriteChains.map((c) => (<ChainCard key={c.id} chain={c} />))}</div>
        </section>
      )}

      {undo && (
        <div role="status" className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-full bg-foreground px-5 py-2 text-background shadow-lg">
          <span className="text-[0.9375rem]">{t("Deleted “{name}”.", { name: undo.name })}</span>
          <button type="button" className="min-h-11 px-2 text-[0.9375rem] font-bold text-[var(--sun)]" onClick={() => { restoreSavedOrder(undo); setUndo(null); }}>{t("Undo")}</button>
        </div>
      )}
    </div>
  );
}
