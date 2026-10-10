"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addToList, formatPrice } from "@/lib/mm/groceries";
import { shoppingStore } from "@/lib/mm/stores";
import { formatDate } from "@/lib/mm/format";
import { nutritionBasis, possessive, shopPageUrl, shopPhotoUrl } from "@/lib/mm/shopProducts";
import { BasketIcon, ChevronLeftIcon, ExternalIcon } from "../../../_components/icons";
import { Button, ErrorBox, Spinner } from "../../../_components/ui";
import { loadRetailer } from "../../../_lib/groceries";
import { useShopProducts } from "../../../_lib/shopProducts";
import { ProductPhotoFigure } from "../../ProductPhoto";

// One product from a shop's full list: what the shop's own category page printed. We have not read this product's page, so no calories, protein or allergens
// here unless its barcode is one the Groceries list already has numbers for (then the full page is one tap away).
export function ShopItemScreen({ shop, id }: { shop: string; id: string }) {
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(shop, retry);
  const product = useMemo(() => (state.status === "ready" ? state.products.find((p) => p.id === id) : undefined), [state, id]);
  const [inCatalogue, setInCatalogue] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const gtin = product?.gtin ?? "";
  useEffect(() => {
    if (!gtin) return;
    let cancelled = false;
    loadRetailer(shop).then(
      (f) => { if (!cancelled) setInCatalogue(f.products.some((p) => p.gtin === gtin)); },
      () => undefined,
    );
    return () => { cancelled = true; };
  }, [shop, gtin]);

  const back = (<Link href={`/app/groceries/shop?r=${shop}`} aria-label="Back to the full list" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>);
  if (state.status === "loading") return (<div>{back}<Spinner label="Loading product" /></div>);
  if (state.status === "error") return (<div>{back}<div className="mt-4"><ErrorBox message="Couldn't load this product. Check your connection." onRetry={() => setRetry((n) => n + 1)} /></div></div>);
  if (!product) return (<div>{back}<div className="mt-4"><ErrorBox message="That product isn't in the list." /></div></div>);

  const { file } = state;
  const photo = shopPhotoUrl(file, product);
  const page = shopPageUrl(file, product);
  const nutrition = product.nutrition;
  const rows: Array<[string, string]> = nutrition
    ? [
        ...(nutrition.kj !== null ? [["Energy", `${nutrition.kj.toLocaleString("en-GB")} kJ`] as [string, string]] : []),
        ...(nutrition.saturates !== null ? [["Saturates", `${nutrition.saturates}g`] as [string, string]] : []),
        ...(nutrition.sugars !== null ? [["Sugars", `${nutrition.sugars}g`] as [string, string]] : []),
        ...(nutrition.fibre !== null ? [["Fibre", `${nutrition.fibre}g`] as [string, string]] : []),
        ...(nutrition.salt !== null ? [["Salt", `${nutrition.salt}g`] as [string, string]] : []),
      ]
    : [];

  return (
    <div>
      {back}
      <ProductPhotoFigure sources={photo ? [{ src: photo, from: "retailer", shop }] : []} />

      <div className="hero-card mt-5 overflow-hidden rounded-[2rem] p-6">
        <p className="kicker">{file.name}</p>
        <h1 className="text-[1.7rem] font-extrabold leading-[1.1] tracking-tight">{product.name}</h1>
        <p className="mt-1 text-sm text-muted">{product.category}</p>
        <p className="app-numbers mt-5">
          <span className="sun-text text-5xl font-extrabold leading-none tracking-tighter">{formatPrice(product.price)}</span>
          {product.unitPrice !== null && product.unit && <span className="ml-2 text-muted">{formatPrice(product.unitPrice)} {product.unit}</span>}
        </p>
        {product.member && (
          <p className="app-numbers mt-2 text-base">
            <span className="font-extrabold text-accent">{formatPrice(product.member.amount)}</span> <span className="font-semibold">with {product.member.scheme.replace(/ price$/i, "")}</span>
            <span className="block text-xs text-muted">Needs {possessive(file.name)} loyalty card. The regular price above is what everyone pays.</span>
          </p>
        )}
        <p className="mt-2 text-xs text-muted">From {possessive(file.name)} website, checked {formatDate(file.checkedOn)}. Prices and offers vary by store and by loyalty card.</p>
      </div>

      <div className="mt-3">
        <Button full onClick={() => { shoppingStore.update((l) => addToList(l, { gtin: product.gtin, shopId: product.id, retailer: file.retailer, name: product.name, brand: "", size: "", price: product.price, checkedOn: file.checkedOn })); setAdded(`Added to your ${file.name} list.`); }}>
          <BasketIcon className="h-5 w-5" />Add to my list
        </Button>
        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-center text-sm font-medium text-accent">{added && <>{added} <Link href="/app/groceries/list" className="underline underline-offset-2">See list</Link></>}</p>
      </div>

      <section aria-labelledby="nutrition-heading" className="glass mt-3 rounded-3xl p-5">
        <h2 id="nutrition-heading" className="text-lg font-bold tracking-tight">Nutrition{nutrition ? ` ${nutritionBasis(nutrition)}` : ""}</h2>
        {nutrition ? (
          <>
            <div role="group" aria-label={`${product.name}, ${Math.round(nutrition.kcal)} calories, ${nutrition.protein} grams protein, ${nutrition.carbs} grams carbs, ${nutrition.fat} grams fat ${nutritionBasis(nutrition)}`} className="app-numbers mt-3">
              <div className="flex items-end gap-2">
                <span className="sun-text text-6xl font-extrabold leading-[0.9] tracking-tighter">{Math.round(nutrition.kcal)}</span>
                <span className="pb-1 text-sm font-bold uppercase tracking-[0.14em] text-muted">kcal {nutritionBasis(nutrition)}</span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2">
                {([["Protein", nutrition.protein, true], ["Carbs", nutrition.carbs, false], ["Fat", nutrition.fat, false]] as const).map(([label, v, lead]) => (
                  <div key={label} className={`flex flex-col-reverse gap-0.5 rounded-2xl px-3 py-3 ${lead ? "bg-accent-soft" : "inset-card"}`}>
                    <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{label}</dt>
                    <dd className={`text-2xl font-extrabold tracking-tight ${lead ? "text-accent" : ""}`}>{v}g</dd>
                  </div>
                ))}
              </dl>
            </div>
            {rows.length > 0 && (
              <dl className="app-numbers mt-3 divide-y divide-line text-sm">
                {rows.map(([label, value]) => (<div key={label} className="flex min-h-11 items-center justify-between gap-3"><dt className="text-muted">{label}</dt><dd className="font-semibold">{value}</dd></div>))}
              </dl>
            )}
            <p className="mt-3 text-xs text-muted">Read from the product&apos;s own page on {possessive(file.name)} website{file.nutritionCheckedOn ? `, checked ${formatDate(file.nutritionCheckedOn)}` : ""}. Allergens aren&apos;t shown for this product yet: check the pack or the page.</p>
          </>
        ) : inCatalogue ? (
          <>
            <p className="mt-1 text-sm text-muted">We have calories, protein, carbs, fat and allergens for this product.</p>
            <Link href={`/app/groceries/product?code=${product.gtin}&r=${shop}`} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-bold text-background transition active:scale-[0.97]">See the nutrition</Link>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">We haven&apos;t read the nutrition for this product yet. The label on the pack has it, and so does the product&apos;s page on {possessive(file.name)} website.</p>
        )}
        <a href={page} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent underline underline-offset-2">
          Open it on {possessive(file.name)} website <ExternalIcon className="h-4 w-4" /><span className="sr-only"> (opens in a new tab)</span>
        </a>
      </section>

      <p className="mt-8 border-t border-line pt-4 text-xs text-muted">Not affiliated with {file.name}.</p>
    </div>
  );
}
