"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { barcodeQuery, cheapestRetailer, forRetailer, formatPrice, mergeProducts, perLabel, photoSources, priceRating, RETAILERS, retailerName, sizeVariants, type GroceryFile, type ListedProduct } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { foodDietProblem, listedFacts } from "@/lib/mm/foodDiet";
import type { Allergens } from "@/lib/mm/types";
import { addToList, withPhoto } from "@/lib/mm/groceries";
import { CompareButton } from "../../_components/CompareButton";
import { compareFoodFromListed } from "../../_lib/compare";
import { shoppingStore } from "@/lib/mm/stores";
import { AllergenTable } from "../../_components/Allergens";
import { CopyIcon, InfoIcon, PlusIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { Button, ErrorBox, Spinner } from "../../_components/ui";
import { loadManifest, loadRetailer } from "../../_lib/groceries";
import { useSettings } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { Rich } from "../../_lib/Rich";
import { NutritionPanel } from "../NutritionPanel";
import { BackLink, CARD, CHIP, CHIP_ON, FootNote, HEADING, LABEL, NOTE } from "../PageBits";
import { ProductPhotoFigure } from "../ProductPhoto";

// A product from the supermarket lists (docs/GROCERIES_PLAN.md): photo, per-100 g numbers, price where known, the 14 allergens, the barcode.
// Looks follow Home (founder 2026-10-15): one white card holding the picture, the name as a big title and the nutrition as Home's macro rows; the
// further label figures as the same rows in DM Mono; prices as big figures in a regular weight; outlined chips for the shop and size switchers;
// adding to the list right under the prices, the shop you came from as the black pill and the others as grey pills; 20 px corners throughout.
const SEARCH_LINKS: Record<string, (code: string) => string> = {
  tesco: (c) => `https://www.tesco.com/groceries/en-GB/search?query=${c}`,
  sainsburys: (c) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${c}`,
  asda: (c) => `https://www.asda.com/groceries/search/${c}`,
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

/** A small quiet mark beside a price ("Lowest", "Lowest with card"): the accent green on the light grey fill. */
const MARK = "inline-flex items-center rounded-full bg-[var(--fill)] px-2.5 py-1 text-xs font-bold text-accent";

/**
 * Label text the shop's page prints as "Name: value; Name: value" (the further label figures, the per-portion line), shown as calm rows: the
 * name in the running text's size and case (it is the shop's own wording, so it is never set in capitals), the figure in DM Mono on the
 * end side. A part without a colon is a note the page printed (e.g. "As sold"), shown as a plain muted sentence across the row.
 */
function LabelRows({ text }: { text: string }) {
  return (
    <dl className="app-numbers mt-3 divide-y divide-line">
      {text.split(";").map((x) => x.trim()).filter(Boolean).map((x, n) => {
        const i = x.indexOf(":");
        return i > 0 ? (
          <div key={`${n}-${x}`} className="flex min-h-11 items-center justify-between gap-4 py-1.5">
            <dt className="text-[0.9375rem] leading-snug">{x.slice(0, i).trim()}</dt>
            <dd className="text-end font-mono text-[0.8125rem] font-normal text-muted">{x.slice(i + 1).trim()}</dd>
          </div>
        ) : (
          <div key={`${n}-${x}`} className="flex min-h-11 flex-wrap items-center py-1.5">
            <dt className="text-[0.9375rem] leading-snug text-muted">{x}</dt>
          </div>
        );
      })}
    </dl>
  );
}

export function ProductScreen({ code, retailerHint }: { code: string; retailerHint: string | null }) {
  const t = useT();
  const prefs = useSettings().preferences;
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
        // a shop counts only where its own list shows the price; a scanned barcode no shop prices still opens with its numbers
        const priced = mergeProducts(files, { pricedOnly: true });
        const pricedHit = priced.find((p) => p.gtin.replace(/^0+/, "") === wanted);
        const all = pricedHit ? priced : mergeProducts(files);
        const found = pricedHit ?? all.find((p) => p.gtin.replace(/^0+/, "") === wanted);
        if (!cancelled) setState(found ? { status: "ready", product: found, all } : { status: "missing" });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [wanted, retailerHint]);

  const back = <BackLink href="/app/groceries" label={t("Back to groceries")} />;
  if (state.status === "loading") return (<div>{back}<Spinner label={t("Loading product")} /></div>);
  if (state.status === "error") return (<div>{back}<div className="mt-4"><ErrorBox message={t("Couldn't load this product. Check your connection.")} /></div></div>);
  if (state.status === "missing") return (<div>{back}<div className="mt-4"><ErrorBox message={t("That barcode isn't in our list yet.")} /></div></div>);

  const listed = state.product;
  // Opened from a supermarket: that shop's own name, size, numbers and price lead; the others are listed below it.
  const selected = retailerHint && listed.retailers.includes(retailerHint) ? retailerHint : listed.retailers[0]!;
  const p = forRetailer(listed, selected);
  const photos = photoSources(listed, selected);
  const per = perLabel(p, t);
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
    ...(p.kj !== undefined ? [[t("Energy"), `${p.kj.toLocaleString("en-GB")} kJ`] as [string, string]] : []),
    ...(p.saturates !== undefined ? [[t("Saturates"), `${p.saturates}g`] as [string, string]] : []),
    ...(p.sugars !== undefined ? [[t("Sugars"), `${p.sugars}g`] as [string, string]] : []),
    ...(p.fibre !== undefined ? [[t("Fibre"), `${p.fibre}g`] as [string, string]] : []),
    ...(p.salt !== undefined ? [[t("Salt"), `${p.salt}g`] as [string, string]] : []),
  ];
  const containsCount = p.allergens?.contains.length ?? 0;
  const unsuited = foodDietProblem(listedFacts(listed), prefs) !== null;
  const outLink = "font-semibold text-accent underline underline-offset-4";

  return (
    <div>
      {back}
      <div className={`${CARD} mt-3.5 overflow-hidden p-5`}>
        <ProductPhotoFigure sources={photos} />
        {p.brand && <p className="kicker">{p.brand}</p>}
        <h1 className={`${p.brand ? "mt-1.5" : ""} text-[2rem] font-[800] leading-[1.08] tracking-[-0.02em] [overflow-wrap:anywhere]`}>{p.name}</h1>
        {p.size && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{p.size}</p>}
        {unsuited && <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-[var(--fill)] px-4 py-3 text-[0.9375rem] leading-snug"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />{t("This product doesn't fit your diet settings, going by its name, type and label.")}</p>}
        <div className="mt-7">
          <NutritionPanel
            kcal={p.kcal} protein={p.protein} carbs={p.carbs} fat={p.fat} basis={per} rows={rows}
            groupLabel={t("{name}, {kcal} calories, {protein} grams protein, {carbs} grams carbs, {fat} grams fat {per}", { name: p.name, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, per })}
          />
        </div>
        {p.serving && (
          <p className={`app-numbers mt-5 rounded-2xl bg-[var(--fill)] px-4 py-3 ${NOTE}`}>
            {t("Per serving ({size}): {kcal} kcal · {protein}g protein · {carbs}g carbs · {fat}g fat", { size: p.serving.size, kcal: Math.round(p.serving.kcal), protein: p.serving.protein, carbs: p.serving.carbs, fat: p.serving.fat })}
          </p>
        )}
      </div>

      {p.other && (
        <section aria-labelledby="more-label-heading" className={`${CARD} mt-3.5 p-5`}>
          <h2 id="more-label-heading" className={HEADING}>{t("More from the label")}</h2>
          <LabelRows text={p.other} />
        </section>
      )}

      {p.portion && (
        <section aria-labelledby="portion-heading" className={`${CARD} mt-3.5 p-5`}>
          <h2 id="portion-heading" className={HEADING}>{t("Per portion")}</h2>
          <LabelRows text={p.portion} />
        </section>
      )}

      <p className={`mt-3 px-1 ${NOTE}`}>
        {p.source === "retailer"
          ? <Rich text={p.checkedOn ? t("Numbers from {link}, checked {date}.", { date: formatDate(p.checkedOn, t) }) : t("Numbers from {link}.")} values={{ link: <a className="underline underline-offset-4" href={p.pageUrl} target="_blank" rel="noopener noreferrer">{t("{shop}'s own product page", { shop: retailerName(selected) })}<span className="sr-only"> {t("(opens in a new tab)")}</span></a> }} />
          : <>{t("Numbers from Open Food Facts contributors (community data), not the supermarket.")}</>}
      </p>

      {p.ingredients && (
        <section aria-labelledby="ingredients-heading" className={`${CARD} mt-3.5 p-5`}>
          <h2 id="ingredients-heading" className={HEADING}>{t("Ingredients")}</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed">{p.ingredients}</p>
          <p className={`mt-3 ${NOTE}`}>{p.checkedOn ? t("As printed on {shop}'s website, checked {date}.", { shop: retailerName(selected), date: formatDate(p.checkedOn, t) }) : t("As printed on {shop}'s website.", { shop: retailerName(selected) })} {t("Recipes change, so check the pack.")}</p>
        </section>
      )}

      {listed.retailers.length > 1 && (
        <nav aria-label={t("Supermarket")} className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
          {listed.retailers.map((r) => (
            <Link key={r} href={`/app/groceries/product?code=${listed.gtin}&r=${r}`} replace prefetch={false} aria-current={r === selected ? "page" : undefined}
              className={`${r === selected ? CHIP_ON : CHIP} gap-2 pe-4 ps-1.5`}>
              <ShopMark shopId={r} size="xs" />{retailerName(r)}
            </Link>
          ))}
        </nav>
      )}

      {sizes.length > 1 && (
        <section aria-labelledby="sizes-heading" className="mt-4">
          <h2 id="sizes-heading" className={`ps-1 ${LABEL}`}>{t("Other sizes")}</h2>
          <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
            {sizes.map((v) => (
              <Link key={v.gtin} href={`/app/groceries/product?code=${v.gtin}${v.retailers.includes(selected) ? `&r=${selected}` : ""}`} replace prefetch={false} aria-current={v.gtin === listed.gtin ? "page" : undefined}
                className={`${v.gtin === listed.gtin ? CHIP_ON : CHIP} px-4`}>
                {forRetailer(v, selected).size || t("Size not stated")}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="price-heading" className={`${CARD} mt-3.5 p-5`}>
        <h2 id="price-heading" className={HEADING}>{t("Price at {shop}", { shop: retailerName(selected) })}</h2>
        {here ? (
          <div className="mt-4">
            <p className="app-numbers flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[2.5rem] font-medium leading-none tracking-[-0.03em] text-accent">{formatPrice(here.amount)}</span>
              {here.perUnit && <span className="text-[0.9375rem] text-muted">{formatPrice(here.perUnit.amount)} {here.perUnit.unit}</span>}
            </p>
            {here.member && (
              <p className="app-numbers mt-3 text-base">
                <span className="font-bold text-accent">{formatPrice(here.member.amount)}</span> <span className="font-semibold">{t("with {scheme}", { scheme: here.member.scheme.replace(/ price$/i, "") })}</span>
                <span className={`mt-0.5 block ${NOTE}`}>{here.member.ends ? t("Needs {shop}'s loyalty card, {ends}.", { shop: retailerName(selected), ends: here.member.ends }) : t("Needs {shop}'s loyalty card.", { shop: retailerName(selected) })} {t("The regular price above is what everyone pays.")}</span>
              </p>
            )}
            {(pricedCount > 1 && cheapest === selected) || cardLowest(selected) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {pricedCount > 1 && cheapest === selected && <p className={MARK}>{t("Lowest regular price of the supermarkets we've checked")}</p>}
                {cardLowest(selected) && <p className={MARK}>{t("Lowest price with a loyalty card")}</p>}
              </div>
            ) : null}
            <p className={`mt-3 ${NOTE}`}><Rich text={t("From {link}, checked {date}.", { date: formatDate(here.checkedOn, t) })} values={{ link: <a className="underline underline-offset-4" href={here.url} target="_blank" rel="noopener noreferrer">{t("{shop}'s website", { shop: retailerName(selected) })}<span className="sr-only"> {t("(opens in a new tab)")}</span></a> }} /> {t("Prices and offers vary by store and by loyalty card.")}</p>
          </div>
        ) : (
          <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("We haven't read a price at {shop} yet.", { shop: retailerName(selected) })} <a className={outLink} href={SEARCH_LINKS[selected]?.(listed.gtin) ?? "#"} target="_blank" rel="noopener noreferrer">{t("Check it on their site")}<span className="sr-only"> {t("(opens in a new tab)")}</span></a></p>
        )}
        {otherShops.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className={LABEL}>{t("At other supermarkets")}</h3>
            <ul className="mt-1 divide-y divide-line">
              {otherShops.map((r) => {
                const price = listed.prices[r];
                const diff = price && here ? price.amount - here.amount : null;
                return (
                  <li key={r} className="flex min-h-14 items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <Link href={`/app/groceries/product?code=${listed.gtin}&r=${r}`} replace prefetch={false} className="text-[0.9375rem] font-bold underline-offset-4 hover:underline">{retailerName(r)}</Link>
                      {price && cheapest === r && pricedCount > 1 && <span className={`ms-2 ${MARK} py-0.5`}>{t("Lowest")}</span>}
                      {price && cardLowest(r) && <span className={`ms-2 ${MARK} py-0.5`}>{t("Lowest with card")}</span>}
                      <span className="block text-[0.8125rem] text-muted">{price ? t("checked {date}", { date: formatDate(price.checkedOn, t) }) : t("price not read yet")}</span>
                    </span>
                    <span className="app-numbers shrink-0 text-end">
                      {price ? (
                        <>
                          <a className="text-base font-bold underline underline-offset-4" href={price.url} target="_blank" rel="noopener noreferrer">{formatPrice(price.amount)}<span className="sr-only"> {t("at {shop} (opens in a new tab)", { shop: retailerName(r) })}</span></a>
                          {diff !== null && diff !== 0 && <span className="block text-[0.8125rem] text-muted">{diff < 0 ? t("{price} cheaper", { price: formatPrice(Math.abs(diff)) }) : t("{price} more", { price: formatPrice(Math.abs(diff)) })}</span>}
                          {diff === 0 && <span className="block text-[0.8125rem] text-muted">{t("same price")}</span>}
                          {price.member && <span className="block text-[0.8125rem] font-semibold text-accent">{t("{price} with {scheme}", { price: formatPrice(price.member.amount), scheme: price.member.scheme.replace(/ price$/i, "") })}</span>}
                        </>
                      ) : (
                        <a className={`text-sm ${outLink}`} href={SEARCH_LINKS[r]?.(listed.gtin) ?? "#"} target="_blank" rel="noopener noreferrer">{t("Check")}<span className="sr-only"> {t("at {shop} (opens in a new tab)", { shop: retailerName(r) })}</span></a>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <div className={`${CARD} mt-3.5 p-5`}>
        <p className={LABEL}>{t("Add to your shopping list")}</p>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2.5">
          {/* the shop you came from first, across the card's width; the others in equal cells two to a row under it (one a row at large text) */}
          {[...p.retailers].sort((x, y) => Number(y === selected) - Number(x === selected)).map((r) => (
            <Button key={r} variant={r === selected ? "primary" : "secondary"} className={r === selected ? "col-span-full" : "px-3! text-balance"} onClick={() => { shoppingStore.update((l) => addToList(l, { gtin: listed.gtin, retailer: r, name: forRetailer(listed, r).name, brand: listed.brand, size: forRetailer(listed, r).size, ...withPhoto(photoSources(listed, r)) })); setAdded(t("Added to your list for {shop}.", { shop: retailerName(r) })); }}>
              {r === selected && <PlusIcon className="h-[18px] w-[18px]" />}{t("Add · {shop}", { shop: retailerName(r) })}
            </Button>
          ))}
        </div>
        <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-accent empty:mt-0">{added}</p>
        {added && <Link href="/app/groceries/list" className={`inline-flex min-h-11 items-center text-[0.9375rem] ${outLink}`}>{t("Open your shopping list")}</Link>}
      </div>

      <div className="mt-3.5"><CompareButton full item={compareFoodFromListed(listed, selected)} /></div>

      {rating && (
        <section aria-labelledby="rating-heading" className={`${CARD} mt-3.5 p-5`}>
          <h2 id="rating-heading" className={HEADING}>{t("Price check")}</h2>
          <p className="mt-2 text-base font-semibold leading-snug">
            {rating.band === "lower" ? t("Lower price than most similar products") : rating.band === "middle" ? t("Around the middle for price") : t("Higher price than most similar products")}
          </p>
          <p className="app-numbers mt-1.5 text-[0.9375rem] leading-snug text-muted">
            {rating.unit === "kg"
              ? t("Costs less per kg than {pct}% of {n} similar products. {price} per kg here; the middle is {median}.", { pct: rating.cheaperThanPct, n: rating.n, price: formatPrice(rating.mine), median: formatPrice(rating.median) })
              : t("Costs less per litre than {pct}% of {n} similar products. {price} per litre here; the middle is {median}.", { pct: rating.cheaperThanPct, n: rating.n, price: formatPrice(rating.mine), median: formatPrice(rating.median) })}
          </p>
          {rating.proteinPerPound > 0 && <p className="app-numbers mt-1.5 text-[0.9375rem] leading-snug text-muted">{t("{g}g of protein for every £1.", { g: rating.proteinPerPound })}</p>}
          <p className={`mt-3 ${NOTE}`}>{typeLabel ? t("Compared with other {type} products we have prices for, using the lowest price we've read for each. This is about price only.", { type: typeLabel }) : t("Compared with other similar products we have prices for, using the lowest price we've read for each. This is about price only.")}</p>
        </section>
      )}

      <section aria-labelledby="allergens-heading" className={`${CARD} mt-3.5 overflow-hidden`}>
        <div className="px-5 pt-5">
          <h2 id="allergens-heading" className={HEADING}>{t("Allergens")}</h2>
          <p className="mt-2 text-[0.9375rem] leading-snug text-muted">
            {allergens === null
              ? t("Allergen information isn't recorded for this product. Check the pack.")
              : containsCount === 0
                ? t("None of the 14 main allergens recorded as an ingredient.")
                : t("Contains {n} of the 14 main allergens.", { n: containsCount })}
          </p>
        </div>
        {p.advice && (
          <p className="mx-5 mt-4 rounded-2xl bg-[var(--fill)] px-4 py-3 text-[0.9375rem] leading-snug">
            <span className="font-bold">{t("{shop}'s allergy advice:", { shop: retailerName(selected) })} </span>{p.advice}
          </p>
        )}
        {allergens && <AllergenTable allergens={allergens} caption={t("Allergens in {name}, from Open Food Facts contributors", { name: p.name })} columnLabel={t("This product")} />}
        <p className={`flex gap-2 border-t border-line px-5 py-4 ${NOTE}`}>
          <InfoIcon className="mt-px h-4 w-4 shrink-0 text-accent" />
          <span>{p.updated ? t("Community data from Open Food Facts, last edited {date}: recipes change and entries can be wrong, so always read the pack before you buy.", { date: formatDate(p.updated, t) }) : t("Community data from Open Food Facts: recipes change and entries can be wrong, so always read the pack before you buy.")} {t("“Not listed” means nothing is recorded, not that the product is free from it.")}</span>
        </p>
      </section>

      <section aria-labelledby="barcode-heading" className={`${CARD} mt-3.5 flex items-center justify-between gap-3 p-5`}>
        <div className="min-w-0">
          <h2 id="barcode-heading" className={LABEL}>{t("Barcode")}</h2>
          <p className="app-numbers mt-1.5 select-all font-mono text-lg tracking-[0.08em] [overflow-wrap:anywhere]">{p.gtin}</p>
        </div>
        <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(p.gtin).then(() => setCopied(true), () => undefined); }}><CopyIcon className="h-5 w-5" />{copied ? t("Copied") : t("Copy")}</Button>
      </section>

      <FootNote>
        {t("Not affiliated with {shop}.", { shop: p.retailers.map(retailerName).join(", ") })} <Rich text={t("Data: {link}, licensed under the Open Database Licence.")} values={{ link: <a className="underline underline-offset-4" href={`https://world.openfoodfacts.org/product/${p.gtin}`} target="_blank" rel="noopener noreferrer">{t("this product on Open Food Facts")}<span className="sr-only"> {t("(opens in a new tab)")}</span></a> }} />
      </FootNote>
    </div>
  );
}
