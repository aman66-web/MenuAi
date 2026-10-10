"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { favoritesStore, settingsStore } from "@/lib/mm/stores";
import { HALAL_CAUTION, isAllHalal } from "@/lib/mm/halal";
import { SAMPLES_ENABLED } from "@/lib/mm/config";
import { chainsInGroup, cuisineGroups } from "@/lib/mm/cuisine";
import { groupByInitial, splitChains } from "@/lib/mm/popular";
import { ChainCard, ChainRow } from "../_components/ChainRow";
import { ArrowRightIcon, PinIcon, SearchIcon } from "../_components/icons";
import { RequestChainSheet } from "../_components/Submit";
import { Button, Chip, EmptyState, ErrorBox, SectionTitle, Spinner } from "../_components/ui";
import { menuClient } from "../_lib/menu";
import { scrollToElement } from "../_lib/scroll";
import { useHydrated, useMenu, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// The Eat out tab (founder 2026-10-10: "find restaurants near you and also see all the restaurants we have and also search"): search, the
// restaurants near you (the map), then every restaurant, café, pub and takeaway we have (SPEC §7.2's chain list: Popular, Favourites, A to Z).

export default function EatOutPage() {
  const t = useT();
  const hydrated = useHydrated();
  const settings = useSettings();
  const menu = useMenu();
  const favorites = useStore(favoritesStore);
  const [requesting, setRequesting] = useState(false);
  const [type, setType] = useBrowseType();
  const [fullOnly, setFullOnly] = useState(false);
  const [halalOnly, setHalalOnly] = useState(() => settingsStore.get().preferences.halalOnly ?? false);
  const anyHalal = useMemo(() => menu.chains.some((c) => isAllHalal(c.id)), [menu.chains]);

  const shownChains = useMemo(
    () => menu.chains.filter((c) => (!fullOnly || (c.nutritionLevel ?? "full") === "full") && (!halalOnly || isAllHalal(c.id))),
    [menu.chains, fullOnly, halalOnly],
  );
  const { popular, rest } = useMemo(() => splitChains(shownChains), [shownChains]);
  const restGroups = useMemo(() => groupByInitial(rest), [rest]);
  const types = useMemo(() => cuisineGroups(shownChains), [shownChains]);
  const activeType = types.find((g) => g.id === type);
  const typeChains = useMemo(() => (activeType ? chainsInGroup(shownChains, activeType.id) : []), [shownChains, activeType]);
  const realCount = shownChains.filter((c) => !c.sample).length;
  const hasCaloriesOnly = menu.chains.some((c) => c.nutritionLevel === "calories");
  const favoriteChains = useMemo(() => {
    const ids = new Set(favorites.map((f) => f.chainId));
    return menu.chains.filter((c) => ids.has(c.id));
  }, [favorites, menu.chains]);

  if (!hydrated || !settings.hasCompletedOnboarding) return <Spinner />;

  return (
    <div>
      <h1 className="text-[2.75rem] font-extrabold leading-[1.0] tracking-[-0.035em]"><Rich text={t("Eat {out}")} values={{ out: <span className="serif-em sun-text pe-0.5">{t("out")}</span> }} /></h1>
      <p className="mt-2 text-[15px] text-muted">{t("Restaurants, cafés, pubs and takeaways, with the calories and protein of every dish.")}</p>

      <Link href="/app/search" className="glass lift group mt-5 flex min-h-[3.75rem] items-center gap-3 rounded-full ps-5 pe-2 text-muted hover:bg-soft-strong">
        <SearchIcon className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t("Search restaurants and items")}</span>
        <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
      </Link>
      <Link href="/app/map" className="hero-card lift group mt-3 flex min-h-[5.5rem] items-center gap-4 rounded-[1.75rem] p-4">
        <span aria-hidden className="icon-bubble h-14 w-14 shrink-0 rounded-2xl"><PinIcon className="h-7 w-7" /></span>
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span className="block text-lg font-extrabold leading-snug tracking-tight">{t("Near me")}</span>
          <span className="block text-sm text-muted">{t("See the places to eat around you on a map.")}</span>
        </span>
        <span aria-hidden className="icon-bubble-soft h-11 w-11 shrink-0 transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
      </Link>

      {SAMPLES_ENABLED && menu.chains.some((c) => c.sample) && (
        <p className="glass mt-4 rounded-2xl px-4 py-2.5 text-xs text-muted">{t("Showing fictional sample data for testing. Numbers are not real.")}</p>
      )}

      {menu.status === "loading" || menu.status === "idle" ? (
        <Spinner label={t("Loading restaurants")} />
      ) : menu.status === "error" ? (
        <div className="mt-6">
          <ErrorBox message={menu.error != null ? t(menu.error) : t("Couldn't load the restaurants.")} onRetry={() => void menuClient.ensureManifest(true)} />
        </div>
      ) : menu.chains.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={t("Menus are coming soon")}
            body={t("We're adding restaurants from their official nutrition guides. Tell us which ones you want first.")}
            action={<Button onClick={() => setRequesting(true)}>{t("Request a chain")}</Button>}
          />
        </div>
      ) : (
        <>
          <div className="mb-1 mt-8 flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight"><span aria-hidden className="bg-sun h-5 w-1.5 shrink-0 rounded-full" />{t("All restaurants")}</h2>
            {realCount > 0 && <p className="app-numbers text-sm text-muted">{t("{n} UK restaurants", { n: realCount })}</p>}
          </div>
          {types.length > 1 && (
            <div role="group" aria-label={t("Browse by type")} className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
              <Chip selected={!activeType} onClick={() => setType(null)}>{t("All")}</Chip>
              {hasCaloriesOnly && <Chip selected={fullOnly} onClick={() => setFullOnly((v) => !v)}>{t("Full nutrition only")}</Chip>}
              {(anyHalal || halalOnly) && <Chip selected={halalOnly} onClick={() => setHalalOnly((v) => !v)}>{t("Halal")}</Chip>}
              {types.map((g) => (
                <Chip key={g.id} selected={activeType?.id === g.id} onClick={() => setType(activeType?.id === g.id ? null : g.id)}>
                  {t(g.label)} <span className="app-numbers ms-1.5 text-xs font-medium opacity-70">{g.count}</span>
                </Chip>
              ))}
            </div>
          )}

          {halalOnly && <p className="mt-2 text-sm text-muted">{t("Restaurants whose own website says all their food is halal.")} {t(HALAL_CAUTION)}</p>}
          {activeType ? (
            <section aria-label={t(activeType.label)} className="mt-4">
              <div className="space-y-2.5">{typeChains.map((c) => (<ChainRow key={c.id} chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "popular" })} />))}</div>
            </section>
          ) : (
          <>
          <SectionTitle>{t("Popular")}</SectionTitle>
          <div className="stagger grid grid-cols-2 gap-3">{popular.map((c) => (<ChainCard key={c.id} chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "popular" })} />))}</div>

          {favoriteChains.length > 0 && (
            <>
              <SectionTitle>{t("Favourites")}</SectionTitle>
              <div className="grid grid-cols-2 gap-3">{favoriteChains.map((c) => (<ChainCard key={c.id} chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "favorite" })} />))}</div>
            </>
          )}

          {rest.length > 0 && (
            <>
              <SectionTitle>{t("More restaurants")}</SectionTitle>
              {restGroups.length > 4 && (
                <nav aria-label={t("Jump to letter")} className="no-scrollbar -mx-5 -mt-1 mb-1 flex gap-1 overflow-x-auto px-5">
                  {restGroups.map((g) => (
                    <a key={g.letter} href={`#az-${g.letter}`} onClick={(e) => jumpTo(e, `az-${g.letter}`)} aria-label={t("Restaurants starting with {letter}", { letter: g.letter })} className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-muted transition-colors hover:bg-soft-strong hover:text-foreground">
                      {g.letter}
                    </a>
                  ))}
                </nav>
              )}
              {restGroups.map((g) => (
                <section key={g.letter} id={`az-${g.letter}`} aria-label={t("Restaurants starting with {letter}", { letter: g.letter })} className="mb-4 scroll-mt-4">
                  <h3 className="mb-1.5 mt-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">{g.letter}</h3>
                  <div className="space-y-2">{g.chains.map((c) => (<ChainRow key={c.id} compact chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "popular" })} />))}</div>
                </section>
              ))}
            </>
          )}
          </>
          )}
        </>
      )}

      <RequestChainSheet open={requesting} onClose={() => setRequesting(false)} />
    </div>
  );
}

/** The chosen "browse by type" chip, kept for this tab so coming back from a restaurant keeps the list the user was in. */
function useBrowseType(): [string | null, (id: string | null) => void] {
  const [type, setType] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("mm.browseType");
      if (stored) setType(stored); // eslint-disable-line react-hooks/set-state-in-effect -- restoring a per-tab choice after hydration
    } catch { /* storage blocked: start from All */ }
  }, []);
  const set = (id: string | null) => {
    setType(id);
    try {
      if (id) sessionStorage.setItem("mm.browseType", id);
      else sessionStorage.removeItem("mm.browseType");
    } catch { /* not remembered, still works */ }
  };
  return [type, set];
}

function jumpTo(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  scrollToElement(el);
  (el.querySelector("a") as HTMLElement | null)?.focus({ preventScroll: true });
}
