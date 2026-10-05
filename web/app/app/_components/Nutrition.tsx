import { formatCalories, formatGrams, formatInt, formatOptionalGrams, formatSodium, nutrientAriaLabel } from "@/lib/mm/format";
import type { Nutrients } from "@/lib/mm/types";

/** Big calories + protein, then carbs and fat (SPEC §15: same order everywhere). */
export function MacroSummary({ nutrients, label, compact }: { nutrients: Nutrients; label?: string; compact?: boolean }) {
  if (compact) {
    return (
      <div className="app-numbers flex flex-wrap items-end justify-between gap-x-4 gap-y-2" role="group" aria-label={label ?? nutrientAriaLabel("Totals", nutrients)}>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <div><span className="text-3xl font-bold leading-none">{formatInt(nutrients.calories)}</span> <span className="text-xs font-medium uppercase tracking-wide text-muted">cal</span></div>
          <div><span className="text-3xl font-bold leading-none text-accent">{formatGrams(nutrients.protein)}</span> <span className="text-xs font-medium uppercase tracking-wide text-muted">protein</span></div>
        </div>
        <div className="text-sm text-muted sm:text-right">
          <div><span className="font-semibold text-foreground">{formatGrams(nutrients.carbs)}</span> carbs</div>
          <div><span className="font-semibold text-foreground">{formatGrams(nutrients.fat)}</span> fat</div>
        </div>
      </div>
    );
  }
  return (
    <div className="app-numbers" role="group" aria-label={label ?? nutrientAriaLabel("Totals", nutrients)}>
      <div className="flex items-end gap-6">
        <div>
          <div className="text-4xl font-bold leading-none tracking-tight">{formatInt(nutrients.calories)}</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">calories</div>
        </div>
        <div>
          <div className="text-4xl font-bold leading-none tracking-tight text-accent">{formatGrams(nutrients.protein)}</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">protein</div>
        </div>
      </div>
      <div className="mt-3 flex gap-5 text-sm text-muted">
        <span><span className="font-semibold text-foreground">{formatGrams(nutrients.carbs)}</span> carbs</span>
        <span><span className="font-semibold text-foreground">{formatGrams(nutrients.fat)}</span> fat</span>
      </div>
    </div>
  );
}

/** One-line numbers under an item name: "520 cal · 32g protein · 55g carbs · 18g fat". */
export function MacroLine({ nutrients }: { nutrients: Nutrients }) {
  return (
    <p className="app-numbers text-sm text-muted">
      {formatCalories(nutrients.calories)} · {formatGrams(nutrients.protein)} protein · {formatGrams(nutrients.carbs)} carbs · {formatGrams(nutrients.fat)} fat
    </p>
  );
}

/** Full nutrient list for the item detail screen; missing optionals read "not published". */
export function NutrientTable({ nutrients, name }: { nutrients: Nutrients; name: string }) {
  const rows: Array<[string, string, boolean]> = [
    ["Protein", formatGrams(nutrients.protein), true],
    ["Carbs", formatGrams(nutrients.carbs), true],
    ["Fat", formatGrams(nutrients.fat), true],
    ["Saturated fat", formatOptionalGrams(nutrients.saturatedFat), nutrients.saturatedFat !== undefined],
    ["Sodium", formatSodium(nutrients.sodium), nutrients.sodium !== undefined],
    ["Sugar", formatOptionalGrams(nutrients.sugar), nutrients.sugar !== undefined],
    ["Fibre", formatOptionalGrams(nutrients.fiber), nutrients.fiber !== undefined],
  ];
  return (
    <dl className="app-numbers divide-y divide-line rounded-xl border border-line" aria-label={`${nutrientAriaLabel(name, nutrients)}`}>
      {rows.map(([label, value, published]) => (
        <div key={label} className="flex min-h-11 items-center justify-between px-4 py-2">
          <dt className="text-base">{label}</dt>
          <dd className={published ? "text-base font-semibold" : "text-sm italic text-muted"}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
