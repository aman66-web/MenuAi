"use client";

import Link from "next/link";
import { builderHref, chainHref } from "@/lib/mm/routes";
import { useEffect, useRef, useState } from "react";
import { FREE_SAVED_ORDER_LIMIT } from "@/lib/mm/config";
import { macroLine, nutrientAriaLabel } from "@/lib/mm/format";
import { describeOrder, isOrderAvailable } from "@/lib/mm/order";
import { deleteSavedOrder, favoritesStore, restoreSavedOrder, savedStore } from "@/lib/mm/stores";
import type { SavedOrder } from "@/lib/mm/user-data";
import { ChainCard } from "../_components/ChainRow";
import { ChevronLeftIcon, TrashIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { MacroSummary } from "../_components/Nutrition";
import { Badge, Button, EmptyState, LinkButton } from "../_components/ui";
import { useChainIndexes, useHydrated, useIsPro, useMenu, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// "My saved meals" (from Home; founder 2026-10-10): the restaurant meals the person saved, then their favourite restaurants.
// SPEC §7.7: most recent first. Pro: tap opens the builder. Free: read-only detail. A saved order whose item or
// ingredient left the menu says "No longer on the menu", keeps its saved numbers, and can't be edited.
export default function SavedPage() {
  const hydrated = useHydrated();
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

  if (!hydrated) return null;

  function remove(order: SavedOrder) {
    deleteSavedOrder(order.id);
    setUndo(order);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 6000);
  }

  return (
    <div>
      <Link href="/app" aria-label={t("Back to home")} className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      <h1 className="mt-5 text-4xl font-extrabold tracking-tight">{t("My saved meals")}</h1>
      {!pro && saved.length > 0 && (
        <p className="mt-1 text-sm text-muted">{t("{used} of {limit} free saved orders used.", { used: Math.min(saved.length, FREE_SAVED_ORDER_LIMIT), limit: FREE_SAVED_ORDER_LIMIT })}</p>
      )}

      {saved.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Pip mood="wave" size={64} />} title={t("No saved orders yet")} body={t("Save an order from any menu item, or from the order builder.")} action={<LinkButton href="/app/eat-out" variant="secondary">{t("Find a restaurant")}</LinkButton>} />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {saved.map((o) => {
            const ix = indexes.get(o.chainId);
            const gone = ix === "missing" || (ix !== undefined && !isOrderAvailable(ix, o.lines));
            const expanded = open === o.id;
            return (
              <li key={o.id} className="glass rounded-3xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold leading-snug tracking-tight">{o.name}</h2>
                    <p className="text-sm text-muted">{o.chainName}</p>
                    <p className="app-numbers mt-1 text-sm text-muted" aria-label={nutrientAriaLabel(o.name, o.nutrients, t)}>{macroLine(o.nutrients, t)}</p>
                    {gone && <p className="mt-2"><Badge>{t("No longer on the menu")}</Badge></p>}
                  </div>
                  <button type="button" aria-label={t("Delete {name}", { name: o.name })} onClick={() => remove(o)} className="-me-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft-strong">
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-3 flex gap-2">
                  {pro && !gone ? (
                    <LinkButton href={builderHref({ chain: o.chainId, saved: o.id })} variant="secondary" className="flex-1">{t("Open in builder")}</LinkButton>
                  ) : (
                    <Button variant="secondary" className="flex-1" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : o.id)}>{expanded ? t("Hide details") : t("Details")}</Button>
                  )}
                  {!gone && <Link href={chainHref(o.chainId)} className="inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold text-accent hover:bg-accent-soft">{t("Menu")}</Link>}
                </div>
                {expanded && (
                  <div className="mt-3 rounded-2xl bg-soft-strong p-3">
                    <MacroSummary nutrients={o.nutrients} />
                    {ix && ix !== "missing" && !gone && <p className="mt-3 text-sm text-muted">{describeOrder(ix, o.lines)}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {favoriteChains.length > 0 && (
        <section aria-labelledby="fav-heading" className="mt-8">
          <h2 id="fav-heading" className="mb-3 text-xl font-extrabold tracking-tight">{t("Favourite restaurants")}</h2>
          <div className="grid grid-cols-2 gap-3">{favoriteChains.map((c) => (<ChainCard key={c.id} chain={c} />))}</div>
        </section>
      )}

      {undo && (
        <div role="status" className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md items-center justify-between gap-3 glass rounded-full bg-[var(--nav-bg)] px-5 py-2 shadow-lg">
          <span className="text-sm">{t("Deleted “{name}”.", { name: undo.name })}</span>
          <button type="button" className="min-h-11 px-2 font-semibold text-accent" onClick={() => { restoreSavedOrder(undo); setUndo(null); }}>{t("Undo")}</button>
        </div>
      )}
    </div>
  );
}
