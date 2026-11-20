"use client";

import Link from "next/link";
import { shoppingStore } from "@/lib/mm/stores";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { BasketIcon, GearIcon } from "./icons";

// The top right of every page (founder 2026-11-19: "the settings cog should be on the top right of every page. Also shopping list should be on the last page
// too"), the same control on every screen (colour meeting, 19 November 2026; approved by the founder that day): the Shopping list pill, then the Settings cog
// with the word "Settings" under it, always far right. Not on Settings itself, in sheets or on the full-screen camera. PageHeader.tsx lays them out with
// Back, the title and the page's own action.

/**
 * The Shopping list, with how many things are left to pick up (a screen reader hears "Shopping list, 3 things to pick up"): white with the 1.5 px edge of
 * every control you can tap, an ink basket, ink words, and the count in an ink circle with a white figure (never red). On a phone narrower than 360 px the
 * word is only spoken, so the pill shows the basket and the count. The inline padding gives back the 1.5 px edge on each side. `photo`: the photo-chip look,
 * floating on a food photo.
 */
export function ShoppingListPill({ photo }: { photo?: boolean } = {}) {
  const t = useT();
  const shopping = useStore(shoppingStore);
  const toBuy = shopping.filter((i) => !i.done).length;
  return (
    <Link href="/app/groceries/list" className="group inline-flex min-h-11 shrink-0 items-center rounded-full transition active:scale-95">
      <span className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full ps-[calc(0.625rem_-_1.5px)] pe-[calc(0.75rem_-_1.5px)] text-[0.9375rem] font-semibold text-foreground transition-colors max-[360px]:pe-[calc(0.625rem_-_1.5px)] ${photo ? "photo-chip" : "border-[1.5px] border-edge bg-card group-hover:bg-background"}`}>
        <BasketIcon aria-hidden className="h-[18px] w-[18px] shrink-0 text-ink" />
        <span className="max-[360px]:sr-only">{t("Shopping list")}</span>
        {toBuy > 0 && <span className="app-numbers ms-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1.5 text-[0.75rem] font-bold text-on-ink"><span className="sr-only">, {toBuy === 1 ? t("1 thing to pick up") : t("{n} things to pick up", { n: toBuy })}</span><span aria-hidden>{toBuy}</span></span>}
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
      <Link href="/app/settings" className="photo-chip inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full ps-3 pe-3.5 text-[0.9375rem] font-bold transition active:scale-95">
        <GearIcon aria-hidden className="h-[18px] w-[18px] shrink-0 text-ink" />
        {t("Settings")}
      </Link>
    );
  }
  return (
    <Link href="/app/settings" className="group inline-flex min-w-11 shrink-0 flex-col items-center rounded-2xl px-0.5 pb-0.5 pt-1 transition active:scale-95">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-edge bg-card text-ink transition-colors group-hover:bg-background">
        <GearIcon aria-hidden className="h-[18px] w-[18px]" />
      </span>
      <span className="mt-0.5 whitespace-nowrap text-[0.75rem] font-semibold leading-tight text-foreground">{t("Settings")}</span>
    </Link>
  );
}
