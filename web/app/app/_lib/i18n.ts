"use client";

import { useSyncExternalStore } from "react";
import { englishT, localeInfo, translate, type Dict, type Locale, type T } from "@/lib/mm/i18n";
import { possessive } from "@/lib/mm/shopProducts";

// The language the app is shown in (lib/mm/i18n.ts). Each language's dictionary is its own small file, loaded only when that
// language is chosen (and kept for offline use by the service worker like the rest of the app's code).

const LOADERS: Record<Exclude<Locale, "en">, () => Promise<{ default: Dict }>> = {
  pl: () => import("@/lib/mm/locales/pl.json"),
  ro: () => import("@/lib/mm/locales/ro.json"),
  pa: () => import("@/lib/mm/locales/pa.json"),
  ur: () => import("@/lib/mm/locales/ur.json"),
  pt: () => import("@/lib/mm/locales/pt.json"),
  es: () => import("@/lib/mm/locales/es.json"),
  ar: () => import("@/lib/mm/locales/ar.json"),
  bn: () => import("@/lib/mm/locales/bn.json"),
  gu: () => import("@/lib/mm/locales/gu.json"),
  it: () => import("@/lib/mm/locales/it.json"),
};

interface LanguageState {
  locale: Locale;
  t: T;
}

let state: LanguageState = { locale: "en", t: englishT };
let request = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** <html lang> and dir (Urdu and Arabic read right to left); also lets the page show again if it was hidden until the words arrived. */
export function applyDocumentLanguage(locale: Locale): void {
  if (typeof document === "undefined") return;
  const info = localeInfo(locale);
  document.documentElement.lang = info.htmlLang;
  document.documentElement.dir = info.dir;
}

function done(): void {
  if (typeof document !== "undefined") delete document.documentElement.dataset.i18nPending;
}

/** Show the app in `locale` (loads its words first; English needs none). A failed load leaves the app in English. */
export async function setLanguage(locale: Locale): Promise<void> {
  const mine = ++request;
  applyDocumentLanguage(locale);
  if (locale === "en") {
    state = { locale, t: englishT };
  } else {
    try {
      const dict = (await LOADERS[locale]()).default;
      if (mine !== request) return; // another language was picked meanwhile
      state = { locale, t: (english, vars) => translate(dict, english, vars) };
    } catch {
      if (mine !== request) return;
      applyDocumentLanguage("en");
      state = { locale: "en", t: englishT };
    }
  }
  done();
  listeners.forEach((fn) => fn());
}

const getT = () => state.t;
const getLocale = () => state.locale;
const serverT = () => englishT;
const serverLocale = (): Locale => "en";

/** The translate function for the current language: `t("English text", { n: 3 })`. */
export function useT(): T {
  return useSyncExternalStore(subscribe, getT, serverT);
}

/** The language the app is shown in right now. */
export function useLanguage(): Locale {
  return useSyncExternalStore(subscribe, getLocale, serverLocale);
}

/** A shop's name for "{shopPossessive}" in our text: "Tesco's" in English; other languages build their own form around the plain name. */
export function usePossessive(): (name: string) => string {
  return useLanguage() === "en" ? possessive : plainName;
}
const plainName = (name: string) => name;
