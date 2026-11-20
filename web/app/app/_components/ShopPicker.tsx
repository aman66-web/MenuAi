"use client";

import { useEffect, useId, useState } from "react";
import { RETAILERS } from "@/lib/mm/groceries";
import { useT } from "../_lib/i18n";
import { loadManifest } from "../_lib/groceries";
import { recipeShopSetFor } from "../_lib/recipes";
import { loadShopFile, useShopManifest } from "../_lib/shopProducts";
import { SHOP_OFFER_LINE, shopOffer, type NamesManifest } from "../welcome/shopLines";
import { ShopMark } from "./ChainMark";
import { PickMark } from "./DietPicker";

/** The product-names list (public/groceries/groceries-manifest.json), for the shops missing from the every-product list; null until it has loaded (or offline). */
function useNamesManifest(): NamesManifest | null {
  const [m, setM] = useState<NamesManifest | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadManifest().then((x) => { if (!cancelled) setM(x); }, () => undefined);
    return () => { cancelled = true; };
  }, []);
  return m;
}

/**
 * The supermarkets someone uses (onboarding and Settings): tap to add or remove; the order tapped is kept (first = the one Groceries and
 * Recipes open on). One white card with a row per shop and hairlines between them, like Settings' Goal list: the shop's own logo on its
 * tile, its name in plain text, and the round mark at the end (the lime tick and a bolder name once chosen).
 * Under each name, one line says what Numbite has for that shop, worked out from the data (the onboarding redesign meeting of 20 November 2026; welcome/shopLines.ts):
 * "Recipes, products and prices", "Products and prices. Not in recipes yet", "Products and some prices. Not in recipes yet" or "Product names only". Said only
 * once the lists have loaded: nothing while they load, or offline (a failed load reads as no shops at all, which would wrongly mark every one). A shop with no
 * products at all (Ocado) isn't offered, unless it is already ticked (from before), so it can still be taken off.
 * `warm` (the welcome screens' "Where do you shop?"): ticking a shop starts loading the shop file the next screen's recipes will use, so they are ready sooner.
 */
export function ShopPicker({ value, onChange, warm = false }: { value: readonly string[]; onChange: (shops: string[]) => void; warm?: boolean }) {
  const t = useT();
  const id = useId();
  const manifest = useShopManifest();
  const names = useNamesManifest();
  const change = (next: string[]) => {
    onChange(next);
    if (!warm || !manifest) return;
    // the shop the recipes on the next screen come from (the first ticked shop that is in recipes, else the default one): loaded once and cached; a failure here
    // only means that screen loads it itself
    const shop = recipeShopSetFor(manifest, null, next)[0];
    if (shop) void loadShopFile(shop).catch(() => undefined);
  };
  const shown = RETAILERS.filter((r) => value.includes(r.id) || shopOffer(r.id, manifest, names) !== "none");
  return (
    <div role="group" aria-label={t("Your supermarkets")} className="glass divide-y divide-line overflow-hidden rounded-[1.25rem]">
      {shown.map((r) => {
        const on = value.includes(r.id);
        const offer = shopOffer(r.id, manifest, names);
        const line = offer && offer !== "none" ? SHOP_OFFER_LINE[offer] : null;
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={on}
            // the shop's name stays the button's name; the line under it is read after it as its description
            aria-labelledby={`${id}-${r.id}`}
            aria-describedby={line ? `${id}-${r.id}-note` : undefined}
            onClick={() => change(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
            className="flex min-h-[3.75rem] w-full items-center gap-3.5 px-4 py-2.5 text-start transition hover:bg-soft-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-soft-strong"
          >
            {/* the shop's own logo on its tile (decorative), then its name in plain text */}
            <ShopMark shopId={r.id} size="sm" />
            <span className="min-w-0 flex-1 [overflow-wrap:break-word]">
              <span id={`${id}-${r.id}`} className={`block text-[1.0625rem] leading-snug ${on ? "font-bold" : "font-medium"}`}>{r.name}</span>
              {line && <span id={`${id}-${r.id}-note`} className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{t(line)}</span>}
            </span>
            <PickMark on={on} />
          </button>
        );
      })}
    </div>
  );
}
