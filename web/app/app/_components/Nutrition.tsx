import { Fragment } from "react";
import { hasMacros } from "@/lib/mm/nutrients";
import { formatCalories, formatFineGrams, formatGrams, formatInt, formatOptionalGrams, formatSalt, formatSodium, nutrientAriaLabel, nutrientsSpoken } from "@/lib/mm/format";
import type { Nutrients } from "@/lib/mm/types";
import { useT } from "../_lib/i18n";

// The figures follow Home's language (founder 2026-10-15, "the rest of the app should match that elegance"): a big number in a medium
// weight with its unit small beside it, small spaced capitals for labels, DM Mono for the figures in a row, and neutral grey fills
// instead of tinted ones. One hue per macro stays as a small dot (labels only, never good/bad: CLAUDE.md rule 3).

/** A small label inside a card, in spaced capitals, as on Home's macro rows. */
export const SMALL_LABEL = "text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted";

/** Big calories + protein, then carbs and fat (SPEC §15: same order everywhere). */
export function MacroSummary({ nutrients: n, label, compact }: { nutrients: Nutrients; label?: string; compact?: boolean }) {
  const t = useT();
  // Orders are only built from chains that publish full nutrition, so these are always present; 0 is just the type fallback.
  const nutrients = { ...n, protein: n.protein ?? 0, carbs: n.carbs ?? 0, fat: n.fat ?? 0 };
  if (compact) {
    return (
      <div className="app-numbers flex flex-wrap items-end justify-between gap-x-5 gap-y-2" role="group" aria-label={label ?? nutrientAriaLabel(t("Totals"), nutrients, t)}>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <div className="flex items-baseline gap-1.5"><span className="text-[2rem] font-medium leading-none tracking-[-0.03em]">{formatInt(nutrients.calories)}</span> <span className={SMALL_LABEL}>kcal</span></div>
          <div className="flex items-baseline gap-1.5"><span className="text-[2rem] font-medium leading-none tracking-[-0.03em]">{formatGrams(nutrients.protein)}</span> <span className={SMALL_LABEL}>{t("protein")}</span></div>
        </div>
        <div className="flex gap-4 leading-5">
          <div className="flex items-baseline gap-1.5"><span className="font-mono text-[0.8125rem] text-foreground">{formatGrams(nutrients.carbs)}</span> <span className={SMALL_LABEL}>{t("carbs")}</span></div>
          <div className="flex items-baseline gap-1.5"><span className="font-mono text-[0.8125rem] text-foreground">{formatGrams(nutrients.fat)}</span> <span className={SMALL_LABEL}>{t("fat")}</span></div>
        </div>
      </div>
    );
  }
  return (
    <div className="app-numbers" role="group" aria-label={label ?? nutrientAriaLabel(t("Totals"), nutrients, t)}>
      <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
        <div>
          <div className="text-[2.5rem] font-medium leading-none tracking-[-0.03em]">{formatInt(nutrients.calories)}</div>
          <div className={`mt-1.5 ${SMALL_LABEL}`}>{t("calories")}</div>
        </div>
        <div>
          <div className="text-[2.5rem] font-medium leading-none tracking-[-0.03em]">{formatGrams(nutrients.protein)}</div>
          <div className={`mt-1.5 ${SMALL_LABEL}`}>{t("protein")}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-4">
        <span className="flex items-baseline gap-1.5"><span className="font-mono text-[0.8125rem] text-foreground">{formatGrams(nutrients.carbs)}</span> <span className={SMALL_LABEL}>{t("carbs")}</span></span>
        <span className="flex items-baseline gap-1.5"><span className="font-mono text-[0.8125rem] text-foreground">{formatGrams(nutrients.fat)}</span> <span className={SMALL_LABEL}>{t("fat")}</span></span>
      </div>
    </div>
  );
}

/** One-line numbers under an item name: "520 kcal · 32g protein · 55g carbs · 18g fat" (spoken in full words). Inline-safe inside links. */
export function MacroLine({ nutrients }: { nutrients: Nutrients }) {
  const t = useT();
  if (!hasMacros(nutrients)) {
    // a calories-only chain: protein, carbs and fat are not published, and the chain page says so
    return <span className="app-numbers mt-0.5 block text-[0.9375rem] font-semibold leading-snug text-foreground">{formatCalories(nutrients.calories)}</span>;
  }
  // Calories and protein first and darker (what most people look for), carbs and fat after them. Each figure keeps its unit on its
  // line ("19g fat" never splits), and a line breaks after a "·", never before one.
  const figures: Array<[string, boolean]> = [
    [formatCalories(nutrients.calories), true],
    [`${formatGrams(nutrients.protein!)} ${t("protein")}`, true],
    [`${formatGrams(nutrients.carbs!)} ${t("carbs")}`, false],
    [`${formatGrams(nutrients.fat!)} ${t("fat")}`, false],
  ];
  return (
    <span className="app-numbers mt-0.5 block text-[0.9375rem] leading-snug text-muted">
      <span aria-hidden>
        {figures.map(([text, lead], i) => (
          <Fragment key={i}>
            <span className="whitespace-nowrap">
              <span className={lead ? "font-semibold text-foreground" : undefined}>{text}</span>
              {i < figures.length - 1 && " ·"}
            </span>
            {i < figures.length - 1 && " "}
          </Fragment>
        ))}
      </span>
      <span className="sr-only">, {nutrientsSpoken(nutrients, t)}</span>
    </span>
  );
}

/**
 * Item detail hero (SPEC §7.5): the item itself (passed as children: chain, name, serving) on the one card, then big calories,
 * then protein, carbs and fat as three quiet grey tiles, each with its small colour dot (one row each when the card is narrow:
 * large text, small phones). The numbers are one group so a screen reader hears them as one line.
 * Look (founder 2026-10-15, Home's language): the dish's photo runs to the card's edges at the top, the calories are one big figure in a
 * medium weight with "kcal" small beside it like Home's "1,030 / 2,800 kcal", and the tiles carry no tints. The earlier three-colour bar
 * of the grams is gone: the tiles already give each figure, and the page stays calm.
 */
export function ItemHero({ nutrients, name, children, media }: { nutrients: Nutrients; name: string; children?: React.ReactNode; media?: React.ReactNode }) {
  const t = useT();
  const macros: Array<[string, number | undefined, boolean, string]> = [
    [t("Protein"), nutrients.protein, true, "bg-protein"],
    [t("Carbs"), nutrients.carbs, false, "bg-carbs"],
    [t("Fat"), nutrients.fat, false, "bg-fat"],
  ];
  return (
    <div className="hero-card overflow-hidden rounded-[1.25rem]">
      {/* the photo's caption lines up with the card's text below it */}
      {media && <div className="[&_figcaption]:px-4 [&_figcaption]:pt-2.5">{media}</div>}
      <div className="p-4">
        {children}
        <div role="group" aria-label={nutrientAriaLabel(name, nutrients, t)} className={`app-numbers @container ${children ? "mt-6" : ""}`}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[3.5rem] font-medium leading-[0.9] tracking-[-0.04em]">{formatInt(nutrients.calories)}</span>
            <span className="text-[1.0625rem] font-medium text-muted">kcal</span>
            {nutrients.energyKj !== undefined && <span className="font-mono text-[0.8125rem] text-muted">· {formatInt(nutrients.energyKj)} kJ</span>}
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-2 @max-[17.5rem]:grid-cols-1">
            {macros.map(([label, value, lead, hue]) => (
              <div key={label} className="tile flex min-w-0 flex-col gap-2.5 rounded-2xl px-3.5 pb-3.5 pt-3 @max-[17.5rem]:flex-row @max-[17.5rem]:items-center @max-[17.5rem]:justify-between @max-[17.5rem]:px-4 @max-[17.5rem]:py-3">
                <dt className={`flex items-center gap-1.5 ${SMALL_LABEL} tracking-[0.1em]`}><span aria-hidden className={`dot ${hue}`} />{label}</dt>
                <dd className={value === undefined ? "text-[0.9375rem] italic leading-snug text-muted" : `text-[1.625rem] font-medium leading-none tracking-[-0.02em] ${lead ? "text-accent" : ""}`}>{value === undefined ? t("not published") : formatGrams(value)}</dd>
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
export function NutrientTable({ nutrients, bare = false }: { nutrients: Nutrients; bare?: boolean }) {
  const t = useT();
  const saltOrSodium: Array<[string, string, boolean]> = [];
  if (nutrients.salt !== undefined) saltOrSodium.push([t("Salt"), formatSalt(nutrients.salt, t), true]);
  if (nutrients.sodium !== undefined) saltOrSodium.push([t("Sodium"), formatSodium(nutrients.sodium, t), true]);
  if (saltOrSodium.length === 0) saltOrSodium.push([t("Salt"), formatSalt(undefined, t), false]);
  // Extra figures (docs/DATA.md "Extra nutrients") appear only when the chain prints them: no "not published" clutter.
  const extra = (label: string, value: number | undefined, fmt: (v: number) => string): Array<[string, string, boolean]> =>
    value === undefined ? [] : [[label, fmt(value), true]];
  const rows: Array<[string, string, boolean]> = [
    ...extra(t("Energy"), nutrients.energyKj, (v) => `${formatInt(v)} kJ`),
    ...extra(t("Serving weight"), nutrients.weight, (v) => `${formatInt(v)}g`),
    [t("Saturated fat"), formatOptionalGrams(nutrients.saturatedFat, t), nutrients.saturatedFat !== undefined],
    ...extra(t("Monounsaturated fat"), nutrients.monounsaturatedFat, formatFineGrams),
    ...extra(t("Polyunsaturated fat"), nutrients.polyunsaturatedFat, formatFineGrams),
    ...extra(t("Trans fat"), nutrients.transFat, formatFineGrams),
    ...saltOrSodium,
    [t("Sugar"), formatOptionalGrams(nutrients.sugar, t), nutrients.sugar !== undefined],
    [t("Fibre"), formatOptionalGrams(nutrients.fiber, t), nutrients.fiber !== undefined],
    ...extra(t("Caffeine"), nutrients.caffeine, (v) => `${formatInt(v)}mg`),
  ];
  // An unpublished figure reads NOT_PUBLISHED ("not published", lib/mm/format.ts), translated where it's shown.
  return (
    // `bare`: the rows only, for a card that already holds them (the item page's "More detail").
    <dl className={`app-numbers divide-y divide-line ${bare ? "" : "glass overflow-hidden rounded-[1.25rem] px-4"}`}>
      {rows.map(([label, value, published]) => (
        <div key={label} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          <dt className={SMALL_LABEL}>{label}</dt>
          <dd className={published ? "font-mono text-[0.875rem]" : "text-[0.875rem] italic text-muted"}>{published ? value : t(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
