"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { mealSlotFor, MEALS, MEAL_LABEL } from "@/lib/mm/budget";
import { formatDate } from "@/lib/mm/format";
import { filterCaution, filterItems, groupByCategory, isNewItem, LARGE_MENU_ITEMS, searchItems, SECTION_PREVIEW_ITEMS, SORT_OPTIONS, sortItems, type SortKind } from "@/lib/mm/menu-view";
import { itemHref } from "@/lib/mm/routes";
import { settingsStore, favoritesStore, toggleFavorite } from "@/lib/mm/stores";
import type { Meal, MenuItem, Preferences } from "@/lib/mm/types";
import { BestForYou } from "../_components/BestForYou";
import { ChainMark } from "../_components/ChainMark";
import { ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, InfoIcon, SearchIcon, StarIcon } from "../_components/icons";
import { ItemThumb } from "../_components/ItemPhoto";
import { MacroLine } from "../_components/Nutrition";
import { ReportSheet } from "../_components/Submit";
import { Badge, Button, Chip, EmptyState, ErrorBox, inputClass, SampleBadge, Spinner } from "../_components/ui";
import { useChain, useMenu, useNow, useStore } from "../_lib/hooks";
import { scrollToElement } from "../_lib/scroll";

// SPEC §7.4: header, meal chip, Best for you, full menu (sort, filter, tags), source footer.
// Real menus run to 650 rows, so the full menu has a sticky search + category bar, long menus open with each section
// trimmed (tap to show the rest), off-screen rows skip layout (.cv-row), and a small button brings Best for you back.

export function ChainScreen({ chainId }: { chainId: string }) {
  const { status, index, error, retry } = useChain(chainId);
  if (status === "loading") return (<Shell><Spinner label="Loading menu" /></Shell>);
  if (status === "error" || !index) return (<Shell><ErrorBox message={error ?? "Couldn't load this menu."} onRetry={retry} /></Shell>);
  return <Loaded key={chainId} index={index} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Link href="/app" aria-label="Back to home" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      {children}
    </div>
  );
}

function Loaded({ index }: { index: NonNullable<ReturnType<typeof useChain>["index"]> }) {
  const { chain } = index;
  const menu = useMenu();
  const now = useNow();
  const favorites = useStore(favoritesStore);
  const isFavorite = favorites.some((f) => f.chainId === chain.id);

  const [meal, setMeal] = useState<Meal>(() => mealSlotFor(new Date()));
  const [prefs, setPrefs] = useState<Preferences>(() => settingsStore.get().preferences);
  const [sort, setSort] = useState<SortKind>("menu");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [flatLimit, setFlatLimit] = useState(FLAT_PAGE);
  const [reporting, setReporting] = useState<MenuItem | "any" | null>(null);

  const searching = query.trim().length > 0;
  const filtered = useMemo(() => filterItems(chain.items, prefs), [chain.items, prefs]);
  const visible = useMemo(() => sortItems(searchItems(filtered, query), sort), [filtered, query, sort]);
  const grouped = sort === "menu";
  const sections = useMemo(() => (grouped ? groupByCategory(chain, visible) : [{ category: "", items: visible }]), [chain, visible, grouped]);
  const large = chain.items.length > LARGE_MENU_ITEMS;
  const caloriesOnly = chain.nutritionLevel === "calories";
  const clearFilters = () => setPrefs({ vegetarianOnly: false, noPork: false, noBeef: false });
  const anyFilter = prefs.vegetarianOnly || prefs.noPork || prefs.noBeef;
  const caution = filterCaution(prefs);
  const showCategoryChips = grouped && !searching && sections.length > 1;

  const setPref = (key: keyof Preferences) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    analytics.track({ name: "menuFiltered", kind: key });
  };

  const bestRef = useRef<HTMLDivElement>(null);
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
        <Link href="/app" aria-label="Back to home" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
        <button
          type="button"
          onClick={() => toggleFavorite(chain.id)}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Remove ${chain.name} from favourites` : `Add ${chain.name} to favourites`}
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
            <p className="kicker mt-0.5 flex flex-wrap items-center gap-x-2">{chain.cuisine} {chain.sample && <SampleBadge />}</p>
          </div>
        </div>
        {/* The data's limits come first: users must see them before trusting a number. */}
        <div className="mt-4 flex gap-3 border-t border-line pt-4 text-sm">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 space-y-1.5">
            {chain.note && <p>{chain.note}</p>}
            {caloriesOnly && <p className="font-semibold">{chain.name} publishes calories only: protein, carbs and fat aren&apos;t published, so there are no best-for-you picks, order builder or logging for this restaurant.</p>}
            <p className="app-numbers text-muted">
              <span className="font-semibold text-foreground">{chain.items.length} items</span> from{" "}
              <a href={chain.source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{chain.source.title}</a>, checked {formatDate(chain.source.checkedOn)}.
            </p>
          </div>
        </div>
      </div>
      {!caloriesOnly && (
        <div className="glass mt-5 flex flex-wrap gap-1 rounded-[1.75rem] p-1" role="group" aria-label="Meal">
          {MEALS.map((m) => (
            <Chip key={m} segment className="flex-1 justify-center" selected={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filters">
        <Chip selected={prefs.vegetarianOnly} onClick={() => setPref("vegetarianOnly")}>Vegetarian</Chip>
        <Chip selected={prefs.noPork} onClick={() => setPref("noPork")}>No pork</Chip>
        <Chip selected={prefs.noBeef} onClick={() => setPref("noBeef")}>No beef</Chip>
      </div>
      {caution && <p className="mt-2 text-sm text-muted">{caution}</p>}

      <div ref={bestRef}>
        {!caloriesOnly && <BestForYou index={index} meal={meal} preferences={prefs} onClearFilters={clearFilters} />}
      </div>

      <div className="mb-2 mt-10 flex items-center justify-between gap-3">
        <h2 id="full-menu" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight"><span aria-hidden className="bg-sun h-5 w-1.5 shrink-0 rounded-full" />Full menu</h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Sort by</span>
          <select
            className={`${inputClass} min-h-11 w-auto py-0 text-sm`}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKind);
              setFlatLimit(FLAT_PAGE);
              analytics.track({ name: "menuSorted", kind: e.target.value });
            }}
          >
            {SORT_OPTIONS.filter((o) => !caloriesOnly || o.value === "menu" || o.value === "calories").map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </label>
      </div>

      {/* Sticky: search this menu, and jump between its sections. */}
      <div className="sticky top-0 z-10 -mx-5 border-b border-line bg-[color-mix(in_srgb,var(--background)_86%,transparent)] px-5 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setFlatLimit(FLAT_PAGE);
            }}
            placeholder={`Search the ${chain.name} menu`}
            aria-label={`Search the ${chain.name} menu`}
            enterKeyHint="search"
            className="glass min-h-12 w-full rounded-full pl-11 pr-12 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-foreground">
              <CloseIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        {showCategoryChips && <CategoryChips categories={sections.map((s) => s.category)} active={activeCategory} onJump={jumpToCategory} />}
      </div>

      <p role="status" aria-live="polite" className="app-numbers mt-3 min-h-5 text-sm text-muted">
        {searching ? (visible.length === 1 ? "1 item matches" : `${visible.length} items match`) : anyFilter ? `${visible.length} of ${chain.items.length} items` : ""}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          title={searching ? `Nothing on this menu matches \u201c${query.trim()}\u201d.` : "Nothing here matches your filters."}
          action={searching ? <Button variant="secondary" onClick={() => setQuery("")}>Clear search</Button> : anyFilter ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined}
        />
      ) : grouped ? (
        sections.map((s) => {
          const open = !large || searching || expanded.has(s.category);
          const shown = open ? s.items : s.items.slice(0, SECTION_PREVIEW_ITEMS);
          const allExtras = s.items.every((i) => !i.rankable);
          return (
            <section key={s.category} id={sectionId(s.category)} data-category={s.category} aria-label={s.category} className="scroll-mt-36">
              <div className="mb-2 mt-6 flex items-baseline justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{s.category}</h3>
                <span className="app-numbers rounded-full bg-soft-strong px-2 py-0.5 text-xs font-semibold text-muted">{s.items.length}</span>
              </div>
              {allExtras && <p className="-mt-1 mb-2 text-xs text-muted">Not suggested in Best for you.</p>}
              <ItemList items={shown} chainId={chain.id} now={now} />
              {shown.length < s.items.length && (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => new Set(e).add(s.category))}
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-dashed border-line text-sm font-semibold text-accent transition hover:bg-accent-soft"
                >
                  Show all {s.items.length} in {s.category}
                </button>
              )}
            </section>
          );
        })
      ) : (
        <section aria-label="All items">
          <ItemList items={visible.slice(0, flatLimit)} chainId={chain.id} now={now} />
          {visible.length > flatLimit && (
            <button type="button" onClick={() => setFlatLimit((n) => n + FLAT_PAGE)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-dashed border-line text-sm font-semibold text-accent transition hover:bg-accent-soft">
              Show {Math.min(FLAT_PAGE, visible.length - flatLimit)} more
            </button>
          )}
        </section>
      )}

      <footer className="mt-10 space-y-2 border-t border-line pt-5 text-sm text-muted">
        <p>
          Source:{" "}
          <a href={chain.source.url} target="_blank" rel="noopener noreferrer" className="underline">{chain.source.title}</a>, checked {formatDate(chain.source.checkedOn)}
        </p>
        <p>Not affiliated with {chain.name}.</p>
        <p>
          Something look wrong?{" "}
          <button type="button" className="min-h-11 font-medium text-accent underline" onClick={() => setReporting("any")}>Report a number</button>
        </p>
      </footer>

      {bestOffScreen && (
        <button
          type="button"
          onClick={() => bestRef.current?.scrollIntoView({ behavior: smoothScroll(), block: "start" })}
          className="glass sheet-in fixed bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] left-1/2 z-20 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--nav-bg)] px-5 text-sm font-bold text-accent shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl transition active:scale-95"
        >
          <ArrowUpIcon className="h-4 w-4" /> Best for you
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
                    <span className={`tracking-tight ${item.rankable ? "text-base font-bold" : "text-[15px] font-semibold"}`}>{item.name}</span>
                    {isNew && <Badge tone="accent">New</Badge>}
                    {item.limitedTime && <Badge>Limited time</Badge>}
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
    <div ref={row} role="group" aria-label="Menu sections" className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
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
