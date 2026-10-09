"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { possessive, SHOP_SORTS, searchShopProducts, type ShopProduct, type ShopSort } from "@/lib/mm/shopProducts";
import { formatDate } from "@/lib/mm/format";
import { ChevronLeftIcon, SearchIcon } from "../../_components/icons";
import { Chip, EmptyState, ErrorBox, inputClass, Spinner } from "../../_components/ui";
import { useShopProducts } from "../../_lib/shopProducts";
import { ShopProductRow } from "./ShopProductRow";

// Every product a supermarket lists (founder 2026-10-09, docs/GROCERIES_PLAN.md): name, price, price per kg or litre, card price and the shop's own picture,
// exactly as its category pages print them. No nutrition here: that appears only for products whose page we have read (the product page says which).
const PAGE = 60;
const NONE: ShopProduct[] = [];

export function ShopListScreen({ shop }: { shop: string }) {
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(shop, retry);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [card, setCard] = useState(false);
  const [nutrition, setNutrition] = useState(false);
  const [sort, setSort] = useState<ShopSort>("name");
  const [shown, setShown] = useState(PAGE);
  const deferred = useDeferredValue(query);
  const products = state.status === "ready" ? state.products : NONE;
  const results = useMemo(() => searchShopProducts(products, { query: deferred, category, card, nutrition, sort }), [products, deferred, category, card, nutrition, sort]);
  const hasCard = useMemo(() => products.some((p) => p.member), [products]);
  const nutritionCount = useMemo(() => products.reduce((n, p) => n + (p.nutrition ? 1 : 0), 0), [products]);
  const reset = () => setShown(PAGE);
  const back = (<Link href="/app/groceries" aria-label="Back to groceries" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>);

  if (state.status === "loading") return (<div>{back}<Spinner label="Loading the full list" /></div>);
  if (state.status === "error") return (<div>{back}<div className="mt-4"><ErrorBox message="Couldn't load this list. Check your connection." onRetry={() => setRetry((n) => n + 1)} /></div></div>);
  const { file } = state;

  return (
    <div>
      {back}
      <h1 className="mt-4 text-[2rem] font-extrabold leading-[1.05] tracking-tight">Every <span className="serif-em sun-text pr-0.5">{file.name}</span> product</h1>
      <p className="mt-1 text-sm text-muted">
        {products.length.toLocaleString("en-GB")} products with the name and price as {file.name} lists them, checked {formatDate(file.checkedOn)}. Calories, protein and allergens appear only for products whose page we&apos;ve read{nutritionCount > 0 ? ` (${nutritionCount.toLocaleString("en-GB")} so far)` : ""}.
      </p>

      <label className="relative mt-4 block">
        <span className="sr-only">Search {file.name} products</span>
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); reset(); }} placeholder={`Search ${file.name} products`} enterKeyHint="search" autoComplete="off" className="glass min-h-12 w-full rounded-full pl-11 pr-4 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent" />
      </label>

      <div role="group" aria-label="Filters" className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
        {nutritionCount > 0 && <Chip selected={nutrition} onClick={() => { setNutrition((v) => !v); reset(); }}>Has nutrition</Chip>}
        {hasCard && <Chip selected={card} onClick={() => { setCard((v) => !v); reset(); }}>Has a card price</Chip>}
        <Chip selected={category === null} onClick={() => { setCategory(null); reset(); }}>All types</Chip>
        {file.categories.map((c) => (<Chip key={c} selected={category === c} onClick={() => { setCategory(c); reset(); }}>{c}</Chip>))}
      </div>
      <label className="mt-3 flex items-center justify-end gap-2 text-sm">
        <span className="text-muted">Sort</span>
        <select className={`${inputClass} min-h-11 w-auto py-0 text-sm`} value={sort} onChange={(e) => { setSort(e.target.value as ShopSort); reset(); }}>
          {SHOP_SORTS.filter((o) => nutritionCount > 0 || (o.value !== "density" && o.value !== "protein")).map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </label>

      {(sort === "density" || sort === "protein") && <p className="mt-2 text-xs text-muted">Products without numbers, and those whose numbers are for the cooked or prepared food, are listed after the rest.</p>}
      <p role="status" aria-live="polite" className="app-numbers mt-3 text-sm text-muted">{results.length.toLocaleString("en-GB")} {results.length === 1 ? "product" : "products"}</p>
      {results.length === 0 ? (
        <div className="mt-3"><EmptyState title="No products match." body="Try fewer words or a different type." /></div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {results.slice(0, shown).map((p) => (<li key={p.id}><ShopProductRow file={file} product={p} /></li>))}
        </ul>
      )}
      {results.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-dashed border-line text-sm font-semibold text-accent transition hover:bg-accent-soft">
          Show {Math.min(PAGE, results.length - shown)} more
        </button>
      )}

      <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
        From {possessive(file.name)} website, checked {formatDate(file.checkedOn)}. Prices and offers vary by store and by loyalty card. Not affiliated with {file.name}.
      </p>
    </div>
  );
}
