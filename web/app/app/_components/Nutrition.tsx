import { formatCalories, formatGrams, formatInt, formatOptionalGrams, formatSalt, formatSodium, nutrientAriaLabel } from "@/lib/mm/format";
import type { Nutrients } from "@/lib/mm/types";

/** Big calories + protein, then carbs and fat (SPEC §15: same order everywhere). */
export function MacroSummary({ nutrients, label, compact }: { nutrients: Nutrients; label?: string; compact?: boolean }) {
  if (compact) {
    return (
      <div className="app-numbers flex flex-wrap items-end justify-between gap-x-4 gap-y-2" role="group" aria-label={label ?? nutrientAriaLabel("Totals", nutrients)}>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <div><span className="sun-text text-3xl font-extrabold leading-none">{formatInt(nutrients.calories)}</span> <span className="text-xs font-medium uppercase tracking-wide text-muted">kcal</span></div>
          <div><span className="text-3xl font-extrabold leading-none text-accent">{formatGrams(nutrients.protein)}</span> <span className="text-xs font-medium uppercase tracking-wide text-muted">protein</span></div>
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
          <div className="sun-text text-5xl font-extrabold leading-none tracking-tighter">{formatInt(nutrients.calories)}</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">calories</div>
        </div>
        <div>
          <div className="text-5xl font-extrabold leading-none tracking-tighter text-accent">{formatGrams(nutrients.protein)}</div>
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

/** One-line numbers under an item name: "520 kcal · 32g protein · 55g carbs · 18g fat". */
export function MacroLine({ nutrients }: { nutrients: Nutrients }) {
  return (
    <p className="app-numbers text-sm text-muted">
      {formatCalories(nutrients.calories)} · {formatGrams(nutrients.protein)} protein · {formatGrams(nutrients.carbs)} carbs · {formatGrams(nutrients.fat)} fat
    </p>
  );
}

/** Item detail hero: big calories, then protein, carbs and fat (SPEC §7.5). One group so a screen reader hears it as one line. */
export function ItemHero({ nutrients, name }: { nutrients: Nutrients; name: string }) {
  const macros: Array<[string, number, boolean]> = [["Protein", nutrients.protein, true], ["Carbs", nutrients.carbs, false], ["Fat", nutrients.fat, false]];
  return (
    <div role="group" aria-label={nutrientAriaLabel(name, nutrients)} className="hero-card app-numbers rounded-3xl p-6">
      <div className="sun-text text-7xl font-extrabold leading-none tracking-tighter">{formatInt(nutrients.calories)}</div>
      <div className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">calories</div>
      <dl className="mt-6 grid grid-cols-3 divide-x divide-line border-t border-line pt-4 text-center">
        {macros.map(([label, grams, lead]) => (
          <div key={label} className="flex flex-col-reverse gap-0.5 px-1">
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{label}</dt>
            <dd className={`text-2xl font-extrabold tracking-tight ${lead ? "text-accent" : ""}`}>{formatGrams(grams)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The other nutrients for the item detail screen (protein, carbs and fat sit in ItemHero); missing optionals read "not published".
 * Salt and sodium are different published figures (UK vs US guides) and are never converted: show whichever
 * the chain publishes, both if both, and a single "Salt: not published" row if neither.
 */
export function NutrientTable({ nutrients }: { nutrients: Nutrients }) {
  const saltOrSodium: Array<[string, string, boolean]> = [];
  if (nutrients.salt !== undefined) saltOrSodium.push(["Salt", formatSalt(nutrients.salt), true]);
  if (nutrients.sodium !== undefined) saltOrSodium.push(["Sodium", formatSodium(nutrients.sodium), true]);
  if (saltOrSodium.length === 0) saltOrSodium.push(["Salt", formatSalt(undefined), false]);
  const rows: Array<[string, string, boolean]> = [
    ["Saturated fat", formatOptionalGrams(nutrients.saturatedFat), nutrients.saturatedFat !== undefined],
    ...saltOrSodium,
    ["Sugar", formatOptionalGrams(nutrients.sugar), nutrients.sugar !== undefined],
    ["Fibre", formatOptionalGrams(nutrients.fiber), nutrients.fiber !== undefined],
  ];
  return (
    <div>
    <dl className="app-numbers glass divide-y divide-line overflow-hidden rounded-3xl">
      {rows.map(([label, value, published]) => (
        <div key={label} className="flex min-h-12 items-center justify-between px-5 py-2">
          <dt className="text-base">{label}</dt>
          <dd className={published ? "text-base font-semibold" : "text-sm italic text-muted"}>{value}</dd>
        </div>
      ))}
    </dl>
    </div>
  );
}
