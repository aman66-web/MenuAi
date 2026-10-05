"use client";

import Link from "next/link";
import { builderHref, chainHref } from "@/lib/mm/routes";
import { useEffect, useRef, useState } from "react";
import { FREE_SAVED_ORDER_LIMIT } from "@/lib/mm/config";
import { macroLine, nutrientAriaLabel } from "@/lib/mm/format";
import { describeOrder, isOrderAvailable } from "@/lib/mm/order";
import { deleteSavedOrder, restoreSavedOrder, savedStore } from "@/lib/mm/stores";
import type { SavedOrder } from "@/lib/mm/user-data";
import { TrashIcon } from "../_components/icons";
import { MacroSummary } from "../_components/Nutrition";
import { Badge, Button, EmptyState, LinkButton } from "../_components/ui";
import { useChainIndexes, useHydrated, useIsPro, useStore } from "../_lib/hooks";

// SPEC §7.7: most recent first. Pro: tap opens the builder. Free: read-only detail. A saved order whose item or
// ingredient left the menu says "No longer on the menu", keeps its saved numbers, and can't be edited.
export default function SavedPage() {
  const hydrated = useHydrated();
  const saved = useStore(savedStore);
  const pro = useIsPro();
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
      <h1 className="text-3xl font-bold tracking-tight">Saved</h1>
      {!pro && saved.length > 0 && (
        <p className="mt-1 text-sm text-muted">{Math.min(saved.length, FREE_SAVED_ORDER_LIMIT)} of {FREE_SAVED_ORDER_LIMIT} free saved orders used.</p>
      )}

      {saved.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No saved orders yet" body="Save an order from any menu item, or from the order builder." action={<LinkButton href="/app" variant="secondary">Find a restaurant</LinkButton>} />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {saved.map((o) => {
            const ix = indexes.get(o.chainId);
            const gone = ix === "missing" || (ix !== undefined && !isOrderAvailable(ix, o.lines));
            const expanded = open === o.id;
            return (
              <li key={o.id} className="rounded-xl border border-line bg-soft p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold leading-snug">{o.name}</h2>
                    <p className="text-sm text-muted">{o.chainName}</p>
                    <p className="app-numbers mt-1 text-sm text-muted" aria-label={nutrientAriaLabel(o.name, o.nutrients)}>{macroLine(o.nutrients)}</p>
                    {gone && <p className="mt-2"><Badge>No longer on the menu</Badge></p>}
                  </div>
                  <button type="button" aria-label={`Delete ${o.name}`} onClick={() => remove(o)} className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background">
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-3 flex gap-2">
                  {pro && !gone ? (
                    <LinkButton href={builderHref({ chain: o.chainId, saved: o.id })} variant="secondary" className="flex-1">Open in builder</LinkButton>
                  ) : (
                    <Button variant="secondary" className="flex-1" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : o.id)}>{expanded ? "Hide details" : "Details"}</Button>
                  )}
                  {!gone && <Link href={chainHref(o.chainId)} className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-medium text-accent hover:bg-accent-soft">Menu</Link>}
                </div>
                {expanded && (
                  <div className="mt-3 rounded-lg bg-background p-3">
                    <MacroSummary nutrients={o.nutrients} />
                    {ix && ix !== "missing" && !gone && <p className="mt-3 text-sm text-muted">{describeOrder(ix, o.lines)}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {undo && (
        <div role="status" className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-line bg-background px-4 py-2 shadow-lg">
          <span className="text-sm">Deleted “{undo.name}”.</span>
          <button type="button" className="min-h-11 px-2 font-semibold text-accent" onClick={() => { restoreSavedOrder(undo); setUndo(null); }}>Undo</button>
        </div>
      )}
    </div>
  );
}
