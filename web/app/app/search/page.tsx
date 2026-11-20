"use client";

import Link from "next/link";
import { chainHref, itemHref } from "@/lib/mm/routes";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { formatCalories } from "@/lib/mm/format";
import { itemImageUrl } from "@/lib/mm/images";
import { anyDietFilter, filterCaution } from "@/lib/mm/menu-view";
import { addRecentSearch, highlightRange, MIN_QUERY_LENGTH, normalizeForSearch, search } from "@/lib/mm/search";
import { ChainMark } from "../_components/ChainMark";
import { chainGroupClass } from "../_components/ChainRow";
import { ItemThumb } from "../_components/ItemPhoto";
import { blurOnEnter, DONE_ROOM, DONE_ROOM_WITH_CLEAR, SearchDone } from "../_components/SearchDone";
import { ChevronRightIcon, CloseIcon, SearchIcon } from "../_components/icons";
import { PageHeader } from "../_components/PageHeader";
import { RequestChainSheet } from "../_components/Submit";
import { Button, Chip, EmptyIcon, EmptyState, SampleBadge } from "../_components/ui";
import { useEntryQuery } from "../_lib/backNav";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { useSearchIndex, useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";

// SPEC §7.3: type-ahead over chain and item names, minimum 2 characters. Chains first, then items.
// Look (founder 2026-10-15, "the rest of the app should match that elegance"): the search pill has the whole width under a grey Back
// pill (36 px in a 44 px tap area, like Home's round buttons; the pill gets the whole width so its placeholder is never cut short),
// results sit in grouped white cards under compact headings, calories in DM Mono like Home's figures, and the matched letters are
// marked with the brand lime like a highlighter. Words, roles and names are unchanged; an item row still reads
// "Chicken wrap · Cluck House · 440 kcal" in that order (SPEC §7.3).
// Photos (founder 2026-11-17, "Use images please when possible"): a dish with the chain's own photo (the search file's photo entry) shows it
// before its name like a restaurant's menu list. When any dish in the list has one, the others get the grey fork tile so every name starts at
// the same place; a photo that can't load (offline in the iPhone app, which loads photos from the website) becomes that tile too. On a narrow
// row (its content under 18.5rem: a 360 px phone, Large text on most phones, Extra large on all) the photos step aside, as Compare's rows do, so names keep their room.

const heading = "mt-7 text-xl font-[800] tracking-[-0.01em]";

export default function SearchPage() {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useEntryQuery(inputRef); // kept in the history entry, so Back from a result finds the search as it was left
  const deferred = useDeferredValue(query);
  const { searchIndex, loadedCount, totalCount } = useSearchIndex();
  const [requesting, setRequesting] = useState(false);
  const [recent, setRecent] = useRecentSearches();
  // The diet settings (Settings › Diet) apply here as on a restaurant's page; one tap shows every dish.
  const prefs = useSettings().preferences;
  const [dietOn, setDietOn] = useState(true);
  const diet = anyDietFilter(prefs) && dietOn;
  const results = useMemo(() => search(searchIndex, deferred, 40, diet ? prefs : undefined), [searchIndex, deferred, diet, prefs]);
  const active = normalizeForSearch(deferred).length >= MIN_QUERY_LENGTH;
  const empty = results.chains.length === 0 && results.items.length === 0 && results.hiddenByDiet === 0;
  const stillLoading = loadedCount < totalCount;
  const remember = () => setRecent(addRecentSearch(recent, deferred));
  // itemImageUrl is undefined when photos are switched off or a chain's photos are taken down (hidden.json); the taken-down list can arrive
  // after the page opens, so re-check (and re-render the rows' photos) when it does, as a restaurant's page does.
  const hiddenLogos = useHiddenLogos();
  const itemPhotos = useMemo(() => results.items.some((i) => itemImageUrl(i.image) !== undefined), [results.items, hiddenLogos]); // eslint-disable-line react-hooks/exhaustive-deps -- itemImageUrl reads the taken-down list, which hiddenLogos tracks

  return (
    <div>
      <h1 className="sr-only">{t("Search")}</h1>
      {/* the header every page has (colour meeting, 19 November 2026): Back goes to the page before when there is one in the app (Eat out, or wherever
          Search was opened from), else Eat out; the Settings cog far right */}
      <PageHeader back={{ href: "/app/eat-out", label: t("Back to restaurants") }} />
      <div className="group/search relative mt-3">
        <SearchIcon className="pointer-events-none absolute start-5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-foreground" />
        <input
          ref={inputRef}
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") remember(); // the keyboard's own key says "search" here: it keeps the search in Recent searches, then puts the keyboard away
            blurOnEnter(e);
          }}
          placeholder={t("Search restaurants and items")}
          aria-label={t("Search restaurants and items")}
          enterKeyHint="search"
          autoComplete="off"
          className={`glass min-h-[3.25rem] w-full rounded-full ps-12 pe-14 ${query ? DONE_ROOM_WITH_CLEAR : DONE_ROOM} text-base placeholder:text-muted [&::-webkit-search-cancel-button]:hidden`}
        />
        <SearchDone>
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label={t("Clear search")} className="group inline-flex h-11 w-11 items-center justify-center rounded-full">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[color:var(--edge)] bg-soft text-foreground transition-colors group-hover:bg-[var(--fill)]"><CloseIcon className="h-4 w-4" /></span>
            </button>
          )}
        </SearchDone>
      </div>

      {!active && (
        recent.length > 0 ? (
          <section aria-labelledby="recent-heading">
            <div className="mt-7 flex items-baseline justify-between gap-3">
              <h2 id="recent-heading" className="text-xl font-[800] tracking-[-0.01em]">{t("Recent searches")}</h2>
              <button type="button" onClick={() => setRecent([])} className="min-h-11 px-1 text-[0.9375rem] font-semibold text-accent">{t("Clear")}</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {recent.map((r) => (<Chip key={r} onClick={() => setQuery(r)}>{r}</Chip>))}
            </div>
          </section>
        ) : (
          // a plain hint, no Pip (Pip audit, founder 2026-11-20: "keep him as the guide, not the decoration")
          <p className="mx-auto mt-10 max-w-sm text-center text-[0.9375rem] leading-snug text-muted">{t("Type at least {n} letters of a restaurant or a dish.", { n: MIN_QUERY_LENGTH })}</p>
        )
      )}

      {active && empty && (
        <div className="mt-6">
          {stillLoading ? (
            <SearchSkeleton />
          ) : (
            <EmptyState
              icon={<EmptyIcon><SearchIcon /></EmptyIcon>}
              title={t("We don't cover this yet.")}
              body={t("Nothing matches “{query}”. Tell us which restaurant you'd like next.", { query: deferred.trim() })}
              action={<Button onClick={() => setRequesting(true)}>{t("Request it")}</Button>}
            />
          )}
        </div>
      )}

      {results.chains.length > 0 && (
        <>
          <h2 className={heading}>{t("Chains")}</h2>
          <ul className={`mt-3.5 ${chainGroupClass}`}>
            {results.chains.map((c) => (
              <li key={c.chainId}>
                <Link
                  href={chainHref(c.chainId)}
                  onClick={() => {
                    remember();
                    analytics.track({ name: "chainOpened", chainId: c.chainId, source: "search" });
                  }}
                  className="group flex min-h-[4.5rem] items-center gap-3.5 px-4 py-2.5 transition-colors hover:bg-[var(--fill)] active:bg-soft-strong focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]!"
                >
                  <ChainMark chainId={c.chainId} cuisine={c.cuisine} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]"><Highlight text={c.name} query={deferred} /></span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm leading-snug text-muted">{c.cuisine ? t(c.cuisine) : null} {c.sample && <SampleBadge />}</span>
                  </span>
                  <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {active && anyDietFilter(prefs) && (results.items.length > 0 || results.hiddenByDiet > 0) && (
        <div className="mt-5">
          <Chip selected={dietOn} onClick={() => setDietOn((v) => !v)}>{t("Fits my diet")}</Chip>
          {diet && <p className="mt-2.5 text-[0.8125rem] leading-snug text-muted">{filterCaution(prefs, t)}</p>}
        </div>
      )}

      {results.items.length === 0 && results.hiddenByDiet > 0 && (
        <div className="mt-3.5"><EmptyState icon={<EmptyIcon><SearchIcon /></EmptyIcon>} title={t("Nothing here matches your filters.")} /></div>
      )}

      {results.items.length > 0 && (
        <>
          <h2 className={heading}>{t("Items")}</h2>
          <ul className={`mt-3.5 ${chainGroupClass}`}>
            {results.items.map((i) => (
              <li key={`${i.chainId}/${i.itemId}`}>
                <Link
                  href={itemHref(i.chainId, i.itemId)}
                  onClick={remember}
                  className={`group flex items-center px-4 transition-colors hover:bg-[var(--fill)] active:bg-soft-strong focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]! ${itemPhotos ? "@container min-h-[4.75rem] gap-3.5 py-3" : "min-h-[4.25rem] gap-3 py-2.5"}`}
                >
                  {/* The photo steps aside when the row is narrow (a small phone, or larger text), so the dish's name keeps room beside the calories. */}
                  {itemPhotos && <span className="hidden shrink-0 @[18.5rem]:flex"><ItemThumb key={i.image ?? ""} image={i.image} placeholder /></span>}
                  {/* SPEC §7.3: "Chicken wrap · Cluck House · 440 kcal", in that order for screen readers and for the text as a whole;
                      on screen the dish sits over its restaurant with the calories at the end of the row, like a price list, so the
                      separators are kept for assistive tech only. */}
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]"><Highlight text={i.name} query={deferred} /></span>
                    <span className="sr-only"> · </span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted [overflow-wrap:anywhere]">{i.chainName}</span>
                    <span className="sr-only"> · </span>
                  </span>
                  <span className="app-numbers shrink-0 whitespace-nowrap font-mono text-[0.8125rem] font-normal text-muted">
                    <span aria-hidden>{formatCalories(i.calories)}</span>
                    <span className="sr-only">{t("{n} calories", { n: Math.round(i.calories) })}</span>
                  </span>
                  <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
          {stillLoading && <p role="status" className="mt-3.5 text-center text-sm text-muted">{t("Still loading menus ({n} of {total})…", { n: loadedCount, total: totalCount })}</p>}
        </>
      )}

      <RequestChainSheet open={requesting} onClose={() => setRequesting(false)} initialName={deferred.trim()} />
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const range = highlightRange(text, query);
  if (!range) return <>{text}</>;
  const chars = [...text];
  return (
    <>
      {chars.slice(0, range[0]).join("")}
      <mark className="rounded-[0.25rem] bg-sun text-foreground">{chars.slice(range[0], range[1]).join("")}</mark>
      {chars.slice(range[1]).join("")}
    </>
  );
}

/** Shown while the search index is still arriving, so typing never looks like "no results". */
function SearchSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-label={t("Loading search")} className={chainGroupClass}>
      {[0, 1, 2, 3].map((n) => (
        <div key={n} aria-hidden className="flex min-h-14 items-center gap-3 px-4">
          <span className="h-4 animate-pulse rounded-full bg-soft-strong" style={{ width: `${70 - n * 12}%` }} />
        </div>
      ))}
    </div>
  );
}

const RECENT_KEY = "mm.v1.recentSearches";

/** Recent searches stay on this device only (localStorage), like everything else the user does. */
function useRecentSearches(): [string[], (list: string[]) => void] {
  const [recent, setRecentState] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
      if (Array.isArray(stored)) setRecentState(stored.filter((s): s is string => typeof s === "string").slice(0, 6)); // eslint-disable-line react-hooks/set-state-in-effect -- read after hydration
    } catch { /* storage blocked or corrupt: start empty */ }
  }, []);
  const set = (list: string[]) => {
    setRecentState(list);
    try {
      if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list));
      else localStorage.removeItem(RECENT_KEY);
    } catch { /* not remembered, still works */ }
  };
  return [recent, set];
}
