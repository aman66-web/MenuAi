"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { formatCalories } from "@/lib/mm/format";
import { MIN_QUERY_LENGTH, search } from "@/lib/mm/search";
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
  const active = deferred.trim().length >= MIN_QUERY_LENGTH;
  const empty = results.chains.length === 0 && results.items.length === 0;
  const stillLoading = loadedCount < totalCount;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Link href="/app" aria-label="Back" className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-soft"><ChevronLeftIcon /></Link>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search restaurants and items"
            aria-label="Search restaurants and items"
            className="min-h-12 w-full rounded-xl border border-line bg-soft pl-10 pr-3 text-base focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
      </div>

      {!active && <p className="mt-6 text-center text-sm text-muted">Type at least {MIN_QUERY_LENGTH} letters.</p>}

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
          <ul>
            {results.chains.map((c) => (
              <li key={c.chainId}>
                <Link href={`/app/chain/${c.chainId}`} onClick={() => analytics.track({ name: "chainOpened", chainId: c.chainId, source: "search" })} className="flex min-h-14 items-center justify-between border-b border-line px-1 py-2 hover:bg-soft">
                  <span>
                    <span className="block font-semibold">{c.name}</span>
                    <span className="flex items-center gap-2 text-sm text-muted">{c.cuisine} {c.sample && <SampleBadge />}</span>
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
          <ul>
            {results.items.map((i) => (
              <li key={`${i.chainId}/${i.itemId}`}>
                <Link href={`/app/chain/${i.chainId}/item/${i.itemId}`} className="flex min-h-14 items-center justify-between border-b border-line px-1 py-2 hover:bg-soft">
                  <span className="app-numbers">
                    <span className="block font-semibold">{i.name}</span>
                    <span className="block text-sm text-muted">{i.chainName} · {formatCalories(i.calories)}</span>
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
