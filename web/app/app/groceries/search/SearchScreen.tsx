"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { barcodeDigits, scanHref, shopItemHref } from "@/lib/mm/barcodes";
import { ALLERGEN_LABEL } from "@/lib/mm/allergens";
import { anyFoodDiet, foodDietProblem, groceryDietLine } from "@/lib/mm/foodDiet";
import { RETAILERS, retailerName } from "@/lib/mm/groceries";
import { groupProducts, sameProductGroups, type ProductGroup } from "@/lib/mm/leaderboards";
import { nutritionBasis, SHOP_SORTS, searchShopProducts, shopPhotoSources, tagShopProducts, type ShopFile, type ShopProduct, type ShopSort } from "@/lib/mm/shopProducts";
import { PageHeader } from "../../_components/PageHeader";
import { ChevronRightIcon, ScanIcon, SearchIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../../_components/SearchDone";
import { AllergyNote, Chip, EmptyIcon, EmptyState, ErrorBox, Spinner } from "../../_components/ui";
import { useEntryQuery } from "../../_lib/backNav";
import { useShopLists, useShopManifest } from "../../_lib/shopProducts";
import { useSettings } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { NutritionChips } from "../NutritionChips";
import { FootNote, MoreButton, NOTE, PILL_INPUT, ROW, SelectField, TITLE } from "../PageBits";
import { PhotoTile } from "../ProductPhoto";
import { Scanner } from "../Scanner";
import { ShopPrices } from "../ShopPrices";

// Search every shop at once (founder's request 2026-10-07; moved here 2026-10-11 when Groceries began with "Which shop?"): the supermarkets' own full lists
// (2026-11-20: it searched only the older barcode catalogue, so Aldi showed 1 product, Lidl 1 and M&S none), every shop that sells a product on one row with
// its logo and price there, the numbers from the shop's own label where we have read it. The person's own shops by default, one shop, or all of them.
// Looks follow Home (founder 2026-10-15): a white pill search box with a round white scan button, outlined chips, the sort as a white field.
const PAGE = 60;

type Scope = "mine" | "all" | string;

/** One product at every shop in the search that sells it: the first shop's photo and name (the person's own shop first), every shop's logo and price, and the
 *  numbers from the first shop with a label of its own (else another source, said quietly). */
function GroupRow({ group, files, mine }: { group: ProductGroup; files: Map<string, ShopFile>; mine: readonly string[] }) {
  const t = useT();
  const rank = (shop: string) => { const i = mine.indexOf(shop); return i < 0 ? mine.length : i; };
  const items = [...group.items].sort((a, b) => rank(a.shop) - rank(b.shop));
  const first = items[0]!;
  const file = files.get(first.shop);
  const own = (p: ShopProduct) => !!p.nutrition && !p.nutrition.community && !p.nutrition.govFood;
  const numbers = items.find((x) => own(x.product)) ?? items.find((x) => !!x.product.nutrition);
  const n = numbers?.product.nutrition ?? null;
  return (
    <Link href={shopItemHref({ shop: first.shop, id: first.product.id })} prefetch={false} className={ROW}>
      <PhotoTile sources={file ? shopPhotoSources(file, first.product) : []} />
      <span className="min-w-[9rem] flex-1 py-0.5">
        <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]">{first.product.name}</span>
        {/* every shop that sells it, by its logo with its price there (founder 2026-11-18) */}
        <span className="mt-1.5 block">
          <ShopPrices items={items.map((x) => ({ shop: x.shop, name: files.get(x.shop)?.name ?? retailerName(x.shop), price: x.product.price, member: x.product.member }))} />
        </span>
        {n && <NutritionChips kcal={n.kcal} protein={n.protein} basis={nutritionBasis(n, t)} />}
        {n?.community && <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">{t("community numbers")}</span>}
        {n?.govFood && <span className="mt-1 block text-[0.8125rem] leading-snug text-muted">{t("UK government figures")}</span>}
      </span>
      <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-ink" />
    </Link>
  );
}

export function GroceriesSearchScreen({ initialShop }: { initialShop: string | null }) {
  const t = useT();
  const router = useRouter();
  const settings = useSettings();
  const prefs = settings.preferences;
  const [retry, setRetry] = useState(0);
  // "Try again" asks for the shops' list again too (the 30-person meeting, 21 November 2026, Maya: when it had failed, Try again could never recover)
  const manifest = useShopManifest(retry);
  const available = useMemo<string[]>(() => (manifest ? RETAILERS.map((r): string => r.id).filter((id) => manifest.retailers.some((m) => m.id === id)) : []), [manifest]);
  const mine = useMemo(() => (settings.shops ?? []).filter((id) => available.includes(id)), [settings.shops, available]);
  const [picked, setPicked] = useState<Scope | null>(initialShop);
  const scope: Scope = picked && (picked === "mine" || picked === "all" || available.includes(picked)) ? picked : mine.length > 0 ? "mine" : "all";
  const ids = scope === "all" ? available : scope === "mine" ? mine : [scope];
  const [query, setQuery] = useEntryQuery(); // kept in the history entry, so Back from a product finds the search as it was left
  const [sort, setSort] = useState<ShopSort>("name");
  const [nutrition, setNutrition] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [scanning, setScanning] = useState(false);
  const [dietOn, setDietOn] = useState(true);
  const deferred = useDeferredValue(query);
  // a barcode typed in, as printed (leading zeros kept: 2026-11-20, 01318180 sent as 1318180 wasn't found)
  const code = barcodeDigits(deferred);
  // All shops loads nothing until something is typed, as Add food's search (the second pass, 21 November 2026, Xena #36: it loaded, sorted and grouped all nine
  // lists, 74,303 products, before a letter was typed); one shop or the person's own load at once, so the list shows as before
  const wantLists = scope !== "all" || !!code || deferred.trim().length >= 2;
  const lists = useShopLists(manifest && wantLists ? ids : [], retry);
  const loaded = lists.status === "ready" ? lists.loaded : null;
  const files = useMemo(() => new Map((loaded ?? []).map((l) => [l.file.retailer, l.file])), [loaded]);
  // every loaded product tagged with its shop, once for the set of shops (the lists themselves are shared and never changed)
  const pool = useMemo(() => tagShopProducts((loaded ?? []).map((l) => ({ shop: l.file.retailer, products: l.products }))), [loaded]);
  // which products at different shops are the same one, once for the set of shops
  const groupsOf = useMemo(() => sameProductGroups((loaded ?? []).map((l) => ({ shop: l.file.retailer, products: l.products }))), [loaded]);
  const filtering = anyFoodDiet(prefs);
  const diet = filtering && dietOn;
  // the diet settings, by each product's own name and aisle (allergens aren't read for these lists), worked out once for the shops and the settings
  const unsuited = useMemo(() => (filtering ? new Set(pool.filter((p) => foodDietProblem({ name: p.name, category: p.category }, prefs))) : null), [pool, prefs, filtering]);
  const results = useMemo(() => {
    if (code || !wantLists) return [];
    const found = searchShopProducts(pool, { query: deferred, nutrition, sort });
    const kept = diet && unsuited ? found.filter((p) => !unsuited.has(p)) : found;
    return groupProducts(kept.map((p) => ({ shop: p.shop ?? "", product: p })), groupsOf);
  }, [pool, deferred, nutrition, sort, diet, unsuited, code, groupsOf, wantLists]);
  // what the diet filter can promise: these lists are read by each product's name and aisle only (the second pass, Zara #52: it said "name, type and label")
  const dietLine = groceryDietLine(prefs, diet, t, { byName: true });
  // allergens aren't read for these lists, so the allergy settings hide nothing here: said whether or not the filter is on, as on a shop's own list (the 30-person
  // meeting, 21 November 2026, Maya)
  const avoid = prefs.avoidAllergens ?? [];
  const avoidNames = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(avoid.map((k) => t(ALLERGEN_LABEL[k])));
  const reset = () => setShown(PAGE);

  return (
    <div>
      <PageHeader back={{ href: "/app/groceries", label: t("Back to groceries") }} list />
      {/* the title says what the page does; no line repeating it (the words pass, 20 November 2026) */}
      <h1 className={`mt-5 ${TITLE}`}>{t("Search every shop")}</h1>

      <div className="mt-5 flex gap-2.5">
        <div className="group/search relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); reset(); }} placeholder={t("Search groceries")} aria-label={t("Search products or type a barcode")} {...DONE_KEY} autoComplete="off" className={`${PILL_INPUT} ps-11 pe-4 ${DONE_ROOM}`} />
          <SearchDone />
        </div>
        <button type="button" onClick={() => setScanning(true)} aria-label={t("Scan a barcode")} className="border-[1.5px] border-edge bg-card text-foreground inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition active:scale-95 hover:bg-background">
          <ScanIcon className="h-5 w-5" />
        </button>
      </div>

      <div role="group" aria-label={t("Supermarket")} className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
        {mine.length > 0 && <Chip selected={scope === "mine"} onClick={() => { setPicked("mine"); reset(); }}>{t("My shops")}</Chip>}
        <Chip selected={scope === "all"} onClick={() => { setPicked("all"); reset(); }}>{t("All shops")}</Chip>
        {available.map((id) => (
          <Chip key={id} selected={scope === id} onClick={() => { setPicked(id); reset(); }} className="gap-2 ps-1.5"><ShopMark shopId={id} size="xs" />{retailerName(id)}</Chip>
        ))}
      </div>
      <div role="group" aria-label={t("Filters")} className="no-scrollbar -mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5 empty:hidden">
        {filtering && <Chip selected={dietOn} onClick={() => { setDietOn((v) => !v); reset(); }}>{t("Fits my diet")}</Chip>}
        <Chip selected={nutrition} onClick={() => { setNutrition((v) => !v); reset(); }}>{t("Has nutrition")}</Chip>
      </div>
      <SelectField label={t("Sort")} className="mt-3.5" value={sort} onChange={(e) => { setSort(e.target.value as ShopSort); reset(); }}>
        {SHOP_SORTS.map((o) => (<option key={o.value} value={o.value}>{t(o.label)}</option>))}
      </SelectField>

      {code ? (
        // a barcode typed in: the product's own page (a shop's list where one has it, the person's own shop first)
        <Link href={scanHref(code) ?? "/app/groceries/search"} className={`${ROW} mt-6`}>
          <ScanIcon aria-hidden className="h-6 w-6 shrink-0 text-ink" />
          <span className="min-w-0 flex-1 text-base font-bold leading-snug">{t("Open the product with barcode {code}", { code })}</span>
          <ChevronRightIcon className="h-[18px] w-[18px] shrink-0 text-ink" />
        </Link>
      ) : !wantLists ? null : !manifest || lists.status === "loading" ? (
        <Spinner label={t("Loading products")} />
      ) : loaded && loaded.length === 0 ? (
        <div className="mt-4"><ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div>
      ) : (
        <>
          {lists.status === "ready" && lists.failed.length > 0 && (
            <div className="mt-4"><ErrorBox message={t("Couldn't load {shops}. Check your connection.", { shops: lists.failed.map(retailerName).join(", ") })} onRetry={() => setRetry((n) => n + 1)} /></div>
          )}
          {(sort === "density" || sort === "protein") && <p className={`mt-3.5 ${NOTE}`}>{sort === "density" ? t("Listed last: under 20 kcal or 5 g protein per 100 g, no numbers, or numbers for the cooked or prepared food.") : t("Listed last: no numbers, or numbers for the cooked or prepared food.")}</p>}
          {dietLine && <p className={`mt-3.5 ${NOTE}`}>{dietLine}</p>}
          {avoid.length > 0 && <AllergyNote className="mt-3.5"><p>{t("Allergens aren't read here, so nothing is hidden for {allergens}. Always check the pack.", { allergens: avoidNames })}</p></AllergyNote>}
          <p role="status" aria-live="polite" className="app-numbers mt-6 ps-1 text-sm font-semibold text-muted">{results.length === 1 ? t("1 product") : t("{n} products", { n: results.length.toLocaleString("en-GB") })}</p>
          {results.length === 0 ? (
            <div className="mt-3"><EmptyState icon={<EmptyIcon><SearchIcon /></EmptyIcon>} title={t("No products match.")} body={t("Try fewer words or another shop.")} /></div>
          ) : (
            <ul className="mt-2.5 space-y-3">
              {results.slice(0, shown).map((g) => (<li key={g.key}><GroupRow group={g} files={files} mine={mine} /></li>))}
            </ul>
          )}
          {results.length > shown && (
            <MoreButton onClick={() => setShown((n) => n + PAGE)}>{t("Show {n} more", { n: Math.min(PAGE, results.length - shown) })}</MoreButton>
          )}
        </>
      )}

      <FootNote>
        {t("Numbers are from each shop's own label where we've read it.")}{" "}
        {t("Some numbers are the same product's label at another shop, Open Food Facts (community data), or UK government figures for loose fruit and veg; each product says which.")}{" "}
        {t("Prices from each supermarket's own website. Not affiliated with any supermarket.")}
      </FootNote>

      {/* a scan opens the product: in a shop's full list where one has it (the person's own shop first), else its catalogue page, else "We don't have it yet" */}
      <Scanner open={scanning} onClose={() => setScanning(false)} onCode={(raw) => { setScanning(false); const href = scanHref(raw); if (href) router.push(href); }} />
    </div>
  );
}
