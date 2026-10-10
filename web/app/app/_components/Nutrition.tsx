import { hasMacros } from "@/lib/mm/nutrients";
import { formatCalories, formatFineGrams, formatGrams, formatInt, formatOptionalGrams, formatSalt, formatSodium, nutrientAriaLabel, nutrientsSpoken } from "@/lib/mm/format";
import type { Nutrients } from "@/lib/mm/types";

/** Big calories + protein, then carbs and fat (SPEC §15: same order everywhere). */
export function MacroSummary({ nutrients: n, label, compact }: { nutrients: Nutrients; label?: string; compact?: boolean }) {
  // Orders are only built from chains that publish full nutrition, so these are always present; 0 is just the type fallback.
  const nutrients = { ...n, protein: n.protein ?? 0, carbs: n.carbs ?? 0, fat: n.fat ?? 0 };
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

/** One-line numbers under an item name: "520 kcal · 32g protein · 55g carbs · 18g fat" (spoken in full words). Inline-safe inside links. */
export function MacroLine({ nutrients }: { nutrients: Nutrients }) {
  if (!hasMacros(nutrients)) {
    // a calories-only chain: protein, carbs and fat are not published, and the chain page says so
    return <span className="app-numbers block text-sm text-muted">{formatCalories(nutrients.calories)}</span>;
  }
  return (
    <span className="app-numbers block text-sm text-muted">
      <span aria-hidden>{formatCalories(nutrients.calories)} · {formatGrams(nutrients.protein!)} protein · {formatGrams(nutrients.carbs!)} carbs · {formatGrams(nutrients.fat!)} fat</span>
      <span className="sr-only">, {nutrientsSpoken(nutrients)}</span>
    </span>
  );
}

/**
 * Item detail hero (SPEC §7.5): the item itself (passed as children: chain, name, serving) on the one lit card, then big
 * calories, then protein, carbs and fat. The numbers are one group so a screen reader hears them as one line.
 */
export function ItemHero({ nutrients, name, children, media }: { nutrients: Nutrients; name: string; children?: React.ReactNode; media?: React.ReactNode }) {
  const macros: Array<[string, number | undefined, boolean, string]> = [
    ["Protein", nutrients.protein, true, "bg-protein"],
    ["Carbs", nutrients.carbs, false, "bg-carbs"],
    ["Fat", nutrients.fat, false, "bg-fat"],
  ];
  // A bar of the three published weights side by side (grams as printed, nothing converted or estimated). Decorative: the
  // numbers themselves are in the tiles below and in the group's spoken label.
  const grams = hasMacros(nutrients) ? [nutrients.protein!, nutrients.carbs!, nutrients.fat!] : null;
  const total = grams ? grams[0] + grams[1] + grams[2] : 0;
  return (
    <div className="hero-card overflow-hidden rounded-[2rem]">
      {media}
      <div className="p-6">
        {children}
        <div role="group" aria-label={nutrientAriaLabel(name, nutrients)} className={`app-numbers ${children ? "mt-6" : ""}`}>
          <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
            <span className="sun-text text-[min(5rem,22vw)] font-extrabold leading-[0.85] tracking-[-0.05em]">{formatInt(nutrients.calories)}</span>
            <span className="pb-1 text-sm font-bold uppercase tracking-[0.14em] text-muted">kcal</span>
            {nutrients.energyKj !== undefined && <span className="pb-1 text-sm font-semibold text-muted">· {formatInt(nutrients.energyKj)} kJ</span>}
          </div>
          {grams && total > 0 && (
            <div aria-hidden className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-[var(--ring-track)]">
              {grams.map((g, i) => (g > 0 ? <span key={i} className={`${macros[i]![3]} h-full first:rounded-l-full last:rounded-r-full`} style={{ width: `${(g / total) * 100}%` }} /> : null))}
            </div>
          )}
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {macros.map(([label, value, lead, hue]) => (
              <div key={label} className={`flex flex-col-reverse gap-0.5 rounded-2xl px-3 py-3 ${lead ? "bg-accent-soft ring-1 ring-inset ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]" : "tile"}`}>
                <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted"><span aria-hidden className={`dot ${hue}`} />{label}</dt>
                <dd className={value === undefined ? "text-base font-semibold italic text-muted" : `text-2xl font-extrabold tracking-tight ${lead ? "text-accent" : ""}`}>{value === undefined ? "not published" : formatGrams(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
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
  // Extra figures (docs/DATA.md "Extra nutrients") appear only when the chain prints them: no "not published" clutter.
  const extra = (label: string, value: number | undefined, fmt: (v: number) => string): Array<[string, string, boolean]> =>
    value === undefined ? [] : [[label, fmt(value), true]];
  const rows: Array<[string, string, boolean]> = [
    ...extra("Energy", nutrients.energyKj, (v) => `${formatInt(v)} kJ`),
    ...extra("Serving weight", nutrients.weight, (v) => `${formatInt(v)}g`),
    ["Saturated fat", formatOptionalGrams(nutrients.saturatedFat), nutrients.saturatedFat !== undefined],
    ...extra("Monounsaturated fat", nutrients.monounsaturatedFat, formatFineGrams),
    ...extra("Polyunsaturated fat", nutrients.polyunsaturatedFat, formatFineGrams),
    ...extra("Trans fat", nutrients.transFat, formatFineGrams),
    ...saltOrSodium,
    ["Sugar", formatOptionalGrams(nutrients.sugar), nutrients.sugar !== undefined],
    ["Fibre", formatOptionalGrams(nutrients.fiber), nutrients.fiber !== undefined],
    ...extra("Caffeine", nutrients.caffeine, (v) => `${formatInt(v)}mg`),
  ];
  return (
    <dl className="app-numbers glass divide-y divide-line overflow-hidden rounded-[1.75rem]">
      {rows.map(([label, value, published]) => (
        <div key={label} className="flex min-h-12 items-center justify-between gap-4 px-5 py-2.5">
          <dt className="text-base">{label}</dt>
          <dd className={published ? "text-base font-semibold" : "text-sm italic text-muted"}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
