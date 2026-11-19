"use client";

import Link from "next/link";
import { shoppingStore } from "@/lib/mm/stores";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { BasketIcon, GearIcon } from "./icons";

// The top right of each tab's page (founder 2026-11-19: "the settings cog should be on the top right of every page. Also shopping list should be on the last
// page too"): the round Settings gear on every tab, and the Shopping list with how many things are left on Home and Eat out (Groceries has its own).

/** The Shopping list, with how many things are left to pick up (a screen reader hears "3 things to pick up"). */
export function ShoppingListPill() {
  const t = useT();
  const shopping = useStore(shoppingStore);
  const toBuy = shopping.filter((i) => !i.done).length;
  return (
    <Link href="/app/groceries/list" className="group inline-flex min-h-11 items-center rounded-full transition active:scale-95">
      <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-soft-strong ps-2.5 pe-3 text-[0.9375rem] font-semibold transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]">
        <BasketIcon aria-hidden className="h-[18px] w-[18px]" />{t("Shopping list")}
        {toBuy > 0 && <span className="app-numbers ms-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 text-[0.75rem] font-bold text-background"><span className="sr-only">, {toBuy === 1 ? t("1 thing to pick up") : t("{n} things to pick up", { n: toBuy })}</span><span aria-hidden>{toBuy}</span></span>}
      </span>
    </Link>
  );
}

/** The round Settings gear. */
export function SettingsGear() {
  const t = useT();
  return (
    <Link href="/app/settings" aria-label={t("Settings")} className="group inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]"><GearIcon aria-hidden className="h-[18px] w-[18px]" /></span>
    </Link>
  );
}
