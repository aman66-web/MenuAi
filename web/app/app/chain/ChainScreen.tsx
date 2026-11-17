"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { mealSlotFor, MEALS, MEAL_LABEL } from "@/lib/mm/budget";
import { formatDate } from "@/lib/mm/format";
import { itemImageUrl } from "@/lib/mm/images";
import { anyDietFilter, anyUnchecked, filterCaution, groupByCategory, namesAllergen, passesMenuDiet, uncheckedDiet, isNewItem, LARGE_MENU_ITEMS, searchItems, SECTION_PREVIEW_ITEMS, SORT_OPTIONS, sortItems, type SortKind } from "@/lib/mm/menu-view";
import { indexChain } from "@/lib/mm/chain-index";
import { allergensFromParams, fitsLimits, hasLimits, limitsFromParams, limitWords, type NumberLimits } from "@/lib/mm/numbers";
import { itemHref } from "@/lib/mm/routes";
import { settingsStore, favoritesStore, recentStore, toggleFavorite } from "@/lib/mm/stores";
import { recentFor } from "@/lib/mm/recent";
import { ALLERGEN_KEYS, type Meal, type MenuItem, type Preferences } from "@/lib/mm/types";
import { BestForYou } from "../_components/BestForYou";
import { ALLERGEN_SHORT, DietPicker, dietWords } from "../_components/DietPicker";
import { DONE_KEY, DONE_ROOM, DONE_ROOM_WITH_CLEAR, SearchDone } from "../_components/SearchDone";
import { halalFor, HALAL_CAUTION } from "@/lib/mm/halal";
import { ChainMark } from "../_components/ChainMark";
import { ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, InfoIcon, SearchIcon, StarIcon } from "../_components/icons";
import { ItemThumb } from "../_components/ItemPhoto";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { MacroLine, SMALL_LABEL } from "../_components/Nutrition";
import { PresetPills } from "../_components/truth/PresetPills";
import { ReportSheet } from "../_components/Submit";
import { Badge, Button, Chip, EmptyState, ErrorBox, SampleBadge, Sheet, Spinner } from "../_components/ui";
import { backName, useBack } from "../_lib/backNav";
import { useChain, useMenu, useNow, useStore } from "../_lib/hooks";
import { scrollToElement } from "../_lib/scroll";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// SPEC §7.4: header, meal chip, Best for you, full menu (sort, filter, tags), source footer.
// Kept plain for older users (founder 2026-10-11): the diet and allergy choices are one line ("Your diet: Vegetarian · Change") that opens
// the same big-button picker as Settings, instead of a row of chips.
// Real menus run to 650 rows, so the full menu has a sticky search + category bar, long menus open with each section
// trimmed (tap to show the rest), off-screen rows skip layout (.cv-row), and a small button brings Best for you back.
// Look (founder 2026-10-15, "the rest of the app should match that elegance"): Home's language. White cards with 20 px corners on the
// grey page, small spaced capitals for labels, a black pill for the selected meal, the favourite star in a small grey circle like Home's
// calendar button; each menu section is one white card with its dishes divided by fine lines (not a card per dish), the search bar is
// flat grey like the page, and "Back to Best for you" is a black pill with a plain arrow (no circle).

/** Where Back goes when there is no earlier page of the app (a restaurant opened by address or from a shared link, a fresh launch). */
const EAT_OUT = "/app/eat-out";
/** "Show all 12 in Burgers": the last row of a section's card, in the accent green. */
const MORE_ROW = "flex min-h-12 w-full items-center justify-center gap-1.5 px-4 py-3 text-center text-[0.9375rem] font-semibold text-accent transition hover:bg-[var(--fill)] active:bg-[var(--fill)]";
/** A link in running text: underlined, but quietly. */
const QUIET_LINK = "underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] underline-offset-[3px] hover:decoration-current";

export function ChainScreen({ chainId }: { chainId: string }) {
  const t = useT();
  const { status, index, error, retry } = useChain(chainId);
  if (status === "loading") return (<Shell><Spinner label={t("Loading menu")} /></Shell>);
  if (status === "error" || !index) return (<Shell><ErrorBox message={error != null ? t(error) : t("Couldn't load this menu.")} onRetry={retry} /></Shell>);
  return <Loaded key={chainId} index={index} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const back = useBack(EAT_OUT); // the page before (Eat out, Search, Home, the map, a dish...) when there is one in the app, else Eat out
  return (
    <div>
      <Link href={back.href} onClick={back.onClick} aria-label={backName(t("Back"), t("Back to restaurants"), back.cameFromApp)} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
      {children}
    </div>
  );
}

function Loaded({ index }: { index: NonNullable<ReturnType<typeof useChain>["index"]> }) {
  const t = useT();
  const back = useBack(EAT_OUT);
  const { chain } = index;
  const menu = useMenu();
  const now = useNow();
  const favorites = useStore(favoritesStore);
  const isFavorite = favorites.some((f) => f.chainId === chain.id);
  // A few words beside the star say what the tap did (founder 2026-10-16: "small text in the top right saying that the restaurant is added to their favourites"):
  // shown for a moment, then faded out; a screen reader hears it through the status line, the visible copy is hidden from it so it is not read twice.
  const [favNote, setFavNote] = useState<{ kind: "added" | "removed"; shown: boolean } | null>(null);
  const favTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (favTimer.current) clearTimeout(favTimer.current); }, []);
  const tapStar = () => {
    const adding = !isFavorite;
    toggleFavorite(chain.id);
    setFavNote({ kind: adding ? "added" : "removed", shown: true });
    if (favTimer.current) clearTimeout(favTimer.current);
    favTimer.current = setTimeout(() => setFavNote((n) => (n ? { ...n, shown: false } : n)), 2600);
  };
  const favText = favNote ? (favNote.kind === "added" ? t("Added to your favourites") : t("Removed from your favourites")) : "";

  const [meal, setMeal] = useState<Meal>(() => mealSlotFor(new Date()));
  // Opened from Eat out's "find a restaurant by my numbers": the numbers and allergies typed there arrive in the link and apply to this visit only.
  const link = useSearchParams();
  const [limits, setLimits] = useState<NumberLimits>(() => limitsFromParams(link));
  const [prefs, setPrefs] = useState<Preferences>(() => {
    const saved = settingsStore.get().preferences;
    const fromLink = allergensFromParams(link);
    if (fromLink.length === 0) return saved;
    return { ...saved, avoidAllergens: ALLERGEN_KEYS.filter((k) => (saved.avoidAllergens ?? []).includes(k) || fromLink.includes(k)) };
  });
  const [sort, setSort] = useState<SortKind>("menu");
  const [query, setQuery] = useState("");
  const [halalOpen, setHalalOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [flatLimit, setFlatLimit] = useState(FLAT_PAGE);
  const [reporting, setReporting] = useState<MenuItem | "any" | null>(null);
  const [dietOpen, setDietOpen] = useState(false);
  const halal = halalFor(chain.id);
  // founder 2026-11-17 ("I've clicked on restaurants, but I can't see any of the actual food items"): the vegetarian, pescatarian and vegan filters follow what
  // each restaurant marks, and the allergy filter its allergen guide. Where a restaurant marks no dish vegetarian (39 of 241), names no dish vegan, or publishes
  // no allergen details (98), those filters emptied the menu. Its menu is now shown with only the dishes whose own names say otherwise left out, under a note that
  // the rest aren't checked (uncheckedDiet, passesMenuDiet). Best for you keeps the strict rule: it never recommends a dish it can't check.
  const unchecked = useMemo(() => uncheckedDiet(chain.items, prefs), [chain.items, prefs]);
  const allergiesUnchecked = unchecked.allergies;
  const menuPrefs = useMemo<Preferences>(() => (allergiesUnchecked ? { ...prefs, avoidAllergens: [] } : prefs), [allergiesUnchecked, prefs]);
  const allergyNames = new Intl.ListFormat("en-GB", { type: "conjunction" }).format((prefs.avoidAllergens ?? []).map((a) => t(ALLERGEN_SHORT[a]).toLowerCase()));
  // "Show all dishes" in the full menu: the whole menu for this visit, the person's diet unchanged everywhere else (Best for you, Quick answers).
  const [everyDish, setEveryDish] = useState(false);

  const searching = query.trim().length > 0;
  const filtered = useMemo(() => chain.items.filter((i) => passesMenuDiet(i, prefs, unchecked)), [chain.items, prefs, unchecked]);
  const hiddenByDiet = chain.items.length - filtered.length;
  const menuBase = everyDish ? chain.items : filtered;
  const fitting = useMemo(() => (hasLimits(limits) ? menuBase.filter((i) => fitsLimits(i, limits)) : menuBase), [menuBase, limits]);
  // Best for you picks from the dishes that fit the numbers typed on Eat out too (the ranking itself is untouched: its pool is just narrower),
  // so the picks never contradict the "Your numbers" line above them. Where allergens can't be checked, dishes whose names mention an allergy are left out of its pool.
  const bestIndex = useMemo(() => {
    const avoid = prefs.avoidAllergens ?? [];
    const keep = (i: MenuItem) => !allergiesUnchecked || !namesAllergen(i, avoid);
    if (!hasLimits(limits) && !allergiesUnchecked) return index;
    const items = chain.items.filter((i) => keep(i) && (!hasLimits(limits) || fitsLimits(i, limits)));
    const kept = new Set(items.map((i) => i.id));
    return indexChain({ ...chain, items, combinations: chain.combinations.filter((c) => (c.baseItemId === null || kept.has(c.baseItemId)) && (!hasLimits(limits) || fitsLimits(c, limits))) });
  }, [index, chain, limits, allergiesUnchecked, prefs.avoidAllergens]);
  const visible = useMemo(() => sortItems(searchItems(fitting, query), sort), [fitting, query, sort]);
  const grouped = sort === "menu";
  const sections = useMemo(() => (grouped ? groupByCategory(chain, visible) : [{ category: "", items: visible }]), [chain, visible, grouped]);
  const large = chain.items.length > LARGE_MENU_ITEMS;
  const caloriesOnly = chain.nutritionLevel === "calories";
  const clearFilters = () => { setPrefs({ vegetarianOnly: false, noPork: false, noBeef: false, ...(prefs.halalOnly ? { halalOnly: true } : {}) }); setLimits({}); };
  const anyFilter = anyDietFilter(prefs) || hasLimits(limits);
  const caution = filterCaution(prefs, t);
  const showCategoryChips = grouped && !searching && sections.length > 1;

  const changeDiet = (next: Preferences) => {
    for (const key of ["vegetarianOnly", "veganOnly", "pescatarianOnly", "noPork", "noBeef"] as const) if (Boolean(next[key]) !== Boolean(prefs[key]) && next[key]) analytics.track({ name: "menuFiltered", kind: key });
    setPrefs(next);
    setEveryDish(false);
  };
  const words = dietWords(t, prefs);
  const recentLog = useStore(recentStore);
  // A menu where some dishes have the chain's photo gives the others a grey fork tile, so every row's name starts at the same place.
  // itemImageUrl is undefined when photos are switched off or the chain's photos are taken down (hidden.json): no tiles then.
  // The taken-down list can arrive after the page opens: re-check (and re-render the rows' photos) when it does.
  const hiddenLogos = useHiddenLogos();
  const menuPhotos = useMemo(() => chain.items.some((i) => itemImageUrl(i.image) !== undefined), [chain.items, hiddenLogos]); // eslint-disable-line react-hooks/exhaustive-deps -- itemImageUrl reads the taken-down list, which hiddenLogos tracks
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
      <div className="flex items-center justify-between gap-3">
        <Link href={back.href} onClick={back.onClick} aria-label={backName(t("Back"), t("Back to restaurants"), back.cameFromApp)} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
        {/* a small grey circle like Home's calendar button, inside a full 44 px tap area, with what the tap did written beside it */}
        <div className="flex min-w-0 items-center gap-1.5">
          <p aria-hidden className={`min-w-0 text-end text-[0.8125rem] font-semibold leading-snug text-accent transition-opacity duration-300 motion-reduce:transition-none ${favNote?.shown ? "opacity-100" : "opacity-0"}`}>{favText}</p>
          <span role="status" className="sr-only">{favNote?.shown ? favText : ""}</span>
          <button
            type="button"
            onClick={tapStar}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? t("Remove {chain} from favourites", { chain: chain.name }) : t("Add {chain} to favourites", { chain: chain.name })}
            className="group -me-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
          >
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-soft-strong transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] ${isFavorite ? "text-accent" : "text-foreground"}`}>
              <StarIcon filled={isFavorite} />
            </span>
          </button>
        </div>
      </div>

      <div className="hero-card mt-4 rounded-[1.25rem] p-4">
        <div className="flex items-center gap-4">
          <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="xl" />
          <div className="min-w-0">
            <h1 className="text-[2rem] font-[800] leading-[1.05] tracking-[-0.02em] [overflow-wrap:anywhere]">{chain.name}</h1>
            {(chain.cuisine || chain.sample) && <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">{chain.cuisine ? <span className={SMALL_LABEL}>{t(chain.cuisine)}</span> : null} {chain.sample && <SampleBadge />}</p>}
          </div>
        </div>
        {/* The data's limits come first: users must see them before trusting a number. */}
        <div className="mt-4 space-y-3 border-t border-line pt-4 text-[0.9375rem] leading-snug">
          {chain.note && <p>{chain.note}</p>}
          {caloriesOnly && <p className="font-semibold">{t("{chain} publishes calories only: protein, carbs and fat aren't published, so there are no best-for-you picks, order builder or logging for this restaurant.", { chain: chain.name })}</p>}
          {halal && (
            <div>
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="font-semibold">{halal.scope === "some" ? t("Halal (some):") : t("Halal:")}</span>
                <button type="button" aria-expanded={halalOpen} aria-controls="halal-quote" onClick={() => setHalalOpen((o) => !o)} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[var(--fill)] ps-4 pe-3 font-semibold text-accent transition hover:bg-soft-strong active:scale-[0.98]">
                  {t("What {chain} says", { chain: chain.name })}
                  <ChevronRightIcon className={`h-4 w-4 transition-transform ${halalOpen ? "-rotate-90" : "rotate-90"}`} />
                </button>
              </p>
              {halalOpen && (
                <p id="halal-quote" className="mt-2 rounded-2xl bg-[var(--fill)] px-4 py-3">
                  &ldquo;{halal.statement}&rdquo;{" "}
                  <a href={halal.url} target="_blank" rel="noopener noreferrer" className={`text-muted ${QUIET_LINK}`}>{t("{chain}'s website", { chain: chain.name })}</a>
                </p>
              )}
            </div>
          )}
          <p className="app-numbers text-sm leading-snug text-muted">
            <Rich
              text={t("{items} from {source}, checked {date}.")}
              values={{
                items: <span className="font-semibold text-foreground">{t("{n} items", { n: chain.items.length })}</span>,
                source: <a href={chain.source.url} target="_blank" rel="noopener noreferrer" className={QUIET_LINK}>{chain.source.title}</a>,
                date: formatDate(chain.source.checkedOn, t),
              }}
            />
          </p>
        </div>
      </div>

      {anyUnchecked(unchecked) && (
        <div role="note" className="mt-3 flex gap-3 rounded-[1.25rem] border-2 border-[#d97706] bg-[#fffbeb] p-4 text-[0.9375rem] leading-snug text-[#3b2a06]">
          <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#b45309]" />
          <div className="min-w-0">
            <p className="font-bold">{allergiesUnchecked && (unchecked.vegetarian || unchecked.vegan) ? t("Not checked for your diet or allergies") : allergiesUnchecked ? t("Allergens aren't checked here") : t("Not checked for your diet")}</p>
            {unchecked.vegetarian && prefs.vegetarianOnly && <p className="mt-1">{t("{chain} doesn't mark which dishes are vegetarian, so only dishes whose names say meat or fish are left out.", { chain: chain.name })}</p>}
            {unchecked.vegetarian && prefs.pescatarianOnly && <p className="mt-1">{t("{chain} doesn't mark which dishes are vegetarian, so only dishes whose names say meat are left out.", { chain: chain.name })}</p>}
            {unchecked.vegan && <p className="mt-1">{t("{chain} doesn't say which dishes are vegan, so only dishes whose names say meat, fish, dairy or eggs are left out.", { chain: chain.name })}</p>}
            {allergiesUnchecked && <p className="mt-1">{t("{chain} doesn't publish allergen details we can read, so only dishes whose names mention {allergens} are left out.", { chain: chain.name, allergens: allergyNames })}</p>}
            <p className="mt-1 font-semibold">{t("Check the rest with {chain} before you order.", { chain: chain.name })}</p>
            {allergiesUnchecked && chain.allergenGuide && <a href={chain.allergenGuide.url} target="_blank" rel="noopener noreferrer" className={`mt-1 inline-flex min-h-11 items-center font-semibold text-[#92400e] ${QUIET_LINK}`}>{t("See its own allergen information")}</a>}
          </div>
        </div>
      )}
      <PresetPills chain={chain} items={filtered} renderList={(list) => <ItemList items={list} chainId={chain.id} now={now} photos={menuPhotos} />} />
      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="mt-7">
          <h2 id="recent-heading" className="mb-3 text-xl font-[800] tracking-[-0.01em]">{t("Recently viewed")}</h2>
          <ItemList items={recent} chainId={chain.id} now={now} photos={menuPhotos} />
        </section>
      )}

      {/* One card: what Best for you is picked for (the meal and the person's diet), then the picks. The diet also narrows the full menu below. */}
      <section aria-labelledby="best-heading" ref={bestRef} className={`glass rounded-[1.25rem] p-4 ${recent.length > 0 ? "mt-7" : "mt-3.5"}`}>
        {!caloriesOnly && (
          <>
            <h2 id="best-heading" className="text-xl font-[800] tracking-[-0.01em]">{t("Best for you")}</h2>
            <p className={`mb-2 mt-4 ${SMALL_LABEL}`}>{t("Which meal?")}</p>
            {/* Three across when they fit; one under another at large text, so no meal ever breaks onto two lines (stacked, the
                unselected meals are dark text like the shared segmented control's list, so they read as choices). */}
            <div className="@container">
              <div className="grid grid-cols-1 gap-1 rounded-[1.625rem] bg-[var(--fill)] p-1 @min-[18.5rem]:grid-cols-3" role="group" aria-label={t("Meal")}>
                {MEALS.map((m) => (
                  <Chip key={m} segment className={`w-full justify-center px-2 text-center [overflow-wrap:normal] ${meal === m ? "" : "@max-[18.5rem]:text-foreground"}`} selected={meal === m} onClick={() => setMeal(m)}>{t(MEAL_LABEL[m])}</Chip>
                ))}
              </div>
            </div>
          </>
        )}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${caloriesOnly ? "" : "mt-3"}`}>
          <p className="min-w-0 flex-1 basis-40 text-[0.9375rem] leading-snug"><span className="font-bold">{t("Your diet:")}</span> {words.length ? words.join(" · ") : t("nothing left out")}</p>
          <Button variant="secondary" aria-haspopup="dialog" onClick={() => setDietOpen(true)}>{t("Change")}</Button>
        </div>
        {hasLimits(limits) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 basis-40 text-[0.9375rem] leading-snug"><span className="font-bold">{t("Your numbers:")}</span> {limitWords(limits, t).join(" · ")}</p>
            <Button variant="secondary" onClick={() => setLimits({})}>{t("Show all dishes")}</Button>
          </div>
        )}
        {caution && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{caution}</p>}
        {prefs.halalOnly && !halal && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("{chain}'s website doesn't say its food is halal.", { chain: chain.name })} {t(HALAL_CAUTION)}</p>}
        {!caloriesOnly && (unchecked.vegetarian || unchecked.vegan ? (
          // Best for you recommends, so it never picks a dish the restaurant doesn't mark as fitting the person's diet; the menu below still shows the dishes
          <div className="mt-5 rounded-[1rem] bg-[var(--fill)] p-4 text-[0.9375rem] leading-snug">
            <p>{t("Best for you can't pick for your diet here, because {chain} doesn't mark which dishes fit it. Its full menu is below.", { chain: chain.name })}</p>
            <Button variant="secondary" className="mt-3" onClick={() => { const el = document.getElementById("full-menu"); if (el) scrollToElement(el); }}>{t("See the full menu")}</Button>
          </div>
        ) : <div className="mt-5"><BestForYou bare index={bestIndex} meal={meal} preferences={menuPrefs} onClearFilters={clearFilters} photos={menuPhotos} /></div>)}
      </section>
      <Sheet open={dietOpen} onClose={() => setDietOpen(false)} title={t("Your diet")}>
        <DietPicker value={prefs} onChange={changeDiet} halal={false} />
        <div className="mt-5"><Button full onClick={() => setDietOpen(false)}>{t("Done")}</Button></div>
      </Sheet>

      <div className="mb-3 mt-9 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="full-menu" className="whitespace-nowrap text-xl font-[800] tracking-[-0.01em]">{t("Full menu")}</h2>
        <label className="relative flex max-w-full items-center text-base">
          <span className="sr-only">{t("Sort by")}</span>
          <select
            className="min-h-11 max-w-full appearance-none truncate rounded-full bg-white ps-4 pe-10 text-[0.9375rem] font-semibold shadow-[var(--card-shadow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKind);
              setFlatLimit(FLAT_PAGE);
              analytics.track({ name: "menuSorted", kind: e.target.value });
            }}
          >
            {SORT_OPTIONS.filter((o) => !caloriesOnly || o.value === "menu" || o.value === "calories").map((o) => (<option key={o.value} value={o.value}>{t(o.label)}</option>))}
          </select>
          <ChevronRightIcon aria-hidden className="pointer-events-none absolute end-4 h-4 w-4 rotate-90 text-muted" />
        </label>
      </div>

      {/* Sticky: search this menu, and jump between its sections. Flat grey like the page with a hairline under it (no blur or shade), so a
          card sliding beneath reads as passing under a toolbar, not as cut off. */}
      <div className="sticky top-0 z-10 -mx-5 bg-background px-5 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-[0_1px_0_var(--line)]">
        <div className="group/search relative">
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
            {...DONE_KEY}
            className={`glass min-h-12 w-full rounded-full ps-11 pe-12 ${searching ? DONE_ROOM_WITH_CLEAR : DONE_ROOM} text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden`}
          />
          <SearchDone>
            {searching && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("Clear search")} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-foreground">
                <CloseIcon className="h-5 w-5" />
              </button>
            )}
          </SearchDone>
        </div>
        {showCategoryChips && <CategoryChips categories={sections.map((s) => s.category)} active={activeCategory} onJump={jumpToCategory} />}
      </div>

      {/* Empty (and no height) until there's something to say; it stays in the page so a screen reader hears it change. */}
      <p role="status" aria-live="polite" className="app-numbers mt-1 px-1 text-sm text-muted empty:mt-0">
        {searching ? (visible.length === 1 ? t("1 item matches") : t("{n} items match", { n: visible.length })) : hasLimits(limits) ? t("{n} of {total} items", { n: visible.length, total: chain.items.length }) : ""}
      </p>
      {/* Never a menu that just looks short: how many dishes the diet settings hide, and one tap to see the whole menu (this visit only). */}
      {!searching && hiddenByDiet > 0 && filtered.length > 0 && (
        <div className="glass mt-3 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[1.25rem] p-4">
          <div className="min-w-0 flex-1 basis-48 text-[0.9375rem] leading-snug">
            <p className="app-numbers font-bold">{everyDish ? t("Showing all {total} dishes", { total: chain.items.length }) : t("Showing {n} of {total} dishes", { n: filtered.length, total: chain.items.length })}</p>
            <p className="mt-0.5 text-muted">{everyDish ? t("Some of them may not fit your diet settings.") : t("The others don't fit your diet settings, or {chain} doesn't say.", { chain: chain.name })}</p>
          </div>
          <Button variant="secondary" onClick={() => setEveryDish((v) => !v)}>{everyDish ? t("Show only what fits") : t("Show all {total}", { total: chain.items.length })}</Button>
        </div>
      )}

      <div className="mt-3">
        {visible.length === 0 ? (
          <EmptyState
            title={searching ? t("Nothing on this menu matches “{query}”.", { query: query.trim() }) : anyFilter ? t("Your diet settings hide every dish here") : t("Nothing here matches your filters.")}
            body={!searching && anyFilter ? t("None of {chain}'s {n} dishes fits your settings ({settings}). You can see them all for this visit, or change your diet.", { chain: chain.name, n: chain.items.length, settings: [...dietWords(t, prefs), ...(hasLimits(limits) ? limitWords(limits, t) : [])].join(", ").toLowerCase() }) : undefined}
            action={searching ? <Button variant="secondary" onClick={() => setQuery("")}>{t("Clear search")}</Button> : anyFilter ? (
              <div className="flex flex-wrap justify-center gap-2.5">
                <Button onClick={() => { setEveryDish(true); setLimits({}); }}>{t("Show every dish")}</Button>
                <Button variant="secondary" aria-haspopup="dialog" onClick={() => setDietOpen(true)}>{t("Change my diet")}</Button>
              </div>
            ) : undefined}
          />
        ) : grouped ? (
          <div className="space-y-8">
            {sections.map((s) => {
              const open = !large || searching || expanded.has(s.category);
              const shown = open ? s.items : s.items.slice(0, SECTION_PREVIEW_ITEMS);
              const allExtras = s.items.every((i) => !i.rankable);
              return (
                <section key={s.category} id={sectionId(s.category)} data-category={s.category} aria-label={s.category} className="scroll-mt-36">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h3 className="text-lg font-[800] leading-snug tracking-[-0.01em]">{s.category}</h3>
                    <span className="app-numbers font-mono text-[0.8125rem] text-muted">{s.items.length}</span>
                  </div>
                  {allExtras && <p className="-mt-1.5 mb-3 text-sm text-muted">{t("Not suggested in Best for you.")}</p>}
                  <ItemList
                    items={shown}
                    chainId={chain.id}
                    now={now}
                    photos={menuPhotos}
                    footer={shown.length < s.items.length && (
                      <button type="button" onClick={() => setExpanded((e) => new Set(e).add(s.category))} className={MORE_ROW}>
                        {t("Show all {n} in {section}", { n: s.items.length, section: s.category })}
                        <ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 rotate-90" />
                      </button>
                    )}
                  />
                </section>
              );
            })}
          </div>
        ) : (
          <section aria-label={t("All items")}>
            <ItemList
              items={visible.slice(0, flatLimit)}
              chainId={chain.id}
              now={now}
              photos={menuPhotos}
              footer={visible.length > flatLimit && (
                <button type="button" onClick={() => setFlatLimit((n) => n + FLAT_PAGE)} className={MORE_ROW}>
                  {t("Show {n} more", { n: Math.min(FLAT_PAGE, visible.length - flatLimit) })}
                  <ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 rotate-90" />
                </button>
              )}
            />
          </section>
        )}
      </div>

      {/* pb-16: the last line (and "Report a number"'s tap area) clears the floating "Best for you" pill above the tab bar. */}
      <footer className="mt-10 space-y-1.5 px-1 pb-16 text-sm leading-snug text-muted">
        <p>
          <Rich
            text={t("Source: {source}, checked {date}")}
            values={{
              source: <a href={chain.source.url} target="_blank" rel="noopener noreferrer" className={QUIET_LINK}>{chain.source.title}</a>,
              date: formatDate(chain.source.checkedOn, t),
            }}
          />
        </p>
        <p>{t("Not affiliated with {chain}.", { chain: chain.name })}</p>
        <p>
          {t("Something look wrong?")}{" "}
          <button type="button" className={`min-h-11 font-semibold text-accent ${QUIET_LINK}`} onClick={() => setReporting("any")}>{t("Report a number")}</button>
        </p>
      </footer>

      {bestOffScreen && (
        <button
          type="button"
          onClick={() => bestRef.current?.scrollIntoView({ behavior: smoothScroll(), block: "start" })}
          className="sheet-in fixed bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.5rem)] left-1/2 z-20 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-5 py-1 text-[0.9375rem] font-bold text-background shadow-[0_12px_28px_-12px_rgba(17,24,20,0.5)] transition active:scale-95"
        >
          <ArrowUpIcon aria-hidden className="h-4 w-4 shrink-0" /> {t("Best for you")}
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

/**
 * A section's dishes as one white card, the rows divided by fine lines that start where the text does (fewer boxes than a card per
 * dish). An optional footer row ("Show all …") closes the card. `photos`: the chain has photos for some dishes, so a dish without
 * one shows the grey fork tile and every row's name lines up.
 */
function ItemList({ items, chainId, now, footer, photos }: { items: readonly MenuItem[]; chainId: string; now: Date; footer?: React.ReactNode; photos?: boolean }) {
  const t = useT();
  return (
    <div className="glass overflow-hidden rounded-[1.25rem]">
      <ul>
        {items.map((item) => {
          const isNew = isNewItem(item, now);
          return (
            <li key={item.id} className="cv-row relative before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-line first:before:hidden">
              {/* A dish Best for you never suggests (an extra, a sauce) is a quieter row: a lighter name. */}
              <Link
                href={itemHref(chainId, item.id)}
                prefetch={false}
                onClick={() => analytics.track({ name: "itemOpened", chainId })}
                className={`group flex items-center gap-3.5 px-4 transition hover:bg-[var(--fill)] active:bg-[var(--fill)] ${item.rankable ? "min-h-[4.75rem] py-3" : "min-h-16 py-2.5"}`}
              >
                <ItemThumb image={item.image} placeholder={photos} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`text-base leading-snug tracking-[-0.005em] ${item.rankable ? "font-bold" : "font-medium"}`}>{item.name}</span>
                    {isNew && <Badge tone="accent">{t("New")}</Badge>}
                    {item.limitedTime && <Badge>{t("Limited time")}</Badge>}
                  </span>
                  {item.serving && !item.rankable && <span className="sr-only">, {item.serving}</span>}
                  <MacroLine nutrients={item.nutrients} />
                </span>
                <ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 text-muted transition group-hover:text-foreground rtl:rotate-180" />
              </Link>
            </li>
          );
        })}
      </ul>
      {footer ? <div className="border-t border-line">{footer}</div> : null}
    </div>
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
    <div ref={row} role="group" aria-label={t("Menu sections")} className="no-scrollbar -mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5">
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
