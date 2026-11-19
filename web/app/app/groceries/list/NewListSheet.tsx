"use client";

import { MAX_SHOPPING_LISTS, RETAILERS, type ShoppingList } from "@/lib/mm/groceries";
import { ShopMark } from "../../_components/ChainMark";
import { Sheet, Spinner } from "../../_components/ui";
import { useSettings } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { useShopManifest } from "../../_lib/shopProducts";
import { CARD } from "../PageBits";

// "+ New list" (founder 2026-11-18: "they'd go to shopping list and then there'd be a way to press plus and what do you want to create a shopping list for? And
// they could press like M&S, saying it can only be one of the shops there"): the supermarkets whose products the app lists, as big tiles with their own logos,
// the person's own shops first (like Groceries' "Which shop?"). Choosing one makes a list named after it ("M&S", then "M&S 2") and opens it.

/** Two tiles side by side, one above the other when the text is large (the minimum width is in rem, so it grows with the text size). */
const PAIR = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.25rem),1fr))] gap-3";

export function NewListSheet({ open, onClose, onPick, lists }: { open: boolean; onClose: () => void; onPick: (shop: { id: string; name: string }) => void; lists: readonly ShoppingList[] }) {
  const t = useT();
  const settings = useSettings();
  const manifest = useShopManifest();
  const mine = settings.shops ?? [];
  const order = (id: string) => (mine.includes(id) ? mine.indexOf(id) : 100 + RETAILERS.findIndex((r) => r.id === id));
  const shops = manifest ? [...manifest.retailers].sort((a, b) => order(a.id) - order(b.id)) : null;
  const full = lists.length >= MAX_SHOPPING_LISTS;

  return (
    <Sheet open={open} onClose={onClose} title={t("What do you want to make a shopping list for?")}>
      <div className="pb-2 pt-1">
        {full ? (
          <p className="text-base leading-snug">{t("You have {n} lists, the most there can be. Delete one to make another.", { n: MAX_SHOPPING_LISTS })}</p>
        ) : (
          <>
            <p className="text-[0.9375rem] leading-snug text-muted">{t("Choose a shop. You can have more than one list for the same shop.")}</p>
            {!shops ? (
              <Spinner label={t("Loading shops")} />
            ) : (
              <ul className={`mt-4 ${PAIR}`}>
                {shops.map((s) => (
                  <li key={s.id} className="@container flex">
                    {/* the logo above the name; when a tile has the whole row (large text) the logo sits beside the name instead */}
                    <button type="button" onClick={() => onPick({ id: s.id, name: s.name })} className={`${CARD} lift flex min-h-[7.5rem] w-full flex-col items-start justify-between gap-3 p-4 text-start [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent @[260px]:min-h-16 @[260px]:flex-row @[260px]:items-center @[260px]:justify-start`}>
                      <ShopMark shopId={s.id} size="md" />
                      <span className="block text-lg font-[800] leading-snug tracking-[-0.01em]">{s.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
