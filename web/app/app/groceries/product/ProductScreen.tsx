"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { barcodeQuery, cheapestRetailer, forRetailer, formatPrice, mergeProducts, perLabel, photoSources, priceRating, RETAILERS, retailerName, sizeVariants, type GroceryFile, type ListedProduct } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import type { Allergens } from "@/lib/mm/types";
import { addToList } from "@/lib/mm/groceries";
import { shoppingStore } from "@/lib/mm/stores";
import { AllergenTable } from "../../_components/Allergens";
import { ChevronLeftIcon, CopyIcon, InfoIcon } from "../../_components/icons";
import { Button, ErrorBox, Spinner } from "../../_components/ui";
import { loadManifest, loadRetailer } from "../../_lib/groceries";
import { ProductPhotoFigure } from "../ProductPhoto";

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

type State = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ready"; product: ListedProduct; all: ListedProduct[] };

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
        const all = mergeProducts(files);
        const found = all.find((p) => p.gtin.replace(/^0+/, "") === wanted);
        if (!cancelled) setState(found ? { status: "ready", product: found, all } : { status: "missing" });
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

  const listed = state.product;
  // Opened from a supermarket: that shop's own name, size, numbers and price lead; the others are listed below it.
  const selected = retailerHint && listed.retailers.includes(retailerHint) ? retailerHint : listed.retailers[0]!;
  const p = forRetailer(listed, selected);
  const photos = photoSources(listed, selected);
  const per = perLabel(p);
  const sizes = sizeVariants(state.all, listed);
  const rating = priceRating(state.all, listed, selected);
  const cheapest = cheapestRetailer(listed);
  const cheapestCard = cheapestRetailer(listed, true);
  const cardLowest = (r: string) => pricedCount > 1 && cheapestCard === r && !!listed.prices[r]?.member && cheapestCard !== cheapest;
  const pricedCount = Object.keys(listed.prices).length;
  const here = listed.prices[selected];
  const otherShops = listed.retailers
    .filter((r) => r !== selected)
    .sort((a, b) => (listed.prices[a]?.amount ?? Number.POSITIVE_INFINITY) - (listed.prices[b]?.amount ?? Number.POSITIVE_INFINITY));
  const typeLabel = (listed.type ?? "").replace(/-/g, " ");
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
      <ProductPhotoFigure sources={photos} />

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

      {p.other && (
        <section aria-labelledby="more-label-heading" className="glass mt-3 rounded-3xl p-5">
          <h2 id="more-label-heading" className="text-lg font-bold tracking-tight">More from the label</h2>
          <dl className="app-numbers mt-2 divide-y divide-line">
            {p.other.split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
              const i = x.indexOf(":");
              return (
                <div key={x} className="flex min-h-11 items-center justify-between gap-4 py-1.5 text-sm">
                  <dt>{i > 0 ? x.slice(0, i).trim() : x}</dt>
                  {i > 0 && <dd className="font-semibold">{x.slice(i + 1).trim()}</dd>}
                </div>
              );
            })}
          </dl>
        </section>
      )}

      {p.portion && (
        <section aria-labelledby="portion-heading" className="glass mt-3 rounded-3xl p-5">
          <h2 id="portion-heading" className="text-lg font-bold tracking-tight">Per portion</h2>
          <p className="app-numbers mt-1 text-sm">{p.portion}</p>
        </section>
      )}

      <p className="mt-2 px-1 text-xs text-muted">
        {p.source === "retailer"
          ? <>Numbers from <a className="underline underline-offset-2" href={p.pageUrl} target="_blank" rel="noopener noreferrer">{retailerName(selected)}&apos;s own product page<span className="sr-only"> (opens in a new tab)</span></a>{p.checkedOn ? `, checked ${formatDate(p.checkedOn)}` : ""}.</>
          : <>Numbers from Open Food Facts contributors (community data), not the supermarket.</>}
      </p>

      {p.ingredients && (
        <section aria-labelledby="ingredients-heading" className="glass mt-3 rounded-3xl p-5">
          <h2 id="ingredients-heading" className="text-lg font-bold tracking-tight">Ingredients</h2>
          <p className="mt-1 text-sm leading-relaxed">{p.ingredients}</p>
          <p className="mt-2 text-xs text-muted">As printed on {retailerName(selected)}&apos;s website{p.checkedOn ? `, checked ${formatDate(p.checkedOn)}` : ""}. Recipes change, so check the pack.</p>
        </section>
      )}

      {listed.retailers.length > 1 && (
        <nav aria-label="Supermarket" className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          {listed.retailers.map((r) => (
            <Link key={r} href={`/app/groceries/product?code=${listed.gtin}&r=${r}`} replace prefetch={false} aria-current={r === selected ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition active:scale-[0.97] ${r === selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-soft hover:bg-soft-strong"}`}>
              {retailerName(r)}
            </Link>
          ))}
        </nav>
      )}

      {sizes.length > 1 && (
        <section aria-labelledby="sizes-heading" className="mt-3">
          <h2 id="sizes-heading" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Other sizes</h2>
          <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
            {sizes.map((v) => (
              <Link key={v.gtin} href={`/app/groceries/product?code=${v.gtin}${v.retailers.includes(selected) ? `&r=${selected}` : ""}`} replace prefetch={false} aria-current={v.gtin === listed.gtin ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition active:scale-[0.97] ${v.gtin === listed.gtin ? "border-accent bg-accent-soft text-accent" : "border-line bg-soft hover:bg-soft-strong"}`}>
                {forRetailer(v, selected).size || "Size not stated"}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="price-heading" className="glass mt-3 rounded-3xl p-5">
        <h2 id="price-heading" className="text-lg font-bold tracking-tight">Price at {retailerName(selected)}</h2>
        {here ? (
          <div className="mt-2">
            <p className="app-numbers"><span className="text-3xl font-extrabold">{formatPrice(here.amount)}</span> {here.perUnit && <span className="text-muted">{formatPrice(here.perUnit.amount)} {here.perUnit.unit}</span>}</p>
            {here.member && (
              <p className="app-numbers mt-1 text-base">
                <span className="font-extrabold text-accent">{formatPrice(here.member.amount)}</span> <span className="font-semibold">with {here.member.scheme.replace(/ price$/i, "")}</span>
                <span className="block text-xs text-muted">Needs {retailerName(selected)}&apos;s loyalty card{here.member.ends ? `, ${here.member.ends}` : ""}. The regular price above is what everyone pays.</span>
              </p>
            )}
            {pricedCount > 1 && cheapest === selected && <p className="mt-1 inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">Lowest regular price of the supermarkets we&apos;ve checked</p>}
            {cardLowest(selected) && <p className="mt-1 inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">Lowest price with a loyalty card</p>}
            <p className="mt-1 text-xs text-muted">From <a className="underline underline-offset-2" href={here.url} target="_blank" rel="noopener noreferrer">{retailerName(selected)}&apos;s website<span className="sr-only"> (opens in a new tab)</span></a>, checked {formatDate(here.checkedOn)}. Prices and offers vary by store and by loyalty card.</p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">We haven&apos;t read a price at {retailerName(selected)} yet. <a className="font-semibold text-accent underline underline-offset-2" href={SEARCH_LINKS[selected]?.(listed.gtin) ?? "#"} target="_blank" rel="noopener noreferrer">Check it on their site<span className="sr-only"> (opens in a new tab)</span></a></p>
        )}
        {otherShops.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">At other supermarkets</h3>
            <ul className="mt-2 divide-y divide-line">
              {otherShops.map((r) => {
                const price = listed.prices[r];
                const diff = price && here ? price.amount - here.amount : null;
                return (
                  <li key={r} className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <Link href={`/app/groceries/product?code=${listed.gtin}&r=${r}`} replace prefetch={false} className="font-semibold underline-offset-2 hover:underline">{retailerName(r)}</Link>
                      {price && cheapest === r && pricedCount > 1 && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">Lowest</span>}
                      {price && cardLowest(r) && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">Lowest with card</span>}
                      <span className="block text-xs text-muted">{price ? `checked ${formatDate(price.checkedOn)}` : "price not read yet"}</span>
                    </span>
                    <span className="app-numbers shrink-0 text-right">
                      {price ? (
                        <>
                          <a className="font-bold underline underline-offset-2" href={price.url} target="_blank" rel="noopener noreferrer">{formatPrice(price.amount)}<span className="sr-only"> at {retailerName(r)} (opens in a new tab)</span></a>
                          {diff !== null && diff !== 0 && <span className="block text-xs text-muted">{formatPrice(Math.abs(diff))} {diff < 0 ? "cheaper" : "more"}</span>}
                          {diff === 0 && <span className="block text-xs text-muted">same price</span>}
                          {price.member && <span className="block text-xs font-semibold text-accent">{formatPrice(price.member.amount)} with {price.member.scheme.replace(/ price$/i, "")}</span>}
                        </>
                      ) : (
                        <a className="text-sm font-semibold text-accent underline underline-offset-2" href={SEARCH_LINKS[r]?.(listed.gtin) ?? "#"} target="_blank" rel="noopener noreferrer">Check<span className="sr-only"> at {retailerName(r)} (opens in a new tab)</span></a>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {rating && (
        <section aria-labelledby="rating-heading" className="glass mt-3 rounded-3xl p-5">
          <h2 id="rating-heading" className="text-lg font-bold tracking-tight">Price check</h2>
          <p className="mt-1 text-base font-semibold">
            {rating.band === "lower" ? "Lower price than most similar products" : rating.band === "middle" ? "Around the middle for price" : "Higher price than most similar products"}
          </p>
          <p className="app-numbers mt-1 text-sm text-muted">
            Costs less per {rating.unit === "kg" ? "kg" : "litre"} than {rating.cheaperThanPct}% of {rating.n} similar products. {formatPrice(rating.mine)} per {rating.unit === "kg" ? "kg" : "litre"} here; the middle is {formatPrice(rating.median)}.
          </p>
          {rating.proteinPerPound > 0 && <p className="app-numbers mt-1 text-sm text-muted">{rating.proteinPerPound}g of protein for every £1.</p>}
          <p className="mt-2 text-xs text-muted">Compared with other {typeLabel || "similar"} products we have prices for, using the lowest price we&apos;ve read for each. This is about price only.</p>
        </section>
      )}

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
        {p.advice && (
          <p className="mx-5 mt-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm">
            <span className="font-bold">{retailerName(selected)}&apos;s allergy advice: </span>{p.advice}
          </p>
        )}
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
            <Button key={r} onClick={() => { shoppingStore.update((l) => addToList(l, { gtin: listed.gtin, retailer: r, name: forRetailer(listed, r).name, brand: listed.brand, size: forRetailer(listed, r).size })); setAdded(`Added to your list for ${retailerName(r)}.`); }}>
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

