"use client";

import Link from "next/link";
import { chainHref, itemHref } from "@/lib/mm/routes";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { formatCalories } from "@/lib/mm/format";
import { addRecentSearch, highlightRange, MIN_QUERY_LENGTH, normalizeForSearch, search } from "@/lib/mm/search";
import { ChainMark } from "../_components/ChainMark";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, SearchIcon } from "../_components/icons";
import { RequestChainSheet } from "../_components/Submit";
import { Button, Chip, EmptyState, SampleBadge, SectionTitle } from "../_components/ui";
import { PipSays } from "../_components/Mascot";
import { useSearchIndex } from "../_lib/hooks";

// SPEC §7.3: type-ahead over chain and item names, minimum 2 characters. Chains first, then items.
export default function SearchPage() {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const { searchIndex, loadedCount, totalCount } = useSearchIndex();
  const [requesting, setRequesting] = useState(false);
  const [recent, setRecent] = useRecentSearches();
  const results = useMemo(() => search(searchIndex, deferred), [searchIndex, deferred]);
  const active = normalizeForSearch(deferred).length >= MIN_QUERY_LENGTH;
  const empty = results.chains.length === 0 && results.items.length === 0;
  const stillLoading = loadedCount < totalCount;
  const remember = () => setRecent(addRecentSearch(recent, deferred));

  return (
    <div>
      <h1 className="sr-only">Search</h1>
      <div className="flex items-center gap-2">
        <Link href="/app" aria-label="Back" className="glass inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && remember()}
            placeholder="Search restaurants and items"
            aria-label="Search restaurants and items"
            enterKeyHint="search"
            autoComplete="off"
            className="glass min-h-12 w-full rounded-full pl-11 pr-12 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-foreground">
              <CloseIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {!active && (
        recent.length > 0 ? (
          <section aria-labelledby="recent-heading">
            <SectionTitle action={<button type="button" onClick={() => setRecent([])} className="min-h-11 px-1 text-sm font-medium text-accent">Clear</button>}>
              <span id="recent-heading">Recent searches</span>
            </SectionTitle>
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (<Chip key={r} onClick={() => setQuery(r)}>{r}</Chip>))}
            </div>
          </section>
        ) : (
          <div className="mx-auto mt-10 max-w-sm">
            <PipSays mood="think">Type at least {MIN_QUERY_LENGTH} letters of a restaurant or a dish.</PipSays>
          </div>
        )
      )}

      {active && empty && (
        <div className="mt-6">
          {stillLoading ? (
            <SearchSkeleton />
          ) : (
            <EmptyState
              title="We don't cover this yet."
              body={<>Nothing matches &ldquo;{deferred.trim()}&rdquo;. Tell us which restaurant you&apos;d like next.</>}
              action={<Button onClick={() => setRequesting(true)}>Request it</Button>}
            />
          )}
        </div>
      )}

      {results.chains.length > 0 && (
        <>
          <SectionTitle>Chains</SectionTitle>
          <ul className="space-y-2">
            {results.chains.map((c) => (
              <li key={c.chainId}>
                <Link
                  href={chainHref(c.chainId)}
                  onClick={() => {
                    remember();
                    analytics.track({ name: "chainOpened", chainId: c.chainId, source: "search" });
                  }}
                  className="glass flex min-h-16 items-center gap-3 rounded-3xl px-4 py-2 transition active:scale-[0.99] hover:bg-soft-strong"
                >
                  <ChainMark chainId={c.chainId} cuisine={c.cuisine} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold tracking-tight"><Highlight text={c.name} query={deferred} /></span>
                    <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">{c.cuisine} {c.sample && <SampleBadge />}</span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {results.items.length > 0 && (
        <>
          <SectionTitle>Items</SectionTitle>
          <ul className="space-y-2">
            {results.items.map((i) => (
              <li key={`${i.chainId}/${i.itemId}`}>
                <Link
                  href={itemHref(i.chainId, i.itemId)}
                  onClick={remember}
                  className="glass flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 py-2.5 transition active:scale-[0.99] hover:bg-soft-strong"
                >
                  <span className="app-numbers min-w-0">
                    {/* SPEC §7.3: "Chicken wrap · Cluck House · 440 kcal" */}
                    <span className="font-bold tracking-tight"><Highlight text={i.name} query={deferred} /></span>{" "}
                    <span className="text-muted">
                      · {i.chainName} · <span aria-hidden className="whitespace-nowrap">{formatCalories(i.calories)}</span>
                      <span className="sr-only">{Math.round(i.calories)} calories</span>
                    </span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
          {stillLoading && <p role="status" className="mt-3 text-center text-sm text-muted">Still loading menus ({loadedCount} of {totalCount})…</p>}
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
      <mark className="rounded-sm bg-accent-soft text-accent">{chars.slice(range[0], range[1]).join("")}</mark>
      {chars.slice(range[1]).join("")}
    </>
  );
}

/** Shown while the search index is still arriving, so typing never looks like "no results". */
function SearchSkeleton() {
  return (
    <div role="status" aria-label="Loading search" className="space-y-2">
      {[0, 1, 2, 3].map((n) => (
        <div key={n} aria-hidden className="glass flex min-h-14 items-center gap-3 rounded-2xl px-4">
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
