"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { barcodeQuery, formatPrice, imageUrl, perLabel, RETAILERS, retailerName, type GroceryFile, type ListedProduct, mergeProducts } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import type { Allergens } from "@/lib/mm/types";
import { addToList } from "@/lib/mm/groceries";
import { shoppingStore } from "@/lib/mm/stores";
import { AllergenTable } from "../../_components/Allergens";
import { ChevronLeftIcon, CopyIcon, ExternalIcon, InfoIcon } from "../../_components/icons";
import { Button, ErrorBox, Spinner } from "../../_components/ui";
import { loadManifest, loadRetailer } from "../../_lib/groceries";

// A product from the supermarket lists (docs/GROCERIES_PLAN.md): photo, per-100 g numbers, price where known, the 14 allergens, the barcode.
const SEARCH_LINKS: Record<string, (code: string) => string> = {
  tesco: (c) => `https://www.tesco.com/groceries/en-GB/search?query=${c}`,
  sainsburys: (c) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${c}`,
  asda: (c) => `https://groceries.asda.com/search/${c}`,
  waitrose: (c) => `https://www.waitrose.com/ecom/shop/search?searchTerm=${c}`,
  aldi: (c) => `https://www.aldi.co.uk/results?q=${c}`,
  lidl: (c) => `https://www.lidl.co.uk/q/search?q=${c}`,
  morrisons: (c) => `https://groceries.morrisons.com/search?entry=${c}`,
  coop: (c) => `https://shop.coop.co.uk/search?term=${c}`,
  "marks-and-spencer": (c) => `https://www.marksandspencer.com/search?searchTerm=${c}`,
  iceland: (c) => `https://www.iceland.co.uk/search?q=${c}`,
  ocado: (c) => `https://www.ocado.com/search?entry=${c}`,
};

type State = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ready"; product: ListedProduct };

export function ProductScreen({ code, retailerHint }: { code: string; retailerHint: string | null }) {
  const wanted = barcodeQuery(code);
  const [state, setState] = useState<State>({ status: "loading" });
  const [added, setAdded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!wanted) return void (!cancelled && setState({ status: "missing" }));
        const manifest = await loadManifest();
        const order = [...(retailerHint ? [retailerHint] : []), ...RETAILERS.map((r) => r.id).filter((id) => id !== retailerHint)].filter((id) => manifest.retailers.some((m) => m.id === id));
        const files: GroceryFile[] = [];
        for (const id of order) {
          files.push(await loadRetailer(id));
          // keep going: the same barcode may be sold by other retailers, which we list too
        }
        const found = mergeProducts(files).find((p) => p.gtin.replace(/^0+/, "") === wanted);
        if (!cancelled) setState(found ? { status: "ready", product: found } : { status: "missing" });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [wanted, retailerHint]);

  const back = (<Link href="/app/groceries" aria-label="Back to groceries" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>);
  if (state.status === "loading") return (<div>{back}<Spinner label="Loading product" /></div>);
  if (state.status === "error") return (<div>{back}<div className="mt-4"><ErrorBox message="Couldn't load this product. Check your connection." /></div></div>);
  if (state.status === "missing") return (<div>{back}<div className="mt-4"><ErrorBox message="That barcode isn't in our list yet." /></div></div>);

  const p = state.product;
  const photo = imageUrl(p.image, 400);
  const per = perLabel(p);
  const priceEntries = Object.entries(p.prices);
  const allergens: Allergens | null = p.allergens ? { contains: p.allergens.contains, mayContain: p.allergens.mayContain } : null;
  const rows: Array<[string, string]> = [
    ...(p.kj !== undefined ? [["Energy", `${p.kj.toLocaleString("en-GB")} kJ`] as [string, string]] : []),
    ...(p.saturates !== undefined ? [["Saturates", `${p.saturates}g`] as [string, string]] : []),
    ...(p.sugars !== undefined ? [["Sugars", `${p.sugars}g`] as [string, string]] : []),
    ...(p.fibre !== undefined ? [["Fibre", `${p.fibre}g`] as [string, string]] : []),
    ...(p.salt !== undefined ? [["Salt", `${p.salt}g`] as [string, string]] : []),
  ];
  const containsCount = p.allergens?.contains.length ?? 0;

  return (
    <div>
      {back}
      {photo && (
        <figure className="glass mt-5 overflow-hidden rounded-3xl bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- a third-party product photo (Open Food Facts, CC BY-SA), decorative */}
          <img src={photo} alt="" width={400} height={400} decoding="async" className="mx-auto h-auto max-h-80 w-full object-contain" />
          <figcaption className="bg-background px-4 py-2 text-xs text-muted">Photo: Open Food Facts contributors (CC BY-SA)</figcaption>
        </figure>
      )}

      <div className="hero-card mt-5 overflow-hidden rounded-[2rem] p-6">
        {p.brand && <p className="kicker">{p.brand}</p>}
        <h1 className="text-[1.7rem] font-extrabold leading-[1.1] tracking-tight">{p.name}</h1>
        {p.size && <p className="mt-1 text-sm text-muted">{p.size}</p>}
        <div role="group" aria-label={`${p.name}, ${p.kcal} calories, ${p.protein} grams protein, ${p.carbs} grams carbs, ${p.fat} grams fat ${per}`} className="app-numbers mt-5">
          <div className="flex items-end gap-2">
            <span className="sun-text text-7xl font-extrabold leading-[0.9] tracking-tighter">{Math.round(p.kcal)}</span>
            <span className="pb-1 text-sm font-bold uppercase tracking-[0.14em] text-muted">kcal {per}</span>
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-2">
            {([["Protein", p.protein, true], ["Carbs", p.carbs, false], ["Fat", p.fat, false]] as const).map(([label, v, lead]) => (
              <div key={label} className={`flex flex-col-reverse gap-0.5 rounded-2xl px-3 py-3 ${lead ? "bg-accent-soft" : "inset-card"}`}>
                <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{label}</dt>
                <dd className={`text-2xl font-extrabold tracking-tight ${lead ? "text-accent" : ""}`}>{v}g</dd>
              </div>
            ))}
          </dl>
        </div>
        {p.serving && (
          <p className="app-numbers mt-4 text-sm text-muted">
            Per serving ({p.serving.size}): {Math.round(p.serving.kcal)} kcal · {p.serving.protein}g protein · {p.serving.carbs}g carbs · {p.serving.fat}g fat
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <dl className="app-numbers glass mt-3 divide-y divide-line overflow-hidden rounded-3xl">
          {rows.map(([label, value]) => (
            <div key={label} className="flex min-h-12 items-center justify-between gap-4 px-5 py-2"><dt>{label} <span className="text-sm text-muted">{per}</span></dt><dd className="font-semibold">{value}</dd></div>
          ))}
        </dl>
      )}

      <section aria-labelledby="price-heading" className="glass mt-3 rounded-3xl p-5">
        <h2 id="price-heading" className="text-lg font-bold tracking-tight">Price</h2>
        {priceEntries.length > 0 ? (
          <ul className="mt-2 space-y-3">
            {priceEntries.map(([r, price]) => (
              <li key={r}>
                <p className="app-numbers"><span className="text-2xl font-extrabold">{formatPrice(price.amount)}</span> <span className="text-muted">at {retailerName(r)}{price.perUnit ? ` · ${formatPrice(price.perUnit.amount)} ${price.perUnit.unit}` : ""}</span></p>
                <p className="text-xs text-muted">From <a className="underline underline-offset-2" href={price.url} target="_blank" rel="noopener noreferrer">{retailerName(r)}&apos;s website<span className="sr-only"> (opens in a new tab)</span></a>, checked {formatDate(price.checkedOn)}. Prices and offers vary by store and by loyalty card.</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">We haven&apos;t read a price for this product yet. Check the supermarket&apos;s own page:</p>
        )}
        <ul className="mt-3 flex flex-wrap gap-2">
          {p.retailers.map((r) => (
            <li key={r}>
              <a href={SEARCH_LINKS[r]?.(p.gtin) ?? "#"} target="_blank" rel="noopener noreferrer" className="glass inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-accent">
                {retailerName(r)} <ExternalIcon className="h-4 w-4" /><span className="sr-only">: search for this barcode (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="allergens-heading" className="glass mt-3 overflow-hidden rounded-3xl">
        <div className="px-5 pt-5">
          <h2 id="allergens-heading" className="text-lg font-bold tracking-tight">Allergens</h2>
          <p className="mt-1 text-sm text-muted">
            {allergens === null
              ? "Allergen information isn't recorded for this product. Check the pack."
              : containsCount === 0
                ? "None of the 14 main allergens recorded as an ingredient."
                : `Contains ${containsCount} of the 14 main allergens.`}
          </p>
        </div>
        {allergens && <AllergenTable allergens={allergens} caption={`Allergens in ${p.name}, from Open Food Facts contributors`} columnLabel="This product" />}
        <p className="flex gap-2 border-t border-line px-5 py-4 text-xs text-muted">
          <InfoIcon className="mt-px h-4 w-4 shrink-0 text-accent" />
          <span>Community data from Open Food Facts{p.updated ? `, last edited ${formatDate(p.updated)}` : ""}: recipes change and entries can be wrong, so always read the pack before you buy. &ldquo;Not listed&rdquo; means nothing is recorded, not that the product is free from it.</span>
        </p>
      </section>

      <section aria-labelledby="barcode-heading" className="glass mt-3 flex items-center justify-between gap-3 rounded-3xl p-5">
        <div>
          <h2 id="barcode-heading" className="text-sm font-bold uppercase tracking-[0.14em] text-muted">Barcode</h2>
          <p className="app-numbers mt-1 select-all text-xl font-bold tracking-[0.12em]">{p.gtin}</p>
        </div>
        <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(p.gtin).then(() => setCopied(true), () => undefined); }}><CopyIcon className="h-5 w-5" />{copied ? "Copied" : "Copy"}</Button>
      </section>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Add to your shopping list</p>
        <div className="flex flex-wrap gap-2">
          {p.retailers.map((r) => (
            <Button key={r} onClick={() => { shoppingStore.update((l) => addToList(l, { gtin: p.gtin, retailer: r, name: p.name, brand: p.brand, size: p.size })); setAdded(`Added to your list for ${retailerName(r)}.`); }}>
              Add · {retailerName(r)}
            </Button>
          ))}
        </div>
        <p role="status" aria-live="polite" className="min-h-5 text-sm font-medium text-accent">{added}</p>
        {added && <Link href="/app/groceries/list" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">Open your shopping list</Link>}
      </div>

      <p className="mt-4 text-xs text-muted">
        Not affiliated with {p.retailers.map(retailerName).join(", ")}. Data: <a className="underline" href={`https://world.openfoodfacts.org/product/${p.gtin}`} target="_blank" rel="noopener noreferrer">this product on Open Food Facts<span className="sr-only"> (opens in a new tab)</span></a>, licensed under the Open Database Licence.
      </p>
    </div>
  );
}

