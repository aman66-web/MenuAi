"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { mealSlotFor, MEALS, MEAL_LABEL } from "@/lib/mm/budget";
import { formatDate } from "@/lib/mm/format";
import { itemImageUrl } from "@/lib/mm/images";
import { dietNameList } from "@/lib/mm/foodDiet";
import { tk } from "@/lib/mm/i18n";
import { anyDietFilter, anyUnchecked, filterCaution, groupByCategory, passesMenuDiet, uncheckedDiet, isNewItem, LARGE_MENU_ITEMS, searchItems, SECTION_PREVIEW_ITEMS, SORT_OPTIONS, sortItems, type SortKind } from "@/lib/mm/menu-view";
import { indexChain } from "@/lib/mm/chain-index";
import { allergensFromParams, fitsLimits, hasLimits, limitsFromParams, limitWords, type NumberLimits } from "@/lib/mm/numbers";
import { candidatesFor } from "@/lib/mm/ranking";
import { itemHref } from "@/lib/mm/routes";
import { settingsStore, favoritesStore, recentStore, toggleFavorite } from "@/lib/mm/stores";
import { recentFor } from "@/lib/mm/recent";
import { ALLERGEN_KEYS, type Meal, type MenuItem, type Preferences } from "@/lib/mm/types";
import { sanitizeSettings } from "@/lib/mm/user-data";
import { BestForYou } from "../_components/BestForYou";
import { ALLERGEN_SHORT, DietPicker, dietWords } from "../_components/DietPicker";
import { DONE_KEY, DONE_ROOM, DONE_ROOM_WITH_CLEAR, SearchDone } from "../_components/SearchDone";
import { halalFor } from "@/lib/mm/halal";
import { ChainMark } from "../_components/ChainMark";
import { ArrowUpIcon, ChevronRightIcon, CloseIcon, SearchIcon, StarIcon } from "../_components/icons";
import { PageHeader } from "../_components/PageHeader";
import { ItemThumb } from "../_components/ItemPhoto";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { MacroLine, SMALL_LABEL } from "../_components/Nutrition";
import { PresetPills } from "../_components/truth/PresetPills";
import { ReportSheet } from "../_components/Submit";
import { AllergyNote, Badge, Button, Chip, EmptyState, ErrorBox, inputClass, LinkButton, SampleBadge, Sheet, Spinner } from "../_components/ui";
import { useEntryQuery } from "../_lib/backNav";
import { useChain, useMenu, useNow, useSettings, useStore } from "../_lib/hooks";
import { scrollToElement } from "../_lib/scroll";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// SPEC §7.4: header, meal chip, Best for you, full menu (sort, filter, tags), source footer.
// Kept plain for older users (founder 2026-10-11): the diet and allergy choices are one line ("Your diet: Vegetarian · Change") that opens
// the same big-button picker as Settings, instead of a row of chips.
// Real menus run to 650 rows, so the full menu has a sticky search + category bar, long menus open with each section
// trimmed (tap to show the rest), off-screen rows skip layout (.cv-row), and a small button brings Best for you back.
// Look (founder 2026-10-15, "the rest of the app should match that elegance"): Home's language. White cards with 20 px corners on the
// grey page; each menu section is one white card with its dishes divided by fine lines (not a card per dish), the search bar is flat grey
// like the page. Since the colour meeting (19 November 2026; approved by the founder that day): the header every page has (Back, the cog far
// right), the favourite beside the restaurant's name with its word, the chosen meal lime with its edge and tick (ui.tsx Chip), and the pill
// back to Best for you white with the edge (it moves you on the page, it doesn't act).

/** Where Back goes when there is no earlier page of the app (a restaurant opened by address or from a shared link, a fresh launch). */
const EAT_OUT = "/app/eat-out";
/** "Show all 12 in Burgers": the last row of a section's card, an underlined accent link (it opens the rest of the section). */
const MORE_ROW = "flex min-h-12 w-full items-center justify-center gap-1.5 px-4 py-3 text-center text-[0.9375rem] font-semibold text-accent underline decoration-solid underline-offset-[3px] transition hover:bg-[var(--fill)] active:bg-[var(--fill)]";
/** The one link style (the 20 November 2026 audit): accent, underlined, a solid line. */
const LINK = "font-semibold text-accent underline decoration-solid underline-offset-[3px]";
/** The menu client's words for a restaurant id that isn't in the catalogue (lib/mm/menu-client.ts): a missing page, not a failure. */
const UNKNOWN_CHAIN = tk("That restaurant isn't available.");
/** The check that goes with a halal line (lib/mm/halal.ts HALAL_CAUTION without its first sentence, which the line before already says). */
const HALAL_CHECK = tk("If it matters to you, check with the restaurant.");
/** The menu's search field: the app's input, with room for the icon and the clear and Done buttons. */
const MENU_SEARCH = inputClass.replace("px-4", "ps-11 pe-14");

export function ChainScreen({ chainId }: { chainId: string }) {
  const t = useT();
  const { status, index, error, retry } = useChain(chainId);
  if (status === "loading") return (<Shell><Spinner label={t("Loading menu")} /></Shell>);
  // a link to a restaurant the app doesn't have (an old share, a typed address) is a missing page, not a failure: say so and offer the list, never "Try again"
  if (status === "error" && error === UNKNOWN_CHAIN) {
    return (
      <Shell>
        <div className="mt-4"><EmptyState title={t(UNKNOWN_CHAIN)} action={<LinkButton href={EAT_OUT} variant="secondary">{t("See all restaurants")}</LinkButton>} /></div>
      </Shell>
    );
  }
  if (status === "error" || !index) return (<Shell><div className="mt-4"><ErrorBox message={error != null ? t(error) : t("Couldn't load this menu.")} onRetry={retry} /></div></Shell>);
  return <Loaded key={chainId} index={index} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useT();
  // Back goes to the page before (Eat out, Search, Home, the map, a dish...) when there is one in the app, else Eat out
  return (
    <div>
      <PageHeader back={{ href: EAT_OUT, label: t("Back to restaurants") }} />
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
  const settings = useSettings();
  // Coming Back from a dish finds the page as it was left (the 21 November 2026 meeting: Back wiped the search, the sort, "Show all" and the visit's diet):
  // the search words travel with the history entry (useEntryQuery), the rest is kept for this visit (readVisit, saveVisit). A fresh visit starts afresh.
  const [visit] = useState(() => readVisit(chain.id));
  // Opened from Eat out's "find a restaurant by my numbers": the numbers and allergies typed there arrive in the link and apply to this visit only.
  const link = useSearchParams();
  const [limits, setLimits] = useState<NumberLimits>(() => limitsFromParams(link));
  const [prefs, setPrefs] = useState<Preferences>(() => {
    if (visit?.prefs) return visit.prefs;
    const saved = settingsStore.get().preferences;
    const fromLink = allergensFromParams(link);
    if (fromLink.length === 0) return saved;
    return { ...saved, avoidAllergens: ALLERGEN_KEYS.filter((k) => (saved.avoidAllergens ?? []).includes(k) || fromLink.includes(k)) };
  });
  const [sort, setSort] = useState<SortKind>(() => visit?.sort ?? "menu");
  const [query, setQuery] = useEntryQuery();
  const [halalOpen, setHalalOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(visit?.expanded ?? []));
  const [flatLimit, setFlatLimit] = useState(FLAT_PAGE);
  const [reporting, setReporting] = useState<MenuItem | "any" | null>(null);
  const [dietOpen, setDietOpen] = useState(false);
  const halal = halalFor(chain.id);
  // founder 2026-11-17 ("I've clicked on restaurants, but I can't see any of the actual food items"): the vegetarian, pescatarian and vegan filters follow what
  // each restaurant marks, and the allergy filter its allergen guide. Where a restaurant marks no dish vegetarian (39 of 241), names no dish vegan, or publishes
  // no allergen details (98), those filters emptied the menu. Its menu is now shown with only the dishes whose own names say otherwise left out, under a note that
  // the rest aren't checked (uncheckedDiet, passesMenuDiet). Best for you recommends, so it never ranks dishes it can't check: for any such choice (diet or
  // allergies) it says it can't pick here and points to the full menu.
  const unchecked = useMemo(() => uncheckedDiet(chain.items, prefs, chain.id), [chain.items, prefs, chain.id]);
  const allergiesUnchecked = unchecked.allergies;
  const allergyNames = new Intl.ListFormat("en-GB", { type: "conjunction" }).format((prefs.avoidAllergens ?? []).map((a) => t(ALLERGEN_SHORT[a]).toLowerCase()));
  // "Show all dishes" in the full menu: the whole menu for this visit, the person's diet unchanged everywhere else (Best for you, Quick answers).
  const [everyDish, setEveryDish] = useState(() => visit?.everyDish ?? false);
  useEffect(() => { saveVisit(chain.id, { prefs, sort, everyDish, expanded: [...expanded] }); }, [chain.id, prefs, sort, everyDish, expanded]);

  const searching = query.trim().length > 0;
  /** The menu's size as a person reads it ("1,349"). */
  const total = chain.items.length.toLocaleString("en-GB");
  const filtered = useMemo(() => chain.items.filter((i) => passesMenuDiet(i, prefs, unchecked)), [chain.items, prefs, unchecked]);
  const hiddenByDiet = chain.items.length - filtered.length;
  const menuBase = everyDish ? chain.items : filtered;
  const fitting = useMemo(() => (hasLimits(limits) ? menuBase.filter((i) => fitsLimits(i, limits)) : menuBase), [menuBase, limits]);
  // Best for you picks from the dishes that fit the numbers typed on Eat out too (the ranking itself is untouched: its pool is just narrower),
  // so the picks never contradict the "Your numbers" line above them.
  const bestIndex = useMemo(() => {
    if (!hasLimits(limits)) return index;
    const items = chain.items.filter((i) => fitsLimits(i, limits));
    const kept = new Set(items.map((i) => i.id));
    return indexChain({ ...chain, items, combinations: chain.combinations.filter((c) => (c.baseItemId === null || kept.has(c.baseItemId)) && fitsLimits(c, limits)) });
  }, [index, chain, limits]);
  const visible = useMemo(() => sortItems(searchItems(fitting, query), sort), [fitting, query, sort]);
  const grouped = sort === "menu";
  const sections = useMemo(() => (grouped ? groupByCategory(chain, visible) : [{ category: "", items: visible }]), [chain, visible, grouped]);
  const large = chain.items.length > LARGE_MENU_ITEMS;
  const caloriesOnly = chain.nutritionLevel === "calories";
  // No Best for you where it has nothing to rank (the 21 November 2026 meeting: Chipotle and six others said "Nothing here matches your filters." with no filter
  // on): a calories-only restaurant, or one with no dish or meal it suggests (rankable, with calories). Its diet line then sits by the Full menu heading.
  const candidates = useMemo(() => candidatesFor(chain), [chain]);
  const noBest = caloriesOnly || !candidates.some((c) => c.nutrients.calories > 0);
  const clearFilters = () => { setPrefs({ vegetarianOnly: false, noPork: false, noBeef: false, ...(prefs.halalOnly ? { halalOnly: true } : {}) }); setLimits({}); };
  const anyFilter = anyDietFilter(prefs) || hasLimits(limits);
  // where allergens can't be checked the amber note says so; the usual allergy sentence ("hide dishes it doesn't cover") wouldn't be true here
  const caution = filterCaution(allergiesUnchecked ? { ...prefs, avoidAllergens: [] } : prefs, t);
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
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const barHeight = useStickyBar(rootRef, barRef, searchRef);
  const spy = useActiveSection(showCategoryChips ? sections.map((s) => s.category) : [], barHeight);
  const activeCategory = spy.active;

  const jumpToCategory = (category: string) => {
    setExpanded((e) => new Set(e).add(category));
    // the tapped chip lights at once and stays lit while the page scrolls there (the scroll-spy waits for the scroll to end)
    spy.hold(category);
    requestAnimationFrame(() => {
      const el = document.getElementById(sectionId(category));
      if (el) jumpAndFocus(el, el.querySelector("h3"));
    });
  };

  // Best for you picks only where every choice can be checked against the restaurant's own data, and only where it has something to rank (noBest)
  const ranks = !noBest && !anyUnchecked(unchecked);
  const meatUnmarked = unchecked.pork && unchecked.beef ? t("pork or beef") : unchecked.pork ? t("pork") : unchecked.beef ? t("beef") : "";
  const markedDietUnchecked = unchecked.vegetarian || unchecked.vegan || unchecked.pork || unchecked.beef;
  const dietUnchecked = markedDietUnchecked || unchecked.others.length > 0;
  // the person's diet (and Eat out's numbers) for this visit, with one button to change them: in Best for you's card, or by the Full menu heading
  const dietLines = (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
      {prefs.halalOnly && !halal && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("{chain}'s website doesn't say its food is halal.", { chain: chain.name })} {t(HALAL_CHECK)}</p>}
    </>
  );

  return (
    <div ref={rootRef}>
      {/* The header every page has (colour meeting, 19 November 2026): Back with its word, the Settings cog far right. The favourite star moved into the
          restaurant's card beside its name, with its word, to leave the top right to the cog. */}
      <PageHeader back={{ href: EAT_OUT, label: t("Back to restaurants") }} />

      <div className="hero-card mt-4 rounded-[1.25rem] p-4">
        {/* the name goes under the logo when the text is large, rather than breaking mid-word (usability test 2026-11-19: "McDonal / d's") */}
        <div className="flex flex-wrap items-center gap-4">
          <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="xl" />
          <div className="min-w-[min(100%,11rem)] flex-1">
            <h1 className="hyphens-auto text-[2rem] font-[800] leading-[1.05] tracking-[-0.02em] [overflow-wrap:break-word]">{chain.name}</h1>
            {(chain.cuisine || chain.sample) && <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">{chain.cuisine ? <span className={SMALL_LABEL}>{t(chain.cuisine)}</span> : null} {chain.sample && <SampleBadge />}</p>}
            {/* The favourite beside the name (colour meeting, 19 November 2026; approved by the founder that day): a white button with the edge, an ink star,
                outline when it isn't a favourite and filled when it is, with its word in both states (the button says which by aria-pressed). What the tap
                did is written beside it for a moment (founder 2026-10-16), and a screen reader hears it through the status line. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <button
                type="button"
                onClick={tapStar}
                aria-pressed={isFavorite}
                className="group -ms-0.5 inline-flex min-h-11 shrink-0 items-center rounded-full transition active:scale-95"
              >
                <span className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-edge bg-card ps-3 pe-4 text-[0.9375rem] font-semibold text-foreground transition-colors group-hover:bg-background">
                  <StarIcon filled={isFavorite} aria-hidden className="h-[18px] w-[18px] shrink-0 text-ink" />
                  {t("Favourite")}
                </span>
              </button>
              <p aria-hidden className={`min-w-0 text-[0.8125rem] font-semibold leading-snug text-foreground transition-opacity duration-300 motion-reduce:transition-none ${favNote?.shown ? "opacity-100" : "opacity-0"}`}>{favText}</p>
              <span role="status" className="sr-only">{favNote?.shown ? favText : ""}</span>
            </div>
          </div>
        </div>
        {/* The data's limits come first: users must see them before trusting a number (calories only, halal). The longer note on how the figures were read
            moved to the foot of the page (the review of 2026-11-18: the menu started 1,500 px down behind it), beside the source. */}
        <div className="mt-4 space-y-3 border-t border-line pt-4 text-[0.9375rem] leading-snug">
          {caloriesOnly && <p className="font-semibold">{t("{chain} publishes calories only.", { chain: chain.name })}</p>}
          {halal && (
            <div>
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="font-semibold">{halal.scope === "some" ? t("Halal (some):") : t("Halal:")}</span>
                <button type="button" aria-expanded={halalOpen} aria-controls="halal-quote" onClick={() => setHalalOpen((o) => !o)} className="inline-flex min-h-11 items-center gap-1 rounded-full border-[1.5px] border-edge bg-card ps-4 pe-3 font-semibold text-foreground transition hover:bg-background active:scale-[0.98]">
                  {t("What {chain} says", { chain: chain.name })}
                  <ChevronRightIcon className={`h-4 w-4 transition-transform ${halalOpen ? "-rotate-90" : "rotate-90"}`} />
                </button>
              </p>
              {halalOpen && (
                <p id="halal-quote" className="mt-2 rounded-2xl bg-[var(--fill)] px-4 py-3">
                  &ldquo;{halal.statement}&rdquo;{" "}
                  <a href={halal.url} target="_blank" rel="noopener noreferrer" className={LINK}>{t("{chain}'s website", { chain: chain.name })}</a>
                </p>
              )}
            </div>
          )}
          {/* one short line and one short link (the 20 November 2026 audit: 154 restaurants showed a long footnote-style citation here); the full citation is
              in the footer's "Source:" line and the Menu sources sheet */}
          <p className="app-numbers text-sm leading-snug text-muted">
            {t("{n} items from {chain}'s own figures, checked {date}.", { n: chain.items.length.toLocaleString("en-GB"), chain: chain.name, date: formatDate(chain.source.checkedOn, t) })}{" "}
            <a href={chain.source.url} target="_blank" rel="noopener noreferrer" className={LINK}>{t("Where these numbers come from")}</a>
          </p>
        </div>
      </div>

      {anyUnchecked(unchecked) && (
        <AllergyNote className="mt-3">
          <p className="font-bold">{allergiesUnchecked && dietUnchecked ? t("Not checked for your diet or allergies") : allergiesUnchecked ? t("Allergens aren't checked here") : t("Not checked for your diet")}</p>
          {unchecked.vegetarian && prefs.vegetarianOnly && <p className="mt-1">{t("{chain} doesn't mark vegetarian dishes, so only dishes whose names, menu sections or labels say meat or fish are left out.", { chain: chain.name })}</p>}
          {unchecked.vegetarian && prefs.pescatarianOnly && <p className="mt-1">{t("{chain} doesn't mark vegetarian dishes, so only dishes whose names, menu sections or labels say meat are left out.", { chain: chain.name })}</p>}
          {unchecked.vegan && <p className="mt-1">{unchecked.vegetarianMarks
            ? t("{chain} doesn't mark vegan dishes. Only its vegetarian dishes are shown, leaving out any whose names, menu sections or labels say meat, fish, dairy or eggs.", { chain: chain.name })
            : t("{chain} doesn't mark vegan dishes, so only dishes whose names, menu sections or labels say meat, fish, dairy or eggs are left out.", { chain: chain.name })}</p>}
          {meatUnmarked && <p className="mt-1">{t("{chain} doesn't mark which dishes have {meat}, so only dishes whose names say so are left out.", { chain: chain.name, meat: meatUnmarked })}</p>}
          {unchecked.others.length > 0 && <p className="mt-1">{t("Restaurant menus don't list ingredients, so {diets} can't be checked here.", { diets: dietNameList(unchecked.others, t) })}</p>}
          {allergiesUnchecked && <p className="mt-1">{t("{chain} doesn't publish allergen details we can read, so only dishes whose names or menu sections mention {allergens} are left out.", { chain: chain.name, allergens: allergyNames })}</p>}
          <p className="mt-1 font-semibold">{t("Check the rest with {chain} before you order.", { chain: chain.name })}</p>
          {allergiesUnchecked && chain.allergenGuide && <a href={chain.allergenGuide.url} target="_blank" rel="noopener noreferrer" className={`mt-1 inline-flex min-h-11 items-center ${LINK}`}>{t("See its own allergen information")}</a>}
        </AllergyNote>
      )}
      {/* Quick answers recommend too: never a "top 5" for a choice the restaurant's own data can't check, calories-only restaurants included (the 21 November 2026 meeting) */}
      <PresetPills chain={chain} items={filtered} notChecked={anyUnchecked(unchecked) ? t("Can't pick for your diet or allergies here.") : null} renderList={(list) => <ItemList items={list} chainId={chain.id} now={now} photos={menuPhotos} />} />
      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="mt-7">
          <h2 id="recent-heading" className="mb-3 text-xl font-[800] tracking-[-0.01em]">{t("Recently viewed")}</h2>
          <ItemList items={recent} chainId={chain.id} now={now} photos={menuPhotos} />
        </section>
      )}

      {/* One card: what Best for you is picked for (the meal and the person's diet), then the picks. The diet also narrows the full menu below. The meal
          choice shows only where Best for you will pick (it did nothing beside "can't pick"), and not for the GLP-1 goal, whose picks are the same for every meal
          (the 21 November 2026 meeting); a restaurant with nothing to rank (noBest) has no Best for you, so its diet line sits by the Full menu heading instead
          of in a card with no heading (the 20 November 2026 audit). */}
      {!noBest && (
        <section aria-labelledby="best-heading" ref={bestRef} className={`glass rounded-[1.25rem] p-4 ${recent.length > 0 ? "mt-7" : "mt-3.5"}`}>
          <h2 id="best-heading" tabIndex={-1} className="text-xl font-[800] tracking-[-0.01em]">{t("Best for you")}</h2>
          {ranks && settings.goal !== "glp1" && (
            <>
              <p className={`mb-2 mt-4 ${SMALL_LABEL}`}>{t("Which meal?")}</p>
              {/* Three across when they fit; one under another at large text, so no meal ever breaks onto two lines (stacked, the
                  unselected meals are dark text like the shared segmented control's list, so they read as choices). Across, the chosen one with its tick fits
                  its third at 375 px (second wave's review: "Breakfast" was clipped): a slimmer track, 4 px sides, a 14 px tick and 15 px words. */}
              <div className="@container">
                <div className="grid grid-cols-1 gap-0.5 rounded-[1.625rem] border-[1.5px] border-edge bg-fill p-0.5 @min-[18.5rem]:grid-cols-3" role="group" aria-label={t("Meal")}>
                  {MEALS.map((m) => (
                    <Chip key={m} segment className={`w-full justify-center gap-1! px-1! text-center text-[0.9375rem]! [overflow-wrap:normal] [&>svg]:h-3.5 [&>svg]:w-3.5 ${meal === m ? "" : "@max-[18.5rem]:text-foreground"}`} selected={meal === m} onClick={() => setMeal(m)}>{t(MEAL_LABEL[m])}</Chip>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="mt-3">{dietLines}</div>
          {ranks ? (
            <div className="mt-5"><BestForYou bare index={bestIndex} meal={meal} preferences={prefs} onClearFilters={clearFilters} photos={menuPhotos} /></div>
          ) : (
            // Best for you recommends, so it never picks a dish the restaurant's data can't check against the person's diet or allergies; the menu below still
            // shows the dishes. Why it can't is the amber note at the top of the page (always shown with this), so it isn't said again here (words pass, 20 November 2026)
            <div className="mt-5 rounded-[1rem] bg-[var(--fill)] p-4 text-[0.9375rem] leading-snug">
              <p>{markedDietUnchecked
                ? allergiesUnchecked
                  ? t("Can't pick for your diet or allergies here.")
                  : t("Can't pick for your diet here.")
                : unchecked.others.length > 0
                  ? t("Can't pick for {diets} here.", { diets: dietNameList(unchecked.others, t) })
                  : t("Can't pick for your allergies here.")}</p>
              <Button variant="secondary" className="mt-3" onClick={() => { const el = document.getElementById("full-menu"); if (el) jumpAndFocus(el, el); }}>{t("See the full menu")}</Button>
            </div>
          )}
        </section>
      )}
      <Sheet open={dietOpen} onClose={() => setDietOpen(false)} title={t("Your diet")}>
        {/* the choice here is for this visit only (the 20 November 2026 audit: Vegetarian chosen at KFC wasn't kept at Nando's): said, with the way to keep it */}
        <p className="mb-4 text-[0.9375rem] leading-snug text-muted">
          {t("Just for this visit.")}{" "}
          <Link href="/app/settings#diet" className={LINK}>{t("Change it in Settings")}</Link>
        </p>
        <DietPicker value={prefs} onChange={changeDiet} halal={false} />
        <div className="mt-5"><Button full onClick={() => setDietOpen(false)}>{t("Done")}</Button></div>
      </Sheet>

      <div className={`mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 ${noBest ? "mt-7" : "mt-9"}`}>
        <h2 id="full-menu" tabIndex={-1} className="whitespace-nowrap text-xl font-[800] tracking-[-0.01em]">{t("Full menu")}</h2>
        <label className="relative flex max-w-full items-center text-base">
          <span className="sr-only">{t("Sort by")}</span>
          <select
            className="min-h-11 max-w-full appearance-none truncate rounded-full border-[1.5px] border-edge bg-card ps-4 pe-10 text-[0.9375rem] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKind);
              setFlatLimit(FLAT_PAGE);
              analytics.track({ name: "menuSorted", kind: e.target.value });
            }}
          >
            {SORT_OPTIONS.filter((o) => !caloriesOnly || o.value === "menu" || o.value === "calories").map((o) => (<option key={o.value} value={o.value}>{t(o.label)}</option>))}
          </select>
          <ChevronRightIcon aria-hidden className="pointer-events-none absolute end-4 h-4 w-4 rotate-90 text-ink" />
        </label>
      </div>
      {noBest && <div className="mb-4 px-1">{dietLines}</div>}

      {/* Sticky: search this menu, and jump between its sections. Flat grey like the page with a hairline under it (no blur or shade), so a
          card sliding beneath reads as passing under a toolbar, not as cut off. Its height is measured (--chain-bar) so a tapped section's heading lands just
          under it on every phone; on a short screen (landscape, zoomed text) the search box scrolls away and only the section chips stay (--chain-search). */}
      <div ref={barRef} className="sticky top-0 z-10 -mx-5 bg-background px-5 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-[0_1px_0_var(--line)] [@media(max-height:500px)]:top-[calc(-1*var(--chain-search,0px))]">
        <div ref={searchRef} className="group/search relative">
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
            className={`${MENU_SEARCH} ${searching ? DONE_ROOM_WITH_CLEAR : DONE_ROOM} [&::-webkit-search-cancel-button]:hidden`}
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
        {searching ? (visible.length === 1 ? t("1 item matches") : t("{n} items match", { n: visible.length.toLocaleString("en-GB") })) : hasLimits(limits) ? t("{n} of {total} items", { n: visible.length.toLocaleString("en-GB"), total: total }) : ""}
      </p>
      {/* Never a menu that just looks short: how many dishes the diet settings hide, and one tap to see the whole menu (this visit only). Shown too after the
          empty state's "Show every dish", so the list never looks filtered when it isn't. While Eat out's numbers apply, the status line and "Your numbers"
          give the counts instead (this card counts the diet alone). */}
      {!searching && !hasLimits(limits) && hiddenByDiet > 0 && (filtered.length > 0 || everyDish) && (
        <div className="glass mt-3 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[1.25rem] p-4">
          <div className="min-w-0 flex-1 basis-48 text-[0.9375rem] leading-snug">
            <p className="app-numbers font-bold">{everyDish ? t("Showing all {total} dishes", { total }) : t("Showing {n} of {total} dishes", { n: filtered.length.toLocaleString("en-GB"), total })}</p>
            <p className="mt-0.5 text-muted">{everyDish ? t("Some may not fit your diet.") : t("The rest don't fit your diet, or {chain} doesn't say.", { chain: chain.name })}</p>
          </div>
          <Button variant="secondary" onClick={() => setEveryDish((v) => !v)}>{everyDish ? t("Show only what fits") : t("Show all {total}", { total })}</Button>
        </div>
      )}

      <div className="mt-3">
        {visible.length === 0 ? (
          <EmptyState
            title={searching ? t("Nothing on this menu matches “{query}”.", { query: query.trim() }) : anyFilter ? t("Your diet settings hide every dish here") : t("Nothing here matches your filters.")}
            body={!searching && anyFilter ? t("Your settings: {settings}.", { settings: [...dietWords(t, prefs), ...(hasLimits(limits) ? limitWords(limits, t) : [])].join(", ").toLowerCase() }) : undefined}
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
                <section key={s.category} id={sectionId(s.category)} data-category={s.category} aria-label={s.category} className="scroll-mt-[calc(var(--chain-bar,9rem)+0.5rem)]">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h3 tabIndex={-1} className="text-lg font-[800] leading-snug tracking-[-0.01em]">{s.category}</h3>
                    <span className="app-numbers font-mono text-[0.8125rem] text-muted">{s.items.length}</span>
                  </div>
                  {/* not where there is no Best for you at all (usability test 2026-11-19: the line repeated under every section) */}
                  {allExtras && !noBest && <p className="-mt-1.5 mb-3 text-sm text-muted">{t("Not suggested in Best for you.")}</p>}
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
              source: <a href={chain.source.url} target="_blank" rel="noopener noreferrer" className={LINK}>{chain.source.title}</a>,
              date: formatDate(chain.source.checkedOn, t),
            }}
          />
        </p>
        {chain.note && <p>{chain.note}</p>}
        <p>{t("Not affiliated with {chain}.", { chain: chain.name })}</p>
        <p>
          {t("Something look wrong?")}{" "}
          <button type="button" className={`min-h-11 ${LINK}`} onClick={() => setReporting("any")}>{t("Report a number")}</button>
        </p>
      </footer>

      {/* no pill back to Best for you where there is none to go back to (noBest; usability test 2026-11-19) */}
      {bestOffScreen && !noBest && (
        <button
          type="button"
          onClick={() => {
            const el = bestRef.current;
            if (!el) return;
            el.scrollIntoView({ behavior: smoothScroll(), block: "start" });
            document.getElementById("best-heading")?.focus({ preventScroll: true });
          }}
          className="sheet-in fixed bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.5rem)] left-1/2 z-20 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] border-edge bg-card px-5 py-1 text-[0.9375rem] font-bold text-foreground shadow-[var(--shadow-lift)] transition hover:bg-background active:scale-95"
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
 * Scroll to a part of the page and move the focus to its heading (tabIndex -1), as Eat out's letter jumps do, so VoiceOver reads on from there instead of
 * staying on the chip or button that was tapped (the 21 November 2026 meeting). The focus never scrolls the page itself.
 */
function jumpAndFocus(el: HTMLElement, heading: HTMLElement | null) {
  scrollToElement(el);
  heading?.focus({ preventScroll: true });
}

// ---- this visit's choices, kept for Back

/** The history entry's own visit id is kept under this key in history.state (beside Back's depth and the search words, lib/mm/navDepth.ts). */
const VISIT_KEY = "mmChainVisit";
const visitStoreKey = (chainId: string) => `mm.chain.${chainId}`;

interface ChainVisit {
  prefs?: Preferences;
  sort?: SortKind;
  everyDish?: boolean;
  expanded?: string[];
}

function entryVisitId(): string | null {
  const state = window.history.state as Record<string, unknown> | null;
  const id = state && typeof state === "object" ? state[VISIT_KEY] : undefined;
  return typeof id === "string" ? id : null;
}

/**
 * What this visit to the restaurant's page changed (the diet "just for this visit", the sort, "Show all", the opened sections), when the page on screen is
 * that same visit come Back to: sessionStorage under mm.chain.<id> holds it, tagged with the history entry's own visit id, so a fresh visit (a new entry)
 * starts from the person's own settings again. Null when there is nothing to restore or storage can't be read.
 */
function readVisit(chainId: string): ChainVisit | null {
  try {
    const id = entryVisitId();
    if (!id) return null;
    const raw = JSON.parse(sessionStorage.getItem(visitStoreKey(chainId)) ?? "null") as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || raw.visit !== id) return null;
    const out: ChainVisit = {};
    if (raw.prefs && typeof raw.prefs === "object") out.prefs = sanitizeSettings({ preferences: raw.prefs }).preferences;
    if (SORT_OPTIONS.some((o) => o.value === raw.sort)) out.sort = raw.sort as SortKind;
    if (typeof raw.everyDish === "boolean") out.everyDish = raw.everyDish;
    if (Array.isArray(raw.expanded)) out.expanded = raw.expanded.filter((c): c is string => typeof c === "string");
    return out;
  } catch {
    return null; // nothing kept: the page opens as a fresh visit
  }
}

function saveVisit(chainId: string, v: Required<ChainVisit>) {
  try {
    let id = entryVisitId();
    if (!id) {
      id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      window.history.replaceState({ ...((window.history.state as Record<string, unknown> | null) ?? {}), [VISIT_KEY]: id }, "");
    }
    sessionStorage.setItem(visitStoreKey(chainId), JSON.stringify({ visit: id, ...v }));
  } catch { /* not kept: Back opens the page afresh, it still works */ }
}

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
        // one line each, at most 15rem with an ellipsis (a long section name wrapped to three lines and the bar covered most of a zoomed screen)
        // they jump, they don't switch anything on: the section on screen is announced as the current one (aria-current), never as a pressed toggle; its dot
        // and colour come from the same `active` (the 21 November 2026 meeting)
        <Chip key={c} data-chip={c} selected={active === c} aria-pressed={undefined} aria-current={active === c ? "true" : undefined} mark="dot" title={c} className="max-w-[15rem] shrink-0 whitespace-nowrap" onClick={() => onJump(c)}><span className="min-w-0 truncate">{c}</span></Chip>
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

/**
 * Measures the sticky search-and-sections bar and writes its visible height to --chain-bar on the page (sections scroll to just under it, whatever the
 * phone's notch, text size or chip wrapping), and the search box's height to --chain-search (on a short screen the bar is pulled up by that much, so only the
 * chips stay). Returns the visible height for the scroll-spy.
 */
function useStickyBar(root: React.RefObject<HTMLElement | null>, bar: React.RefObject<HTMLElement | null>, search: React.RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const r = root.current;
    const b = bar.current;
    const sbox = search.current;
    if (!r || !b) return;
    const short = window.matchMedia("(max-height: 500px)");
    const measure = () => {
      // the search box with the bar's own top padding above it (the safe area on a notched phone), so none of it peeks out on a short screen
      const searchH = sbox ? Math.max(0, sbox.getBoundingClientRect().bottom - b.getBoundingClientRect().top) : 0;
      const visible = Math.max(0, b.offsetHeight - (short.matches ? searchH : 0));
      r.style.setProperty("--chain-search", `${searchH}px`);
      r.style.setProperty("--chain-bar", `${visible}px`);
      setHeight(visible);
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(b);
    short.addEventListener("change", measure);
    return () => {
      ro?.disconnect();
      short.removeEventListener("change", measure);
    };
  }, [root, bar, search]);
  return height;
}

/**
 * Which menu section is at the top of the screen (just under the sticky bar), for the category chips: of the sections in the band under the bar, the first in
 * the page's order; the last one once the page is scrolled to the bottom (a short last section never reaches the band). `hold(c)` lights a tapped chip at once
 * and ignores the observer until the scroll it starts has ended, so the chips never flicker through the sections in between.
 */
function useActiveSection(categories: readonly string[], barHeight: number): { active: string | null; hold: (c: string) => void } {
  const [active, setActive] = useState<string | null>(null);
  const held = useRef(false);
  const key = categories.join("\u0000");
  useEffect(() => {
    if (!key || typeof IntersectionObserver === "undefined") return;
    const order = key.split("\u0000");
    const els = order.map((c) => document.getElementById(sectionId(c))).filter((e): e is HTMLElement => e !== null);
    const inBand = new Set<string>();
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    const pick = () => {
      if (held.current) return;
      if (atBottom()) return setActive(order[order.length - 1] ?? null);
      const first = order.find((c) => inBand.has(c));
      if (first) setActive(first);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const c = (e.target as HTMLElement).dataset.category ?? "";
          if (e.isIntersecting) inBand.add(c);
          else inBand.delete(c);
        }
        pick();
      },
      { rootMargin: `-${Math.round(barHeight) + 8}px 0px -55% 0px` },
    );
    els.forEach((e) => io.observe(e));
    window.addEventListener("scroll", pick, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", pick);
    };
  }, [key, barHeight]);
  const hold = (c: string) => {
    setActive(c);
    held.current = true;
    const release = () => { held.current = false; };
    if ("onscrollend" in window) {
      window.addEventListener("scrollend", release, { once: true });
      setTimeout(release, 2000); // a scroll that never starts (already there) fires no scrollend
    } else setTimeout(release, 900);
  };
  return { active: categories.includes(active ?? "") ? active : null, hold };
}
