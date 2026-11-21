"use client";

import { warnPreferences } from "@/lib/mm/user-data";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loggableFromListed, loggableFromShop, withShopLabel, type LoggableProduct } from "@/lib/mm/addFood";
import { ALLERGEN_LABEL } from "@/lib/mm/allergens";
import { barcodeDigits, barcodeShown, labelledHits, normaliseBarcode, sameBarcode, scanHref, scannedItemHref, shopItemHref, type BarcodeHit } from "@/lib/mm/barcodes";
import { cheapestRetailer, forRetailer, formatPrice, mergeProducts, photoSources, priceRating, RETAILERS, retailerName, sizeVariants, type GroceryFile, type ListedProduct } from "@/lib/mm/groceries";
import { formatDate } from "@/lib/mm/format";
import { avoidedAllergens, foodDietNotChecked, foodDietProblem, listedFacts } from "@/lib/mm/foodDiet";
import type { Allergens, LogMeal } from "@/lib/mm/types";
import type { LogEntry } from "@/lib/mm/user-data";
import { withPhoto } from "@/lib/mm/groceries";
import type { CompareItem } from "@/lib/mm/compare";
import { CompareButton } from "../../_components/CompareButton";
import { compareFoodFromListed } from "../../_lib/compare";
import { AllergenTable } from "../../_components/Allergens";
import { shopNameFor, shopRowFor, useOpenFoodFacts } from "../../_components/addfood/findByBarcode";
import { DiaryButton, DiaryToast, NotFound, SourceNote, useTypedDiary } from "../../_components/addfood/ProductPick";
import { PremiumBadge } from "../../_components/PremiumBadge";
import { CopyIcon, ExternalIcon, InfoIcon, PencilIcon, PlusIcon, ScanIcon } from "../../_components/icons";
import { ShopMark } from "../../_components/ChainMark";
import { InfoLine } from "../../_components/Note";
import { PageHeader } from "../../_components/PageHeader";
import { Toast } from "../../_components/Toast";
import { AllergyNote, Button, ErrorBox, LinkButton, Spinner } from "../../_components/ui";
import { loadManifest, loadRetailer, productTitleClass } from "../../_lib/groceries";
import { useSettings } from "../../_lib/hooks";
import { usePossessive, useT } from "../../_lib/i18n";
import { Rich } from "../../_lib/Rich";
import { findBarcode, loadShopFile, loadShopManifest } from "../../_lib/shopProducts";
import { Scanner } from "../Scanner";
import { NutritionPanel } from "../NutritionPanel";
import { CARD, CHIP, CHIP_ON, FootNote, HEADING, LABEL, NOTE } from "../PageBits";
import { ProductPhotoFigure } from "../ProductPhoto";
import { ProductMini } from "../ProductMini";
import { addedText, listHref, useAddToList } from "../ListChoice";

// A product from the supermarket lists (docs/GROCERIES_PLAN.md): photo, per-100 g numbers, price where known, the 14 allergens, the barcode.
// Looks follow Home (founder 2026-10-15): one white card holding the picture, the name as a big title and the nutrition as Home's macro rows; the
// further label figures as the same rows in DM Mono; outlined chips for the shop and size switchers; 20 px corners throughout. The colour meeting (19 November
// 2026, approved by the founder that day): the shelf price in the body's ink, extra bold (never the link green: the biggest number must not look like a link
// or praise); "Lowest" as a square tag you can't tap; a price that opens a shop's site underlined with an external-link icon; adding to the list right under
// the prices, the shop you came from as the one ink pill and the others white with the edge, and what was added said in the one toast.
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

/** "missing": `name` is a shop list's name for a barcode it holds with no label (the typed entry starts with it), else "". */
type State = { status: "loading" } | { status: "missing"; name: string } | { status: "error" } | { status: "ready"; product: ListedProduct; all: ListedProduct[] };

/** A small tag beside a price ("Lowest", "Lowest with card") that can't be tapped: 6 px corners, bold ink words, flat in the page fill inside the card. */
const MARK = "inline-flex items-center rounded-[0.375rem] bg-fill px-2 py-1 text-[0.8125rem] font-bold leading-snug text-foreground";

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

/**
 * The numbers a shop list holds for this barcode from a shop's own label (or the same product's label at another shop), `prefer`'s first; null when none, and
 * undefined while they load (the 30-person meeting, 21 November 2026, Maya: the community numbers showed first and then changed).
 */
function useShopLabel(hit: BarcodeHit | null, prefer: string | null): LoggableProduct | null | undefined {
  const key = hit ? `${hit.code}|${prefer ?? ""}` : "";
  const [got, setGot] = useState<{ key: string; product: LoggableProduct | null } | null>(null);
  useEffect(() => {
    if (!hit) return;
    let live = true;
    (async () => {
      for (const h of labelledHits(hit, prefer)) {
        try {
          const { file, products } = await loadShopFile(h.shop);
          const p = products.find((x) => x.id === h.id);
          const l = p ? loggableFromShop(file, p) : null;
          if (l) { if (live) setGot({ key, product: l }); return; }
        } catch { /* that list can't load: try the next */ }
      }
      if (live) setGot({ key, product: null });
    })();
    return () => { live = false; };
  }, [hit, prefer, key]);
  if (!hit) return null;
  return got?.key === key ? got.product : undefined;
}

/**
 * A barcode none of our lists holds (founder 2026-11-20: "I just tried to scan Rice Krispies, but it didn't come up ... a massive UK database ... they can just add
 * it easy"): Open Food Facts, asked through our own API as Add food asks it (findByBarcode.ts; the phone never talks to it directly). Found with figures: its
 * photo, name and per-100 figures, said to be community data with the ODbL credit, and "Add to my food diary" as the page's one ink button. Nobody has figures (or
 * no barcode to ask): the calm "We don't have this one yet" and "Type the numbers from the pack" (starting with Open Food Facts' name where it knows the product).
 */
function NotInOurLists({ digits, name = "" }: { digits: string | null; /** A shop list's name for it, where one holds it with no label. */ name?: string }) {
  const t = useT();
  const router = useRouter();
  const [retry, setRetry] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [diary, setDiary] = useState<{ entry: LogEntry; meal: LogMeal } | null>(null);
  const added = (entry: LogEntry, meal: LogMeal) => setDiary({ entry, meal });
  const typed = useTypedDiary(added);
  const off = useOpenFoodFacts(digits, digits ? name || t("Barcode {code}", { code: digits }) : "", retry);
  const again = <Button variant="secondary" full className="min-h-12" onClick={() => setScanning(true)}><ScanIcon aria-hidden className="h-5 w-5" />{t("Scan again")}</Button>;
  const ends = (
    <>
      <Scanner open={scanning} onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); const href = scanHref(c); if (href) router.replace(href); }} />
      {typed.sheet}
      <DiaryToast added={diary} onClose={() => setDiary(null)} />
    </>
  );

  if (off?.status === "loading") return (<><Spinner label={t("Looking it up")} />{ends}</>);
  if (off?.status === "found") {
    const p = off.products[0]!;
    const l = p.label;
    const per = t("per 100 {unit}", { unit: p.per });
    const rows: Array<[string, string]> = [
      ...(l.saturates !== undefined ? [[t("Saturates"), `${l.saturates}g`] as [string, string]] : []),
      ...(l.sugars !== undefined ? [[t("Sugars"), `${l.sugars}g`] as [string, string]] : []),
      ...(l.fibre !== undefined ? [[t("Fibre"), `${l.fibre}g`] as [string, string]] : []),
      ...(l.salt !== undefined ? [[t("Salt"), `${l.salt}g`] as [string, string]] : []),
    ];
    return (
      <>
        <div className={`${CARD} mt-3.5 overflow-hidden p-5`}>
          <ProductPhotoFigure sources={p.photos} />
          {p.brand && <p className="kicker">{p.brand}</p>}
          <h1 className={`${p.brand ? "mt-1.5" : ""} ${productTitleClass(p.name)}`}>{p.name}</h1>
          {p.size && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{p.size}</p>}
          {/* the food diary is why it was scanned: the page's one ink button, under the name */}
          <DiaryButton main product={p} className="mt-5 min-h-[3.25rem] text-base" onAdded={added} />
          <div className="mt-7">
            <NutritionPanel
              kcal={l.kcal} protein={l.protein} carbs={l.carbs} fat={l.fat} basis={per} rows={rows}
              groupLabel={t("{name}, {kcal} calories, {protein} grams protein, {carbs} grams carbs, {fat} grams fat {per}", { name: p.name, kcal: l.kcal, protein: l.protein, carbs: l.carbs, fat: l.fat, per })}
            />
          </div>
        </div>
        {/* community data, said so, with the Open Database Licence credit (the photo's own caption credits it) */}
        <div className="mt-3 px-1"><SourceNote product={p} photoCredit={false} /></div>
        <div className="mt-4">{again}</div>
        {ends}
      </>
    );
  }
  // nobody has figures, or Open Food Facts couldn't be asked: the calm line (or the connection said), and typing the numbers from the pack
  const badge = typed.paid ? <PremiumBadge /> : null;
  return (
    <>
      <div className="mt-4">
        {off?.status === "error" ? (
          <div className="space-y-3">
            {/* the connection only when it is the connection (Open Food Facts down, or our server busy, isn't: the 30-person meeting, 21 November 2026) */}
            <ErrorBox message={off.offline ? t("Couldn't look it up. Check your connection.") : t("Couldn't look it up just now. Try again.")} onRetry={() => setRetry((n) => n + 1)} />
            <Button variant="secondary" full className="min-h-12" onClick={() => typed.type(name)}><PencilIcon aria-hidden className="h-5 w-5" />{t("Type the numbers from the pack")}{badge}</Button>
          </div>
        ) : (
          <NotFound name={off?.status === "missing" ? off.name || name : name} code={digits ?? undefined} onType={typed.type} badge={badge} />
        )}
      </div>
      <div className="mt-2.5 grid gap-2.5">
        {again}
        <LinkButton href="/app/groceries/search" variant="secondary" full>{t("Search the supermarkets")}</LinkButton>
      </div>
      {ends}
    </>
  );
}

export function ProductScreen({ code, retailerHint, scan = false }: { code: string; retailerHint: string | null; scan?: boolean }) {
  const t = useT();
  const poss = usePossessive();
  const router = useRouter();
  const settings = useSettings();
  // the warning lines on this one product: the app's filters and what the person told us at sign-up (a warning, never a filter: founder 2026-11-21)
  const prefs = warnPreferences(settings);
  const mineKey = (settings.shops ?? []).join(",");
  // the barcode as printed: a link from a screen that dropped the leading zeros (an EAN-8 such as 01318180 arriving as 1318180) gets its 8 digits back, and it is
  // looked up in that form (2026-11-20: the 7 digits left after stripping were too short to look up, so 01318180 said "We don't have it yet")
  const digits = barcodeDigits(barcodeShown(code));
  // the files key barcodes with the leading zeros stripped; "" (all zeros) is no barcode
  const wanted = digits ? normaliseBarcode(digits) || null : null;
  const [retry, setRetry] = useState(0);
  const key = `${digits}|${retailerHint ?? ""}|${scan}|${retry}`;
  const [loaded, setLoaded] = useState<{ key: string; state: State; hit: BarcodeHit | null } | null>(null);
  const state: State = loaded?.key === key ? loaded.state : { status: "loading" };
  const hit = loaded?.key === key ? loaded.hit : null;
  const [added, setAdded] = useState<{ text: string; href: string; n: number } | null>(null);
  const [diary, setDiary] = useState<{ entry: LogEntry; meal: LogMeal } | null>(null);
  // to the main list, or (when the person has lists for that shop) the one they choose; said in the toast, each add a new one, and an add that changed nothing says
  // why (addedText)
  const { add, sheet } = useAddToList((list, _item, outcome) => { setDiary(null); setAdded((was) => ({ text: addedText(t, list, outcome), href: listHref(list?.id), n: (was?.n ?? 0) + 1 })); });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const done = (st: State, h: BarcodeHit | null = null) => { if (!cancelled) setLoaded({ key, state: st, hit: h }); };
    (async () => {
      try {
        if (!digits || !wanted) return done({ status: "missing", name: "" });
        const mine = mineKey ? mineKey.split(",") : [];
        // where the barcode is (public/groceries/all/barcodes.json); undefined when that file can't be loaded (then every catalogue file is looked in)
        let found: BarcodeHit | null | undefined;
        try { found = await findBarcode(digits, mine); } catch { found = undefined; }
        // only shops whose lists this copy of the app has (the iPhone app can be packed with fewer shops than the barcode file names)
        if (found) {
          const [lists, cat] = await Promise.all([loadShopManifest(), loadManifest().catch(() => null)]);
          const shops = found.shops.filter((h) => lists.retailers.some((r) => r.id === h.shop));
          const catalogue = cat ? found.catalogue.filter((id) => cat.retailers.some((r) => r.id === id)) : found.catalogue;
          found = shops.length || catalogue.length ? { ...found, shops, catalogue } : null;
        }
        if (cancelled) return;
        // a scan of a product in a shop's full list opens that shop's own page for it where a row there has its numbers (the person's own shop first); so does a link
        // to a barcode only those lists hold. A scan whose rows have no numbers goes on to Open Food Facts and "Type the numbers from the pack" (the 30-person
        // meeting, 21 November 2026, Maya and Grace: it opened a page with no numbers and no food diary, and Open Food Facts was never asked). Where the catalogue
        // holds it too, the build left its numbers out on purpose, so the shop's page opens, scan or link, and the person types them from the pack (the second pass,
        // Yusuf #38: "Numbers the build threw out on purpose come back", Nesquik powder at 64.1 kcal)
        if (found && found.shops.length > 0) {
          const target = shopRowFor(found, { scan, hint: retailerHint, mine });
          if (target) {
            // a scan says so, and that page then puts "Add to my food diary" first
            router.replace(scan ? scannedItemHref(target) : shopItemHref(target));
            return;
          }
        }
        if (found === null || (found && found.catalogue.length === 0)) return done({ status: "missing", name: await shopNameFor(found ?? null) }, found ?? null);
        // only the catalogue files that hold this barcode, all at once (2026-11-20: every file, one after another, about 10 MB, before anything showed)
        let ids: string[];
        if (found) ids = [...found.catalogue.filter((r) => r === retailerHint), ...found.catalogue.filter((r) => r !== retailerHint)];
        else {
          const manifest = await loadManifest();
          ids = [...(retailerHint ? [retailerHint] : []), ...RETAILERS.map((r) => r.id).filter((id) => id !== retailerHint)].filter((id) => manifest.retailers.some((m) => m.id === id));
        }
        const files: GroceryFile[] = await Promise.all(ids.map((id) => loadRetailer(id)));
        // the code the files hold it under (a UPC-E scan is found by its UPC-A), compared without leading zeros
        const held = found?.code ?? wanted;
        // a shop counts only where its own list shows the price; a scanned barcode no shop prices still opens with its numbers
        const priced = mergeProducts(files, { pricedOnly: true });
        const pricedHit = priced.find((p) => sameBarcode(p.gtin, held));
        const all = pricedHit ? priced : mergeProducts(files);
        const product = pricedHit ?? all.find((p) => sameBarcode(p.gtin, held));
        done(product ? { status: "ready", product, all } : { status: "missing", name: await shopNameFor(found ?? null) }, found ?? null);
      } catch {
        done({ status: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [key, digits, wanted, retailerHint, scan, mineKey, router]);

  const listed = state.status === "ready" ? state.product : null;
  // Opened from a supermarket: that shop's own name, size, numbers and price lead; the others are listed below it.
  const selected = listed ? (retailerHint && listed.retailers.includes(retailerHint) ? retailerHint : listed.retailers[0]!) : null;
  // the shop's own label always wins over community numbers (2026-11-20: the same product showed two sets of numbers, and Add food logged the wrong one); while it
  // loads, nothing it would change is shown (the 30-person meeting, 21 November 2026, Maya: the community numbers flashed first)
  const labelled = useShopLabel(listed ? hit : null, selected);
  const labelLoading = labelled === undefined && !!hit && labelledHits(hit, selected).length > 0;
  const shopLabel = labelled ?? null;

  const back = <PageHeader back={{ href: "/app/groceries", label: t("Back to groceries") }} list />;
  if (state.status === "loading") return (<div>{back}<Spinner label={t("Loading product")} /></div>);
  if (state.status === "error") return (<div>{back}<div className="mt-4"><ErrorBox message={t("Couldn't load this product. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} /></div></div>);
  if (state.status === "missing" || !listed || !selected) return (<div>{back}<NotInOurLists key={digits ?? ""} digits={wanted ? digits : null} name={state.status === "missing" ? state.name : ""} /></div>);

  const p = forRetailer(listed, selected);
  const cheapestPrice = Math.min(...Object.values(listed.prices).map((x) => x.amount));
  const photos = photoSources(listed, selected);
  const sizes = sizeVariants(state.all, listed);
  const rating = priceRating(state.all, listed, selected);
  const cheapest = cheapestRetailer(listed);
  const cheapestCard = cheapestRetailer(listed, true);
  const pricedCount = Object.keys(listed.prices).length;
  const cardLowest = (r: string) => pricedCount > 1 && cheapestCard === r && !!listed.prices[r]?.member && cheapestCard !== cheapest;
  const here = listed.prices[selected];
  const otherShops = listed.retailers
    .filter((r) => r !== selected)
    .sort((a, b) => (listed.prices[a]?.amount ?? Number.POSITIVE_INFINITY) - (listed.prices[b]?.amount ?? Number.POSITIVE_INFINITY));
  const typeLabel = (listed.type ?? "").replace(/-/g, " ");
  const allergens: Allergens | null = p.allergens ? { contains: p.allergens.contains, mayContain: p.allergens.mayContain } : null;
  // the numbers shown: a shop's label for this barcode where a shop list holds one, else this record's own
  const fig = shopLabel
    ? { kcal: shopLabel.label.kcal, protein: shopLabel.label.protein, carbs: shopLabel.label.carbs, fat: shopLabel.label.fat, saturates: shopLabel.label.saturates, sugars: shopLabel.label.sugars, fibre: shopLabel.label.fibre, salt: shopLabel.label.salt, kj: shopLabel.label.kj }
    : { kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, saturates: p.saturates, sugars: p.sugars, fibre: p.fibre, salt: p.salt, kj: p.kj };
  const per = shopLabel ? (shopLabel.state ? t("per 100 {unit} ({state})", { unit: shopLabel.per, state: shopLabel.state }) : t("per 100 {unit}", { unit: shopLabel.per })) : t("per 100 {unit}", { unit: p.per });
  const rows: Array<[string, string]> = [
    ...(fig.kj !== undefined ? [[t("Energy"), `${fig.kj.toLocaleString("en-GB")} kJ`] as [string, string]] : []),
    ...(fig.saturates !== undefined ? [[t("Saturates"), `${fig.saturates}g`] as [string, string]] : []),
    ...(fig.sugars !== undefined ? [[t("Sugars"), `${fig.sugars}g`] as [string, string]] : []),
    ...(fig.fibre !== undefined ? [[t("Fibre"), `${fig.fibre}g`] as [string, string]] : []),
    ...(fig.salt !== undefined ? [[t("Salt"), `${fig.salt}g`] as [string, string]] : []),
  ];
  const containsCount = p.allergens?.contains.length ?? 0;
  const dietProblem = foodDietProblem(listedFacts(listed), prefs);
  const avoided = dietProblem === "allergen" ? avoidedAllergens(p.allergens, prefs.avoidAllergens ?? []) : null;
  // the other diet settings (vegetarian, halal...) on their own: the allergy check comes first and stops there, so they are asked again without it, and a
  // vegetarian who avoids nuts still hears the chicken doesn't fit (the second pass, Zara #53: the diet line was hidden whenever an allergy was set and the record had none)
  const dietOnly = dietProblem === "allergen" ? foodDietProblem(listedFacts(listed), { ...prefs, avoidAllergens: [] }) : dietProblem;
  const names = (keys: readonly (keyof typeof ALLERGEN_LABEL)[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(keys.map((k) => t(ALLERGEN_LABEL[k])));
  const notChecked = foodDietNotChecked(prefs, t);
  const outLink = "font-semibold text-accent underline underline-offset-4";
  const loggable = shopLabel ? withShopLabel(loggableFromListed(listed, selected), shopLabel) : loggableFromListed(listed, selected);
  // Compare takes the figures the page shows: a shop's label where one is read (the 30-person meeting, 21 November 2026, Maya: it added the community numbers),
  // said as another shop's when the label is from another shop's page
  const compareBase = compareFoodFromListed(listed, selected);
  const labelFrom = shopLabel ? (shopLabel.source.kind === "same" ? shopLabel.source.shop : shopLabel.shop ?? selected) : selected;
  const compareItem: CompareItem = shopLabel
    ? {
        ...compareBase,
        basis: shopLabel.per,
        numbers: { kcal: fig.kcal, protein: fig.protein, carbs: fig.carbs, sugars: fig.sugars ?? null, fat: fig.fat, saturates: fig.saturates ?? null, fibre: fig.fibre ?? null, salt: fig.salt ?? null },
        source: labelFrom === selected ? "label" : "same",
        ...(labelFrom === selected ? {} : { sourceShop: retailerName(labelFrom) }),
        ...(shopLabel.state ? { note: shopLabel.state } : {}),
      }
    : compareBase;
  const shopsToAdd = [...p.retailers].sort((x, y) => Number(y === selected) - Number(x === selected));
  const others = shopsToAdd.length - 1;

  return (
    <div>
      {back}
      <div className={`${CARD} mt-3.5 overflow-hidden p-5`}>
        <ProductPhotoFigure sources={photos} />
        {p.brand && <p className="kicker">{p.brand}</p>}
        <h1 className={`${p.brand ? "mt-1.5" : ""} ${productTitleClass(p.name)}`}>{p.name}</h1>
        {p.size && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{p.size}</p>}
        {/* the person's own allergens: the one amber note, naming them; any other diet setting (vegetarian, halal...): the calm info line, under the note when both apply */}
        {dietProblem === "allergen" && (
          <AllergyNote className="mt-4"><p>{avoided === null
            ? t("No allergen record for this product, so we can't check it for your allergies. Check the pack.")
            : avoided.contains.length > 0
              ? t("Contains {allergens}, which you avoid.", { allergens: names(avoided.contains) })
              : t("May contain {allergens}.", { allergens: names(avoided.mayContain) })}</p></AllergyNote>
        )}
        {dietOnly && <InfoLine heading={null} className={dietProblem === "allergen" ? "mt-3" : "mt-4"}>{t("This product doesn't fit your diet settings, going by its name, type and label.")}</InfoLine>}
        {notChecked && <InfoLine heading={null} className="mt-3">{notChecked}</InfoLine>}
        {/* reached by a scan: the food diary is why, so its button is the page's one ink button, under the name and any allergy note (the design review of 2026-11-20) */}
        {scan && !labelLoading && <DiaryButton main product={loggable} className="mt-5 min-h-[3.25rem] text-base" onAdded={(entry, meal) => { setAdded(null); setDiary({ entry, meal }); }} />}
        {/* one spinner in the numbers' place while the shop's label loads; the source line, the diary button and Compare wait for it too */}
        <div className="mt-7">
          {labelLoading ? <Spinner label={t("Loading product")} /> : (
            <NutritionPanel
              kcal={fig.kcal} protein={fig.protein} carbs={fig.carbs} fat={fig.fat} basis={per} rows={rows}
              groupLabel={t("{name}, {kcal} calories, {protein} grams protein, {carbs} grams carbs, {fat} grams fat {per}", { name: p.name, kcal: fig.kcal, protein: fig.protein, carbs: fig.carbs, fat: fig.fat, per })}
            />
          )}
        </div>
        {p.serving && !shopLabel && !labelLoading && (
          <p className={`app-numbers mt-5 rounded-2xl bg-fill px-4 py-3 ${NOTE}`}>
            {t("Per serving ({size}): {kcal} kcal · {protein} g protein · {carbs} g carbs · {fat} g fat", { size: p.serving.size, kcal: Math.round(p.serving.kcal), protein: p.serving.protein, carbs: p.serving.carbs, fat: p.serving.fat })}
          </p>
        )}
      </div>

      <p className={`mt-3 px-1 ${NOTE} ${labelLoading ? "hidden" : ""}`}>
        {shopLabel
          ? shopLabel.source.kind === "same"
            ? t("Read from the same product's page on {shopPossessive} website.", { shopPossessive: poss(retailerName(shopLabel.source.shop)) })
            : t("Read from the product's own page on {shopPossessive} website.", { shopPossessive: poss(retailerName(shopLabel.shop ?? selected)) })
          : p.source === "retailer"
            ? <Rich text={p.checkedOn ? t("Numbers from {link}, checked {date}.", { date: formatDate(p.checkedOn, t) }) : t("Numbers from {link}.")} values={{ link: <a className="underline underline-offset-4" href={p.pageUrl} target="_blank" rel="noopener noreferrer">{t("{shop}'s own product page", { shop: retailerName(selected) })}<span className="sr-only"> {t("(opens in a new tab)")}</span></a> }} />
            : <>{t("Numbers from Open Food Facts contributors (community data), not the supermarket.")}</>}
      </p>

      {listed.retailers.length > 1 && (
        <nav aria-label={t("Supermarket")} className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
          {listed.retailers.map((r) => (
            <Link key={r} href={`/app/groceries/product?code=${listed.gtin}&r=${r}`} replace prefetch={false} aria-current={r === selected ? "page" : undefined}
              className={`${r === selected ? CHIP_ON : CHIP} gap-2 pe-4 ps-1.5`}>
              <ShopMark shopId={r} size="xs" />{retailerName(r)}
              {/* its price there, beside its logo (founder 2026-11-18) */}
              {listed.prices[r] && <span className={`app-numbers ${listed.prices[r]!.amount === cheapestPrice && listed.retailers.length > 1 ? "font-extrabold" : "font-semibold"}`}>{formatPrice(listed.prices[r]!.amount)}</span>}
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
                className={`${v.gtin === listed.gtin ? CHIP_ON : CHIP} gap-2 pe-4 ps-1.5`}>
                {/* each size's own pack photo, like the shops' logos in the chips above (a multipack is easier to spot); the size stays the label */}
                <ProductMini sources={photoSources(v, selected)} />{forRetailer(v, selected).size || t("Size not stated")}
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
              <span className="text-[2.5rem] font-[800] leading-none tracking-[-0.03em] text-foreground">{formatPrice(here.amount)}</span>
              {here.perUnit && <span className="text-[0.9375rem] text-muted">{formatPrice(here.perUnit.amount)} {here.perUnit.unit}</span>}
            </p>
            {here.member && (
              <p className="app-numbers mt-3 text-base">
                <span className="font-bold text-foreground">{formatPrice(here.member.amount)}</span> <span className="font-semibold">{t("with {scheme}", { scheme: here.member.scheme.replace(/ price$/i, "") })}</span>
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
                      <Link href={`/app/groceries/product?code=${listed.gtin}&r=${r}`} replace prefetch={false} className="inline-flex min-h-11 items-center text-[0.9375rem] font-bold underline underline-offset-4">{retailerName(r)}</Link>
                      {price && cheapest === r && pricedCount > 1 && <span className={`ms-2 ${MARK} py-0.5`}>{t("Lowest")}</span>}
                      {price && cardLowest(r) && <span className={`ms-2 ${MARK} py-0.5`}>{t("Lowest with card")}</span>}
                      <span className="block text-[0.8125rem] text-muted">{price ? t("checked {date}", { date: formatDate(price.checkedOn, t) }) : t("price not read yet")}</span>
                    </span>
                    <span className="app-numbers shrink-0 text-end">
                      {price ? (
                        <>
                          <a className="inline-flex min-h-11 items-center gap-1 text-base font-bold text-foreground underline underline-offset-4" href={price.url} target="_blank" rel="noopener noreferrer">{formatPrice(price.amount)}<ExternalIcon aria-hidden className="h-3.5 w-3.5 shrink-0" /><span className="sr-only"> {t("at {shop} (opens in a new tab)", { shop: retailerName(r) })}</span></a>
                          {diff !== null && diff !== 0 && <span className="block text-[0.8125rem] text-muted">{diff < 0 ? t("{price} cheaper", { price: formatPrice(Math.abs(diff)) }) : t("{price} more", { price: formatPrice(Math.abs(diff)) })}</span>}
                          {diff === 0 && <span className="block text-[0.8125rem] text-muted">{t("same price")}</span>}
                          {price.member && <span className="block text-[0.8125rem] font-semibold text-foreground">{t("{price} with {scheme}", { price: formatPrice(price.member.amount), scheme: price.member.scheme.replace(/ price$/i, "") })}</span>}
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
          {/* the shop you came from first, across the card's width; the others in equal cells two to a row under it (one a row at large text); a lone one
              left over takes the whole row */}
          {shopsToAdd.map((r, i) => (
            // the shelf price that shop's list shows goes with it, as from every other page (the 30-person meeting, 21 November 2026, Leo: it was dropped)
            <Button key={r} variant={r === selected && !scan ? "primary" : "secondary"} className={r === selected || (others % 2 === 1 && i === shopsToAdd.length - 1) ? "col-span-full" : "px-3! text-balance"} onClick={() => add({ gtin: listed.gtin, retailer: r, name: forRetailer(listed, r).name, brand: listed.brand, size: forRetailer(listed, r).size, ...(listed.prices[r] ? { price: listed.prices[r]!.amount, checkedOn: listed.prices[r]!.checkedOn } : {}), ...withPhoto(photoSources(listed, r)) })}>
              {r === selected && <PlusIcon className="h-[18px] w-[18px]" />}{r === selected ? t("Add to my list") : t("Add · {shop}", { shop: retailerName(r) })}
            </Button>
          ))}
        </div>
        {/* the food diary: the same "How much?" step as Add food (founder 2026-11-20); at the top instead when the page was reached by a scan */}
        {!scan && !labelLoading && <DiaryButton product={loggable} className="mt-2.5" onAdded={(entry, meal) => { setAdded(null); setDiary({ entry, meal }); }} />}
        {added && (
          <Toast key={added.n} onClose={() => setAdded(null)}>
            <span>{added.text}</span> <Link href={added.href} className="font-bold text-on-ink underline underline-offset-2">{t("Open your shopping list")}</Link>
          </Toast>
        )}
        <DiaryToast added={diary} onClose={() => setDiary(null)} />
        {sheet}
      </div>

      {!labelLoading && <div className="mt-3.5"><CompareButton full item={compareItem} /></div>}

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

      {p.ingredients && (
        <section aria-labelledby="ingredients-heading" className={`${CARD} mt-3.5 p-5`}>
          <h2 id="ingredients-heading" className={HEADING}>{t("Ingredients")}</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed">{p.ingredients}</p>
          <p className={`mt-3 ${NOTE}`}>{p.checkedOn ? t("As printed on {shop}'s website, checked {date}.", { shop: retailerName(selected), date: formatDate(p.checkedOn, t) }) : t("As printed on {shop}'s website.", { shop: retailerName(selected) })} {t("Products change, so check the pack.")}</p>
        </section>
      )}

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
          {rating.proteinPerPound > 0 && <p className="app-numbers mt-1.5 text-[0.9375rem] leading-snug text-muted">{t("{g} g of protein for every £1.", { g: rating.proteinPerPound })}</p>}
          <p className={`mt-3 ${NOTE}`}>{typeLabel ? t("Compared with the other {type} we have prices for, using the lowest price we've read for each. This is about price only.", { type: typeLabel }) : t("Compared with other similar products we have prices for, using the lowest price we've read for each. This is about price only.")}</p>
        </section>
      )}

      <section aria-labelledby="allergens-heading" className={`${CARD} mt-3.5 overflow-hidden`}>
        <div className="px-5 pt-5">
          <h2 id="allergens-heading" className={HEADING}>{t("Allergens")}</h2>
          {/* "check the pack" on its own is the calm info line (amber is kept for the person's own allergens) */}
          {allergens === null
            ? <InfoLine heading={null} className="mt-2">{t("Allergen information isn't recorded for this product. Check the pack.")}</InfoLine>
            : <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{containsCount === 0 ? t("None of the 14 main allergens recorded as an ingredient.") : t("Contains {n} of the 14 main allergens.", { n: containsCount })}</p>}
        </div>
        {p.advice && (
          <p className="mx-5 mt-4 rounded-2xl bg-fill px-4 py-3 text-[0.9375rem] leading-snug">
            <span className="font-bold">{t("{shop}'s allergy advice:", { shop: retailerName(selected) })} </span>{p.advice}
          </p>
        )}
        {allergens && <AllergenTable allergens={allergens} caption={t("Allergens in {name}, from Open Food Facts contributors", { name: p.name })} columnLabel={t("This product")} />}
        <p className={`flex gap-2 border-t border-line px-5 py-4 ${NOTE}`}>
          <InfoIcon className="mt-px h-4 w-4 shrink-0 text-foreground" />
          <span>{p.updated ? t("Community data from Open Food Facts, last edited {date}: products change and entries can be wrong, so always read the pack before you buy.", { date: formatDate(p.updated, t) }) : t("Community data from Open Food Facts: products change and entries can be wrong, so always read the pack before you buy.")} {t("“Not listed” means nothing is recorded, not that the product is free from it.")}</span>
        </p>
      </section>

      <section aria-labelledby="barcode-heading" className={`${CARD} mt-3.5 flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div className="min-w-0">
          <h2 id="barcode-heading" className={LABEL}>{t("Barcode")}</h2>
          <p className="app-numbers mt-1.5 select-all font-mono text-base tracking-[0.04em] [overflow-wrap:anywhere]">{p.gtin}</p>
        </div>
        <Button variant="secondary" className="shrink-0 whitespace-nowrap" onClick={() => { void navigator.clipboard?.writeText(p.gtin).then(() => setCopied(true), () => undefined); }}><CopyIcon className="h-5 w-5" />{copied ? t("Copied") : t("Copy")}</Button>
      </section>

      <FootNote>
        {t("Not affiliated with {shop}.", { shop: p.retailers.map(retailerName).join(", ") })} <Rich text={t("Data: {link}, licensed under the Open Database Licence.")} values={{ link: <a className="underline underline-offset-4" href={`https://world.openfoodfacts.org/product/${p.gtin}`} target="_blank" rel="noopener noreferrer">{t("this product on Open Food Facts")}<span className="sr-only"> {t("(opens in a new tab)")}</span></a> }} />
      </FootNote>
    </div>
  );
}
