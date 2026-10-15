"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { mealSlotFor, MEALS, MEAL_LABEL } from "@/lib/mm/budget";
import { formatDate } from "@/lib/mm/format";
import { anyDietFilter, filterCaution, filterItems, groupByCategory, isNewItem, LARGE_MENU_ITEMS, searchItems, SECTION_PREVIEW_ITEMS, SORT_OPTIONS, sortItems, type SortKind } from "@/lib/mm/menu-view";
import { itemHref } from "@/lib/mm/routes";
import { settingsStore, favoritesStore, recentStore, toggleFavorite } from "@/lib/mm/stores";
import { recentFor } from "@/lib/mm/recent";
import type { Meal, MenuItem, Preferences } from "@/lib/mm/types";
import { BestForYou } from "../_components/BestForYou";
import { DietPicker, dietWords } from "../_components/DietPicker";
import { halalFor, HALAL_CAUTION } from "@/lib/mm/halal";
import { ChainMark } from "../_components/ChainMark";
import { ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, InfoIcon, SearchIcon, StarIcon } from "../_components/icons";
import { ItemThumb } from "../_components/ItemPhoto";
import { MacroLine } from "../_components/Nutrition";
import { ReportSheet } from "../_components/Submit";
import { Badge, Button, Chip, EmptyState, ErrorBox, inputClass, SampleBadge, Sheet, Spinner } from "../_components/ui";
import { useChain, useMenu, useNow, useStore } from "../_lib/hooks";
import { scrollToElement } from "../_lib/scroll";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// SPEC §7.4: header, meal chip, Best for you, full menu (sort, filter, tags), source footer.
// Kept plain for older users (founder 2026-10-11): the diet and allergy choices are one line ("Your diet: Vegetarian · Change") that opens
// the same big-button picker as Settings, instead of a row of chips.
// Real menus run to 650 rows, so the full menu has a sticky search + category bar, long menus open with each section
// trimmed (tap to show the rest), off-screen rows skip layout (.cv-row), and a small button brings Best for you back.

export function ChainScreen({ chainId }: { chainId: string }) {
  const t = useT();
  const { status, index, error, retry } = useChain(chainId);
  if (status === "loading") return (<Shell><Spinner label={t("Loading menu")} /></Shell>);
  if (status === "error" || !index) return (<Shell><ErrorBox message={error != null ? t(error) : t("Couldn't load this menu.")} onRetry={retry} /></Shell>);
  return <Loaded key={chainId} index={index} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div>
      <Link href="/app/eat-out" aria-label={t("Back to restaurants")} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
      {children}
    </div>
  );
}

function Loaded({ index }: { index: NonNullable<ReturnType<typeof useChain>["index"]> }) {
  const t = useT();
  const { chain } = index;
  const menu = useMenu();
  const now = useNow();
  const favorites = useStore(favoritesStore);
  const isFavorite = favorites.some((f) => f.chainId === chain.id);

  const [meal, setMeal] = useState<Meal>(() => mealSlotFor(new Date()));
  const [prefs, setPrefs] = useState<Preferences>(() => settingsStore.get().preferences);
  const [sort, setSort] = useState<SortKind>("menu");
  const [query, setQuery] = useState("");
  const [halalOpen, setHalalOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [flatLimit, setFlatLimit] = useState(FLAT_PAGE);
  const [reporting, setReporting] = useState<MenuItem | "any" | null>(null);
  const [dietOpen, setDietOpen] = useState(false);
  const halal = halalFor(chain.id);
  const hasAllergenData = useMemo(() => chain.items.some((i) => i.allergens), [chain.items]);
  const avoiding = prefs.avoidAllergens?.length ?? 0;

  const searching = query.trim().length > 0;
  const filtered = useMemo(() => filterItems(chain.items, prefs), [chain.items, prefs]);
  const visible = useMemo(() => sortItems(searchItems(filtered, query), sort), [filtered, query, sort]);
  const grouped = sort === "menu";
  const sections = useMemo(() => (grouped ? groupByCategory(chain, visible) : [{ category: "", items: visible }]), [chain, visible, grouped]);
  const large = chain.items.length > LARGE_MENU_ITEMS;
  const caloriesOnly = chain.nutritionLevel === "calories";
  const clearFilters = () => setPrefs({ vegetarianOnly: false, noPork: false, noBeef: false, ...(prefs.halalOnly ? { halalOnly: true } : {}) });
  const anyFilter = anyDietFilter(prefs);
  const caution = filterCaution(prefs, t);
  const showCategoryChips = grouped && !searching && sections.length > 1;

  const changeDiet = (next: Preferences) => {
    for (const key of ["vegetarianOnly", "veganOnly", "noPork", "noBeef"] as const) if (Boolean(next[key]) !== Boolean(prefs[key]) && next[key]) analytics.track({ name: "menuFiltered", kind: key });
    setPrefs(next);
  };
  const words = dietWords(t, prefs);
  const recentLog = useStore(recentStore);
  const recent = useMemo(() => recentFor(recentLog, chain.id, now).map((id) => index.items.get(id)).filter((i): i is MenuItem => !!i), [recentLog, chain.id, now, index]);

  const bestRef = useRef<HTMLElement>(null);
  const bestOffScreen = useScrolledPast(bestRef);
  const activeCategory = useActiveSection(showCategoryChips ? sections.map((s) => s.category) : []);

  const jumpToCategory = (category: string) => {
    setExpanded((e) => new Set(e).add(category));
    requestAnimationFrame(() => {
      const el = document.getElementById(sectionId(category));
      if (el) scrollToElement(el);
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/app/eat-out" aria-label={t("Back to restaurants")} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
        <button
          type="button"
          onClick={() => toggleFavorite(chain.id)}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? t("Remove {chain} from favourites", { chain: chain.name }) : t("Add {chain} to favourites", { chain: chain.name })}
          className={`glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong ${isFavorite ? "text-accent" : "text-muted"}`}
        >
          <StarIcon filled={isFavorite} />
        </button>
      </div>

      <div className="hero-card mt-4 overflow-hidden rounded-[2rem] p-5">
        <div className="flex items-center gap-4">
          <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="xl" />
          <div className="min-w-0">
            <h1 className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.03em]">{chain.name}</h1>
            <p className="kicker mt-0.5 flex flex-wrap items-center gap-x-2">{chain.cuisine ? t(chain.cuisine) : null} {chain.sample && <SampleBadge />}</p>
          </div>
        </div>
        {/* The data's limits come first: users must see them before trusting a number. */}
        <div className="mt-4 flex gap-3 border-t border-line pt-4 text-base">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 space-y-1.5">
            {chain.note && <p>{chain.note}</p>}
            {caloriesOnly && <p className="font-semibold">{t("{chain} publishes calories only: protein, carbs and fat aren't published, so there are no best-for-you picks, order builder or logging for this restaurant.", { chain: chain.name })}</p>}
            {halal && (
              <div>
                <p className="flex flex-wrap items-center gap-x-2">
                  <span className="font-semibold">{halal.scope === "some" ? t("Halal (some):") : t("Halal:")}</span>
                  <button type="button" aria-expanded={halalOpen} aria-controls="halal-quote" onClick={() => setHalalOpen((o) => !o)} className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline underline-offset-2">
                    {t("What {chain} says", { chain: chain.name })}
                    <ChevronRightIcon className={`h-4 w-4 transition-transform ${halalOpen ? "-rotate-90" : "rotate-90"}`} />
                  </button>
                </p>
                {halalOpen && (
                  <p id="halal-quote" className="mt-1 rounded-2xl bg-soft px-3 py-2">
                    &ldquo;{halal.statement}&rdquo;{" "}
                    <a href={halal.url} target="_blank" rel="noopener noreferrer" className="text-muted underline underline-offset-2">{t("{chain}'s website", { chain: chain.name })}</a>
                  </p>
                )}
              </div>
            )}
            <p className="app-numbers text-muted">
              <Rich
                text={t("{items} from {source}, checked {date}.")}
                values={{
                  items: <span className="font-semibold text-foreground">{t("{n} items", { n: chain.items.length })}</span>,
                  source: <a href={chain.source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{chain.source.title}</a>,
                  date: formatDate(chain.source.checkedOn, t),
                }}
              />
            </p>
          </div>
        </div>
      </div>
      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="mt-5">
          <h2 id="recent-heading" className="mb-2 flex items-center gap-2.5 text-xl font-extrabold tracking-tight">{t("Recently viewed")}</h2>
          <ItemList items={recent} chainId={chain.id} now={now} />
        </section>
      )}

      {/* One card: what Best for you is picked for (the meal and the person's diet), then the picks. The diet also narrows the full menu below. */}
      <section aria-labelledby="best-heading" ref={bestRef} className="glass mt-5 rounded-[1.75rem] p-4">
        {!caloriesOnly && (
          <>
            <h2 id="best-heading" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">{t("Best for you")}</h2>
            <p className="mb-1.5 mt-3 text-base font-bold">{t("Which meal?")}</p>
            <div className="flex flex-wrap gap-1 rounded-[1.5rem] bg-soft p-1" role="group" aria-label={t("Meal")}>
              {MEALS.map((m) => (
                <Chip key={m} segment className="flex-auto justify-center whitespace-nowrap px-3" selected={meal === m} onClick={() => setMeal(m)}>{t(MEAL_LABEL[m])}</Chip>
              ))}
            </div>
          </>
        )}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${caloriesOnly ? "" : "mt-3 border-t border-line pt-3"}`}>
          <p className="min-w-0 flex-1 text-base"><span className="font-bold">{t("Your diet:")}</span> {words.length ? words.join(" · ") : t("nothing left out")}</p>
          <Button variant="secondary" aria-haspopup="dialog" onClick={() => setDietOpen(true)}>{t("Change")}</Button>
        </div>
        {caution && <p className="mt-2 text-base text-muted">{caution}</p>}
        {prefs.halalOnly && !halal && <p className="mt-2 text-base text-muted">{t("{chain}'s website doesn't say its food is halal.", { chain: chain.name })} {t(HALAL_CAUTION)}</p>}
        {avoiding > 0 && !hasAllergenData && (
          <div role="note" className="mt-3 rounded-2xl bg-soft p-3 text-base">
            <p className="font-semibold">{t("{chain} hasn't published allergen details we can read, so its dishes can't be checked for allergies.", { chain: chain.name })}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {chain.allergenGuide && <a href={chain.allergenGuide.url} target="_blank" rel="noopener noreferrer" className="min-h-11 py-3 font-medium text-accent underline">{t("See its own allergen information")}</a>}
              <Button variant="secondary" onClick={() => setPrefs({ ...prefs, avoidAllergens: [] })}>{t("Show all dishes")}</Button>
            </div>
          </div>
        )}
        {!caloriesOnly && <div className="mt-4"><BestForYou bare index={index} meal={meal} preferences={prefs} onClearFilters={clearFilters} /></div>}
      </section>
      <Sheet open={dietOpen} onClose={() => setDietOpen(false)} title={t("Your diet")}>
        <DietPicker value={prefs} onChange={changeDiet} halal={false} />
        <div className="mt-4"><Button full onClick={() => setDietOpen(false)}>{t("Done")}</Button></div>
      </Sheet>

      <div className="mb-2 mt-8 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="full-menu" className="flex items-center gap-2.5 whitespace-nowrap text-xl font-extrabold tracking-tight">{t("Full menu")}</h2>
        <label className="flex items-center gap-2 text-base">
          <span className="sr-only">{t("Sort by")}</span>
          <select
            className={`${inputClass} min-h-12 w-auto py-0 text-base`}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKind);
              setFlatLimit(FLAT_PAGE);
              analytics.track({ name: "menuSorted", kind: e.target.value });
            }}
          >
            {SORT_OPTIONS.filter((o) => !caloriesOnly || o.value === "menu" || o.value === "calories").map((o) => (<option key={o.value} value={o.value}>{t(o.label)}</option>))}
          </select>
        </label>
      </div>

      {/* Sticky: search this menu, and jump between its sections. */}
      <div className="sticky top-0 z-10 -mx-5 border-b border-line bg-[color-mix(in_srgb,var(--background)_86%,transparent)] px-5 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFlatLimit(FLAT_PAGE);
            }}
            placeholder={t("Search the {chain} menu", { chain: chain.name })}
            aria-label={t("Search the {chain} menu", { chain: chain.name })}
            enterKeyHint="search"
            className="glass min-h-12 w-full rounded-full ps-11 pe-12 text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <button type="button" onClick={() => setQuery("")} aria-label={t("Clear search")} className="absolute end-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-foreground">
              <CloseIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        {showCategoryChips && <CategoryChips categories={sections.map((s) => s.category)} active={activeCategory} onJump={jumpToCategory} />}
      </div>

      <p role="status" aria-live="polite" className="app-numbers mt-3 min-h-5 text-sm text-muted">
        {searching ? (visible.length === 1 ? t("1 item matches") : t("{n} items match", { n: visible.length })) : anyFilter ? t("{n} of {total} items", { n: visible.length, total: chain.items.length }) : ""}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          title={searching ? t("Nothing on this menu matches “{query}”.", { query: query.trim() }) : t("Nothing here matches your filters.")}
          action={searching ? <Button variant="secondary" onClick={() => setQuery("")}>{t("Clear search")}</Button> : anyFilter ? <Button variant="secondary" onClick={clearFilters}>{t("Clear filters")}</Button> : undefined}
        />
      ) : grouped ? (
        sections.map((s) => {
          const open = !large || searching || expanded.has(s.category);
          const shown = open ? s.items : s.items.slice(0, SECTION_PREVIEW_ITEMS);
          const allExtras = s.items.every((i) => !i.rankable);
          return (
            <section key={s.category} id={sectionId(s.category)} data-category={s.category} aria-label={s.category} className="scroll-mt-36">
              <div className="mb-2 mt-6 flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-extrabold tracking-tight">{s.category}</h3>
                <span className="app-numbers rounded-full bg-soft-strong px-2.5 py-0.5 text-sm font-semibold text-muted">{s.items.length}</span>
              </div>
              {allExtras && <p className="-mt-1 mb-2 text-sm text-muted">{t("Not suggested in Best for you.")}</p>}
              <ItemList items={shown} chainId={chain.id} now={now} />
              {shown.length < s.items.length && (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => new Set(e).add(s.category))}
                  className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-dashed border-line px-3 text-base font-semibold text-accent transition hover:bg-accent-soft"
                >
                  {t("Show all {n} in {section}", { n: s.items.length, section: s.category })}
                </button>
              )}
            </section>
          );
        })
      ) : (
        <section aria-label={t("All items")}>
          <ItemList items={visible.slice(0, flatLimit)} chainId={chain.id} now={now} />
          {visible.length > flatLimit && (
            <button type="button" onClick={() => setFlatLimit((n) => n + FLAT_PAGE)} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-dashed border-line px-3 text-base font-semibold text-accent transition hover:bg-accent-soft">
              {t("Show {n} more", { n: Math.min(FLAT_PAGE, visible.length - flatLimit) })}
            </button>
          )}
        </section>
      )}

      <footer className="mt-10 space-y-2 border-t border-line pt-5 text-sm text-muted">
        <p>
          <Rich
            text={t("Source: {source}, checked {date}")}
            values={{
              source: <a href={chain.source.url} target="_blank" rel="noopener noreferrer" className="underline">{chain.source.title}</a>,
              date: formatDate(chain.source.checkedOn, t),
            }}
          />
        </p>
        <p>{t("Not affiliated with {chain}.", { chain: chain.name })}</p>
        <p>
          {t("Something look wrong?")}{" "}
          <button type="button" className="min-h-11 font-medium text-accent underline" onClick={() => setReporting("any")}>{t("Report a number")}</button>
        </p>
      </footer>

      {bestOffScreen && (
        <button
          type="button"
          onClick={() => bestRef.current?.scrollIntoView({ behavior: smoothScroll(), block: "start" })}
          className="glass sheet-in fixed bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] left-1/2 z-20 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--nav-bg)] px-5 text-sm font-bold text-accent shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl transition active:scale-95"
        >
          <ArrowUpIcon className="h-4 w-4" /> {t("Best for you")}
        </button>
      )}

      <ReportSheet
        open={reporting !== null}
        onClose={() => setReporting(null)}
        target={{ chainId: chain.id, chainName: chain.name, items: chain.items, ...(menu.dataVersion ? { dataVersion: menu.dataVersion } : {}) }}
      />
    </div>
  );
}

const FLAT_PAGE = 60;
const sectionId = (category: string) => `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
const smoothScroll = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

function ItemList({ items, chainId, now }: { items: readonly MenuItem[]; chainId: string; now: Date }) {
  const t = useT();
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const isNew = isNewItem(item, now);
        return (
          <li key={item.id} className="cv-row">
            <Link
              href={itemHref(chainId, item.id)}
              prefetch={false}
              onClick={() => analytics.track({ name: "itemOpened", chainId })}
              className={`group flex items-center justify-between gap-3 rounded-[1.35rem] px-3.5 transition active:scale-[0.99] hover:bg-soft-strong ${item.rankable ? "glass min-h-16 py-3" : "min-h-14 border border-line py-2.5"}`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <ItemThumb image={item.image} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`text-base tracking-tight ${item.rankable ? "font-bold" : "font-semibold"}`}>{item.name}</span>
                    {isNew && <Badge tone="accent">{t("New")}</Badge>}
                    {item.limitedTime && <Badge>{t("Limited time")}</Badge>}
                  </span>
                  {item.serving && !item.rankable && <span className="sr-only">, {item.serving}</span>}
                  <MacroLine nutrients={item.nutrients} />
                </span>
              </span>
              <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-soft-strong text-muted transition group-hover:text-accent">
                <ChevronRightIcon className="h-4 w-4" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function CategoryChips({ categories, active, onJump }: { categories: string[]; active: string | null; onJump: (c: string) => void }) {
  const t = useT();
  const row = useRef<HTMLDivElement>(null);
  // Keep the current section's chip in view as the page scrolls (horizontal only: never moves the page).
  useEffect(() => {
    const r = row.current;
    const chip = active ? r?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(active)}"]`) : null;
    if (!r || !chip) return;
    const left = chip.offsetLeft - r.clientWidth / 2 + chip.clientWidth / 2;
    r.scrollTo({ left, behavior: smoothScroll() });
  }, [active]);
  return (
    <div ref={row} role="group" aria-label={t("Menu sections")} className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
      {categories.map((c) => (
        <Chip key={c} data-chip={c} selected={active === c} onClick={() => onJump(c)}>{c}</Chip>
      ))}
    </div>
  );
}

/** True once the element has scrolled up and out of view (not before the user reaches it). */
function useScrolledPast(ref: React.RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setPast(!!e && !e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return past;
}

/** Which menu section is at the top of the screen (under the sticky bar), for the category chips. */
function useActiveSection(categories: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = categories.join("\u0000");
  useEffect(() => {
    if (!key || typeof IntersectionObserver === "undefined") return;
    const els = key.split("\u0000").map((c) => document.getElementById(sectionId(c))).filter((e): e is HTMLElement => e !== null);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive((top.target as HTMLElement).dataset.category ?? null);
      },
      { rootMargin: "-150px 0px -55% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [key]);
  return categories.includes(active ?? "") ? active : null;
}
