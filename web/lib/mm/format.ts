import { englishT, tk, type T } from "./i18n";
import { halfUp, proteinPer100Cal } from "./nutrients";
import type { Nutrients } from "./types";

// Fixed en-US grouping so "1,050 kcal" is stable regardless of the visitor's locale (SPEC §6.1 pins en_US in tests).
const groupFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const NOT_PUBLISHED = tk("not published");

export function formatInt(n: number): string {
  return groupFmt.format(halfUp(n));
}

export function formatCalories(n: number): string {
  return `${formatInt(n)} kcal`;
}

/** Grams display as whole numbers, half away from zero: 20.5 → "21g". */
export function formatGrams(n: number): string {
  return `${halfUp(n)}g`;
}

export function formatDensity(n: Pick<Nutrients, "calories" | "protein">, t: T = englishT): string {
  return t("{grams}g per 100 kcal", { grams: halfUp(proteinPer100Cal(n), 1).toFixed(1) });
}

export function formatOptionalGrams(value: number | undefined, t: T = englishT): string {
  return value === undefined ? t(NOT_PUBLISHED) : formatGrams(value);
}

export function formatSodium(value: number | undefined, t: T = englishT): string {
  return value === undefined ? t(NOT_PUBLISHED) : `${formatInt(value)}mg`;
}

const saltFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fineFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** Small fat figures keep their published decimal (0.1g of trans fat must not read "0g"). */
export function formatFineGrams(value: number): string {
  return `${fineFmt.format(halfUp(value, 1))}g`;
}

/** Salt in grams, up to 2 decimals as the UK guides publish it: 0.9 → "0.9g", 1.25 → "1.25g". */
export function formatSalt(value: number | undefined, t: T = englishT): string {
  return value === undefined ? t(NOT_PUBLISHED) : `${saltFmt.format(halfUp(value, 2))}g`;
}

/** "520 kcal · 32g protein · 55g carbs · 18g fat" — same order everywhere (SPEC §15). */
export function macroLine(n: Nutrients, t: T = englishT): string {
  if (n.protein === undefined || n.carbs === undefined || n.fat === undefined) return formatCalories(n.calories); // calories-only chain
  return t("{calories} · {protein} protein · {carbs} carbs · {fat} fat", {
    calories: formatCalories(n.calories), protein: formatGrams(n.protein), carbs: formatGrams(n.carbs), fat: formatGrams(n.fat),
  });
}

/** "58g protein · 610 kcal · 9.5g per 100 kcal" — the "Best for you" reason line (SPEC §6.4). */
export function reasonLine(n: Nutrients, t: T = englishT): string {
  return t("{protein} protein · {calories} · {density}", { protein: formatGrams(n.protein ?? 0), calories: formatCalories(n.calories), density: formatDensity(n, t) });
}

/** Screen-reader label with the same rounding as the display (SPEC §7). */
export function nutrientAriaLabel(name: string, n: Nutrients, t: T = englishT): string {
  return t("{name}, {nutrients}", { name, nutrients: nutrientsSpoken(n, t) });
}

/** The four main numbers as a screen reader should say them: "520 calories, 32 grams protein, 55 grams carbs, 18 grams fat". */
export function nutrientsSpoken(n: Nutrients, t: T = englishT): string {
  if (n.protein === undefined || n.carbs === undefined || n.fat === undefined) return t("{calories} calories", { calories: formatInt(n.calories) }); // calories-only chain
  return t("{calories} calories, {protein} grams protein, {carbs} grams carbs, {fat} grams fat", {
    calories: formatInt(n.calories), protein: halfUp(n.protein), carbs: halfUp(n.carbs), fat: halfUp(n.fat),
  });
}

const MONTHS = [tk("Jan"), tk("Feb"), tk("Mar"), tk("Apr"), tk("May"), tk("Jun"), tk("Jul"), tk("Aug"), tk("Sep"), tk("Oct"), tk("Nov"), tk("Dec")];

/** "2026-10-01" → "1 Oct 2026" (fixed format, no locale surprises). Returns the input if it isn't a date. */
export function formatDate(iso: string, t: T = englishT): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? t("{day} {month} {year}", { day: Number(m[3]), month: t(month), year: m[1] }) : iso;
}

/** Lower-case the first letter unless the second is upper-case ("No BBQ sauce" stays "no BBQ sauce"). */
export function lowerFirst(label: string): string {
  if (label.length > 1) {
    const second = label[1]!;
    if (second.toLowerCase() !== second && second.toUpperCase() === second) return label;
  }
  return label.slice(0, 1).toLowerCase() + label.slice(1);
}
