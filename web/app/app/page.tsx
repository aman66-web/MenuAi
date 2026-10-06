"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { loggedToday, remainingToday } from "@/lib/mm/budget";
import { formatCalories, formatGrams, macroLine } from "@/lib/mm/format";
import { favoritesStore, logStore, savedStore, updateSettings } from "@/lib/mm/stores";
import { SAMPLES_ENABLED } from "@/lib/mm/config";
import { groupByInitial, splitChains } from "@/lib/mm/popular";
import { ChainRow } from "./_components/ChainRow";
import { Ring } from "./_components/Ring";
import { SearchIcon } from "./_components/icons";
import { RequestChainSheet } from "./_components/Submit";
import { Button, Card, EmptyState, ErrorBox, SectionTitle, Spinner } from "./_components/ui";
import { menuClient } from "./_lib/menu";
import { useHydrated, useIsPro, useMenu, useNow, useSettings, useStore } from "./_lib/hooks";

// SPEC §7.2. "Near you" is not available on the web (docs/WEB_BUILD_PLAN.md), so the chain list is always "Popular".

export default function HomePage() {
  const hydrated = useHydrated();
  const settings = useSettings();
  const pro = useIsPro();
  const menu = useMenu();
  const favorites = useStore(favoritesStore);
  const saved = useStore(savedStore);
  const log = useStore(logStore);
  const now = useNow();
  const [requesting, setRequesting] = useState(false);

  const { popular, rest } = useMemo(() => splitChains(menu.chains), [menu.chains]);
  const restGroups = useMemo(() => groupByInitial(rest), [rest]);
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
      <h1 className="text-[2.6rem] font-extrabold leading-[1.02] tracking-tight">Where are you <span className="serif-em sun-text pr-0.5">eating</span>?</h1>

      {SAMPLES_ENABLED && menu.chains.some((c) => c.sample) && (
        <p className="glass mt-4 rounded-2xl px-4 py-2.5 text-xs text-muted">Showing fictional sample data for testing. Numbers are not real.</p>
      )}

      {/* Targets / left today */}
      <Card hero className="mt-6 p-5">
        {pro ? (
          <div className="flex items-center gap-5">
            <Ring id="home" label="Calories used today" fraction={usedFraction} size={92} stroke={10}>
              <span aria-hidden className="app-numbers text-base font-extrabold">{Math.round(usedFraction * 100)}%</span>
            </Ring>
            <p className="app-numbers min-w-0 flex-1 text-base leading-snug">
              {remaining.calories >= 0 ? (
                <><span className="block text-sm text-muted">Left today:</span><span><span className="sun-text text-xl font-extrabold">{formatCalories(remaining.calories)}</span>{remaining.protein !== undefined && <> <span className="text-muted">·</span></>}</span>{remaining.protein !== undefined && <span className="block font-extrabold text-accent">{formatGrams(Math.max(0, remaining.protein))} protein</span>}</>
              ) : (
                <>Over today&apos;s target by <span className="text-xl font-extrabold">{formatCalories(-remaining.calories)}</span></>
              )}
            </p>
          </div>
        ) : (
          <p className="app-numbers text-xl">
            <span className="block text-sm text-muted">Your targets:</span>{" "}
            <span className="sun-text font-extrabold">{formatCalories(settings.dailyCalories)}</span>
            {settings.dailyProtein ? <> · <span className="font-extrabold text-accent">{formatGrams(settings.dailyProtein)} protein</span></> : null}
          </p>
        )}
      </Card>

      {!settings.hasSetTargets && !settings.dismissedTargetsCard && (
        <Card className="mt-3 flex items-center justify-between gap-3 p-4">
          <Link href="/app/settings#targets" className="min-h-11 flex-1 font-medium">Set your targets to see what&apos;s left today</Link>
          <button type="button" className="min-h-11 min-w-11 text-sm text-muted" onClick={() => updateSettings({ dismissedTargetsCard: true })} aria-label="Dismiss">Dismiss</button>
        </Card>
      )}

      <Link href="/app/search" className="glass mt-4 flex min-h-14 items-center gap-3 rounded-full px-5 text-muted transition active:scale-[0.99] hover:bg-soft-strong">
        <SearchIcon className="h-5 w-5" />
        Search restaurants and items
      </Link>

      {menu.status === "loading" || menu.status === "idle" ? (
        <Spinner label="Loading restaurants" />
      ) : menu.status === "error" ? (
        <div className="mt-6">
          <ErrorBox message={menu.error ?? "Couldn't load the restaurants."} onRetry={() => void menuClient.ensureManifest(true)} />
        </div>
      ) : menu.chains.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Menus are coming soon"
            body="We're adding restaurants from their official nutrition guides. Tell us which ones you want first."
            action={<Button onClick={() => setRequesting(true)}>Request a chain</Button>}
          />
        </div>
      ) : (
        <>
          <SectionTitle>Popular</SectionTitle>
          <div className="space-y-2.5">{popular.map((c) => (<ChainRow key={c.id} chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "popular" })} />))}</div>

          {favoriteChains.length > 0 && (
            <>
              <SectionTitle>Favourites</SectionTitle>
              <div className="space-y-2.5">{favoriteChains.map((c) => (<ChainRow key={c.id} chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "favorite" })} />))}</div>
            </>
          )}

          {rest.length > 0 && (
            <>
              <SectionTitle>More restaurants</SectionTitle>
              {restGroups.map((g) => (
                <section key={g.letter} aria-label={`Restaurants starting with ${g.letter}`} className="mb-4">
                  <h3 className="mb-1.5 mt-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">{g.letter}</h3>
                  <div className="space-y-2">{g.chains.map((c) => (<ChainRow key={c.id} compact chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "popular" })} />))}</div>
                </section>
              ))}
            </>
          )}
        </>
      )}

      {saved.length > 0 && (
        <>
          <SectionTitle action={<Link href="/app/saved" className="min-h-11 py-3 text-sm font-medium text-accent">See all</Link>}>Saved orders</SectionTitle>
          <ul className="space-y-2">
            {saved.slice(0, 3).map((o) => (
              <li key={o.id}>
                <Link href="/app/saved" className="glass block rounded-3xl p-4 transition active:scale-[0.99] hover:bg-soft-strong">
                  <span className="block font-bold tracking-tight">{o.name}</span>
                  <span className="block text-sm text-muted">{o.chainName}</span>
                  <span className="app-numbers block text-sm text-muted">{macroLine(o.nutrients)}</span>
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
