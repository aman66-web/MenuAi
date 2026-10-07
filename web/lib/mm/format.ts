import { halfUp, proteinPer100Cal } from "./nutrients";
import type { Nutrients } from "./types";

// Fixed en-US grouping so "1,050 kcal" is stable regardless of the visitor's locale (SPEC §6.1 pins en_US in tests).
const groupFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const NOT_PUBLISHED = "not published";

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

export function formatDensity(n: Pick<Nutrients, "calories" | "protein">): string {
  return `${halfUp(proteinPer100Cal(n), 1).toFixed(1)}g per 100 kcal`;
}

export function formatOptionalGrams(value: number | undefined): string {
  return value === undefined ? NOT_PUBLISHED : formatGrams(value);
}

export function formatSodium(value: number | undefined): string {
  return value === undefined ? NOT_PUBLISHED : `${formatInt(value)}mg`;
}

const saltFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fineFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** Small fat figures keep their published decimal (0.1g of trans fat must not read "0g"). */
export function formatFineGrams(value: number): string {
  return `${fineFmt.format(halfUp(value, 1))}g`;
}

/** Salt in grams, up to 2 decimals as the UK guides publish it: 0.9 → "0.9g", 1.25 → "1.25g". */
export function formatSalt(value: number | undefined): string {
  return value === undefined ? NOT_PUBLISHED : `${saltFmt.format(halfUp(value, 2))}g`;
}

/** "520 kcal · 32g protein · 55g carbs · 18g fat" — same order everywhere (SPEC §15). */
export function macroLine(n: Nutrients): string {
  if (n.protein === undefined || n.carbs === undefined || n.fat === undefined) return formatCalories(n.calories); // calories-only chain
  return `${formatCalories(n.calories)} · ${formatGrams(n.protein)} protein · ${formatGrams(n.carbs)} carbs · ${formatGrams(n.fat)} fat`;
}

/** "58g protein · 610 kcal · 9.5g per 100 kcal" — the "Best for you" reason line (SPEC §6.4). */
export function reasonLine(n: Nutrients): string {
  return `${formatGrams(n.protein ?? 0)} protein · ${formatCalories(n.calories)} · ${formatDensity(n)}`;
}

/** Screen-reader label with the same rounding as the display (SPEC §7). */
export function nutrientAriaLabel(name: string, n: Nutrients): string {
  return `${name}, ${nutrientsSpoken(n)}`;
}

/** The four main numbers as a screen reader should say them: "520 calories, 32 grams protein, 55 grams carbs, 18 grams fat". */
export function nutrientsSpoken(n: Nutrients): string {
  if (n.protein === undefined || n.carbs === undefined || n.fat === undefined) return `${formatInt(n.calories)} calories`; // calories-only chain
  return `${formatInt(n.calories)} calories, ${halfUp(n.protein)} grams protein, ${halfUp(n.carbs)} grams carbs, ${halfUp(n.fat)} grams fat`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" → "1 Oct 2026" (fixed format, no locale surprises). Returns the input if it isn't a date. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

/** Lower-case the first letter unless the second is upper-case ("No BBQ sauce" stays "no BBQ sauce"). */
export function lowerFirst(label: string): string {
  if (label.length > 1) {
    const second = label[1]!;
    if (second.toLowerCase() !== second && second.toUpperCase() === second) return label;
  }
  return label.slice(0, 1).toLowerCase() + label.slice(1);
}
