"use client";

import { useEffect, useState } from "react";
import { RETAILERS } from "@/lib/mm/groceries";
import { useT } from "../_lib/i18n";
import { loadManifest } from "../_lib/groceries";
import { recipeShopSetFor } from "../_lib/recipes";
import { loadShopFile, useShopManifest } from "../_lib/shopProducts";
import { SHOP_OFFER_LINE, shopOffer, type NamesManifest } from "../welcome/shopLines";
import { ShopMark } from "./ChainMark";
import { PickMark } from "./DietPicker";
import { Badge } from "./ui";

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
 * `tiles` (the welcome screens; founder, 20 November 2026: pictures over text): big tiles two a row, each with the shop's own logo (unmodified, on its tile;
 * CLAUDE.md rule 2), its name in plain text under it and the round mark; the only words besides the name are "No recipes yet" on a shop recipes can't use, as
 * the next screen's recipes come from another shop then.
 */
export function ShopPicker({ value, onChange, warm = false, tiles = false }: { value: readonly string[]; onChange: (shops: string[]) => void; warm?: boolean; tiles?: boolean }) {
  const t = useT();
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
  if (tiles) {
    return (
      <div role="group" aria-label={t("Your supermarkets")} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3">
        {shown.map((r) => {
          const on = value.includes(r.id);
          const offer = shopOffer(r.id, manifest, names);
          // said only once the lists have loaded (a failed load must never mark every shop)
          const noRecipes = offer !== null && offer !== "recipes";
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => change(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
              className={`relative flex min-h-[8.5rem] min-w-0 flex-col items-center justify-center gap-2 rounded-[1.25rem] px-3 pb-3 pt-4 text-center transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-2 border-on-sun bg-sun text-on-sun" : "border-[1.5px] border-edge bg-card text-foreground hover:bg-background"}`}
            >
              <span className="absolute end-2.5 top-2.5"><PickMark on={on} small /></span>
              <ShopMark shopId={r.id} size="lg" />
              <span className="block min-w-0 [overflow-wrap:break-word]">
                <span className={`block text-[1.0625rem] leading-tight ${on ? "font-bold" : "font-semibold"}`}>{r.name}</span>
                {noRecipes && <span className={`mt-0.5 block text-sm leading-snug ${on ? "text-on-sun" : "text-muted"}`}>{t("No recipes yet")}</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="group" aria-label={t("Your supermarkets")} className="glass divide-y divide-line overflow-hidden rounded-[1.25rem]">
      {shown.map((r) => {
        const on = value.includes(r.id);
        const offer = shopOffer(r.id, manifest, names);
        const line = offer && offer !== "none" ? SHOP_OFFER_LINE[offer] : null;
        // with two or more ticked, the first one is marked: it is the one Groceries and Recipes open on
        const first = on && value.length > 1 && value[0] === r.id;
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={on}
            // the button's name is all the words on it (its shop, "Opens first" and the line under it), as on the diet tiles: a name that left the visible
            // line out failed axe's label-content-name-mismatch (the audit, 20 November 2026)
            onClick={() => change(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
            className="flex min-h-[3.75rem] w-full items-center gap-3.5 px-4 py-2.5 text-start transition hover:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-background"
          >
            {/* the shop's own logo on its tile (decorative), then its name in plain text */}
            <ShopMark shopId={r.id} size="sm" />
            <span className="min-w-0 flex-1 [overflow-wrap:break-word]">
              <span className={`block text-[1.0625rem] leading-snug ${on ? "font-bold" : "font-medium"}`}>
                {r.name}
                {first && <> <span className="ms-1 inline-block align-[0.1em]"><Badge>{t("Opens first")}</Badge></span></>}
              </span>
              {line && <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{t(line)}</span>}
            </span>
            <PickMark on={on} />
          </button>
        );
      })}
    </div>
  );
}
