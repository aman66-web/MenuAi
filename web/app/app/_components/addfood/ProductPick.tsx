"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { ADD_TO, amountNutrients, MAX_AMOUNT, MIN_AMOUNT, parseAmount } from "@/lib/mm/addFood";
import { formatCalories, formatGrams } from "@/lib/mm/format";
import { photoSources, searchProducts, type ListedProduct } from "@/lib/mm/groceries";
import type { Meal } from "@/lib/mm/types";
import { NumberDone } from "../SearchDone";
import { ScanIcon } from "../icons";
import { Button, inputClass, Spinner } from "../ui";
import { useGroceryCatalogue } from "../../_lib/groceries";
import { useSettings } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { PhotoTile } from "../../groceries/ProductPhoto";
import { Scanner } from "../../groceries/Scanner";
import { BackBar, ChoosePill, PICK_LIST, PickRow, SheetSearch, type NewEntry } from "./parts";

// "Choose a supermarket product": found by name or by its barcode (typed, or read by the camera), then how much was had, in grams or millilitres.
// The figures are the product's label per 100 g or 100 ml times the amount over 100: plain arithmetic, shown before it is added. A figure the
// label doesn't print stays out.

const RESULTS = 8;

export function ProductPick({ meal, onAdd, onBack }: { meal: Meal; onAdd: (entry: NewEntry) => void; onBack: () => void }) {
  const t = useT();
  const prefer = useSettings().shops?.[0] ?? null;
  const catalogue = useGroceryCatalogue(null);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query).trim();
  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<ListedProduct | null>(null);
  const results = useMemo(() => (deferred.length >= 2 ? searchProducts(catalogue.products, { query: deferred, sort: "name" }).slice(0, RESULTS) : []), [catalogue.products, deferred]);

  if (picked) return <HowMuch product={picked} meal={meal} prefer={prefer} onBack={() => setPicked(null)} onAdd={onAdd} />;

  return (
    <div className="space-y-4 pb-2">
      <BackBar onBack={onBack} />
      <SheetSearch value={query} onChange={setQuery} label={t("Search products or type a barcode")} placeholder={t("Type a product, e.g. baked beans")} />
      <Button variant="secondary" full className="min-h-12" onClick={() => setScanning(true)}><ScanIcon aria-hidden className="h-5 w-5" />{t("Scan a barcode")}</Button>
      <Scanner open={scanning} onClose={() => setScanning(false)} onCode={(code) => { setScanning(false); setQuery(code); }} />

      {catalogue.status === "loading" && deferred.length >= 2 ? (
        <Spinner label={t("Loading products")} />
      ) : catalogue.status === "error" ? (
        <p className="text-[0.9375rem] text-muted">{t("Couldn't load the products. Check your connection.")}</p>
      ) : deferred.length >= 2 && results.length === 0 ? (
        <p className="text-[0.9375rem] text-muted">{t("No products match.")}</p>
      ) : results.length > 0 ? (
        <ul className={PICK_LIST}>
          {results.map((p) => (
            <PickRow
              key={p.gtin}
              lead={<PhotoTile sources={photoSources(p, prefer)} />}
              title={p.name}
              line={t("{kcal} kcal · {protein}g protein per 100 {unit}", { kcal: Math.round(p.kcal), protein: p.protein, unit: p.per })}
              action={<ChoosePill name={p.name} onClick={() => setPicked(p)} />}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The second step: how much of it, and what that comes to. */
function HowMuch({ product: p, meal, prefer, onBack, onAdd }: { product: ListedProduct; meal: Meal; prefer: string | null; onBack: () => void; onAdd: (entry: NewEntry) => void }) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState("100");
  const amount = parseAmount(text);
  const n = amount === null ? null : amountNutrients(p, amount);
  const unit = p.per;
  const shown = amount === null ? "" : `${Math.round(amount * 10) / 10} ${unit}`;

  return (
    <form
      className="space-y-5 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (n && amount !== null) onAdd({ chainId: "", chainName: t("Groceries"), name: `${p.name} (${shown})`, nutrients: n, source: "product" });
      }}
    >
      <BackBar onBack={onBack} />
      <div className="flex items-center gap-3.5">
        <PhotoTile sources={photoSources(p, prefer)} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-[800] leading-snug tracking-[-0.01em] [overflow-wrap:anywhere]">{p.name}</p>
          <p className="app-numbers mt-0.5 text-[0.875rem] leading-snug text-muted">{t("{kcal} kcal · {protein}g protein per 100 {unit}", { kcal: Math.round(p.kcal), protein: p.protein, unit })}</p>
        </div>
      </div>

      <div className="group/nums relative">
        <label htmlFor={id} className="mb-2 flex min-h-8 items-center text-[0.9375rem] font-semibold leading-snug">{unit === "ml" ? t("How much did you have? (ml)") : t("How much did you have? (g)")}</label>
        <NumberDone />
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-invalid={amount === null || undefined}
          aria-describedby={`${id}-note`}
          className={`${inputClass} app-numbers`}
        />
      </div>

      <p id={`${id}-note`} role="status" className="app-numbers min-h-12 text-[0.9375rem] leading-snug text-muted">
        {n
          ? t("From the label, for {amount}: {kcal}, {protein} protein, {carbs} carbs, {fat} fat.", { amount: shown, kcal: formatCalories(n.calories), protein: formatGrams(n.protein ?? 0), carbs: formatGrams(n.carbs ?? 0), fat: formatGrams(n.fat ?? 0) })
          : t("Type an amount from {min} to {max}.", { min: MIN_AMOUNT, max: MAX_AMOUNT.toLocaleString("en-GB") })}
      </p>

      <Button type="submit" full disabled={!n} className="min-h-12 text-base">{t(ADD_TO[meal])}</Button>
    </form>
  );
}
