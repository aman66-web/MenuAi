"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { barcodeQuery, GROCERY_SORTS, RETAILERS, searchProducts, type GrocerySort } from "@/lib/mm/groceries";
import { shoppingStore } from "@/lib/mm/stores";
import { useRouter } from "next/navigation";
import { BasketIcon, ScanIcon, SearchIcon } from "../_components/icons";
import { Button, Chip, EmptyState, ErrorBox, inputClass, Spinner } from "../_components/ui";
import { useGroceryCatalogue } from "../_lib/groceries";
import { useStore } from "../_lib/hooks";
import { ProductRow } from "./ProductRow";
import { Scanner } from "./Scanner";

// Supermarket groceries (founder's request 2026-10-07): search by name or barcode, per-100 g macros, allergens, prices where known.
// Product data is community data from Open Food Facts, credited below; docs/GROCERIES_PLAN.md.
const PAGE = 60;

export default function GroceriesPage() {
  const router = useRouter();
  const list = useStore(shoppingStore);
  const [retailer, setRetailer] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<GrocerySort>("density");
  const [priced, setPriced] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [retry, setRetry] = useState(0);
  const [scanning, setScanning] = useState(false);
  const deferred = useDeferredValue(query);
  const catalogue = useGroceryCatalogue(retailer, retry);

  const results = useMemo(() => searchProducts(catalogue.products, { query: deferred, retailer: retailer, category, priced, sort }), [catalogue.products, deferred, retailer, category, priced, sort]);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of catalogue.products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return (catalogue.manifest?.categories ?? []).filter((c) => counts.has(c.id));
  }, [catalogue.products, catalogue.manifest]);
  const anyPrices = useMemo(() => catalogue.products.some((p) => Object.keys(p.prices).length > 0), [catalogue.products]);
  const counts = new Map((catalogue.manifest?.retailers ?? []).map((r) => [r.id, r.count]));
  const isBarcode = !!barcodeQuery(deferred);

  const reset = () => setShown(PAGE);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[2.2rem] font-extrabold leading-[1.05] tracking-tight">Shop <span className="serif-em sun-text pr-0.5">smart</span></h1>
        <Link href="/app/groceries/list" aria-label={`Shopping list, ${list.length} ${list.length === 1 ? "item" : "items"}`} className="glass relative mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong">
          <BasketIcon />
          {list.length > 0 && <span aria-hidden className="app-numbers absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-background">{list.length}</span>}
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">Products from the UK&apos;s biggest supermarkets: calories, protein, carbs, fat, allergens and the barcode for each product.</p>

      <div className="mt-4 flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search products or type a barcode</span>
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); reset(); }} placeholder="Search groceries" enterKeyHint="search" autoComplete="off" className="glass min-h-12 w-full rounded-full pl-11 pr-4 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent" />
        </label>
        <Button variant="secondary" onClick={() => setScanning(true)} aria-label="Scan a barcode"><ScanIcon className="h-5 w-5" /></Button>
      </div>

      <div role="group" aria-label="Supermarket" className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
        <Chip selected={retailer === null} onClick={() => { setRetailer(null); reset(); }}>All</Chip>
        {RETAILERS.filter((r) => !catalogue.manifest || counts.has(r.id)).map((r) => (
          <Chip key={r.id} selected={retailer === r.id} onClick={() => { setRetailer(r.id); reset(); }}>{r.name}</Chip>
        ))}
      </div>
      <div role="group" aria-label="Filters" className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
        {anyPrices && <Chip selected={priced} onClick={() => { setPriced((v) => !v); reset(); }}>Has a price</Chip>}
        <Chip selected={category === null} onClick={() => { setCategory(null); reset(); }}>All types</Chip>
        {categories.map((c) => (<Chip key={c.id} selected={category === c.id} onClick={() => { setCategory(c.id); reset(); }}>{c.label}</Chip>))}
      </div>
      <label className="mt-3 flex items-center justify-end gap-2 text-sm">
        <span className="text-muted">Sort</span>
        <select className={`${inputClass} min-h-11 w-auto py-0 text-sm`} value={sort} onChange={(e) => { setSort(e.target.value as GrocerySort); reset(); }}>
          {GROCERY_SORTS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </label>

      {catalogue.status === "loading" ? (
        <Spinner label="Loading products" />
      ) : catalogue.status === "error" ? (
        <div className="mt-4"><ErrorBox message="Couldn't load the products. Check your connection." onRetry={() => setRetry((n) => n + 1)} /></div>
      ) : (
        <>
          <p role="status" aria-live="polite" className="app-numbers mt-3 text-sm text-muted">{results.length.toLocaleString("en-GB")} {results.length === 1 ? "product" : "products"}{isBarcode ? " with that barcode" : ""}</p>
          {results.length === 0 ? (
            <div className="mt-3"><EmptyState title="No products match." body={isBarcode ? "That barcode isn't in our list yet." : "Try fewer words, another supermarket, or a different type."} /></div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {results.slice(0, shown).map((p) => (<li key={p.gtin}><ProductRow product={p} retailer={retailer} /></li>))}
            </ul>
          )}
          {results.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-dashed border-line text-sm font-semibold text-accent transition hover:bg-accent-soft">
              Show {Math.min(PAGE, results.length - shown)} more
            </button>
          )}
        </>
      )}

      <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
        Product details come from Open Food Facts contributors (open data: openfoodfacts.org). They can be out of date or wrong, so always check the pack, especially for allergens.
        Prices appear only where we&apos;ve read them from the supermarket&apos;s own website. Not affiliated with any supermarket.
      </p>

      <Scanner open={scanning} onClose={() => setScanning(false)} onCode={(code) => { setScanning(false); const c = barcodeQuery(code); if (c) { setQuery(c); setRetailer(null); router.push(`/app/groceries/product?code=${c}`); } }} />
    </div>
  );
}
