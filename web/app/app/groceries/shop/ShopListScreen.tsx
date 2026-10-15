"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { SHOP_SORTS, searchShopProducts, type ShopNutrition, type ShopProduct, type ShopSort } from "@/lib/mm/shopProducts";
import { formatDate } from "@/lib/mm/format";
import { anyFoodDiet, foodDietCaution, foodDietProblem, listedFacts } from "@/lib/mm/foodDiet";
import type { GroceryProduct } from "@/lib/mm/groceries";
import { SearchIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../../_components/SearchDone";
import { Chip, EmptyIcon, EmptyState, ErrorBox, Spinner } from "../../_components/ui";
import { usePossessive, useT } from "../../_lib/i18n";
import { useSettings } from "../../_lib/hooks";
import { useShopProducts } from "../../_lib/shopProducts";
import { loadManifest, loadRetailer } from "../../_lib/groceries";
import { BackLink, FootNote, MoreButton, NOTE, PILL_INPUT, SelectField, TITLE } from "../PageBits";
import { ShopProductRow } from "./ShopProductRow";

// A supermarket's own list (founder 2026-10-09, docs/GROCERIES_PLAN.md; since 2026-10-11 the main Groceries list, opened from "Which shop?"): name, price,
// price per kg or litre, card price and the shop's own picture, exactly as its category pages print them. The numbers come from the product's own page where
// we've read it, else from the catalogue's community record for the same barcode (matched exactly, never guessed); the product's page says which.
// Looks follow Home (founder 2026-10-15): the shop's logo beside a compact title, a white pill search box, outlined chips, the aisle and the sort as
// white fields with their label in small capitals inside, white rows with 20 px corners.
const PAGE = 60;
const NONE: ShopProduct[] = [];
const NO_CATALOGUE = new Map<string, GroceryProduct>();
/** A barcode without leading zeros: 05000157062673 and 5000157062673 are the same product. */
const noZeros = (code: string) => code.replace(/^0+/, "");

/** The shop's catalogue records by barcode (community data), for the products its list ties to a barcode; empty while loading or when it has none. */
function useCatalogueByBarcode(shop: string): Map<string, GroceryProduct> {
  const [byCode, setByCode] = useState<{ shop: string; map: Map<string, GroceryProduct> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadManifest()
      .then((m) => (m.retailers.some((r) => r.id === shop && r.count > 0) ? loadRetailer(shop) : null))
      .then((f) => { if (!cancelled && f) setByCode({ shop, map: new Map(f.products.map((p) => [noZeros(p.gtin), p])) }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [shop]);
  return byCode?.shop === shop ? byCode.map : NO_CATALOGUE;
}

const asNutrition = (c: GroceryProduct): ShopNutrition => ({
  kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, saturates: c.saturates ?? null, sugars: c.sugars ?? null, fibre: c.fibre ?? null,
  salt: c.salt ?? null, kj: c.kj ?? null, per: c.per, state: "",
});

export function ShopListScreen({ shop }: { shop: string }) {
  const t = useT();
  const poss = usePossessive();
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(shop, retry);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [card, setCard] = useState(false);
  const [nutrition, setNutrition] = useState(false);
  const [sort, setSort] = useState<ShopSort>("name");
  const [shown, setShown] = useState(PAGE);
  const [dietOn, setDietOn] = useState(true);
  const prefs = useSettings().preferences;
  const deferred = useDeferredValue(query);
  const listed = state.status === "ready" ? state.products : NONE;
  const catalogue = useCatalogueByBarcode(shop);
  // a product without its own page's numbers shows the catalogue's numbers for the same barcode (a copy: recipes keep using only the shop's own labels)
  const products = useMemo(() => (catalogue.size === 0 ? listed : listed.map((p) => {
    const c = !p.nutrition && p.gtin ? catalogue.get(noZeros(p.gtin)) : undefined;
    return c ? { ...p, nutrition: asNutrition(c) } : p;
  })), [listed, catalogue]);
  // Diet settings: the shop's own name and category, plus the catalogue's ingredients and allergens where the barcode matches, can leave a product out.
  const unsuited = useMemo(() => (anyFoodDiet(prefs) ? new Set(products.filter((p) => {
    const c = p.gtin ? catalogue.get(noZeros(p.gtin)) : undefined;
    return foodDietProblem(c ? { ...listedFacts(c), name: `${p.name} ; ${c.name}`, category: `${p.category} ; ${c.category}` } : { name: p.name, category: p.category }, prefs);
  }).map((p) => p.id)) : null), [products, prefs, catalogue]);
  const diet = !!unsuited && dietOn;
  const results = useMemo(() => {
    const found = searchShopProducts(products, { query: deferred, category, card, nutrition, sort });
    return diet && unsuited ? found.filter((p) => !unsuited.has(p.id)) : found;
  }, [products, deferred, category, card, nutrition, sort, diet, unsuited]);
  const hasCard = useMemo(() => products.some((p) => p.member), [products]);
  const nutritionCount = useMemo(() => products.reduce((n, p) => n + (p.nutrition ? 1 : 0), 0), [products]);
  const pricedCount = useMemo(() => products.reduce((n, p) => n + (p.price !== null ? 1 : 0), 0), [products]);
  const reset = () => setShown(PAGE);
  const back = <BackLink href="/app/groceries" label={t("Back to groceries")} />;

  if (state.status === "loading") return (<div>{back}<Spinner label={t("Loading the full list")} /></div>);
  if (state.status === "error") return (<div>{back}<div className="mt-4"><ErrorBox message={t("Couldn't load this list. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>);
  const { file } = state;

  return (
    <div>
      {back}
      {/* wraps, so at large text a long name moves under the logo instead of splitting mid-word ("Sains / bury's") */}
      <div className="mt-5 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <ShopMark shopId={file.retailer} size="md" />
        <h1 className={`${TITLE} max-w-full [overflow-wrap:break-word]`}>{file.name}</h1>
      </div>
      <p className="app-numbers mt-3.5 text-[0.9375rem] leading-relaxed text-muted">
        {pricedCount === products.length
          ? t("{n} products, with the prices {shop} showed on {date}.", { n: products.length.toLocaleString("en-GB"), shop: file.name, date: formatDate(file.checkedOn, t) })
          : `${t("{n} products from {shopPossessive} website, checked {date}.", { n: products.length.toLocaleString("en-GB"), shopPossessive: poss(file.name), date: formatDate(file.checkedOn, t) })} ${t("{count} show a price. {shop} shows the others' prices only in store.", { count: pricedCount.toLocaleString("en-GB"), shop: file.name })}`}{" "}
        {nutritionCount > 0 ? t("{count} of them show calories and protein.", { count: nutritionCount.toLocaleString("en-GB") }) : t("Calories and protein aren't shown for these yet.")}
      </p>

      <div className="group/search relative mt-5">
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); reset(); }} placeholder={t("Search {shop} products", { shop: file.name })} aria-label={t("Search {shop} products", { shop: file.name })} {...DONE_KEY} autoComplete="off" className={`${PILL_INPUT} ps-11 pe-4 ${DONE_ROOM}`} />
        <SearchDone />
      </div>

      <div role="group" aria-label={t("Filters")} className="mt-3.5 flex flex-wrap gap-2 empty:hidden">
        {unsuited && <Chip selected={dietOn} onClick={() => { setDietOn((v) => !v); reset(); }}>{t("Fits my diet")}</Chip>}
        {nutritionCount > 0 && <Chip selected={nutrition} onClick={() => { setNutrition((v) => !v); reset(); }}>{t("Has nutrition")}</Chip>}
        {hasCard && <Chip selected={card} onClick={() => { setCard((v) => !v); reset(); }}>{t("Has a card price")}</Chip>}
      </div>
      <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
        <SelectField label={t("Aisle")} value={category ?? ""} onChange={(e) => { setCategory(e.target.value || null); reset(); }}>
          <option value="">{t("Every aisle")}</option>
          {file.categories.map((c) => (<option key={c} value={c}>{c}</option>))}
        </SelectField>
        <SelectField label={t("Sort")} value={sort} onChange={(e) => { setSort(e.target.value as ShopSort); reset(); }}>
          {SHOP_SORTS.filter((o) => nutritionCount > 0 || (o.value !== "density" && o.value !== "protein")).map((o) => (<option key={o.value} value={o.value}>{t(o.label)}</option>))}
        </SelectField>
      </div>

      {(sort === "density" || sort === "protein") && <p className={`mt-3 ${NOTE}`}>{t("Products without numbers, and those whose numbers are for the cooked or prepared food, are listed after the rest.")}</p>}
      {diet && foodDietCaution(prefs, t) && <p className={`mt-3 ${NOTE}`}>{foodDietCaution(prefs, t)}</p>}
      {diet && (prefs.avoidAllergens?.length ?? 0) > 0 && <p className={`mt-2 ${NOTE}`}>{t("We haven't read allergens for these products, so your allergy settings can't hide any here. Always check the pack.")}</p>}
      <p role="status" aria-live="polite" className="app-numbers mt-6 ps-1 text-sm font-semibold text-muted">{results.length === 1 ? t("1 product") : t("{n} products", { n: results.length.toLocaleString("en-GB") })}</p>
      {results.length === 0 ? (
        <div className="mt-3"><EmptyState icon={<EmptyIcon><SearchIcon /></EmptyIcon>} title={t("No products match.")} body={t("Try fewer words or a different type.")} /></div>
      ) : (
        <ul className="mt-2.5 space-y-3">
          {results.slice(0, shown).map((p) => (<li key={p.id}><ShopProductRow file={file} product={p} /></li>))}
        </ul>
      )}
      {results.length > shown && (
        <MoreButton onClick={() => setShown((n) => n + PAGE)}>{t("Show {n} more", { n: Math.min(PAGE, results.length - shown) })}</MoreButton>
      )}

      {catalogue.size > 0 && (
        <Link href={`/app/groceries/search?r=${file.retailer}`} className="glass mt-3.5 inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-center text-[0.9375rem] font-bold transition active:scale-[0.98] hover:bg-soft-strong">
          {t("More {shop} products with their numbers", { shop: file.name })}
        </Link>
      )}

      <FootNote>
        {t("From {shopPossessive} website, checked {date}.", { shopPossessive: poss(file.name), date: formatDate(file.checkedOn, t) })} {t("Prices and offers vary by store and by loyalty card.")}{" "}
        {catalogue.size > 0 && t("Where we haven't read a product's own page, its numbers come from Open Food Facts contributors (community data) for the same barcode.")}{" "}
        {t("Not affiliated with {shop}.", { shop: file.name })}
      </FootNote>
    </div>
  );
}
