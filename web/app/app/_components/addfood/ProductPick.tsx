"use client";

import { needsPaywall } from "@/lib/mm/entitlements";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ADD_TO, ADDED_TO, amountChoices, amountNutrients, amountText, loggableFromShop, MAX_AMOUNT, MIN_AMOUNT, parseAmount, productEntry, startAmount, stepAmount, withShopLabel, type AmountChoice, type LoggableProduct } from "@/lib/mm/addFood";
import { analytics } from "@/lib/mm/analytics";
import { amountIn, countText, MEASURE_WORDS, measuresFor, parseCount, QUICK_COUNTS, type Measure, type MeasureKey } from "@/lib/mm/portions";
import { barcodeDigits, barcodeShown, validGs1 } from "@/lib/mm/barcodes";
import { LOG_MEAL_LABEL, LOG_MEALS, mealSlotFor } from "@/lib/mm/budget";
import { retailerName, withPhoto } from "@/lib/mm/groceries";
import { searchShopProducts, type ShopManifest } from "@/lib/mm/shopProducts";
import { normalizeForSearch } from "@/lib/mm/search";
import { addLogEntry, countProAction, deleteLogEntry } from "@/lib/mm/stores";
import type { LogMeal, Nutrients } from "@/lib/mm/types";
import type { LogEntry } from "@/lib/mm/user-data";
import { NumberDone } from "../SearchDone";
import { AlertCircleIcon, MinusIcon, PencilIcon, PlusIcon, ScanIcon } from "../icons";
import { InfoLine } from "../Note";
import { useGate } from "../Paywall";
import { PremiumBadge } from "../PremiumBadge";
import { Toast } from "../Toast";
import { Button, Chip, ErrorBox, Sheet, Spinner } from "../ui";
import { useIsPro, useSettings } from "../../_lib/hooks";
import { usePossessive, useT } from "../../_lib/i18n";
import { findBarcode, loadShopFile, useShopLists, useShopManifest } from "../../_lib/shopProducts";
import { PhotoTile } from "../../groceries/ProductPhoto";
import { useBarcodeLookup } from "./findByBarcode";
import { grams, MacroRing } from "./MacroRing";
import { ChoosePill, PICK_LIST, PickRow, SheetSearch, type NewEntry } from "./parts";
import { TypedNumbers } from "./TypedNumbers";

// "Choose a supermarket product": found by name in the person's own supermarkets' full lists (or one shop they pick), or by its barcode (typed, or read by the
// camera; founder 2026-11-20: "when they scan a barcode of a product, it needs to come up with the product and they can input in and it's their food thing"),
// then how much was had, in grams or millilitres. The figures are the product's label per 100 g or 100 ml times the amount over 100: plain arithmetic, shown
// before it is added. A figure the label doesn't print stays out. The shop's own label always wins (2026-11-20: Add food had logged community numbers that
// contradicted it); community numbers only for a barcode no shop list holds, and said so. The product's picture goes with the entry, for Home and Today.

const RESULTS = 8;
/** How many shops a search covers at once when it is "My shops" (each is a full list held in memory). */
const MAX_SEARCH_SHOPS = 3;

/** The shops with labels a search can use: the person's own first (in their order), then the others by how many labels we've read. */
export function labelShops(manifest: ShopManifest | null, mine: readonly string[]): string[] {
  const all = (manifest?.retailers ?? []).filter((r) => (r.nutrition ?? 0) > 0);
  const own = mine.filter((id) => all.some((r) => r.id === id));
  const rest = [...all].sort((a, b) => (b.nutrition ?? 0) - (a.nutrition ?? 0)).map((r) => r.id).filter((id) => !own.includes(id));
  return [...own, ...rest];
}

/**
 * `onScan` opens Add food's "Scan a barcode" (the camera); `onType` opens "Type in your numbers", starting with the name we know for a barcode we have no figures for.
 */
export function ProductPick({ meal, onAdd, onBack, header, onScan, onType }: { meal: LogMeal; onAdd: (entry: NewEntry) => void; onBack: () => void; header: (onBack: () => void) => ReactNode; onScan: () => void; onType: (name: string) => void }) {
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
  // a barcode typed in the box, with its leading zeros (the design review of 2026-11-20: 01318180 was shown as 1318180)
  const code = barcodeDigits(deferred);
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

  // a barcode typed in the box: our lists, then Open Food Facts through our own API (findByBarcode.ts), only once it is a whole barcode (its check digit right): a
  // number still being typed is never looked up (the 30-person meeting, 21 November 2026, Grace: "We don't have this one yet" came up halfway through, and every
  // 8- to 13-digit prefix spent the shared Open Food Facts limit)
  const whole = code && validGs1(code) ? code : null;
  const byCode = useBarcodeLookup(whole, mine, whole ? t("Barcode {code}", { code: whole }) : "", retry);

  // focus moves to the sheet's title when the step changes, as the sheet does between its views (never to a box, which would bring up the keyboard)
  const step = useRef(false);
  useEffect(() => {
    if (!step.current) { step.current = true; return; }
    document.querySelector<HTMLElement>("dialog[open] h2")?.focus({ preventScroll: true });
  }, [picked]);

  if (picked) {
    return (
      <div>
        {header(() => setPicked(null))}
        <HowMuch product={picked} meal={meal} onAdd={(entry) => onAdd(entry)} />
      </div>
    );
  }

  const shown = code ? (byCode?.status === "found" ? byCode.products : []) : results;
  const loading = code ? byCode?.status === "loading" : deferred.length >= 2 && lists.status === "loading";
  const failed = code ? byCode?.status === "error" : lists.status === "ready" && lists.failed.length > 0 && lists.loaded.length === 0;

  return (
    <div className="pb-2">
      {header(onBack)}
      <div className="space-y-4">
        <SheetSearch value={query} onChange={setQuery} label={t("Search products or type a barcode")} placeholder={t("Type a product, e.g. baked beans")} />
        <Button variant="secondary" full className="min-h-12" onClick={onScan}><ScanIcon aria-hidden className="h-5 w-5" />{t("Scan a barcode")}</Button>

        {!code && shops.length > 1 && (
          <div role="group" aria-label={t("Supermarket")} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {ownShops.length > 0 && <Chip selected={scope === null} onClick={() => setScope(null)}>{t("My shops")}</Chip>}
            {shops.map((id) => (<Chip key={id} selected={scope === id || (scope === null && ownShops.length === 0 && searchIds[0] === id)} onClick={() => setScope(id)}>{retailerName(id)}</Chip>))}
          </div>
        )}

        {loading ? (
          <Spinner label={code ? t("Looking it up") : t("Loading products")} />
        ) : failed ? (
          <ErrorBox message={code ? (byCode?.status === "error" && !byCode.offline ? t("Couldn't look it up just now. Try again.") : t("Couldn't look it up. Check your connection.")) : t("Couldn't load the products. Check your connection.")} onRetry={() => setRetry((n) => n + 1)} />
        ) : code && !whole && code.length >= 13 ? (
          // all 13 or 14 digits typed and the check digit is wrong: a slip, said calmly (shorter numbers may still be on their way)
          <p className="text-[0.9375rem] text-muted">{t("Type the number printed under the barcode, or scan again.")}</p>
        ) : code && byCode?.status === "missing" ? (
          // a barcode nobody has figures for is an ordinary answer, never a red error
          <NotFound name={byCode.name} onType={onType} />
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
                // a label for the cooked or prepared food says so (the 30-person meeting, 21 November 2026, Grace)
                line={`${p.shop ? retailerName(p.shop) : p.brand || t("Groceries")} · ${t("{kcal} kcal · {protein} protein per 100 {unit}", { kcal: Math.round(p.label.kcal), protein: grams(p.label.protein), unit: p.per })}${p.state ? ` (${p.state})` : ""}${p.source.kind === "community" ? ` · ${t("community numbers")}` : p.source.kind === "government" ? ` · ${t("UK government figures")}` : ""}`}
                action={<ChoosePill name={p.name} onClick={() => setPicked(p)} />}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** A barcode nobody has figures for: the calm line, and the way on (typing the numbers from the pack, starting with the name where Open Food Facts knows it). */
export function NotFound({ name, onType, code, badge }: { name: string; onType: (name: string) => void; code?: string; badge?: ReactNode }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <InfoLine heading={null}>{t("We don't have this one yet.")}</InfoLine>
      {code && <p className="app-numbers px-1 text-[0.9375rem] text-muted">{t("Barcode {code}", { code: barcodeShown(code) })}</p>}
      <Button full className="min-h-12 text-base" onClick={() => onType(name)}><PencilIcon aria-hidden className="h-5 w-5" />{t("Type the numbers from the pack")}{badge}</Button>
    </div>
  );
}

/** Where the numbers are from, in one short line under them (and the credits Open Food Facts' data and photos need; `photoCredit={false}` where the photo's own caption gives it). */
export function SourceNote({ product, photoCredit = true }: { product: LoggableProduct; photoCredit?: boolean }) {
  const t = useT();
  const poss = usePossessive();
  const s = product.source;
  if (s.kind === "community") {
    const photo = photoCredit && product.photos.some((p) => p.from === "off");
    return (
      <div className="space-y-1">
        <p className="text-[0.875rem] font-semibold leading-snug">{t("Figures from Open Food Facts (community data)")}</p>
        <p className="text-[0.8125rem] leading-snug text-muted">
          {product.code ? (
            <a href={`https://world.openfoodfacts.org/product/${product.code}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {t("Open Food Facts, ODbL")}<span className="sr-only"> {t("(opens in a new tab)")}</span>
            </a>
          ) : t("Open Food Facts, ODbL")}
          {photo && <> · {t("Photo: Open Food Facts contributors (CC BY-SA)")}</>}
        </p>
      </div>
    );
  }
  const text = s.kind === "shop" ? t("Read from the product's own page on {shopPossessive} website.", { shopPossessive: poss(retailerName(s.shop)) })
    : s.kind === "same" ? t("Read from the same product's page on {shopPossessive} website.", { shopPossessive: poss(retailerName(s.shop)) })
    : t("Fresh fruit and vegetables don't have to carry a nutrition label, and {shopPossessive} page shows none, so these are the UK government's figures for {food}.", { shopPossessive: poss(product.shop ? retailerName(product.shop) : t("the shop")), food: s.food });
  return <p className="text-[0.8125rem] leading-relaxed text-muted">{text}</p>;
}

function choiceLabel(c: AmountChoice, unit: "g" | "ml", t: ReturnType<typeof useT>): string {
  const amount = amountText(c.amount, unit);
  if (c.kind === "portion") return t("One portion ({amount})", { amount });
  if (c.kind === "pack") return t("The whole pack ({amount})", { amount });
  if (c.kind === "item") return t("1 of {n} ({amount})", { n: c.count, amount });
  return amount;
}

/** "Glass" for "glass": a measure's button starts with a capital, as every button does. */
const capitalised = (s: string): string => s.charAt(0).toLocaleUpperCase("en-GB") + s.slice(1);

/** "Which meal?": Breakfast, Lunch, Dinner or Snacks as one choice (on a product page, where no meal's + was tapped). */
function MealChoice({ meal, onMeal }: { meal: LogMeal; onMeal: (m: LogMeal) => void }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("Which meal?")}>
      <p className="mb-2 text-[0.9375rem] font-semibold leading-snug" aria-hidden>{t("Which meal?")}</p>
      <div className="flex flex-wrap gap-2">
        {LOG_MEALS.map((m) => (
          <Chip key={m} role="radio" aria-checked={m === meal} aria-pressed={undefined} selected={m === meal} onClick={() => onMeal(m)}>{t(LOG_MEAL_LABEL[m])}</Chip>
        ))}
      </div>
    </div>
  );
}

/** The round − and + beside the amount: white with the edge and an ink sign, 48 px. */
const STEP = "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[1.5px] border-edge bg-card text-ink transition active:scale-95 hover:not-disabled:bg-background disabled:border-transparent disabled:bg-soft-strong disabled:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const NONE: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/**
 * "How much?" (founder 2026-11-20, scanning a barcode into the food diary): the product with its photo and name, what the amount comes to as a ring of its protein,
 * carbs and fat with the figures beside it (MacroRing; they follow the amount as it changes), one-tap amounts from its own label and pack (one portion where printed,
 * the whole pack, 100 g or ml) with the chosen one marked, the amount typed in big with − and +, and (on a product page, with `onMeal`) which meal it goes to. Grams
 * for food and millilitres for drinks, as the label's figures are per. The same step from Add food, a scan, or a product's own page.
 */
export function HowMuch({ product, meal, onMeal, onAdd, busy }: { product: LoggableProduct; meal: LogMeal; onMeal?: (m: LogMeal) => void; onAdd: (entry: NewEntry, meal: LogMeal) => void; busy?: boolean }) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState(() => String(startAmount(product)));
  const unit = product.per;
  // the measure the box counts in (founder 2026-11-21: "allow them to choose measurements too"): g or ml as the label is per, or a serving, an item, the pack,
  // a glass, a can, a pint, a spoon or an ounce (lib/mm/portions.ts: only fixed amounts of the label's own unit, never a density guess)
  const measures = useMemo(() => measuresFor(product), [product]);
  const [measureKey, setMeasureKey] = useState<MeasureKey>("unit");
  const measure: Measure = measures.find((x) => x.key === measureKey) ?? measures[0]!;
  const inUnit = measure.key === "unit";
  const count = inUnit ? null : parseCount(text, measure, MAX_AMOUNT);
  const amount = inUnit ? parseAmount(text) : count === null ? null : Math.max(MIN_AMOUNT, amountIn(measure, count));
  const bad = text.trim() !== "" && amount === null;
  const n = amount === null ? null : amountNutrients(product.label, amount);
  const choices = amountChoices(product);
  // the shop it's from; for a product no shop list holds, its brand
  const fromName = product.shop ? retailerName(product.shop) : product.brand || t("Groceries");
  const step = (direction: 1 | -1) => {
    if (inUnit) return setText(String(stepAmount(amount ?? parseAmount(text.replace(/[^\d.,]/g, "")), direction)));
    // half a measure at a time, never below a half
    const next = Math.max(0.5, Math.round(((count ?? 1) + direction * 0.5) * 2) / 2);
    if (next * measure.one <= MAX_AMOUNT) setText(String(next));
  };
  const word = (m: Measure, c: number) => (m.key === "unit" ? unit : t(MEASURE_WORDS[m.key][c === 1 || c === 0.5 ? 0 : 1]));
  const pickMeasure = (m: Measure) => {
    setMeasureKey(m.key);
    // back to g or ml keeps what the measure came to; a measure starts at one of it
    setText(m.key === "unit" ? String(amount ?? startAmount(product)) : "1");
  };

  return (
    <form
      className="space-y-6 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (n && amount !== null) onAdd({ ...productEntry(product, amount, fromName), ...withPhoto(product.photos) }, meal);
      }}
    >
      <div className="flex items-center gap-3.5">
        <PhotoTile sources={product.photos} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-semibold leading-snug text-muted [overflow-wrap:anywhere]">{fromName}</p>
          <p className="mt-0.5 text-lg font-[800] leading-snug tracking-[-0.01em] [overflow-wrap:anywhere]">{product.name}</p>
        </div>
      </div>

      <MacroRing nutrients={n ?? NONE} />

      <div className="group/nums relative">
        {/* a label for the cooked or prepared food says so beside the question, as the product pages do (the 30-person meeting, 21 November 2026, Grace: nothing
            said the figures were for cooked rice); inside the label, so a screen reader hears it with the box */}
        <label htmlFor={id} className="mb-3 flex min-h-8 flex-wrap items-center gap-x-2 pe-20 text-lg font-[800] leading-snug tracking-[-0.01em]">
          {t("How much?")}
          {product.state && <span className="text-[0.9375rem] font-semibold tracking-normal text-muted">{t("per 100 {unit} ({state})", { unit, state: product.state })}</span>}
        </label>
        <NumberDone />
        {/* the measure to count in: g or ml, then the pack's own, then the kitchen measures for its unit */}
        {measures.length > 1 && (
          <div role="radiogroup" aria-label={t("Measure")} className="mb-3.5">
            <p aria-hidden className="mb-2 text-[0.9375rem] font-semibold leading-snug text-muted">{t("Measure")}</p>
            <div className="flex flex-wrap gap-2">
              {measures.map((m) => (
                <Chip key={m.key} role="radio" aria-checked={m.key === measure.key} aria-pressed={undefined} selected={m.key === measure.key} onClick={() => pickMeasure(m)}>
                  {m.key === "unit" ? unit : m.key === "oz" ? "oz" : t("{measure} ({amount})", { measure: capitalised(word(m, 1)), amount: amountText(m.one, unit) })}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {/* in a measure: a half, one or two of it */}
        {!inUnit && (
          <div role="group" aria-label={t("Amounts")} className="mb-3.5 flex flex-wrap gap-2">
            {QUICK_COUNTS.map((c) => (
              <Chip key={c} selected={count === c} onClick={() => setText(String(c))}>{`${countText(c)} ${word(measure, c)}`}</Chip>
            ))}
          </div>
        )}
        {/* always at least 100 g or ml, marked when it is the amount (2026-11-20: Asda's 2 L milk prints no portion and is too big a pack, so no chips showed) */}
        {inUnit && choices.length > 0 && (
          <div role="group" aria-label={t("Amounts")} className="mb-3.5 flex flex-wrap gap-2">
            {choices.map((c) => (
              <Chip key={`${c.kind}-${c.amount}`} selected={amount === c.amount} onClick={() => setText(String(c.amount))}>{choiceLabel(c, unit, t)}</Chip>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <button type="button" className={STEP} aria-label={t("Less")} disabled={inUnit ? amount !== null && amount <= MIN_AMOUNT : count !== null && count <= 0.5} onClick={() => step(-1)}><MinusIcon aria-hidden className="h-5 w-5" /></button>
          <div className="relative min-w-0 flex-1">
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
              aria-describedby={bad ? `${id}-bad` : undefined}
              className="app-numbers min-h-14 w-full rounded-2xl border-[1.5px] border-edge bg-card ps-4 pe-12 text-center text-[1.75rem] font-[800] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-[0_0_0_0.5px_var(--danger)]"
            />
            <span aria-hidden className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted">{inUnit ? unit : word(measure, count ?? 1)}</span>
          </div>
          <button type="button" className={STEP} aria-label={t("More")} disabled={inUnit ? amount !== null && amount >= MAX_AMOUNT : count !== null && (count + 0.5) * measure.one > MAX_AMOUNT} onClick={() => step(1)}><PlusIcon aria-hidden className="h-5 w-5" /></button>
        </div>
        {/* what a count in a measure comes to, as it goes in the diary */}
        {!inUnit && amount !== null && <p className="app-numbers mt-2.5 text-center text-[0.9375rem] font-semibold leading-snug text-muted">{t("= {amount}", { amount: amountText(amount, unit) })}</p>}
        {bad && (
          <p id={`${id}-bad`} role="alert" className="mt-2.5 flex items-start gap-1.5 text-[0.9375rem] font-semibold leading-snug text-danger">
            <AlertCircleIcon aria-hidden className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0" />
            <span className="min-w-0">{inUnit
              ? t("Type an amount from {min} to {max}.", { min: MIN_AMOUNT, max: MAX_AMOUNT.toLocaleString("en-GB") })
              : t("Type an amount from {min} to {max}.", { min: "0.5", max: Math.floor(MAX_AMOUNT / measure.one).toLocaleString("en-GB") })}</span>
          </p>
        )}
      </div>

      {onMeal && <MealChoice meal={meal} onMeal={onMeal} />}

      <div className="space-y-3">
        <SourceNote product={product} />
        <Button type="submit" full disabled={!n} busy={busy} className="min-h-12 text-base">{t(ADD_TO[meal])}</Button>
      </div>
    </form>
  );
}

/**
 * "Add to my food diary" on a product's own page (founder 2026-11-20): the white button (the ink one, `main`, on a page reached by a scan) opens "How much did you have?" in a sheet; the meal is the one the
 * clock says (Breakfast, Lunch or Dinner), changeable there. Adding does what Add food does (the entry, the analytics, the Premium count) and the page shows
 * the usual toast with Undo through `onAdded`. Free in 1.1: the gate decides, as Home's + does. Nothing shows for a product we have no numbers for.
 */
export function DiaryButton({ product, onAdded, className, main = false }: { product: LoggableProduct | null; onAdded: (entry: LogEntry, meal: LogMeal) => void; className?: string; /** The page's one ink button (a product page reached by a scan). */ main?: boolean }) {
  const t = useT();
  const { gate } = useGate();
  // the Premium badge only where adding really is Premium for this person (free in 1.1's In-App Purchase build: the release review, 20 November 2026)
  const logPaid = needsPaywall("log", { pro: useIsPro() });
  const [open, setOpen] = useState(false);
  const [meal, setMeal] = useState<LogMeal>(() => mealSlotFor(new Date()));
  if (!product) return null;
  return (
    <>
      <Button variant={main ? "primary" : "secondary"} full className={className} onClick={() => gate("log", () => { setMeal(mealSlotFor(new Date())); setOpen(true); })}>
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

/**
 * "Type the numbers from the pack" on a product page for a barcode nobody has figures for (founder 2026-11-20): Add food's "Type in your numbers" in a sheet, the
 * name starting as the one Open Food Facts knows (or empty), the meal the one the clock says, changeable there. Adding does what DiaryButton does; the gate decides.
 * `type(name)` opens it; `sheet` goes on the page; `paid`: adding is Premium for this person (the button then carries the Premium mark).
 */
export function useTypedDiary(onAdded: (entry: LogEntry, meal: LogMeal) => void): { type: (name: string) => void; sheet: ReactNode; paid: boolean } {
  const t = useT();
  const { gate } = useGate();
  const paid = needsPaywall("log", { pro: useIsPro() });
  const [open, setOpen] = useState<{ name: string } | null>(null);
  const [meal, setMeal] = useState<LogMeal>(() => mealSlotFor(new Date()));
  const type = (name: string) => gate("log", () => { setMeal(mealSlotFor(new Date())); setOpen({ name }); });
  const sheet = (
    <Sheet open={open !== null} onClose={() => setOpen(null)} title={t("Type in your numbers")}>
      {open && (
        <div className="space-y-1 pb-2">
          <MealChoice meal={meal} onMeal={setMeal} />
          <TypedNumbers
            key={open.name}
            meal={meal}
            startName={open.name}
            onAdd={(entry) => {
              const logged = addLogEntry({ ...entry, meal });
              analytics.track({ name: "mealLogged" });
              countProAction();
              setOpen(null);
              onAdded(logged, meal);
            }}
          />
        </div>
      )}
    </Sheet>
  );
  return { type, sheet, paid };
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
