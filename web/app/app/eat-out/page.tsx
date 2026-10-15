"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { analytics } from "@/lib/mm/analytics";
import { favoritesStore, settingsStore } from "@/lib/mm/stores";
import { HALAL_CAUTION, isAllHalal } from "@/lib/mm/halal";
import { SAMPLES_ENABLED } from "@/lib/mm/config";
import { chainsInGroup, cuisineGroups } from "@/lib/mm/cuisine";
import { groupByInitial, splitChains } from "@/lib/mm/popular";
import { ChainCard, ChainRow, chainGroupClass } from "../_components/ChainRow";
import { ChevronRightIcon, CompareIcon, ForkIcon, GridIcon, PinIcon, SearchIcon, StarIcon } from "../_components/icons";
import { RequestChainSheet } from "../_components/Submit";
import { Button, Chip, EmptyIcon, EmptyState, ErrorBox, Spinner } from "../_components/ui";
import { menuClient } from "../_lib/menu";
import { scrollToElement } from "../_lib/scroll";
import { useHydrated, useMenu, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// The Eat out tab (founder 2026-10-10: "find restaurants near you and also see all the restaurants we have and also search"): search, the
// restaurants near you (the map), then every restaurant, café, pub and takeaway we have (SPEC §7.2's chain list: Popular, Favourites, A to Z).
// Kept plain for older users (founder 2026-10-11): the type, "Full nutrition only" and "Halal" choices sit behind one "More ways to find a
// restaurant" button instead of a sideways row of chips; closing it goes back to every restaurant.
// Look (founder 2026-10-15, "the rest of the app should match that elegance"): Home's language. A compact heavy title, one white search
// pill, the three shortcuts as rows of one card (Near me's icon in the brand lime, the one highlighted thing), "More ways" as a row of
// its own with a round grid icon, Popular as 20 px tiles, the A to Z jump as Home's grey day circles, and restaurants in grouped cards
// under small spaced letter labels that line up with the names. Every word, role and name is as before.

/** One of the three shortcuts at the top, a row of the same card: a round icon, the title and its line, a quiet chevron. */
function Shortcut({ href, icon, title, line, highlight }: { href: string; icon: ReactNode; title: string; line: string; highlight?: boolean }) {
  return (
    <Link href={href} className="group flex min-h-[4.75rem] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-[var(--fill)] active:bg-soft-strong focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]!">
      <span aria-hidden className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${highlight ? "bg-sun text-[var(--on-accent)]" : "bg-soft-strong text-foreground"} [&>svg]:h-5 [&>svg]:w-5`}>{icon}</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <span className="block text-base font-bold leading-snug">{title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted">{line}</span>
      </span>
      <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

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
  const [moreOpen, setMoreOpen] = useState(() => settingsStore.get().preferences.halalOnly ?? false);
  useEffect(() => { if (type) setMoreOpen(true); }, [type]); // eslint-disable-line react-hooks/set-state-in-effect -- a type restored for this tab shows its choices
  const toggleMore = () => {
    if (moreOpen) { setType(null); setFullOnly(false); setHalalOnly(false); }
    setMoreOpen(!moreOpen);
  };

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
      <h1 className="text-[1.75rem] font-[800] leading-none tracking-[-0.02em]"><Rich text={t("Eat {out}")} values={{ out: <span className="serif-em">{t("out")}</span> }} /></h1>
      <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Restaurants, cafés, pubs and takeaways, with the calories and protein of every dish.")}</p>

      <Link href="/app/search" className="glass mt-5 flex min-h-[3.25rem] items-center gap-3 rounded-[1.625rem] px-5 text-muted transition hover:bg-soft-strong active:scale-[0.99]">
        <SearchIcon className="h-5 w-5 shrink-0 text-foreground" />
        <span className="min-w-0 flex-1 py-3 text-base leading-snug [overflow-wrap:anywhere]">{t("Search restaurants and items")}</span>
      </Link>

      <div className={`mt-3.5 ${chainGroupClass}`}>
        <Shortcut href="/app/map" highlight icon={<PinIcon />} title={t("Near me")} line={t("See the places to eat around you on a map.")} />
        <Shortcut
          href="/app/eat-out/favourites"
          icon={<StarIcon filled={favoriteChains.length > 0} />}
          title={t("My favourite restaurants")}
          line={favoriteChains.length === 0 ? t("Keep the places you go to here") : favoriteChains.length === 1 ? t("1 restaurant") : t("{n} restaurants", { n: favoriteChains.length })}
        />
        <Shortcut href="/app/compare?tab=dish" icon={<CompareIcon />} title={t("Compare dishes")} line={t("Put dishes side by side, even from different restaurants")} />
      </div>

      {SAMPLES_ENABLED && menu.chains.some((c) => c.sample) && (
        <p className="glass mt-3.5 rounded-[1.25rem] px-4 py-3 text-[0.8125rem] leading-snug text-muted">{t("Showing fictional sample data for testing. Numbers are not real.")}</p>
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
            icon={<EmptyIcon><ForkIcon /></EmptyIcon>}
            title={t("Menus are coming soon")}
            body={t("We're adding restaurants from their official nutrition guides. Tell us which ones you want first.")}
            action={<Button onClick={() => setRequesting(true)}>{t("Request a chain")}</Button>}
          />
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-xl font-[800] tracking-[-0.01em]">{t("All restaurants")}</h2>
            {realCount > 0 && <p className="app-numbers text-sm text-muted">{t("{n} UK restaurants", { n: realCount })}</p>}
          </div>
          {types.length > 1 && (
            <button type="button" aria-expanded={moreOpen} aria-controls="more-ways" onClick={toggleMore} className="glass mt-3.5 flex min-h-[3.75rem] w-full items-center gap-3.5 rounded-[1.25rem] px-4 py-2 text-start text-base font-bold leading-snug transition-colors hover:bg-[var(--fill)] active:bg-soft-strong">
              <span aria-hidden className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${moreOpen ? "bg-foreground text-background" : "bg-soft-strong text-foreground"}`}><GridIcon className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 flex-1">{t("More ways to find a restaurant")}</span>
              <ChevronRightIcon aria-hidden className={`h-5 w-5 shrink-0 text-muted transition-transform ${moreOpen ? "-rotate-90" : "rotate-90"}`} />
            </button>
          )}
          {types.length > 1 && moreOpen && (
            <div id="more-ways" role="group" aria-label={t("Browse by type")} className="mt-3.5 flex flex-wrap gap-2">
              <Chip selected={!activeType} onClick={() => setType(null)}>{t("All")}</Chip>
              {hasCaloriesOnly && <Chip selected={fullOnly} onClick={() => setFullOnly((v) => !v)}>{t("Full nutrition only")}</Chip>}
              {(anyHalal || halalOnly) && <Chip selected={halalOnly} onClick={() => setHalalOnly((v) => !v)}>{t("Halal")}</Chip>}
              {types.map((g) => (
                <Chip key={g.id} selected={activeType?.id === g.id} onClick={() => setType(activeType?.id === g.id ? null : g.id)}>
                  {t(g.label)} <span className={`app-numbers ms-1.5 font-normal ${activeType?.id === g.id ? "" : "text-muted"}`}>{g.count}</span>
                </Chip>
              ))}
            </div>
          )}

          {halalOnly && <p className="mt-3.5 px-1 text-[0.9375rem] leading-snug text-muted">{t("Restaurants whose own website says all their food is halal.")} {t(HALAL_CAUTION)}</p>}
          {activeType ? (
            <section aria-label={t(activeType.label)} className="mt-4">
              <div className={chainGroupClass}>{typeChains.map((c) => (<ChainRow key={c.id} chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "popular" })} />))}</div>
            </section>
          ) : (
          <>
          <h2 className="mt-8 text-xl font-[800] tracking-[-0.01em]">{t("Popular")}</h2>
          <div className="stagger mt-3.5 grid grid-cols-2 gap-3.5">{popular.map((c) => (<ChainCard key={c.id} chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "popular" })} />))}</div>

          {rest.length > 0 && (
            <>
              <h2 className="mt-8 text-xl font-[800] tracking-[-0.01em]">{t("More restaurants")}</h2>
              {restGroups.length > 4 && (
                <nav aria-label={t("Jump to letter")} className="no-scrollbar -mx-5 mt-2.5 flex overflow-x-auto px-4">
                  {restGroups.map((g) => (
                    <a key={g.letter} href={`#az-${g.letter}`} onClick={(e) => jumpTo(e, `az-${g.letter}`)} aria-label={t("Restaurants starting with {letter}", { letter: g.letter })} className="group inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-offset-[-2px]!">
                      <span aria-hidden className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-soft-strong px-1 text-[0.8125rem] font-semibold transition-colors group-hover:bg-foreground group-hover:text-background">{g.letter}</span>
                    </a>
                  ))}
                </nav>
              )}
              {restGroups.map((g) => (
                <section key={g.letter} id={`az-${g.letter}`} aria-label={t("Restaurants starting with {letter}", { letter: g.letter })} className="mt-6 scroll-mt-4">
                  <h3 className="kicker mb-2 ps-4">{g.letter}</h3>
                  <div className={chainGroupClass}>{g.chains.map((c) => (<ChainRow key={c.id} compact chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "popular" })} />))}</div>
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
