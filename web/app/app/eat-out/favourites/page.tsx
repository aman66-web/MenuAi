"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { favoritesStore, toggleFavorite } from "@/lib/mm/stores";
import { normalizeForSearch } from "@/lib/mm/search";
import { ChainMark } from "../../_components/ChainMark";
import { ChainRow, chainGroupClass } from "../../_components/ChainRow";
import { ChevronLeftIcon, SearchIcon, StarIcon } from "../../_components/icons";
import { Pip } from "../../_components/Mascot";
import { DONE_KEY, DONE_ROOM, SearchDone } from "../../_components/SearchDone";
import { EmptyState, Spinner } from "../../_components/ui";
import { useHydrated, useMenu, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";

// "My favourite restaurants" (founder 2026-10-11: "on the eat out section there should be one which says my favourite restaurants ... that's when they can
// bookmark restaurants"): the person's favourites first, then every restaurant with a star to add or take it off. On this device only (mm.v1.favorites),
// the same favourites as the star on a restaurant's page.
// Look (founder 2026-10-15): Home's language. A grey Back pill (36 px, in a 44 px tap area, like Home's round buttons), a compact heavy
// title, favourites and the add list as grouped white cards, a white search pill, and Save as the same small grey pill that turns the
// brand lime once a restaurant is saved (lime = selected).

/** Back: a 36 px grey pill inside a 44 px tap area, like Home's round buttons. */
const BACK = "group -ms-1 inline-flex min-h-11 items-center rounded-full px-1 transition active:scale-95";
const BACK_PILL = "inline-flex min-h-9 items-center gap-1 rounded-full bg-soft-strong py-1 ps-2 pe-3.5 text-[0.9375rem] font-bold leading-tight transition-colors group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]";

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
      <Link href="/app/eat-out" aria-label={t("Back to restaurants")} className={BACK}><span className={BACK_PILL}><ChevronLeftIcon className="h-[1.125rem] w-[1.125rem]" /><span>{t("Back")}</span></span></Link>
      <h1 className="mt-4 text-[1.75rem] font-[800] leading-[1.1] tracking-[-0.02em]">{t("My favourite restaurants")}</h1>

      {!hydrated || menu.status === "loading" || menu.status === "idle" ? (
        <Spinner label={t("Loading restaurants")} />
      ) : (
        <>
          {mine.length === 0 ? (
            <div className="mt-5"><EmptyState icon={<Pip mood="point" size={64} />} title={t("No favourite restaurants yet")} body={t("Tap the star next to a restaurant below, or on its page, and it will be here next time.")} /></div>
          ) : (
            <ul className={`mt-5 ${chainGroupClass}`}>
              {mine.map((c) => (<li key={c.id}><ChainRow chain={c} /></li>))}
            </ul>
          )}

          <h2 className="mt-8 text-xl font-[800] tracking-[-0.01em]">{t("Add a restaurant")}</h2>
          <div className="group/search relative mt-3.5">
            <SearchIcon className="pointer-events-none absolute start-5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-foreground" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Type a restaurant's name")} aria-label={t("Search restaurants")} {...DONE_KEY} autoComplete="off" className={`glass min-h-[3.25rem] w-full rounded-full ps-12 pe-4 ${DONE_ROOM} text-base placeholder:text-muted`} />
            <SearchDone />
          </div>
          <ul className={`mt-3.5 ${chainGroupClass}`}>
            {others.slice(0, deferred.trim() ? 60 : 40).map((c) => {
              const on = ids.has(c.id);
              return (
                <li key={c.id} className="flex min-h-[4.25rem] items-center gap-3.5 py-2 pe-3 ps-4">
                  <ChainMark chainId={c.id} cuisine={c.cuisine} size="md" />
                  <span className="min-w-0 flex-1 text-base font-bold leading-snug">{c.name}</span>
                  <button type="button" aria-pressed={on} onClick={() => toggleFavorite(c.id)} className="group inline-flex min-h-11 shrink-0 items-center rounded-full">
                    <span className={`inline-flex min-h-9 items-center gap-1.5 rounded-full py-1 ps-3 pe-3.5 text-[0.9375rem] font-bold leading-tight transition group-active:scale-95 ${on ? "bg-sun text-[var(--on-accent)]" : "bg-soft-strong text-foreground group-hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]"}`}>
                      <StarIcon filled={on} className="h-[1.125rem] w-[1.125rem]" />{on ? t("Saved") : t("Save")}
                    </span>
                    <span className="sr-only"> {c.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!deferred.trim() && others.length > 40 && <p className="mt-3.5 px-1 text-[0.9375rem] leading-snug text-muted">{t("Type a name to find any of the {n} restaurants.", { n: others.length })}</p>}
          {deferred.trim() && others.length === 0 && <p className="mt-3.5 px-1 text-[0.9375rem] leading-snug text-muted">{t("No restaurant matches “{query}”.", { query: deferred.trim() })}</p>}
        </>
      )}
    </div>
  );
}
