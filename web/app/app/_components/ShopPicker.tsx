"use client";

import { useId } from "react";
import { RETAILERS } from "@/lib/mm/groceries";
import { recipeShops } from "@/lib/mm/shopProducts";
import { useT } from "../_lib/i18n";
import { useShopManifest } from "../_lib/shopProducts";
import { ShopMark } from "./ChainMark";
import { PickMark } from "./DietPicker";

/**
 * The supermarkets someone uses (onboarding and Settings): tap to add or remove; the order tapped is kept (first = the one Groceries and
 * Recipes open on). One white card with a row per shop and hairlines between them, like Settings' Goal list: the shop's own logo on its
 * tile, its name in plain text, and the round mark at the end (the lime tick and a bolder name once chosen).
 * A shop whose labels we haven't read enough of for recipes says "Not in recipes yet" under its name (the onboarding meeting, 19 November: Pip promised
 * Lidl's recipes, and Lidl has none). Said only once the list of shops has loaded: nothing while it loads, or offline (a failed load reads as no shops at all,
 * which would wrongly mark every one).
 */
export function ShopPicker({ value, onChange }: { value: readonly string[]; onChange: (shops: string[]) => void }) {
  const t = useT();
  const id = useId();
  const manifest = useShopManifest();
  const known = !!manifest && manifest.retailers.length > 0;
  const inRecipes = new Set(recipeShops(manifest).map((r) => r.id));
  return (
    <div role="group" aria-label={t("Your supermarkets")} className="glass divide-y divide-line overflow-hidden rounded-[1.25rem]">
      {RETAILERS.map((r) => {
        const on = value.includes(r.id);
        const notYet = known && !inRecipes.has(r.id);
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={on}
            // the shop's name stays the button's name; "Not in recipes yet" is read after it as its description
            onClick={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
            className="flex min-h-[3.75rem] w-full items-center gap-3.5 px-4 py-2.5 text-start transition hover:bg-soft-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-soft-strong"
          >
            {/* the shop's own logo on its tile (decorative), then its name in plain text */}
            <ShopMark shopId={r.id} size="sm" />
            <span className="min-w-0 flex-1 [overflow-wrap:break-word]">
              <span id={`${id}-${r.id}`} className={`block text-[1.0625rem] leading-snug ${on ? "font-bold" : "font-medium"}`}>{r.name}</span>
              {notYet && <span id={`${id}-${r.id}-note`} className="mt-0.5 block text-sm leading-snug text-muted">{t("Not in recipes yet")}</span>}
            </span>
            <PickMark on={on} />
          </button>
        );
      })}
    </div>
  );
}
