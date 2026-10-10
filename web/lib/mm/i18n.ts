// The app's languages (founder 2026-10-10: "the first screen should be a screen where they choose their language"). English plus
// the ten most-spoken main languages in England and Wales after English (ONS, Census 2021). Every piece of our own text goes
// through `t("English text", { vars })`: the English text is the key, each language's dictionary maps it to a translation, and a
// missing entry shows the English. What restaurants and shops publish (dish, product and chain names, their notes and quotes)
// is shown as they publish it, in English, and never translated by us.
//
// Rules for keys: a plain double-quoted string literal inside t("…") or tk("…"), so tests/i18n.test.ts can find every one; values go
// in {placeholders}. Text built from data (recipes, pantry labels...) is collected by that test from the data itself.

export type Locale = "en" | "pl" | "ro" | "pa" | "ur" | "pt" | "es" | "ar" | "bn" | "gu" | "it";

export interface LocaleInfo {
  code: Locale;
  /** The language's name in itself, as its speakers write it. */
  name: string;
  /** Its name in English (shown under the own name). */
  english: string;
  dir: "ltr" | "rtl";
  /** The value for <html lang>. */
  htmlLang: string;
}

export const LOCALES: readonly LocaleInfo[] = [
  { code: "en", name: "English", english: "English", dir: "ltr", htmlLang: "en-GB" },
  { code: "pl", name: "Polski", english: "Polish", dir: "ltr", htmlLang: "pl" },
  { code: "ro", name: "Română", english: "Romanian", dir: "ltr", htmlLang: "ro" },
  { code: "pa", name: "ਪੰਜਾਬੀ", english: "Punjabi", dir: "ltr", htmlLang: "pa" },
  { code: "ur", name: "اردو", english: "Urdu", dir: "rtl", htmlLang: "ur" },
  { code: "pt", name: "Português", english: "Portuguese", dir: "ltr", htmlLang: "pt" },
  { code: "es", name: "Español", english: "Spanish", dir: "ltr", htmlLang: "es" },
  { code: "ar", name: "العربية", english: "Arabic", dir: "rtl", htmlLang: "ar" },
  { code: "bn", name: "বাংলা", english: "Bengali", dir: "ltr", htmlLang: "bn" },
  { code: "gu", name: "ગુજરાતી", english: "Gujarati", dir: "ltr", htmlLang: "gu" },
  { code: "it", name: "Italiano", english: "Italian", dir: "ltr", htmlLang: "it" },
];

export const LOCALE_CODES: readonly Locale[] = LOCALES.map((l) => l.code);
export const isLocale = (x: unknown): x is Locale => typeof x === "string" && (LOCALE_CODES as readonly string[]).includes(x);
export const localeInfo = (code: Locale | undefined): LocaleInfo => LOCALES.find((l) => l.code === code) ?? LOCALES[0]!;

/** A language's dictionary: English text → translation. */
export type Dict = Readonly<Record<string, string>>;
export type Vars = Readonly<Record<string, string | number>>;
/** The translate function screens and helpers receive. */
export type T = (english: string, vars?: Vars) => string;

/** Put values into {placeholders}; a placeholder with no value is left as it is. */
export function format(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** The translation of `english` (or the English when the dictionary has none), with its values filled in. */
export function translate(dict: Dict | null | undefined, english: string, vars?: Vars): string {
  const s = dict?.[english];
  return format(typeof s === "string" && s.trim() !== "" ? s : english, vars);
}

/** Marks a string written outside a component (a list of options, a constant) as text to translate where it's shown with t(x). */
export const tk = (english: string): string => english;

/** English, for helpers called without a translator (tests, the server). */
export const englishT: T = (english, vars) => format(english, vars);

/** The placeholders a text uses, sorted ("{n} of {total}" → ["n", "total"]): a translation must use the same ones. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
}

/** The browser's preferred language if we have it (only to pre-select a choice on the language screen; never sent anywhere). */
export function guessLocale(preferred: readonly string[] | undefined): Locale {
  for (const tag of preferred ?? []) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}
