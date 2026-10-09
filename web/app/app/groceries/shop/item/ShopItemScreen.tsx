"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { possessive, shopPageUrl, shopPhotoUrl } from "@/lib/mm/shopProducts";
import { ChevronLeftIcon, ExternalIcon } from "../../../_components/icons";
import { ErrorBox, Spinner } from "../../../_components/ui";
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

      <section aria-labelledby="nutrition-heading" className="glass mt-3 rounded-3xl p-5">
        <h2 id="nutrition-heading" className="text-lg font-bold tracking-tight">Nutrition</h2>
        {inCatalogue ? (
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
