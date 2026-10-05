"use client";

import Link from "next/link";
import { chainHref, itemHref } from "@/lib/mm/routes";
import { useDeferredValue, useMemo, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { formatCalories } from "@/lib/mm/format";
import { MIN_QUERY_LENGTH, normalizeForSearch, search } from "@/lib/mm/search";
import { ChainMark } from "../_components/ChainMark";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "../_components/icons";
import { RequestChainSheet } from "../_components/Submit";
import { Button, EmptyState, SampleBadge, SectionTitle } from "../_components/ui";
import { useSearchIndex } from "../_lib/hooks";

// SPEC §7.3: type-ahead over chain and item names, minimum 2 characters.
export default function SearchPage() {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const { searchIndex, loadedCount, totalCount } = useSearchIndex();
  const [requesting, setRequesting] = useState(false);
  const results = useMemo(() => search(searchIndex, deferred), [searchIndex, deferred]);
  const active = normalizeForSearch(deferred).length >= MIN_QUERY_LENGTH;
  const empty = results.chains.length === 0 && results.items.length === 0;
  const stillLoading = loadedCount < totalCount;

  return (
    <div>
      <h1 className="sr-only">Search</h1>
      <div className="flex items-center gap-2">
        <Link href="/app" aria-label="Back" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search restaurants and items"
            aria-label="Search restaurants and items"
            className="glass min-h-12 w-full rounded-full pl-11 pr-4 text-base placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
      </div>

      {!active && <p className="mt-10 text-center text-sm text-muted">Type at least {MIN_QUERY_LENGTH} letters.</p>}

      {active && empty && (
        <div className="mt-6">
          {stillLoading ? (
            <p role="status" className="text-center text-sm text-muted">Still loading menus ({loadedCount} of {totalCount})…</p>
          ) : (
            <EmptyState title="We don't cover this yet." action={<Button onClick={() => setRequesting(true)}>Request it</Button>} />
          )}
        </div>
      )}

      {results.chains.length > 0 && (
        <>
          <SectionTitle>Chains</SectionTitle>
          <ul className="space-y-2">
            {results.chains.map((c) => (
              <li key={c.chainId}>
                <Link href={chainHref(c.chainId)} onClick={() => analytics.track({ name: "chainOpened", chainId: c.chainId, source: "search" })} className="glass flex min-h-16 items-center gap-3 rounded-3xl px-4 py-2 transition active:scale-[0.99] hover:bg-soft-strong">
                  <ChainMark chainId={c.chainId} cuisine={c.cuisine} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold tracking-tight">{c.name}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">{c.cuisine} {c.sample && <SampleBadge />}</span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 text-muted" />
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
                  aria-label={`${i.name}, ${i.chainName}, ${Math.round(i.calories)} calories`}
                  className="glass flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 py-2.5 transition active:scale-[0.99] hover:bg-soft-strong"
                >
                  <span className="app-numbers min-w-0">
                    {/* SPEC §7.3: "Chicken wrap · Cluck House · 440 kcal" */}
                    <span aria-hidden><span className="font-bold tracking-tight">{i.name}</span> <span className="text-muted">· {i.chainName} · <span className="whitespace-nowrap">{formatCalories(i.calories)}</span></span></span>
                  </span>
                  <ChevronRightIcon className="h-5 w-5 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <RequestChainSheet open={requesting} onClose={() => setRequesting(false)} initialName={deferred.trim()} />
    </div>
  );
}
