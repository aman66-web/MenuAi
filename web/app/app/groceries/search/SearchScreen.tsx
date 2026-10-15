"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { anyFoodDiet, foodDietCaution, foodDietProblem, listedFacts } from "@/lib/mm/foodDiet";
import { barcodeQuery, GROCERY_SORTS, RETAILERS, searchProducts, type GrocerySort } from "@/lib/mm/groceries";
import { shoppingStore } from "@/lib/mm/stores";
import { useRouter } from "next/navigation";
import { ScanIcon, SearchIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { Chip, EmptyIcon, EmptyState, ErrorBox, Spinner } from "../../_components/ui";
import { useGroceryCatalogue, useGroceryManifest } from "../../_lib/groceries";
import { useSettings, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { BackLink, FootNote, ListLink, MoreButton, NOTE, PILL_INPUT, SelectField, TITLE } from "../PageBits";
import { ProductRow } from "../ProductRow";
import { Scanner } from "../Scanner";

// Search every shop at once (founder's request 2026-10-07; moved here 2026-10-11 when Groceries began with "Which shop?"): search by name or barcode,
// per-100 g macros, allergens, prices where known, the same product at every shop that sells it. Product data is community data from Open Food Facts,
// credited below; docs/GROCERIES_PLAN.md. Looks follow Home (founder 2026-10-15): grey pills top left and right, a compact title, a white pill
// search box with a round white scan button, outlined chips, the sort as a white field with its label in small capitals inside.
const PAGE = 60;

export function GroceriesSearchScreen({ initialShop }: { initialShop: string | null }) {
  const t = useT();
  const router = useRouter();
  const list = useStore(shoppingStore);
  // undefined until the person picks: then the first of their supermarkets (Settings) that has products here, else All
  const [picked, setPicked] = useState<string | null | undefined>(initialShop ?? undefined);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<GrocerySort>("density");
  const [shown, setShown] = useState(PAGE);
  const [retry, setRetry] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [dietOn, setDietOn] = useState(true);
  const deferred = useDeferredValue(query);
  const settings = useSettings();
  const catManifest = useGroceryManifest();
  const retailer = picked !== undefined ? picked : (settings.shops?.find((id) => catManifest?.retailers.some((r) => r.id === id && r.count > 0)) ?? null);
  const setRetailer = (r: string | null) => setPicked(r);
  const catalogue = useGroceryCatalogue(retailer, retry);

  // The person's diet settings (Settings › Diet) leave out products that plainly don't suit (lib/mm/foodDiet.ts); one tap shows everything.
  const prefs = settings.preferences;
  const diet = anyFoodDiet(prefs) && dietOn;
  const suits = useMemo(() => {
    if (!anyFoodDiet(prefs)) return null;
    return new Set(catalogue.products.filter((p) => !foodDietProblem(listedFacts(p), prefs)).map((p) => p.gtin));
  }, [catalogue.products, prefs]);
  const results = useMemo(() => {
    const found = searchProducts(catalogue.products, { query: deferred, retailer: retailer, category, sort });
    return diet && suits ? found.filter((p) => suits.has(p.gtin)) : found;
  }, [catalogue.products, deferred, retailer, category, sort, diet, suits]);
  const caution = diet ? foodDietCaution(prefs, t) : null;
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of catalogue.products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return (catalogue.manifest?.categories ?? []).filter((c) => counts.has(c.id));
  }, [catalogue.products, catalogue.manifest]);
  const counts = new Map((catalogue.manifest?.retailers ?? []).map((r) => [r.id, r.count]));
  const isBarcode = !!barcodeQuery(deferred);

  const reset = () => setShown(PAGE);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/app/groceries" label={t("Back to groceries")} />
        <ListLink count={list.length} />
      </div>
      <h1 className={`mt-5 ${TITLE}`}>{t("Search every shop")}</h1>
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Find a product at every supermarket that sells it, with its calories, protein and allergens.")}</p>

      <div className="mt-5 flex gap-2.5">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("Search products or type a barcode")}</span>
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); reset(); }} placeholder={t("Search groceries")} enterKeyHint="search" autoComplete="off" className={`${PILL_INPUT} ps-11 pe-4`} />
        </label>
        <button type="button" onClick={() => setScanning(true)} aria-label={t("Scan a barcode")} className="glass inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong">
          <ScanIcon className="h-5 w-5" />
        </button>
      </div>

      <div role="group" aria-label={t("Supermarket")} className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
        <Chip selected={retailer === null} onClick={() => { setRetailer(null); reset(); }}>{t("All")}</Chip>
        {RETAILERS.filter((r) => !catalogue.manifest || counts.has(r.id)).map((r) => (
          <Chip key={r.id} selected={retailer === r.id} onClick={() => { setRetailer(r.id); reset(); }} className="gap-2 ps-1.5"><ShopMark shopId={r.id} size="xs" />{r.name}</Chip>
        ))}
      </div>
      <div role="group" aria-label={t("Filters")} className="no-scrollbar -mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5">
        {anyFoodDiet(prefs) && <Chip selected={dietOn} onClick={() => { setDietOn((v) => !v); reset(); }}>{t("Fits my diet")}</Chip>}
        <Chip selected={category === null} onClick={() => { setCategory(null); reset(); }}>{t("All types")}</Chip>
        {categories.map((c) => (<Chip key={c.id} selected={category === c.id} onClick={() => { setCategory(c.id); reset(); }}>{t(c.label)}</Chip>))}
      </div>
      <SelectField label={t("Sort")} className="mt-3.5" value={sort} onChange={(e) => { setSort(e.target.value as GrocerySort); reset(); }}>
        {GROCERY_SORTS.map((o) => (<option key={o.value} value={o.value}>{t(o.label)}</option>))}
      </SelectField>

      {catalogue.status === "loading" ? (
        <Spinner label={t("Loading products")} />
      ) : catalogue.status === "error" ? (
        <div className="mt-4"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>
      ) : (
        <>
          {caution && <p className={`mt-3.5 ${NOTE}`}>{caution}</p>}
          <p role="status" aria-live="polite" className="app-numbers mt-6 ps-1 text-sm font-semibold text-muted">{results.length === 1 ? (isBarcode ? t("1 product with that barcode") : t("1 product")) : isBarcode ? t("{n} products with that barcode", { n: results.length.toLocaleString("en-GB") }) : t("{n} products", { n: results.length.toLocaleString("en-GB") })}</p>
          {results.length === 0 ? (
            <div className="mt-3"><EmptyState icon={<EmptyIcon><SearchIcon /></EmptyIcon>} title={t("No products match.")} body={isBarcode ? t("That barcode isn't in our list yet.") : t("Try fewer words, another supermarket, or a different type.")} /></div>
          ) : (
            <ul className="mt-2.5 space-y-3">
              {results.slice(0, shown).map((p) => (<li key={p.gtin}><ProductRow product={p} retailer={retailer} /></li>))}
            </ul>
          )}
          {results.length > shown && (
            <MoreButton onClick={() => setShown((n) => n + PAGE)}>{t("Show {n} more", { n: Math.min(PAGE, results.length - shown) })}</MoreButton>
          )}
        </>
      )}

      <FootNote>
        {t("Product details come from Open Food Facts contributors (open data: openfoodfacts.org). They can be out of date or wrong, so always check the pack, especially for allergens.")}{" "}
        {t("Prices appear only where we've read them from the supermarket's own website. Not affiliated with any supermarket.")}
      </FootNote>

      <Scanner open={scanning} onClose={() => setScanning(false)} onCode={(code) => { setScanning(false); const c = barcodeQuery(code); if (c) { setQuery(c); setRetailer(null); router.push(`/app/groceries/product?code=${c}`); } }} />
    </div>
  );
}
