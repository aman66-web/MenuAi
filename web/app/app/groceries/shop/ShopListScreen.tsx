"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { SHOP_SORTS, searchShopProducts, type ShopProduct, type ShopSort } from "@/lib/mm/shopProducts";
import { ALLERGEN_LABEL } from "@/lib/mm/allergens";
import { formatDate } from "@/lib/mm/format";
import { anyFoodDiet, foodDietProblem, groceryDietLine, listedFacts } from "@/lib/mm/foodDiet";
import type { GroceryProduct } from "@/lib/mm/groceries";
import { PageHeader } from "../../_components/PageHeader";
import { SearchIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../../_components/SearchDone";
import { AllergyNote, Chip, EmptyIcon, EmptyState, ErrorBox, LinkButton, Spinner } from "../../_components/ui";
import { usePossessive, useT } from "../../_lib/i18n";
import { useSettings } from "../../_lib/hooks";
import { useShopProducts } from "../../_lib/shopProducts";
import { loadManifest, loadRetailer } from "../../_lib/groceries";
import { FootNote, MoreButton, NOTE, PILL_INPUT, SelectField, TITLE } from "../PageBits";
import { ShopProductRow } from "./ShopProductRow";

/** A shop or product page opened without saying which (an old or mistyped link): Back, a plain sentence and the way on, never a lone red error (2026-11-20). */
export function NoChoice({ title, body }: { title: string; body?: string }) {
  const t = useT();
  return (
    <div>
      <PageHeader back={{ href: "/app/groceries", label: t("Back to groceries") }} list />
      <div className="mt-6">
        <EmptyState title={title} body={body} action={<LinkButton href="/app/groceries">{t("Choose a shop")}</LinkButton>} />
      </div>
    </div>
  );
}

// A supermarket's own list (founder 2026-10-09, docs/GROCERIES_PLAN.md; since 2026-10-11 the main Groceries list, opened from "Which shop?"): name, price,
// price per kg or litre, card price and the shop's own picture, exactly as its category pages print them. The numbers come from the product's own page where
// we've read it, else the same product's label at another shop, the community record for the same barcode or (loose fresh produce) the government's figures,
// all added when the list is built (tools/groceries/build_all_products.py); each row and the product's page say which.
// Looks follow Home (founder 2026-10-15): the shop's logo beside a compact title, a white pill search box, outlined chips, the aisle and the sort as
// white fields with their label in small capitals inside, white rows with 20 px corners.
const PAGE = 60;
const NONE: ShopProduct[] = [];
const NO_CATALOGUE = new Map<string, GroceryProduct>();
/** A barcode without leading zeros: 05000157062673 and 5000157062673 are the same product. */
const noZeros = (code: string) => code.replace(/^0+/, "");

/** The shop's catalogue records by barcode (community data), for the diet filter's ingredients and allergens; loaded only while `wanted` (2026-11-20: the
 *  whole catalogue, 4.3 MB for Asda, was fetched for every list though it filled numbers for a handful of rows, which the build now does). */
function useCatalogueByBarcode(shop: string, wanted: boolean): Map<string, GroceryProduct> {
  const [byCode, setByCode] = useState<{ shop: string; map: Map<string, GroceryProduct> } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    loadManifest()
      .then((m) => (m.retailers.some((r) => r.id === shop && r.count > 0) ? loadRetailer(shop) : null))
      .then((f) => { if (!cancelled && f) setByCode({ shop, map: new Map(f.products.map((p) => [noZeros(p.gtin), p])) }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [shop, wanted]);
  return wanted && byCode?.shop === shop ? byCode.map : NO_CATALOGUE;
}

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
  const products = state.status === "ready" ? state.products : NONE;
  const filtering = anyFoodDiet(prefs);
  const catalogue = useCatalogueByBarcode(shop, filtering);
  // Diet settings: the shop's own name and category, plus the catalogue's ingredients and allergens where the barcode matches, can leave a product out.
  const unsuited = useMemo(() => (filtering ? new Set(products.filter((p) => {
    const c = p.gtin ? catalogue.get(noZeros(p.gtin)) : undefined;
    return foodDietProblem(c ? { ...listedFacts(c), name: `${p.name} ; ${c.name}`, category: `${p.category} ; ${c.category}` } : { name: p.name, category: p.category }, prefs);
  }).map((p) => p.id)) : null), [products, prefs, catalogue, filtering]);
  const diet = !!unsuited && dietOn;
  // sorted once for the search and the sort; the diet filter only leaves rows out (2026-11-20: the catalogue arriving re-sorted a 16,000-product list)
  const sorted = useMemo(() => searchShopProducts(products, { query: deferred, category, card, nutrition, sort }), [products, deferred, category, card, nutrition, sort]);
  const results = useMemo(() => (diet && unsuited ? sorted.filter((p) => !unsuited.has(p.id)) : sorted), [sorted, diet, unsuited]);
  const hasCard = useMemo(() => products.some((p) => p.member), [products]);
  const nutritionCount = useMemo(() => products.reduce((n, p) => n + (p.nutrition ? 1 : 0), 0), [products]);
  const borrowed = useMemo(() => products.some((p) => p.nutrition && (p.nutrition.community || p.nutrition.govFood || p.nutrition.sameAs)), [products]);
  const pricedCount = useMemo(() => products.reduce((n, p) => n + (p.price !== null ? 1 : 0), 0), [products]);
  const avoid = prefs.avoidAllergens ?? [];
  const avoidNames = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(avoid.map((k) => t(ALLERGEN_LABEL[k])));
  const dietLine = groceryDietLine(prefs, diet, t);
  const reset = () => setShown(PAGE);
  const back = <PageHeader back={{ href: "/app/groceries", label: t("Back to groceries") }} list />;

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
      {/* how many show a price and how many have numbers; where and when the list was read is said once, in the note at the foot (the words pass,
          20 November 2026: the date was said twice) */}
      <p className="app-numbers mt-3.5 text-[0.9375rem] leading-relaxed text-muted">
        {pricedCount === products.length
          ? (nutritionCount > 0
            ? t("{count} of {n} products show calories and protein.", { count: nutritionCount.toLocaleString("en-GB"), n: products.length.toLocaleString("en-GB") })
            : t("{n} products. None show calories and protein yet.", { n: products.length.toLocaleString("en-GB") }))
          : `${t("{count} of {n} products show a price.", { count: pricedCount.toLocaleString("en-GB"), n: products.length.toLocaleString("en-GB") })} ${file.priceNote === "stores"
            ? t("{shop} lists no price for the others.", { shop: file.name })
            : t("{shop} shows the others' prices only in store.", { shop: file.name })} ${nutritionCount > 0
            ? t("{count} show calories and protein.", { count: nutritionCount.toLocaleString("en-GB") })
            : t("None show calories and protein yet.")}`}
      </p>

      <div className="group/search relative mt-5">
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); reset(); }} placeholder={t("Search {shop} products", { shop: file.name })} aria-label={t("Search {shop} products", { shop: file.name })} {...DONE_KEY} autoComplete="off" className={`${PILL_INPUT} ps-11 pe-4 ${DONE_ROOM}`} />
        <SearchDone />
      </div>

      <div role="group" aria-label={t("Filters")} className="mt-3.5 flex flex-wrap gap-2 empty:hidden">
        {unsuited && <Chip selected={dietOn} onClick={() => { setDietOn((v) => !v); reset(); }}>{t("Fits my diet")}</Chip>}
        {nutritionCount > 0 && <Chip selected={nutrition} onClick={() => { setNutrition((v) => !v); reset(); }}>{t("Has nutrition")}</Chip>}
        {hasCard && <Chip selected={card} onClick={() => { setCard((v) => !v); reset(); }}>{t("Loyalty card price")}</Chip>}
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

      {(sort === "density" || sort === "protein") && <p className={`mt-3 ${NOTE}`}>{sort === "density" ? t("Listed last: under 20 kcal or 5 g protein per 100 g, no numbers, or numbers for the cooked or prepared food.") : t("Listed last: no numbers, or numbers for the cooked or prepared food.")}</p>}
      {dietLine && <p className={`mt-3 ${NOTE}`}>{dietLine}</p>}
      {/* what the allergy settings really do here (2026-11-20: it said they "can't hide any" while they hid some) */}
      {avoid.length > 0 && <AllergyNote className="mt-3"><p>{diet
        ? t("Hidden: products whose Open Food Facts record lists {allergens} or no allergens. Most have no record, so they still show. Always check the pack.", { allergens: avoidNames })
        : t("Nothing is hidden for your allergies while “Fits my diet” is off. Always check the pack.")}</p></AllergyNote>}
      <p role="status" aria-live="polite" className="app-numbers mt-6 ps-1 text-sm font-semibold text-muted">{results.length === 1 ? t("1 product") : t("{n} products", { n: results.length.toLocaleString("en-GB") })}</p>
      {results.length === 0 ? (
        <div className="mt-3"><EmptyState icon={<EmptyIcon><SearchIcon /></EmptyIcon>} title={t("No products match.")} body={t("Try fewer words or another aisle.")} /></div>
      ) : (
        <ul className="mt-2.5 space-y-3">
          {results.slice(0, shown).map((p) => (<li key={p.id}><ShopProductRow file={file} product={p} /></li>))}
        </ul>
      )}
      {results.length > shown && (
        <MoreButton onClick={() => setShown((n) => n + PAGE)}>{t("Show {n} more", { n: Math.min(PAGE, results.length - shown) })}</MoreButton>
      )}

      <FootNote>
        {t("From {shopPossessive} website, checked {date}.", { shopPossessive: poss(file.name), date: formatDate(file.checkedOn, t) })} {t("Prices vary by store and loyalty card.")}{" "}
        {borrowed && t("Some numbers are the same product's label at another shop, Open Food Facts (community data), or UK government figures for loose fruit and veg; each product says which.")}{" "}
        {t("Not affiliated with {shop}.", { shop: file.name })}
      </FootNote>
    </div>
  );
}
