"use client";

import { needsPaywall } from "@/lib/mm/entitlements";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ADD_TO, ADDED_TO, amountChoices, amountNutrients, amountText, loggableFromListed, loggableFromShop, MAX_AMOUNT, MIN_AMOUNT, parseAmount, productEntry, startAmount, withShopLabel, type AmountChoice, type LoggableProduct } from "@/lib/mm/addFood";
import { analytics } from "@/lib/mm/analytics";
import { hasLabel, normaliseBarcode } from "@/lib/mm/barcodes";
import { LOG_MEAL_LABEL, LOG_MEALS, mealSlotFor } from "@/lib/mm/budget";
import { mergeProducts, retailerName, withPhoto } from "@/lib/mm/groceries";
import { searchShopProducts, type ShopManifest } from "@/lib/mm/shopProducts";
import { normalizeForSearch } from "@/lib/mm/search";
import { addLogEntry, countProAction, deleteLogEntry } from "@/lib/mm/stores";
import type { LogMeal, Nutrients } from "@/lib/mm/types";
import type { LogEntry } from "@/lib/mm/user-data";
import { NumberDone } from "../SearchDone";
import { AlertCircleIcon, PlusIcon, ScanIcon } from "../icons";
import { InfoLine } from "../Note";
import { useGate } from "../Paywall";
import { PremiumBadge } from "../PremiumBadge";
import { Toast } from "../Toast";
import { Button, Chip, ErrorBox, inputClass, Sheet, Spinner } from "../ui";
import { loadRetailer } from "../../_lib/groceries";
import { useIsPro, useSettings } from "../../_lib/hooks";
import { usePossessive, useT } from "../../_lib/i18n";
import { findBarcode, loadShopFile, useShopLists, useShopManifest } from "../../_lib/shopProducts";
import { PhotoTile } from "../../groceries/ProductPhoto";
import { Scanner } from "../../groceries/Scanner";
import { ChoosePill, PICK_LIST, PickRow, SheetSearch, type NewEntry } from "./parts";

// "Choose a supermarket product": found by name in the person's own supermarkets' full lists (or one shop they pick), or by its barcode (typed, or read by the
// camera; founder 2026-11-20: "when they scan a barcode of a product, it needs to come up with the product and they can input in and it's their food thing"),
// then how much was had, in grams or millilitres. The figures are the product's label per 100 g or 100 ml times the amount over 100: plain arithmetic, shown
// before it is added. A figure the label doesn't print stays out. The shop's own label always wins (2026-11-20: Add food had logged community numbers that
// contradicted it); community numbers only for a barcode no shop list holds, and said so. The product's picture goes with the entry, for Home and Today.

const RESULTS = 8;
/** How many shops a search covers at once when it is "My shops" (each is a full list held in memory). */
const MAX_SEARCH_SHOPS = 3;

/** Grams as the screens show them: whole from 10 g, one decimal below, with a space ("1.4 g", "23 g"). */
const grams = (v: number) => `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}\u00a0g`;

/** The shops with labels a search can use: the person's own first (in their order), then the others by how many labels we've read. */
export function labelShops(manifest: ShopManifest | null, mine: readonly string[]): string[] {
  const all = (manifest?.retailers ?? []).filter((r) => (r.nutrition ?? 0) > 0);
  const own = mine.filter((id) => all.some((r) => r.id === id));
  const rest = [...all].sort((a, b) => (b.nutrition ?? 0) - (a.nutrition ?? 0)).map((r) => r.id).filter((id) => !own.includes(id));
  return [...own, ...rest];
}

/**
 * The products a barcode opens, best first (the person's own shops first): every shop list row with numbers for it; for a barcode no shop list holds, the
 * older catalogue's record (community numbers, said so), with only the catalogue files that hold it loaded. Empty when we have no numbers for it.
 */
export async function productsForBarcode(code: string, mine: readonly string[]): Promise<LoggableProduct[]> {
  const hit = await findBarcode(code, mine);
  if (!hit) return [];
  const rows = hit.shops.filter(hasLabel);
  if (rows.length > 0) {
    const shops = [...new Set(rows.map((h) => h.shop))];
    const lists = await Promise.allSettled(shops.map((s) => loadShopFile(s)));
    const out: LoggableProduct[] = [];
    for (const h of rows) {
      const got = lists[shops.indexOf(h.shop)];
      if (got?.status !== "fulfilled") continue;
      const p = got.value.products.find((x) => x.id === h.id);
      const l = p ? loggableFromShop(got.value.file, p) : null;
      if (l && !out.some((x) => x.key === l.key)) out.push(l);
    }
    if (out.length === 0 && lists.every((x) => x.status === "rejected")) throw new Error("the shop lists couldn't be loaded");
    return out;
  }
  if (hit.shops.length > 0 || hit.catalogue.length === 0) return [];
  const loaded = await Promise.allSettled(hit.catalogue.map((r) => loadRetailer(r)));
  const files = loaded.flatMap((x) => (x.status === "fulfilled" ? [x.value] : []));
  if (files.length === 0) throw new Error("the catalogue couldn't be loaded");
  const found = mergeProducts(files).find((p) => p.gtin.replace(/^0+/, "") === hit.code);
  return found ? [loggableFromListed(found, hit.catalogue.find((r) => mine.includes(r)) ?? hit.catalogue[0] ?? null)] : [];
}

type CodeState = { code: string; status: "loading" } | { code: string; status: "ready"; products: LoggableProduct[] } | { code: string; status: "error" };

export function ProductPick({ meal, onAdd, onBack, header }: { meal: LogMeal; onAdd: (entry: NewEntry) => void; onBack: () => void; header: (onBack: () => void) => ReactNode }) {
  const t = useT();
  const mine = useSettings().shops ?? [];
  const mineKey = mine.join(",");
  const manifest = useShopManifest();
  const shops = useMemo(() => labelShops(manifest, mineKey ? mineKey.split(",") : []), [manifest, mineKey]);
  const ownShops = useMemo(() => shops.filter((s) => mineKey.split(",").includes(s)), [shops, mineKey]);
  // which shops a search covers: the person's own (null: "My shops") or one they tap; with no shops of their own, the one with the most labels
  const [scope, setScope] = useState<string | null>(null);
  const searchIds = scope ? [scope] : ownShops.length > 0 ? ownShops.slice(0, MAX_SEARCH_SHOPS) : shops.slice(0, 1);
  const searchKey = searchIds.join(",");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query).trim();
  const code = normaliseBarcode(deferred);
  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<LoggableProduct | null>(null);
  // the lists load only once something is typed (2026-11-20: never all of them when the sheet opens)
  const lists = useShopLists(!code && deferred.length >= 2 ? searchIds : [], retry);
  const results = useMemo(() => {
    if (code || deferred.length < 2 || lists.status !== "ready") return [];
    const out: LoggableProduct[] = [];
    for (const id of searchKey.split(",")) {
      const l = lists.loaded.find((x) => x.file.retailer === id);
      if (!l) continue;
      // the plain thing before the flavoured or the multipack (the shorter name first), then A to Z
      const found = searchShopProducts(l.products, { query: deferred, nutrition: true }).map((p) => ({ p, len: normalizeForSearch(p.name).length }));
      found.sort((a, b) => a.len - b.len);
      for (const { p } of found) {
        const x = loggableFromShop(l.file, p);
        if (x) out.push(x);
        if (out.length >= RESULTS) return out;
      }
    }
    return out;
  }, [code, deferred, lists, searchKey]);

  // a barcode, typed or scanned
  const [byCode, setByCode] = useState<CodeState | null>(null);
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!code || asked.current === `${code}|${retry}`) return;
    asked.current = `${code}|${retry}`;
    let live = true;
    setByCode({ code, status: "loading" });
    productsForBarcode(code, mineKey ? mineKey.split(",") : []).then(
      (products) => { if (live) setByCode({ code, status: "ready", products }); },
      () => { if (live) setByCode({ code, status: "error" }); },
    );
    return () => { live = false; asked.current = null; };
  }, [code, retry, mineKey]);
  const codeState = code && byCode?.code === code ? byCode : code ? ({ code, status: "loading" } as const) : null;

  // focus moves to the sheet's title when the step changes, as the sheet does between its views (never to a box, which would bring up the keyboard)
  const step = useRef(false);
  useEffect(() => {
    if (!step.current) { step.current = true; return; }
    document.querySelector<HTMLElement>("dialog[open] h2")?.focus({ preventScroll: true });
  }, [picked]);

  const scanned = async (raw: string) => {
    setScanning(false);
    const c = normaliseBarcode(raw);
    if (!c) return;
    setQuery(c);
    // one product for it (or one at the person's own shop): straight to How much
    try {
      const found = await productsForBarcode(c, mine);
      if (found.length === 1 || (found.length > 1 && !!found[0]!.shop && mine.includes(found[0]!.shop))) setPicked(found[0]!);
    } catch { /* the list below says it couldn't load */ }
  };

  if (picked) {
    return (
      <div>
        {header(() => setPicked(null))}
        <HowMuch product={picked} meal={meal} onAdd={(entry) => onAdd(entry)} />
      </div>
    );
  }

  const shown = code ? (codeState?.status === "ready" ? codeState.products : []) : results;
  const loading = code ? codeState?.status === "loading" : deferred.length >= 2 && lists.status === "loading";
  const failed = code ? codeState?.status === "error" : lists.status === "ready" && lists.failed.length > 0 && lists.loaded.length === 0;

  return (
    <div className="pb-2">
      {header(onBack)}
      <div className="space-y-4">
        <SheetSearch value={query} onChange={setQuery} label={t("Search products or type a barcode")} placeholder={t("Type a product, e.g. baked beans")} />
        <Button variant="secondary" full className="min-h-12" onClick={() => setScanning(true)}><ScanIcon aria-hidden className="h-5 w-5" />{t("Scan a barcode")}</Button>
        <Scanner open={scanning} onClose={() => setScanning(false)} onCode={(c) => void scanned(c)} />

        {!code && shops.length > 1 && (
          <div role="group" aria-label={t("Supermarket")} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {ownShops.length > 0 && <Chip selected={scope === null} onClick={() => setScope(null)}>{t("My shops")}</Chip>}
            {shops.map((id) => (<Chip key={id} selected={scope === id || (scope === null && ownShops.length === 0 && searchIds[0] === id)} onClick={() => setScope(id)}>{retailerName(id)}</Chip>))}
          </div>
        )}

        {loading ? (
          <Spinner label={t("Loading products")} />
        ) : failed ? (
          <ErrorBox message={t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} />
        ) : code && shown.length === 0 ? (
          // a barcode we don't have is an ordinary answer, never a red error
          <InfoLine heading={null}>{t("We don't have {code} yet. Search for it by name, or type in your numbers.", { code })}</InfoLine>
        ) : !code && deferred.length >= 2 && shown.length === 0 ? (
          <p className="text-[0.9375rem] text-muted">{t("No products with their numbers match.")}</p>
        ) : shown.length > 0 ? (
          <ul className={PICK_LIST}>
            {shown.map((p) => (
              <PickRow
                key={p.key}
                lead={<PhotoTile sources={p.photos} />}
                title={p.name}
                // the shop it's from first (usability test 2026-11-19: George couldn't tell his Sainsbury's oats from Asda's)
                line={`${p.shop ? retailerName(p.shop) : t("Groceries")} · ${t("{kcal} kcal · {protein} protein per 100 {unit}", { kcal: Math.round(p.label.kcal), protein: grams(p.label.protein), unit: p.per })}${p.source.kind === "community" ? ` · ${t("community numbers")}` : p.source.kind === "government" ? ` · ${t("UK government figures")}` : ""}`}
                action={<ChoosePill name={p.name} onClick={() => setPicked(p)} />}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

const figures = (amount: string, n: Nutrients) => ({ amount, kcal: `${Math.round(n.calories)} kcal`, protein: grams(n.protein ?? 0), carbs: grams(n.carbs ?? 0), fat: grams(n.fat ?? 0) });

/** Where the numbers are from, worded as the shop product page says it. */
function SourceNote({ product }: { product: LoggableProduct }) {
  const t = useT();
  const poss = usePossessive();
  const s = product.source;
  const text = s.kind === "shop" ? t("Read from the product's own page on {shopPossessive} website.", { shopPossessive: poss(retailerName(s.shop)) })
    : s.kind === "same" ? t("Read from the same product's page on {shopPossessive} website.", { shopPossessive: poss(retailerName(s.shop)) })
    : s.kind === "community" ? null // the line above already says so
    : t("Fresh fruit and vegetables don't have to carry a nutrition label, and {shopPossessive} page shows none, so these are the UK government's figures for {food}.", { shopPossessive: poss(product.shop ? retailerName(product.shop) : t("the shop")), food: s.food });
  return text ? <p className="text-[0.8125rem] leading-relaxed text-muted">{text}</p> : null;
}

function choiceLabel(c: AmountChoice, unit: "g" | "ml", t: ReturnType<typeof useT>): string {
  const amount = amountText(c.amount, unit);
  if (c.kind === "portion") return t("One portion ({amount})", { amount });
  if (c.kind === "pack") return t("The whole pack ({amount})", { amount });
  if (c.kind === "item") return t("1 of {n} ({amount})", { n: c.count, amount });
  return amount;
}

/**
 * "How much did you have?": one-tap amounts from the label and the pack, the amount typed, what that comes to, and (on a product page, with `onMeal`) which
 * meal it goes to. The same step whether it is reached from Add food or from a product's own page.
 */
export function HowMuch({ product, meal, onMeal, onAdd, busy }: { product: LoggableProduct; meal: LogMeal; onMeal?: (m: LogMeal) => void; onAdd: (entry: NewEntry, meal: LogMeal) => void; busy?: boolean }) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState(() => String(startAmount(product)));
  const amount = parseAmount(text);
  const bad = text.trim() !== "" && amount === null;
  const n = amount === null ? null : amountNutrients(product.label, amount);
  const unit = product.per;
  const choices = amountChoices(product);
  const shopName = product.shop ? retailerName(product.shop) : t("Groceries");
  const per = product.state ? t("per 100 {unit} ({state})", { unit, state: product.state }) : t("per 100 {unit}", { unit });

  return (
    <form
      className="space-y-5 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (n && amount !== null) onAdd({ ...productEntry(product, amount, shopName), ...withPhoto(product.photos) }, meal);
      }}
    >
      <div className="flex items-center gap-3.5">
        <PhotoTile sources={product.photos} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-[800] leading-snug tracking-[-0.01em] [overflow-wrap:anywhere]">{product.name}</p>
          <p className="app-numbers mt-0.5 text-[0.875rem] leading-snug text-muted">{shopName} · {Math.round(product.label.kcal)} kcal · {t("{protein} protein", { protein: grams(product.label.protein) })} {per}</p>
        </div>
      </div>

      {choices.length > 1 && (
        <div role="group" aria-label={t("Amounts")} className="flex flex-wrap gap-2">
          {choices.map((c) => (
            <Chip key={`${c.kind}-${c.amount}`} selected={amount === c.amount} mark="none" onClick={() => setText(String(c.amount))}>{choiceLabel(c, unit, t)}</Chip>
          ))}
        </div>
      )}

      <div className="group/nums relative">
        <label htmlFor={id} className="mb-2 flex min-h-8 items-center pe-20 text-[0.9375rem] font-semibold leading-snug">{unit === "ml" ? t("How much did you have? (ml)") : t("How much did you have? (g)")}</label>
        <NumberDone />
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          // the amount is chosen when the box is tapped, so typing replaces it (usability test 2026-11-19: George typed after the 100)
          onFocus={(e) => e.currentTarget.select()}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-invalid={bad || undefined}
          aria-describedby={`${id}-note`}
          className={`${inputClass} app-numbers`}
        />
      </div>

      {bad ? (
        <p id={`${id}-note`} role="alert" className="flex items-start gap-1.5 text-[0.9375rem] font-semibold leading-snug text-danger">
          <AlertCircleIcon aria-hidden className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0" />
          <span className="min-w-0">{t("Type an amount from {min} to {max}.", { min: MIN_AMOUNT, max: MAX_AMOUNT.toLocaleString("en-GB") })}</span>
        </p>
      ) : (
        <div id={`${id}-note`} className="space-y-1.5">
          <p role="status" className="app-numbers min-h-6 text-[0.9375rem] font-semibold leading-snug">
            {n && amount !== null
              ? product.source.kind === "community"
                ? t("From Open Food Facts contributors (community data), for {amount}: {kcal}, {protein} protein, {carbs} carbs, {fat} fat. Check the pack.", figures(amountText(amount, unit), n))
                : product.source.kind === "government"
                  ? t("From the UK government's figures, for {amount}: {kcal}, {protein} protein, {carbs} carbs, {fat} fat.", figures(amountText(amount, unit), n))
                  : t("From the label, for {amount}: {kcal}, {protein} protein, {carbs} carbs, {fat} fat.", figures(amountText(amount, unit), n))
              : t("Type an amount from {min} to {max}.", { min: MIN_AMOUNT, max: MAX_AMOUNT.toLocaleString("en-GB") })}
          </p>
          <SourceNote product={product} />
        </div>
      )}

      {onMeal && (
        <div role="radiogroup" aria-label={t("Which meal?")}>
          <p className="mb-2 text-[0.9375rem] font-semibold leading-snug" aria-hidden>{t("Which meal?")}</p>
          <div className="flex flex-wrap gap-2">
            {LOG_MEALS.map((m) => (
              <Chip key={m} role="radio" aria-checked={m === meal} aria-pressed={undefined} selected={m === meal} onClick={() => onMeal(m)}>{t(LOG_MEAL_LABEL[m])}</Chip>
            ))}
          </div>
        </div>
      )}

      <Button type="submit" full disabled={!n} busy={busy} className="min-h-12 text-base">{t(ADD_TO[meal])}</Button>
    </form>
  );
}

/**
 * "Add to my food diary" on a product's own page (founder 2026-11-20): the white button opens "How much did you have?" in a sheet; the meal is the one the
 * clock says (Breakfast, Lunch or Dinner), changeable there. Adding does what Add food does (the entry, the analytics, the Premium count) and the page shows
 * the usual toast with Undo through `onAdded`. Free in 1.1: the gate decides, as Home's + does. Nothing shows for a product we have no numbers for.
 */
export function DiaryButton({ product, onAdded, className }: { product: LoggableProduct | null; onAdded: (entry: LogEntry, meal: LogMeal) => void; className?: string }) {
  const t = useT();
  const { gate } = useGate();
  // the Premium badge only where adding really is Premium for this person (free in 1.1's In-App Purchase build: the release review, 20 November 2026)
  const logPaid = needsPaywall("log", { pro: useIsPro() });
  const [open, setOpen] = useState(false);
  const [meal, setMeal] = useState<LogMeal>(() => mealSlotFor(new Date()));
  if (!product) return null;
  return (
    <>
      <Button variant="secondary" full className={className} onClick={() => gate("log", () => { setMeal(mealSlotFor(new Date())); setOpen(true); })}>
        <PlusIcon aria-hidden className="h-5 w-5" />
        {t("Add to my food diary")}
        {logPaid && <PremiumBadge />}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("Add to my food diary")}>
        {open && (
          <HowMuch
            key={product.key}
            product={product}
            meal={meal}
            onMeal={setMeal}
            onAdd={(entry, m) => {
              const logged = addLogEntry({ ...entry, meal: m });
              analytics.track({ name: "mealLogged" });
              countProAction();
              setOpen(false);
              onAdded(logged, m);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

/** The toast after adding to the food diary, with Undo (the same words Home uses). */
export function DiaryToast({ added, onClose }: { added: { entry: LogEntry; meal: LogMeal } | null; onClose: () => void }) {
  const t = useT();
  if (!added) return null;
  return (
    <Toast key={added.entry.id} onClose={onClose} onUndo={() => { deleteLogEntry(added.entry.id); onClose(); }}>
      {t(ADDED_TO[added.meal], { name: added.entry.name })}
    </Toast>
  );
}

/** A catalogue product's numbers with the same barcode's shop label in their place, where a shop list has one (2026-11-20: the label always wins). */
export async function catalogueWithLabel(product: LoggableProduct, code: string, prefer: string | null, mine: readonly string[]): Promise<LoggableProduct> {
  const hit = await findBarcode(code, mine).catch(() => null);
  if (!hit) return product;
  const rows = hit.shops.filter((h) => h.label === "own" || h.label === "same").sort((a, b) => Number(b.shop === prefer) - Number(a.shop === prefer));
  for (const h of rows) {
    try {
      const { file, products } = await loadShopFile(h.shop);
      const p = products.find((x) => x.id === h.id);
      const l = p ? loggableFromShop(file, p) : null;
      if (l) return withShopLabel(product, l);
    } catch { /* that list can't load: the next */ }
  }
  return product;
}
