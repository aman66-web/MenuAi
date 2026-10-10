"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { loggedToday, remainingToday } from "@/lib/mm/budget";
import { formatCalories, formatGrams, formatInt, macroLine } from "@/lib/mm/format";
import { favoritesStore, logStore, savedStore, settingsStore, shoppingStore, updateSettings } from "@/lib/mm/stores";
import { HALAL_CAUTION, isAllHalal } from "@/lib/mm/halal";
import { SAMPLES_ENABLED } from "@/lib/mm/config";
import { chainsInGroup, cuisineGroups } from "@/lib/mm/cuisine";
import { groupByInitial, splitChains } from "@/lib/mm/popular";
import { ChainCard, ChainRow } from "./_components/ChainRow";
import { Ring } from "./_components/Ring";
import { ArrowRightIcon, BasketIcon, ListIcon, PencilIcon, PinIcon, PotIcon, SearchIcon } from "./_components/icons";
import { RequestChainSheet } from "./_components/Submit";
import { Button, Card, Chip, EmptyState, ErrorBox, SectionTitle, Spinner } from "./_components/ui";
import { menuClient } from "./_lib/menu";
import { scrollToElement } from "./_lib/scroll";
import { useHydrated, useIsPro, useMenu, useNow, useSettings, useStore } from "./_lib/hooks";
import { useT } from "./_lib/i18n";
import { Rich } from "./_lib/Rich";

// SPEC §7.2. "Near you" is not available on the web (docs/WEB_BUILD_PLAN.md), so the chain list is always "Popular".

export default function HomePage() {
  const t = useT();
  const hydrated = useHydrated();
  const settings = useSettings();
  const pro = useIsPro();
  const menu = useMenu();
  const favorites = useStore(favoritesStore);
  const saved = useStore(savedStore);
  const shopping = useStore(shoppingStore);
  const log = useStore(logStore);
  const now = useNow();
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

  const profile = { goal: settings.goal, dailyCalories: settings.dailyCalories, ...(settings.dailyProtein ? { dailyProtein: settings.dailyProtein } : {}) };
  const logged = loggedToday(log, now);
  const remaining = remainingToday(profile, logged);
  const usedFraction = Math.min(1, Math.max(0, logged.calories / settings.dailyCalories));

  if (!hydrated || !settings.hasCompletedOnboarding) return <Spinner />;

  return (
    <div>
      <h1 className="text-[2.75rem] font-extrabold leading-[1.0] tracking-[-0.035em]"><Rich text={t("Where are you {eating}?")} values={{ eating: <span className="serif-em sun-text pe-0.5">{t("eating")}</span> }} /></h1>

      <Link href="/app/search" className="glass lift group mt-6 flex min-h-[3.75rem] items-center gap-3 rounded-full ps-5 pe-2 text-muted hover:bg-soft-strong">
        <SearchIcon className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t("Search restaurants and items")}</span>
        <span aria-hidden className="icon-bubble h-11 w-11 shrink-0 transition-transform group-hover:translate-x-0.5"><ArrowRightIcon className="h-5 w-5" /></span>
      </Link>
      {/* Eat out, shop, cook: the four things the app does, one tap each (founder 2026-10-10: "it's also for groceries"). */}
      <div className="stagger mt-3 grid grid-cols-2 gap-3">
        <Link href="/app/map" className="glass lift group flex min-h-[6.5rem] min-w-0 flex-col justify-between gap-3 rounded-[1.75rem] p-4 [overflow-wrap:anywhere] hover:bg-soft-strong">
          <span aria-hidden className="icon-bubble h-11 w-11"><PinIcon className="h-5 w-5" /></span>
          <span className="text-[15px] font-bold leading-snug tracking-tight">{t("Find restaurants near you")}</span>
        </Link>
        <Link href="/app/groceries" className="glass lift group flex min-h-[6.5rem] min-w-0 flex-col justify-between gap-3 rounded-[1.75rem] p-4 [overflow-wrap:anywhere] hover:bg-soft-strong">
          <span aria-hidden className="icon-bubble h-11 w-11"><BasketIcon className="h-5 w-5" /></span>
          <span className="text-[15px] font-bold leading-snug tracking-tight">{t("Browse supermarket groceries")}</span>
        </Link>
        <Link href="/app/recipes" className="glass lift group flex min-h-[6.5rem] min-w-0 flex-col justify-between gap-3 rounded-[1.75rem] p-4 [overflow-wrap:anywhere] hover:bg-soft-strong">
          <span aria-hidden className="icon-bubble h-11 w-11"><PotIcon className="h-5 w-5" /></span>
          <span className="text-[15px] font-bold leading-snug tracking-tight">{t("Cook from your shop")}</span>
        </Link>
        <Link href="/app/groceries/list" className="glass lift group flex min-h-[6.5rem] min-w-0 flex-col justify-between gap-3 rounded-[1.75rem] p-4 [overflow-wrap:anywhere] hover:bg-soft-strong">
          <span className="flex items-center justify-between gap-2">
            <span aria-hidden className="icon-bubble h-11 w-11"><ListIcon className="h-5 w-5" /></span>
            {hydrated && shopping.length > 0 && <span className="app-numbers rounded-full bg-accent-soft px-2.5 py-1 text-sm font-extrabold text-accent">{shopping.length} <span className="sr-only">{shopping.length === 1 ? t("item") : t("items")}</span></span>}
          </span>
          <span className="text-[15px] font-bold leading-snug tracking-tight">{t("Your shopping list")}</span>
        </Link>
      </div>

      {SAMPLES_ENABLED && menu.chains.some((c) => c.sample) && (
        <p className="glass mt-4 rounded-2xl px-4 py-2.5 text-xs text-muted">{t("Showing fictional sample data for testing. Numbers are not real.")}</p>
      )}

      {/* Targets / left today */}
      <Card hero className="mt-5 overflow-hidden p-5">
        {pro ? (
          <div className="flex items-center gap-5">
            <Ring id="home" label={t("Calories used today")} fraction={usedFraction} size={104} stroke={10}>
              <span aria-hidden className="app-numbers text-lg font-extrabold">{Math.round(usedFraction * 100)}%</span>
            </Ring>
            <p className="app-numbers min-w-0 flex-1 text-base leading-snug">
              {remaining.calories >= 0 ? (
                <><span className="block text-sm font-semibold text-muted">{t("Left today:")}</span><span><span className="sun-text text-3xl font-extrabold tracking-tight">{formatCalories(remaining.calories)}</span>{remaining.protein !== undefined && <> <span className="text-muted">·</span></>}</span>{remaining.protein !== undefined && <span className="mt-1 flex items-center gap-2 font-extrabold text-accent"><span aria-hidden className="dot bg-protein" />{t("{grams} protein", { grams: formatGrams(Math.max(0, remaining.protein)) })}</span>}</>
              ) : (
                <Rich text={t("Over today's target by {kcal}")} values={{ kcal: <span className="text-xl font-extrabold">{formatCalories(-remaining.calories)}</span> }} />
              )}
            </p>
          </div>
        ) : (
          <div className="app-numbers">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-muted">{t("Your targets:")}</p>
              <Link href="/app/settings#targets" aria-label={t("Edit your targets")} className="-my-2 -me-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition hover:bg-soft-strong hover:text-accent">
                <PencilIcon className="h-[18px] w-[18px]" />
              </Link>
            </div>
            <p className="mt-2 grid grid-cols-2 gap-3">
              <span className="tile min-w-0 rounded-2xl px-4 py-3 [overflow-wrap:anywhere]">
                <span className="block text-[1.7rem] font-extrabold leading-tight tracking-tight"><span className="sun-text">{formatInt(settings.dailyCalories)}</span> <span className="text-base font-bold text-muted">kcal</span></span>
                <span aria-hidden className="mt-0.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted"><span className="dot bg-sun" />{t("a day")}</span>
              </span>
              {settings.dailyProtein ? (
                <span className="tile min-w-0 rounded-2xl px-4 py-3 [overflow-wrap:anywhere]">
                  <span className="block text-[1.7rem] font-extrabold leading-tight tracking-tight text-accent">{formatGrams(settings.dailyProtein)} <span className="sr-only">{t("protein")}</span></span>
                  <span aria-hidden className="mt-0.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-muted"><span className="dot bg-protein" />{t("protein")}</span>
                </span>
              ) : null}
            </p>
          </div>
        )}
      </Card>

      {!settings.hasSetTargets && !settings.dismissedTargetsCard && (
        <Card className="mt-3 flex items-center justify-between gap-3 p-4">
          <Link href="/app/settings#targets" className="min-h-11 flex-1 font-medium">{t("Set your targets to see what's left today")}</Link>
          <button type="button" className="min-h-11 min-w-11 text-sm text-muted" onClick={() => updateSettings({ dismissedTargetsCard: true })} aria-label={t("Dismiss")}>{t("Dismiss")}</button>
        </Card>
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
          <div className="mb-1 mt-10 flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight"><span aria-hidden className="bg-sun h-5 w-1.5 shrink-0 rounded-full" />{t("Restaurants")}</h2>
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

      {saved.length > 0 && (
        <>
          <SectionTitle action={<Link href="/app/saved" className="min-h-11 py-3 text-sm font-medium text-accent">{t("See all")}</Link>}>{t("Saved orders")}</SectionTitle>
          <ul className="space-y-2">
            {saved.slice(0, 3).map((o) => (
              <li key={o.id}>
                <Link href="/app/saved" className="glass lift block rounded-3xl p-4 hover:bg-soft-strong">
                  <span className="block font-bold tracking-tight">{o.name}</span>
                  <span className="block text-sm text-muted">{o.chainName}</span>
                  <span className="app-numbers block text-sm text-muted">{macroLine(o.nutrients, t)}</span>
                </Link>
              </li>
            ))}
          </ul>
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
