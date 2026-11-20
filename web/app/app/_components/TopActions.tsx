"use client";

import Link from "next/link";
import { isListId, knownLists, listToOpen } from "@/lib/mm/groceries";
import { shoppingStore } from "@/lib/mm/stores";
import { useHydrated, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { listHref } from "../groceries/ListChoice";
import { BasketIcon, GearIcon } from "./icons";

// The top right of every page (founder 2026-11-19: "the settings cog should be on the top right of every page. Also shopping list should be on the last page
// too"), the same control on every screen (colour meeting, 19 November 2026; approved by the founder that day): the Shopping list pill, then the Settings cog
// with the word "Settings" under it, always far right. Not on Settings itself, in sheets or on the full-screen camera. PageHeader.tsx lays them out with
// Back, the title and the page's own action.

/** The list last looked at on this phone (the Shopping list page notes it): only a convenience, so it lives in this browser's storage and may be gone. */
const LAST_LIST_KEY = "mm.v1.lastList";
/** Notes the list being looked at ("" = the main list), for the pill to open next time. */
export function rememberList(id: string): void {
  try { localStorage.setItem(LAST_LIST_KEY, id || "main"); } catch { /* storage blocked: the pill opens the first list with things to get */ }
}
function lastList(): string | null {
  try {
    const v = localStorage.getItem(LAST_LIST_KEY);
    return v === "main" ? "" : v && isListId(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The Shopping list, with how many things are left to pick up (a screen reader hears "Shopping list, 3 things to pick up"): white with the 1.5 px edge of
 * every control you can tap, an ink basket, ink words, and the count in an ink circle with a white figure (never red). The inline padding gives back the
 * 1.5 px edge on each side. `photo`: the photo-chip look, floating on a food photo.
 * It stays on the title's line at the top right at every phone width (founder 2026-11-20, "Take that in the top right"), with the widest date ("May 20")
 * and a three-digit count, measured at 320, 360, 375, 390 and 430 px (e2e/homepages.mjs): below 375 px (a 360 px Android phone, a 320 px iPhone SE) the
 * word is only spoken, so the pill shows the basket and the count; from 375 px the word shows, with 4 px gaps and a snug count circle so the row still fits.
 */
export function ShoppingListPill({ photo }: { photo?: boolean } = {}) {
  const t = useT();
  const shopping = useStore(shoppingStore);
  const settings = useSettings();
  const hydrated = useHydrated();
  const toBuy = shopping.filter((i) => !i.done).length;
  // the list with things to pick up (groceries.ts listToOpen; the last list looked at is read from this phone once the page is on it, so the first paint
  // matches the server's)
  const href = hydrated ? listHref(listToOpen(shopping, knownLists(settings.shoppingLists, shopping).map((l) => l.id), lastList())) : "/app/groceries/list";
  return (
    // at least 44 px wide (below 375 px the pill is the basket and the count only)
    <Link href={href} className="group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95">
      <span className={`inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-full ps-[calc(0.625rem_-_1.5px)] pe-[calc(0.625rem_-_1.5px)] text-[0.9375rem] font-semibold text-foreground transition-colors ${photo ? "photo-chip" : "border-[1.5px] border-edge bg-card group-hover:bg-background"}`}>
        <BasketIcon aria-hidden className="h-[18px] w-[18px] shrink-0 text-ink" />
        <span className="max-[375px]:sr-only">{t("Shopping list")}</span>
        {toBuy > 0 && <span className="app-numbers inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1 text-[0.75rem] font-bold text-on-ink"><span className="sr-only">, {toBuy === 1 ? t("1 thing to pick up") : t("{n} things to pick up", { n: toBuy })}</span><span aria-hidden>{toBuy}</span></span>}
      </span>
    </Link>
  );
}

/**
 * The Settings cog: a white circle with the 1.5 px edge and an ink cog, with the word "Settings" under it (older testers need words on icons; it is also
 * the link's whole name, "Settings"). The link reaches 44 px wide and taller than 44 px with its word. `photo`: one photo-chip pill with the cog and the word
 * inside it, floating on a food photo.
 */
export function SettingsGear({ photo }: { photo?: boolean } = {}) {
  const t = useT();
  if (photo) {
    return (
      <Link href="/app/settings" className="photo-chip inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95">
        <GearIcon aria-hidden className="h-5 w-5 shrink-0 text-ink" />
        <span className="sr-only">{t("Settings")}</span>
      </Link>
    );
  }
  return (
    // the cog alone, no word under it (founder 2026-11-20: "keep the settings cog, but remove the wording settings"); VoiceOver still hears "Settings"
    <Link href="/app/settings" className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-edge bg-card text-ink transition-colors group-hover:bg-background">
        <GearIcon aria-hidden className="h-[18px] w-[18px]" />
      </span>
      <span className="sr-only">{t("Settings")}</span>
    </Link>
  );
}
