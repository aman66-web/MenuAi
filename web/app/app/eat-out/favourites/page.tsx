"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { favoritesStore, toggleFavorite } from "@/lib/mm/stores";
import { normalizeForSearch } from "@/lib/mm/search";
import { ChainMark } from "../../_components/ChainMark";
import { ChainRow } from "../../_components/ChainRow";
import { ChevronLeftIcon, SearchIcon, StarIcon } from "../../_components/icons";
import { Pip } from "../../_components/Mascot";
import { EmptyState, Spinner } from "../../_components/ui";
import { useHydrated, useMenu, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";

// "My favourite restaurants" (founder 2026-10-11: "on the eat out section there should be one which says my favourite restaurants ... that's when they can
// bookmark restaurants"): the person's favourites first, then every restaurant with a star to add or take it off. On this device only (mm.v1.favorites),
// the same favourites as the star on a restaurant's page.

export default function FavouriteRestaurantsPage() {
  const t = useT();
  const hydrated = useHydrated();
  const menu = useMenu();
  const favorites = useStore(favoritesStore);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const ids = useMemo(() => new Set(favorites.map((f) => f.chainId)), [favorites]);
  const mine = useMemo(() => favorites.map((f) => menu.chains.find((c) => c.id === f.chainId)).filter((c): c is NonNullable<typeof c> => !!c), [favorites, menu.chains]);
  const others = useMemo(() => {
    const words = normalizeForSearch(deferred).split(" ").filter(Boolean);
    return menu.chains
      .filter((c) => words.every((w) => ` ${normalizeForSearch(c.name)}`.includes(` ${w}`)))
      .sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }));
  }, [menu.chains, deferred]);

  return (
    <div>
      <Link href="/app/eat-out" aria-label={t("Back to restaurants")} className="glass inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full ps-2.5 pe-4 text-base font-bold transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon className="h-5 w-5" /><span>{t("Back")}</span></Link>
      <h1 className="mt-5 text-[2.2rem] font-extrabold leading-[1.05] tracking-tight">{t("My favourite restaurants")}</h1>

      {!hydrated || menu.status === "loading" || menu.status === "idle" ? (
        <Spinner label={t("Loading restaurants")} />
      ) : (
        <>
          {mine.length === 0 ? (
            <div className="mt-5"><EmptyState icon={<Pip mood="point" size={64} />} title={t("No favourite restaurants yet")} body={t("Tap the star next to a restaurant below, or on its page, and it will be here next time.")} /></div>
          ) : (
            <ul className="mt-5 space-y-2.5">
              {mine.map((c) => (<li key={c.id}><ChainRow chain={c} /></li>))}
            </ul>
          )}

          <h2 className="mt-8 text-xl font-extrabold tracking-tight">{t("Add a restaurant")}</h2>
          <label className="relative mt-3 block">
            <span className="sr-only">{t("Search restaurants")}</span>
            <SearchIcon className="pointer-events-none absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Type a restaurant's name")} enterKeyHint="search" autoComplete="off" className="glass min-h-14 w-full rounded-full ps-11 pe-4 text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent" />
          </label>
          <ul className="mt-3 space-y-2">
            {others.slice(0, deferred.trim() ? 60 : 40).map((c) => {
              const on = ids.has(c.id);
              return (
                <li key={c.id} className="glass flex min-h-16 items-center gap-3 rounded-3xl py-2 pe-2 ps-3">
                  <ChainMark chainId={c.id} cuisine={c.cuisine} size="sm" />
                  <span className="min-w-0 flex-1 text-base font-bold leading-snug">{c.name}</span>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleFavorite(c.id)}
                    className={`inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-4 text-base font-bold transition active:scale-95 ${on ? "bg-accent-soft text-accent" : "border border-line bg-soft hover:bg-soft-strong"}`}
                  >
                    <StarIcon filled={on} className="h-5 w-5" />{on ? t("Saved") : t("Save")}
                    <span className="sr-only"> {c.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!deferred.trim() && others.length > 40 && <p className="mt-3 px-1 text-base text-muted">{t("Type a name to find any of the {n} restaurants.", { n: others.length })}</p>}
          {deferred.trim() && others.length === 0 && <p className="mt-3 px-1 text-base text-muted">{t("No restaurant matches “{query}”.", { query: deferred.trim() })}</p>}
        </>
      )}
    </div>
  );
}
