"use client";

import { warnPreferences } from "@/lib/mm/user-data";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loggableFromShop } from "@/lib/mm/addFood";
import { ALLERGEN_LABEL } from "@/lib/mm/allergens";
import { sameBarcode } from "@/lib/mm/barcodes";
import { formatPrice, listOf, retailerName, type GroceryProduct } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { avoidedAllergens, foodDietNotChecked, foodDietProblem } from "@/lib/mm/foodDiet";
import { nutritionBasis, shopListItem, shopPageUrl, shopPhotoSources } from "@/lib/mm/shopProducts";
import type { LogMeal } from "@/lib/mm/types";
import type { LogEntry } from "@/lib/mm/user-data";
import { DiaryButton, DiaryToast, useTypedDiary } from "../../../_components/addfood/ProductPick";
import { CheckIcon, ExternalIcon, PencilIcon } from "../../../_components/icons";
import { PremiumBadge } from "../../../_components/PremiumBadge";
import { InfoLine } from "../../../_components/Note";
import { PageHeader } from "../../../_components/PageHeader";
import { Toast } from "../../../_components/Toast";
import { AllergyNote, Button, EmptyState, ErrorBox, LinkButton, Spinner } from "../../../_components/ui";
import { loadRetailer, productTitleClass } from "../../../_lib/groceries";
import { usePossessive, useT } from "../../../_lib/i18n";
import { useSettings, useStore } from "../../../_lib/hooks";
import { shoppingStore } from "@/lib/mm/stores";
import { findBarcode, useShopProducts } from "../../../_lib/shopProducts";
import { ProductPhotoFigure } from "../../ProductPhoto";
import { CompareButton } from "../../../_components/CompareButton";
import { compareFoodFromShop } from "../../../_lib/compare";
import { NutritionPanel } from "../../NutritionPanel";
import { CARD, FootNote, HEADING, MainButton, NOTE } from "../../PageBits";
import { addedText, listHref, useAddToList } from "../../ListChoice";

// One product from a shop's full list: what the shop's own category page printed, and its numbers where we have them (the shop's own label, the same
// product's label at another shop, community numbers for its barcode, or the government's figures for loose produce: each said under them).
// Looks follow Home (founder 2026-10-15): one white card holding the picture and the name as a big title; the nutrition as the label's own rows
// (NutritionPanel); the price as one big figure, extra bold in the body's ink (colour meeting, 19 November 2026: never the link green); the one main action as
// the ink pill; what is already on a list said in words with a tick, and each add confirmed by the one toast. The order is the same on both product pages
// (2026-11-20): picture and name, nutrition, price, Add to my list, Add to my food diary, compare. Reached by a scan (?scan=1), "Add to my food diary" comes
// first, under the product, as the page's one ink button (the design review of 2026-11-20), and "Add to my list" is the white one. A product we have no numbers
// for offers "Type the numbers from the pack" in the food diary button's place (the second pass, 21 November 2026, Yusuf #38).
/** A product with no barcode: no catalogue record to look up. */
const NO_RECORD = { key: "", allergens: null } as const;

export function ShopItemScreen({ shop, id }: { shop: string; id: string }) {
  const t = useT();
  const scan = useSearchParams().get("scan") === "1";
  const poss = usePossessive();
  const settings = useSettings();
  // the warning lines on this one product: the app's filters and what the person told us at sign-up (a warning, never a filter: founder 2026-11-21)
  const prefs = warnPreferences(settings);
  const avoid = prefs.avoidAllergens ?? [];
  const avoidKey = avoid.join(",");
  const mineKey = (settings.shops ?? []).join(",");
  const [retry, setRetry] = useState(0);
  const state = useShopProducts(shop, retry);
  const product = useMemo(() => (state.status === "ready" ? state.products.find((p) => p.id === id) : undefined), [state, id]);
  const [added, setAdded] = useState<{ text: string; n: number } | null>(null);
  const [diary, setDiary] = useState<{ entry: LogEntry; meal: LogMeal } | null>(null);
  // to the main list, or (when the person has lists for this shop) the one they choose; said in the toast, each add a new one, and an add that changed nothing says
  // why (addedText)
  const { add, sheet } = useAddToList((list, _item, outcome) => { setDiary(null); setAdded((was) => ({ text: addedText(t, list, outcome), n: (was?.n ?? 0) + 1 })); });
  const gtin = product?.gtin ?? "";
  // how many are on the person's lists already (usability test 2026-11-19: Stan tapped Add twice because the button looked the same after the first tap), and
  // the list that holds it ("See list" opens that one)
  const listed = useStore(shoppingStore);
  const mine = product ? listed.filter((x) => x.retailer === shop && (x.shopId === product.id || (!!gtin && x.gtin === gtin))) : [];
  const onLists = mine.reduce((n, x) => n + x.qty, 0);
  const holder = mine.length > 0 ? listOf(mine[mine.length - 1]!) : "";
  // This barcode's record in the older barcode catalogue (where it is: the barcode file, then the first catalogue file that holds it, this shop's first), looked up
  // only for its allergens, checked against the person's (the 30-person meeting, 21 November 2026, Maya: every scan lands here, and it never warned about her
  // allergens). undefined while it loads; allergens null when no record has them. Never for its numbers: a product here with none and a catalogue record has
  // them held back by the build on purpose, so "See the nutrition" is gone (the second pass, Yusuf #38: Nesquik powder came back at 64.1 kcal through it).
  const recKey = `${shop}|${gtin}|${avoidKey}|${mineKey}`;
  const [rec, setRec] = useState<{ key: string; allergens: GroceryProduct["allergens"] } | null>(null);
  useEffect(() => {
    if (!gtin || !avoidKey) return;
    let cancelled = false;
    (async () => {
      let ids: string[];
      try {
        const hit = await findBarcode(gtin, mineKey ? mineKey.split(",") : []);
        ids = hit ? [...hit.catalogue.filter((r) => r === shop), ...hit.catalogue.filter((r) => r !== shop)] : [];
      } catch {
        ids = [shop]; // the barcode file couldn't load: this shop's own catalogue file, as before
      }
      const from = ids[0];
      let found: GroceryProduct | null = null;
      if (from) {
        try {
          found = (await loadRetailer(from)).products.find((p) => sameBarcode(p.gtin, gtin)) ?? null;
        } catch { /* that file can't load: no record */ }
      }
      if (!cancelled) setRec({ key: recKey, allergens: found?.allergens ?? null });
    })();
    return () => { cancelled = true; };
  }, [recKey, shop, gtin, avoidKey, mineKey]);
  // a product with no barcode has no record to look up
  const record = !gtin ? NO_RECORD : rec?.key === recKey ? rec : undefined;
  // a product we have no numbers for: the person types them from the pack, as Add food offers (the second pass, Yusuf #38 and Xena #37: a scan landed on a page
  // with no way into the food diary)
  const diaryAdded = (entry: LogEntry, meal: LogMeal) => { setAdded(null); setDiary({ entry, meal }); };
  const typed = useTypedDiary(diaryAdded);

  const back = <PageHeader back={{ href: `/app/groceries/shop?r=${shop}`, label: t("Back to the full list") }} list />;
  if (state.status === "loading") return (<div>{back}<Spinner label={t("Loading product")} /></div>);
  if (state.status === "error") return (<div>{back}<div className="mt-4"><ErrorBox message={t("Couldn't load this product. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>);
  // a product the shop no longer lists is an ordinary answer, not a failure: the way on is its full list
  if (!product) return (<div>{back}<div className="mt-6"><EmptyState title={t("That product isn't in the list.")} body={t("The shop may have stopped selling it, or renamed it.")} action={<LinkButton href={`/app/groceries/shop?r=${shop}`}>{t("See the full list")}</LinkButton>} /></div></div>);

  const { file } = state;
  const photos = shopPhotoSources(file, product);
  const page = shopPageUrl(file, product);
  const nutrition = product.nutrition;
  const compareItem = compareFoodFromShop(file, product);
  const loggable = loggableFromShop(file, product);
  // with no numbers to add, "Type the numbers from the pack" takes the diary button's place: the ink one when reached by a scan, else the white one
  const typeIt = (main: boolean, className: string) => (
    <Button variant={main ? "primary" : "secondary"} full className={className} onClick={() => typed.type(product.name)}>
      <PencilIcon aria-hidden className="h-5 w-5" />{t("Type the numbers from the pack")}{typed.paid ? <PremiumBadge /> : null}
    </Button>
  );
  const notChecked = foodDietNotChecked(prefs, t);
  // the person's avoided allergens the record lists (said once it has loaded); with no record, that it can't be checked
  const avoided = avoid.length > 0 && record ? avoidedAllergens(record.allergens, avoid) : undefined;
  const names = (keys: readonly (keyof typeof ALLERGEN_LABEL)[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(keys.map((k) => t(ALLERGEN_LABEL[k])));
  const allergyText = avoided === undefined ? null
    : avoided === null ? t("No allergen record for this product, so we can't check it for your allergies. Check the pack.")
    : avoided.contains.length > 0 ? t("Contains {allergens}, which you avoid.", { allergens: names(avoided.contains) })
    : avoided.mayContain.length > 0 ? t("May contain {allergens}.", { allergens: names(avoided.mayContain) })
    : null;
  const rows: Array<[string, string]> = nutrition
    ? [
        ...(nutrition.kj !== null ? [[t("Energy"), `${nutrition.kj.toLocaleString("en-GB")} kJ`] as [string, string]] : []),
        ...(nutrition.saturates !== null ? [[t("Saturates"), `${nutrition.saturates}g`] as [string, string]] : []),
        ...(nutrition.sugars !== null ? [[t("Sugars"), `${nutrition.sugars}g`] as [string, string]] : []),
        ...(nutrition.fibre !== null ? [[t("Fibre"), `${nutrition.fibre}g`] as [string, string]] : []),
        ...(nutrition.salt !== null ? [[t("Salt"), `${nutrition.salt}g`] as [string, string]] : []),
      ]
    : [];

  return (
    <div>
      {back}
      <div className={`${CARD} mt-3.5 overflow-hidden p-5`}>
        <ProductPhotoFigure sources={photos} />
        <p className="kicker">{file.name}</p>
        <h1 className={`mt-1.5 ${productTitleClass(product.name)}`}>{product.name}</h1>
        <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{product.category}</p>
        {/* the person's own allergens, from the barcode's catalogue record where there is one: the one amber note, as on the barcode product page */}
        {allergyText && <AllergyNote className="mt-4"><p>{allergyText}</p></AllergyNote>}
        {/* the diet settings by name and aisle only: the calm info line */}
        {foodDietProblem({ name: product.name, category: product.category }, prefs) && <InfoLine heading={null} className="mt-4">{t("This product doesn't fit your diet settings, going by its name and aisle.")}</InfoLine>}
        {notChecked && <InfoLine heading={null} className="mt-3">{notChecked}</InfoLine>}
      </div>

      {scan && (loggable
        ? <DiaryButton main product={loggable} className="mt-3.5 min-h-[3.25rem] text-base" onAdded={diaryAdded} />
        : typeIt(true, "mt-3.5 min-h-[3.25rem] text-base"))}

      <section aria-labelledby="nutrition-heading" className={`${CARD} mt-3.5 p-5`}>
        <h2 id="nutrition-heading" className={HEADING}>{nutrition ? t("Nutrition {basis}", { basis: nutritionBasis(nutrition, t) }) : t("Nutrition")}</h2>
        {nutrition ? (
          <>
            <div className="mt-5">
              <NutritionPanel
                kcal={nutrition.kcal} protein={nutrition.protein} carbs={nutrition.carbs} fat={nutrition.fat} basis={nutritionBasis(nutrition, t)} showBasis={false} rows={rows}
                groupLabel={t("{name}, {kcal} calories, {protein} grams protein, {carbs} grams carbs, {fat} grams fat {per}", { name: product.name, kcal: Math.round(nutrition.kcal), protein: nutrition.protein, carbs: nutrition.carbs, fat: nutrition.fat, per: nutritionBasis(nutrition, t) })}
              />
            </div>
            <p className={`mt-4 ${NOTE}`}>{nutrition.govFood ? t("Fresh fruit and vegetables don't have to carry a nutrition label, and {shopPossessive} page shows none, so these are the UK government's figures for {food}.", { shopPossessive: poss(file.name), food: nutrition.govFood }) : nutrition.community ? t("Numbers from Open Food Facts contributors (community data), not the supermarket.") : nutrition.sameAs ? t("Read from the same product's page on {shopPossessive} website.", { shopPossessive: poss(retailerName(nutrition.sameAs)) }) : file.nutritionCheckedOn ? t("Read from the product's own page on {shopPossessive} website, checked {date}.", { shopPossessive: poss(file.name), date: formatDate(file.nutritionCheckedOn, t) }) : t("Read from the product's own page on {shopPossessive} website.", { shopPossessive: poss(file.name) })} {t("Allergens aren't shown for this product yet: check the pack or the page.")}</p>
          </>
        ) : (
          // true for every product with none: a page not read yet, a page that printed no table, Lidl (which publishes none) and the numbers the build held back
          // (the second pass, Yusuf #40: "and so does the product's page on {shop}'s website" was untrue for most of them)
          <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{t("We don't have the nutrition for this product. The label on the pack has it.")}</p>
        )}
        <a href={page} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 text-[0.9375rem] font-semibold text-accent underline underline-offset-4">
          {t("Open it on {shopPossessive} website", { shopPossessive: poss(file.name) })} <ExternalIcon className="h-4 w-4" /><span className="sr-only"> {t("(opens in a new tab)")}</span>
        </a>
      </section>

      <section aria-labelledby="price-heading" className={`${CARD} mt-3.5 p-5`}>
        <h2 id="price-heading" className="sr-only">{t("Price at {shop}", { shop: file.name })}</h2>
        {product.price !== null ? (
          <p className="app-numbers flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[2.75rem] font-[800] leading-none tracking-[-0.03em] text-foreground">{formatPrice(product.price)}</span>
            {product.unitPrice !== null && product.unit && <span className="text-[0.9375rem] text-muted">{formatPrice(product.unitPrice)} {product.unit}</span>}
          </p>
        ) : (
          <>
            <p className="text-[1.75rem] font-[800] leading-tight tracking-[-0.02em]">{t("Price in store")}</p>
            {/* the reason is the shop's: Lidl prices only its weekly offers online; M&S's aisle pages list no price for these products (its site asks for a store; what it shows once
                one is chosen was not seen, so the words say only that the lists have none) */}
            <p className="mt-2 text-[0.9375rem] leading-snug">{file.priceNote === "stores"
              ? t("{shop} doesn't list a price for this product, and prices can differ between its stores. Check this product's price in store.", { shop: file.name })
              : t("{shop} shows prices on its website only for its weekly offers. Check this product's price in store.", { shop: file.name })}</p>
          </>
        )}
        {product.member && (
          <p className="app-numbers mt-4 rounded-2xl bg-fill px-4 py-3 text-base">
            <span className="font-bold text-foreground">{formatPrice(product.member.amount)}</span> <span className="font-semibold">{t("with {scheme}", { scheme: product.member.scheme.replace(/ price$/i, "") })}</span>
            <span className={`mt-0.5 block ${NOTE}`}>{t("Needs {shopPossessive} loyalty card.", { shopPossessive: poss(file.name) })} {t("The regular price above is what everyone pays.")}</span>
          </p>
        )}
        <p className={`mt-4 ${NOTE}`}>{t("From {shopPossessive} website, checked {date}.", { shopPossessive: poss(file.name), date: formatDate(file.checkedOn, t) })} {t("Prices and offers vary by store and by loyalty card.")}</p>
      </section>

      <div className="mt-4 grid gap-3">
        {onLists > 0 && (
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-base font-semibold">
            {/* a status in the body's ink with a tick (lime is never a tick bullet) */}
            <span className="inline-flex items-center gap-1.5"><CheckIcon aria-hidden className="h-5 w-5 shrink-0 text-ink" strokeWidth={2.6} />{onLists === 1 ? t("On your list") : t("{n} on your list", { n: onLists })}</span>
            <Link href={listHref(holder || null)} className="text-accent underline underline-offset-[3px]">{t("See list")}</Link>
          </p>
        )}
        {/* reached by a scan, the food diary's button above is the page's one ink button */}
        {scan ? (
          <Button variant="secondary" full className="min-h-[3.25rem] text-base" onClick={() => add(shopListItem(file, product))}>{onLists > 0 ? t("Add one more") : t("Add to my list")}</Button>
        ) : (
          <MainButton onClick={() => add(shopListItem(file, product))}>
            {onLists > 0 ? t("Add one more") : t("Add to my list")}
          </MainButton>
        )}
        {/* the food diary: the same "How much?" step as Add food (founder 2026-11-20) where we have the numbers, else typing them from the pack; at the top when
            reached by a scan */}
        {!scan && (loggable ? <DiaryButton product={loggable} className="min-h-12" onAdded={diaryAdded} /> : typeIt(false, "min-h-12"))}
        {/* in its own block, so the compare button's own (empty) status line isn't a row of this grid with a gap above it */}
        {compareItem && <div><CompareButton full item={compareItem} /></div>}
      </div>
      {/* takes no room until there is something to say, so no empty band sits between the buttons and the next card */}
      {/* the one toast; "See list" is in the line above the button */}
      {added && <Toast key={added.n} onClose={() => setAdded(null)}>{added.text}</Toast>}
      <DiaryToast added={diary} onClose={() => setDiary(null)} />
      {sheet}
      {typed.sheet}

      <FootNote>{t("Not affiliated with {shop}.", { shop: file.name })}</FootNote>
    </div>
  );
}
