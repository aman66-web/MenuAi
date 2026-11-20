"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { RETAILERS } from "@/lib/mm/groceries";
import { anyFoodDiet, foodDietCaution, foodDietProblem } from "@/lib/mm/foodDiet";
import { SHOP_SORTS, searchShopProducts, type ShopFile, type ShopProduct, type ShopSort } from "@/lib/mm/shopProducts";
import { PageHeader } from "../../_components/PageHeader";
import { SearchIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../../_components/SearchDone";
import { AllergyNote, Chip, EmptyIcon, EmptyState, ErrorBox, Spinner } from "../../_components/ui";
import { useT } from "../../_lib/i18n";
import { useSettings } from "../../_lib/hooks";
import { loadShopFile } from "../../_lib/shopProducts";
import { FootNote, MoreButton, NOTE, PILL_INPUT, SelectField, TITLE } from "../PageBits";
import { ShopProductRow } from "../shop/ShopProductRow";

// Several supermarkets' own lists together (founder 2026-11-17: tick "Select" on the shops you want on Groceries, press Go, and see them all on the next page).
// Each row is exactly what that shop's own list shows (its name, price, price per kg or litre, card price, its own photo and, where its page was read, the
// numbers), with the shop's name on it, and opens the same product page. Nothing is merged or averaged: a product sold at two shops is two rows.
const PAGE = 60;
const nameOf = (id: string) => RETAILERS.find((r) => r.id === id)?.name ?? id;

type Loaded = { file: ShopFile; products: ShopProduct[] };
type State = { key: string; loaded: Loaded[]; failed: string[] } | null;

function useShops(ids: readonly string[], retry: number): { status: "loading" } | { status: "ready"; loaded: Loaded[]; failed: string[] } {
  const list = ids.join(",");
  const key = `${list}|${retry}`;
  const [state, setState] = useState<State>(null);
  useEffect(() => {
    let cancelled = false;
    const wanted = list.split(",");
    Promise.allSettled(wanted.map((id) => loadShopFile(id))).then((results) => {
      if (cancelled) return;
      const loaded: Loaded[] = [];
      const failed: string[] = [];
      results.forEach((r, i) => (r.status === "fulfilled" ? loaded.push(r.value) : failed.push(wanted[i]!)));
      setState({ key: `${list}|${retry}`, loaded, failed });
    });
    return () => { cancelled = true; };
  }, [list, retry]);
  return state && state.key === key ? { status: "ready", loaded: state.loaded, failed: state.failed } : { status: "loading" };
}

export function MultiShopScreen({ shops }: { shops: string[] }) {
  const t = useT();
  const [retry, setRetry] = useState(0);
  const state = useShops(shops, retry);
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

  if (state.status === "loading") return (<div>{back}<Spinner label={t("Loading the full list")} /></div>);
  if (!loaded || loaded.length === 0) {
    return (<div>{back}<div className="mt-4"><ErrorBox message={t("Couldn't load this list. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>);
  }

  return (
    <div>
      {back}
      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex shrink-0 gap-1.5" aria-hidden>{loaded.map((l) => (<ShopMark key={l.file.retailer} shopId={l.file.retailer} size="sm" />))}</span>
        <h1 className={`${TITLE} max-w-full [overflow-wrap:break-word]`}>{t("Your selected shops")}</h1>
      </div>
      <p className="mt-3.5 text-[0.9375rem] leading-relaxed text-muted">{t("Products from {shops}, each with its own shop's price and photo.", { shops: names })}</p>
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

      {(sort === "density" || sort === "protein") && <p className={`mt-3 ${NOTE}`}>{t("Products without numbers, and those whose numbers are for the cooked or prepared food, are listed after the rest.")}</p>}
      {diet && foodDietCaution(prefs, t) && <p className={`mt-3 ${NOTE}`}>{foodDietCaution(prefs, t)}</p>}
      {diet && (prefs.avoidAllergens?.length ?? 0) > 0 && <AllergyNote className="mt-3"><p>{t("We haven't read allergens for these products, so your allergy settings can't hide any here. Always check the pack.")}</p></AllergyNote>}
      <p role="status" aria-live="polite" className="app-numbers mt-6 ps-1 text-sm font-semibold text-muted">{results.length === 1 ? t("1 product") : t("{n} products", { n: results.length.toLocaleString("en-GB") })}</p>
      {results.length === 0 ? (
        <div className="mt-3"><EmptyState icon={<EmptyIcon><SearchIcon /></EmptyIcon>} title={t("No products match.")} body={t("Try fewer words or a different type.")} /></div>
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
        {t("Prices and offers vary by store and by loyalty card.")} {t("Not affiliated with {shops}.", { shops: names })}
      </FootNote>
    </div>
  );
}
