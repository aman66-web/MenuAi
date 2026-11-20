"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ALLERGEN_LABEL } from "@/lib/mm/allergens";
import { RETAILERS } from "@/lib/mm/groceries";
import { anyFoodDiet, foodDietProblem, groceryDietLine } from "@/lib/mm/foodDiet";
import { SHOP_SORTS, searchShopProducts, type ShopFile, type ShopProduct, type ShopSort } from "@/lib/mm/shopProducts";
import { PageHeader } from "../../_components/PageHeader";
import { SearchIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../../_components/SearchDone";
import { AllergyNote, Chip, EmptyIcon, EmptyState, ErrorBox, LinkButton, Spinner } from "../../_components/ui";
import { useT } from "../../_lib/i18n";
import { useSettings } from "../../_lib/hooks";
import { useShopLists, useShopManifestState } from "../../_lib/shopProducts";
import { FootNote, MoreButton, NOTE, PILL_INPUT, SelectField, TITLE } from "../PageBits";
import { ShopProductRow } from "../shop/ShopProductRow";

// Several supermarkets' own lists together (founder 2026-11-17: tick "Select" on the shops you want on Groceries, press Go, and see them all on the next page).
// Each row is exactly what that shop's own list shows (its name, price, price per kg or litre, card price, its own photo and, where its page was read, the
// numbers), with the shop's name on it, and opens the same product page. Nothing is merged or averaged: a product sold at two shops is two rows.
const PAGE = 60;
const nameOf = (id: string) => RETAILERS.find((r) => r.id === id)?.name ?? id;

export function MultiShopScreen({ shops }: { shops: string[] }) {
  const t = useT();
  const [retry, setRetry] = useState(0);
  // only shops that have a full list (an old or mistyped address can name others); known once the manifest is
  const manifestState = useShopManifestState(retry);
  const manifest = manifestState.status === "ready" ? manifestState.manifest : null;
  const known = manifest ? shops.filter((id) => manifest.retailers.some((r) => r.id === id)) : [];
  const lists = useShopLists(known, retry);
  const state = manifestState.status === "error" ? { status: "ready" as const, loaded: [], failed: shops } : !manifest ? { status: "loading" as const } : lists;
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<string | null>(null);
  const [nutrition, setNutrition] = useState(false);
  const [card, setCard] = useState(false);
  const [sort, setSort] = useState<ShopSort>("name");
  const [shown, setShown] = useState(PAGE);
  const [dietOn, setDietOn] = useState(true);
  const prefs = useSettings().preferences;
  const deferred = useDeferredValue(query);
  const loaded = state.status === "ready" ? state.loaded : null;
  const owner = useMemo(() => new Map<ShopProduct, ShopFile>((loaded ?? []).flatMap((l) => l.products.map((p) => [p, l.file] as const))), [loaded]);
  const pool = useMemo(() => (loaded ?? []).filter((l) => !only || l.file.retailer === only).flatMap((l) => l.products), [loaded, only]);
  // Diet settings, by each product's own name and aisle as in a single shop's list (allergens aren't read for these lists: said below)
  const unsuited = useMemo(() => (anyFoodDiet(prefs) ? new Set(pool.filter((p) => foodDietProblem({ name: p.name, category: p.category }, prefs)).map((p) => p)) : null), [pool, prefs]);
  const diet = !!unsuited && dietOn;
  const results = useMemo(() => {
    const found = searchShopProducts(pool, { query: deferred, card, nutrition, sort });
    return diet && unsuited ? found.filter((p) => !unsuited.has(p)) : found;
  }, [pool, deferred, card, nutrition, sort, diet, unsuited]);
  const nutritionCount = useMemo(() => pool.reduce((n, p) => n + (p.nutrition ? 1 : 0), 0), [pool]);
  const hasCard = useMemo(() => pool.some((p) => p.member), [pool]);
  const reset = () => setShown(PAGE);
  const back = <PageHeader back={{ href: "/app/groceries", label: t("Back to groceries") }} list />;
  const names = new Intl.ListFormat("en-GB", { type: "conjunction" }).format((loaded ?? []).map((l) => l.file.name));
  const avoid = prefs.avoidAllergens ?? [];
  const avoidNames = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(avoid.map((k) => t(ALLERGEN_LABEL[k])));
  const dietLine = groceryDietLine(prefs, diet, t);
  // the title shows at once, with the shops' logos, while their lists load (2026-11-20: the page had no heading until every list was in)
  const title = (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="flex shrink-0 gap-1.5" aria-hidden>{(loaded ? loaded.map((l) => l.file.retailer) : shops).map((id) => (<ShopMark key={id} shopId={id} size="sm" />))}</span>
      <h1 className={`${TITLE} max-w-full [overflow-wrap:break-word]`}>{t("Your selected shops")}</h1>
    </div>
  );

  if (state.status === "loading") return (<div>{back}{title}<Spinner label={t("Loading the full list")} /></div>);
  if (manifest && known.length === 0) {
    return (<div>{back}<div className="mt-6"><EmptyState title={t("Choose a supermarket first.")} body={t("Tap Select on the shops you want.")} action={<LinkButton href="/app/groceries">{t("Choose a shop")}</LinkButton>} /></div></div>);
  }
  if (!loaded || loaded.length === 0) {
    return (<div>{back}{title}<div className="mt-4"><ErrorBox message={t("Couldn't load this list. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>);
  }

  return (
    <div>
      {back}
      {title}
      {/* no line under the title: the shops' logos beside it and the shop chips below name them (the words pass, 20 November 2026) */}
      {state.failed.length > 0 && (
        <div className="mt-3.5"><ErrorBox message={t("Couldn't load {shops}. Check your connection.", { shops: state.failed.map(nameOf).join(", ") })} onRetry={() => setRetry((n) => n + 1)} /></div>
      )}

      <div className="group/search relative mt-5">
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); reset(); }} placeholder={t("Search these shops' products")} aria-label={t("Search these shops' products")} {...DONE_KEY} autoComplete="off" className={`${PILL_INPUT} ps-11 pe-4 ${DONE_ROOM}`} />
        <SearchDone />
      </div>

      {loaded.length > 1 && (
        <div role="group" aria-label={t("Shop")} className="mt-3.5 flex flex-wrap gap-2">
          <Chip selected={only === null} onClick={() => { setOnly(null); reset(); }}>{t("All selected shops")}</Chip>
          {loaded.map((l) => (<Chip key={l.file.retailer} selected={only === l.file.retailer} onClick={() => { setOnly(only === l.file.retailer ? null : l.file.retailer); reset(); }}>{l.file.name}</Chip>))}
        </div>
      )}
      <div role="group" aria-label={t("Filters")} className="mt-3.5 flex flex-wrap gap-2 empty:hidden">
        {unsuited && <Chip selected={dietOn} onClick={() => { setDietOn((v) => !v); reset(); }}>{t("Fits my diet")}</Chip>}
        {nutritionCount > 0 && <Chip selected={nutrition} onClick={() => { setNutrition((v) => !v); reset(); }}>{t("Has nutrition")}</Chip>}
        {hasCard && <Chip selected={card} onClick={() => { setCard((v) => !v); reset(); }}>{t("Loyalty card price")}</Chip>}
      </div>
      <div className="mt-3.5">
        <SelectField label={t("Sort")} value={sort} onChange={(e) => { setSort(e.target.value as ShopSort); reset(); }}>
          {SHOP_SORTS.filter((o) => nutritionCount > 0 || (o.value !== "density" && o.value !== "protein")).map((o) => (<option key={o.value} value={o.value}>{t(o.label)}</option>))}
        </SelectField>
      </div>

      {(sort === "density" || sort === "protein") && <p className={`mt-3 ${NOTE}`}>{sort === "density" ? t("Listed last: under 20 kcal or 5 g protein per 100 g, no numbers, or numbers for the cooked or prepared food.") : t("Listed last: no numbers, or numbers for the cooked or prepared food.")}</p>}
      {dietLine && <p className={`mt-3 ${NOTE}`}>{dietLine}</p>}
      {/* allergens aren't read for these lists, so the allergy settings hide nothing here: said whether or not the filter is on */}
      {avoid.length > 0 && <AllergyNote className="mt-3"><p>{t("Allergens aren't read here, so nothing is hidden for {allergens}. Always check the pack.", { allergens: avoidNames })}</p></AllergyNote>}
      <p role="status" aria-live="polite" className="app-numbers mt-6 ps-1 text-sm font-semibold text-muted">{results.length === 1 ? t("1 product") : t("{n} products", { n: results.length.toLocaleString("en-GB") })}</p>
      {results.length === 0 ? (
        <div className="mt-3"><EmptyState icon={<EmptyIcon><SearchIcon /></EmptyIcon>} title={t("No products match.")} body={t("Try fewer words.")} /></div>
      ) : (
        <ul className="mt-2.5 space-y-3">
          {results.slice(0, shown).map((p) => {
            const file = owner.get(p)!;
            return (<li key={`${file.retailer}:${p.id}`}><ShopProductRow file={file} product={p} showShop /></li>);
          })}
        </ul>
      )}
      {results.length > shown && (
        <MoreButton onClick={() => setShown((n) => n + PAGE)}>{t("Show {n} more", { n: Math.min(PAGE, results.length - shown) })}</MoreButton>
      )}

      <FootNote>
        {t("Prices vary by store and loyalty card.")} {t("Not affiliated with {shops}.", { shops: names })}
      </FootNote>
    </div>
  );
}
