"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { tk } from "@/lib/mm/i18n";
import { filterCaution } from "@/lib/mm/menu-view";
import { mealTargetFor } from "@/lib/mm/mealTarget";
import type { CatalogChain } from "@/lib/mm/menu-client";
import { findRestaurants, hasLimits, hasMacroLimits, limitsToParams, toAsciiDigits, type FinderHit, type FinderResult, type NumberLimits } from "@/lib/mm/numbers";
import { chainHref } from "@/lib/mm/routes";
import { ALLERGEN_KEYS, type AllergenKey, type Preferences } from "@/lib/mm/types";
import { AllergenTiles, dietWords } from "../_components/DietPicker";
import { ChainMark } from "../_components/ChainMark";
import { ChevronRightIcon } from "../_components/icons";
import { Button, EmptyIcon, EmptyState, ErrorBox, Spinner } from "../_components/ui";
import { chainGroupClass } from "../_components/ChainRow";
import { NumberDone } from "../_components/SearchDone";
import { SearchIcon } from "../_components/icons";
import { menuClient } from "../_lib/menu";
import { scrollToElement } from "../_lib/scroll";
import { useNumbers, useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// Find a restaurant by your numbers (founder 2026-10-15: "another way where you can input the macros like calories, protein and fat to filter
// the restaurants, also a way to filter by allergies"). It sits in Eat out's "More ways to find a restaurant": four boxes (calories up to, protein
// at least, carbs up to, fat up to) and the 14 allergens; the list then shows only the restaurants with at least one dish that fits everything,
// how many do, and one example. Your saved diet and allergies always count too. Nothing is estimated: see lib/mm/numbers.ts.

const FIELDS = [
  { key: "kcal", label: tk("Calories, up to") },
  { key: "protein", label: tk("Protein, at least (g)") },
  { key: "carbs", label: tk("Carbs, up to (g)") },
  { key: "fat", label: tk("Fat, up to (g)") },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

const PAGE = 40;

export interface NumbersFinderState {
  fields: Record<FieldKey, string>;
  setField: (k: FieldKey, v: string) => void;
  limits: NumberLimits;
  /** The allergies picked here (the saved ones also count: see `prefs`). */
  picked: readonly AllergenKey[];
  toggleAllergen: (k: AllergenKey) => void;
  /** The person's saved diet and allergies plus the allergies picked here. */
  prefs: Preferences;
  /** The panel is open (the Eat out row). Kept with the numbers, so coming back from a restaurant finds both as they were. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Anything typed or picked: the list shows the finder's results instead of every restaurant. */
  active: boolean;
  reset: () => void;
  useMine: (() => void) | null;
}

const EMPTY_FIELDS: Record<FieldKey, string> = { kcal: "", protein: "", carbs: "", fat: "" };

// What was typed and picked is kept for this tab (sessionStorage, on this device only, like the type chosen under "More ways"), so that opening a restaurant
// from the results and coming back finds the panel, the numbers and the allergies as they were.
const FINDER_KEY = "mm.finder";
interface SavedFinder { fields: Record<FieldKey, string>; picked: AllergenKey[]; open: boolean }

function readSavedFinder(): SavedFinder {
  const empty: SavedFinder = { fields: EMPTY_FIELDS, picked: [], open: false };
  try {
    const raw = JSON.parse(sessionStorage.getItem(FINDER_KEY) ?? "null") as Partial<SavedFinder> | null;
    if (!raw || typeof raw !== "object") return empty;
    const fields = { ...EMPTY_FIELDS };
    for (const f of FIELDS) {
      const v = raw.fields?.[f.key];
      if (typeof v === "string") fields[f.key] = toAsciiDigits(v).replace(/[^\d]/g, "").slice(0, 4);
    }
    const listed = Array.isArray(raw.picked) ? (raw.picked as string[]) : [];
    return { fields, picked: ALLERGEN_KEYS.filter((k) => listed.includes(k)), open: raw.open === true };
  } catch {
    return empty; // storage blocked (or nothing there): start empty
  }
}

/** The finder's inputs, kept by Eat out so the panel and the results share them. */
export function useNumbersFinder(): NumbersFinderState {
  const settings = useSettings();
  // read once, when the page is built; the page shows a spinner until it has hydrated, so what is restored is never seen as a mismatch
  const [start] = useState(readSavedFinder);
  const [fields, setFields] = useState(start.fields);
  const [picked, setPicked] = useState<readonly AllergenKey[]>(start.picked);
  const [open, setOpen] = useState(start.open);
  useEffect(() => {
    try {
      if (open || picked.length > 0 || Object.values(fields).some((v) => v !== "")) sessionStorage.setItem(FINDER_KEY, JSON.stringify({ fields, picked, open }));
      else sessionStorage.removeItem(FINDER_KEY);
    } catch { /* not remembered, still works */ }
  }, [fields, picked, open]);
  const limits = useMemo<NumberLimits>(() => {
    const num = (s: string): number | undefined => {
      const n = Number(s);
      return s.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 5000 ? n : undefined;
    };
    const out: NumberLimits = {};
    const kcal = num(fields.kcal), protein = num(fields.protein), carbs = num(fields.carbs), fat = num(fields.fat);
    if (kcal !== undefined) out.maxCalories = kcal;
    if (protein !== undefined) out.minProtein = protein;
    if (carbs !== undefined) out.maxCarbs = carbs;
    if (fat !== undefined) out.maxFat = fat;
    return out;
  }, [fields]);
  const saved = settings.preferences;
  const prefs = useMemo<Preferences>(() => {
    const all = ALLERGEN_KEYS.filter((k) => picked.includes(k) || (saved.avoidAllergens ?? []).includes(k));
    const { avoidAllergens: _drop, ...rest } = saved; // eslint-disable-line @typescript-eslint/no-unused-vars
    return all.length > 0 ? { ...rest, avoidAllergens: all } : rest;
  }, [saved, picked]);
  const target = mealTargetFor(settings);
  return {
    fields,
    setField: (k, v) => setFields((f) => ({ ...f, [k]: toAsciiDigits(v).replace(/[^\d]/g, "").slice(0, 4) })),
    limits,
    picked,
    toggleAllergen: (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k])),
    prefs,
    open,
    setOpen,
    active: hasLimits(limits) || picked.length > 0,
    reset: () => { setFields(EMPTY_FIELDS); setPicked([]); },
    useMine: target
      ? () => setFields({
          kcal: String(Math.round(target.kcal)),
          protein: target.protein ? String(Math.round(target.protein)) : "",
          carbs: target.carbsMax ? String(Math.round(target.carbsMax)) : "",
          fat: target.fatMax ? String(Math.round(target.fatMax)) : "",
        })
      : null,
  };
}

/** One number box, like Settings' target tiles. */
function NumberBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block min-w-0 cursor-text rounded-[1rem] bg-[var(--fill)] px-4 pb-3 pt-3.5 transition-shadow focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
      <span className="block text-[0.8125rem] font-semibold leading-snug text-muted [overflow-wrap:anywhere]">{label}</span>
      <input
        className="app-numbers mt-1 block w-full min-w-0 bg-transparent text-[1.625rem] font-medium leading-tight tracking-[-0.01em] placeholder:text-muted focus-visible:outline-none!"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        placeholder="–"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Scroll the list of restaurants that fit to the top of the screen (the heading of Eat out's results carries this id). */
function showResults() {
  const el = document.getElementById(RESULTS_ID);
  if (el) scrollToElement(el);
}

/** The boxes and the allergy buttons, and under the boxes one line saying what the numbers found (the list itself can be a screen further down). */
export function NumbersPanel({ state, found }: { state: NumbersFinderState; found: FinderFound }) {
  const t = useT();
  const settings = useSettings();
  const words = dietWords(t, settings.preferences);
  const { hits, result, failed } = found;
  const summary = !state.active ? null
    : failed ? t("Couldn't load the numbers just now.")
    : !result ? t("Finding restaurants…")
    : hits.length === 0 ? t("No restaurant has a dish that fits all of that")
    : hits.length === 1 ? t("1 restaurant has dishes that fit")
    : t("{n} restaurants have dishes that fit", { n: hits.length });
  return (
    <div className="glass mt-3.5 rounded-[1.25rem] p-4">
      {/* The number pad has no Return key, so while a box is in use a Done shows at the top corner of the card, where it takes no room and moves nothing. */}
      <div className="group/nums relative">
        <p className="pe-20 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t("Your numbers")}</p>
        <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{t("Type any of these to see the restaurants with dishes that fit. Leave the rest empty.")}</p>
        <NumberDone onDone={showResults} />
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2.5">
          {FIELDS.map((f) => (<NumberBox key={f.key} label={t(f.label)} value={state.fields[f.key]} onChange={(v) => state.setField(f.key, v)} />))}
        </div>
      </div>
      {/* One live line, always there while the panel is: a change from "Finding…" to a count to "No restaurant…" is a change of its text, which a screen reader announces. */}
      <p role="status" className="mt-3 min-h-6 text-[0.9375rem] font-semibold leading-snug">
        {summary !== null && (result && hits.length > 0 ? (
          <a href={`#${RESULTS_ID}`} onClick={(e) => { e.preventDefault(); showResults(); }} className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-2">
            {summary}
            <ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 rotate-90 rtl:scale-x-100!" />
          </a>
        ) : summary)}
      </p>
      {state.useMine && (
        <button type="button" onClick={state.useMine} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--fill)] px-4 text-[0.9375rem] font-semibold transition active:scale-95 hover:bg-soft-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {t("Use my meal numbers")}
        </button>
      )}
      <div aria-hidden className="mx-1 mb-4 mt-5 h-px bg-line" />
      <p className="mb-3 px-1 text-[0.6875rem] font-semibold uppercase leading-snug tracking-[0.12em] text-muted">{t("Allergies to avoid")}</p>
      <AllergenTiles chosen={state.picked} label={t("Allergies to avoid")} onToggle={state.toggleAllergen} />
      {words.length > 0 && (
        <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1 text-[0.9375rem] leading-snug">
          <span><span className="font-bold">{t("Your diet:")}</span> {words.join(" · ")}</span>
          <Link href="/app/settings#diet" className="-my-2 inline-flex min-h-11 items-center px-2 font-semibold text-accent underline underline-offset-2">{t("Change")}</Link>
        </p>
      )}
      {state.active && (
        <div className="mt-4"><Button variant="secondary" onClick={state.reset}>{t("Clear")}</Button></div>
      )}
    </div>
  );
}

/** One restaurant in the results: the tile and name, how many dishes fit and one example. */
function FinderRow({ hit, chain, params }: { hit: FinderHit; chain: CatalogChain | undefined; params: string }) {
  const t = useT();
  const e = hit.example;
  return (
    <Link href={`${chainHref(hit.chainId)}${params ? `&${params}` : ""}`} className="group flex items-center gap-3.5 px-4 min-h-[4.75rem] py-3 transition-colors hover:bg-[var(--fill)] active:bg-soft-strong focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]!">
      <ChainMark chainId={hit.chainId} cuisine={chain?.cuisine} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]">{hit.name}</span>
        <span className="app-numbers mt-0.5 block text-sm font-semibold leading-snug">{hit.count === 1 ? t("1 dish fits") : t("{n} dishes fit", { n: hit.count })}</span>
        <span className="app-numbers mt-0.5 block text-sm leading-snug text-muted [overflow-wrap:anywhere]">
          {e.name} · {e.calories} kcal{e.protein !== null ? ` · ${Math.round(e.protein)}g ${t("protein")}` : ""}
        </span>
      </span>
      <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

const RESULTS_ID = "finder-results";

/** What the finder found, for the line under the boxes and for the list further down. */
export interface FinderFound {
  /** null until the menus (and, for protein, carbs or fat, the numbers file) have loaded. */
  result: FinderResult | null;
  /** The restaurants that fit, most dishes first, after the type, halal and full-nutrition choices. */
  hits: FinderHit[];
  /** The numbers couldn't be loaded. */
  failed: boolean;
}

/** Find the restaurants that fit: once, here, so that the panel and the list agree. `allowed` = the restaurants the type, halal and full-nutrition choices leave in. */
export function useFinderResults(state: NumbersFinderState, allowed: ReadonlySet<string>): FinderFound {
  const { limits, prefs } = state;
  const macros = hasMacroLimits(limits);
  const { searchIndex, searchReady, numbers, status } = useNumbers(state.open && state.active);
  const result = useMemo(
    () => (state.open && state.active && searchReady && (!macros || numbers) ? findRestaurants(searchIndex, numbers, limits, prefs) : null),
    [state.open, state.active, searchReady, macros, numbers, searchIndex, limits, prefs],
  );
  const hits = useMemo(() => (result ? result.hits.filter((h) => allowed.has(h.chainId)) : []), [result, allowed]);
  const failed = !result && (status === "unavailable" || (!searchReady && status === "ready"));
  return { result, hits, failed };
}

/** The restaurants that fit, most dishes first. */
export function FinderResults({ state, chains, found }: { state: NumbersFinderState; chains: readonly CatalogChain[]; found: FinderFound }) {
  const t = useT();
  const { limits, prefs, picked } = state;
  const { result, hits, failed } = found;
  const [limit, setLimit] = useState(PAGE);
  const byId = useMemo(() => new Map(chains.map((c) => [c.id, c])), [chains]);
  const params = limitsToParams(limits, picked);
  const caution = filterCaution(prefs, t);

  if (!result) {
    if (failed) return <div className="mt-6"><ErrorBox message={t("Couldn't load the numbers just now.")} onRetry={() => void menuClient.ensureNumbers()} /></div>;
    return <Spinner label={t("Finding restaurants…")} />;
  }
  return (
    <section id={RESULTS_ID} aria-label={t("Restaurants that fit")} className="mt-5 scroll-mt-4">
      {hits.length > 0 && (
        <h2 className="text-xl font-[800] tracking-[-0.01em]">
          {hits.length === 1 ? t("1 restaurant has dishes that fit") : t("{n} restaurants have dishes that fit", { n: hits.length })}
        </h2>
      )}
      {/* where the count is: "dishes that fit" must not read as "safe to eat" */}
      {caution && <p className="mt-2 px-1 text-[0.9375rem] leading-snug text-muted">{caution}</p>}
      {hits.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={<EmptyIcon><SearchIcon /></EmptyIcon>} title={t("No restaurant has a dish that fits all of that")} body={t("Try a higher calorie limit, a lower protein or fewer allergies.")} />
        </div>
      ) : (
        <div className={`mt-3.5 ${chainGroupClass}`}>
          {hits.slice(0, limit).map((h) => (<FinderRow key={h.chainId} hit={h} chain={byId.get(h.chainId)} params={params} />))}
        </div>
      )}
      {hits.length > limit && <div className="mt-3.5"><Button full variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>{t("Show more restaurants")}</Button></div>}
      <div className="mt-4 space-y-2 px-1 text-[0.9375rem] leading-snug text-muted">
        <p>{t("These count every item on a menu, sides and drinks included, as each restaurant publishes it.")}</p>
        {result.caloriesOnly > 0 && <p>{t("Restaurants that publish calories only are left out when you ask for protein, carbs or fat.")}</p>}
        {picked.length + (prefs.avoidAllergens?.length ?? 0) > 0 && result.noAllergenGuide > 0 && <p>{t("Restaurants that don't publish an allergen guide are left out while you have allergies chosen.")}</p>}
      </div>
    </section>
  );
}
