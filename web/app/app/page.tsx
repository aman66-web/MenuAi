"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { loggedToday, remainingToday } from "@/lib/mm/budget";
import { formatCalories, formatGrams, macroLine } from "@/lib/mm/format";
import { favoritesStore, logStore, savedStore, updateSettings } from "@/lib/mm/stores";
import { SAMPLES_ENABLED } from "@/lib/mm/config";
import { ChainRow } from "./_components/ChainRow";
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

  const popular = useMemo(() => menu.chains.slice(0, 10), [menu.chains]);
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
      <h1 className="text-3xl font-bold tracking-tight">Where are you eating?</h1>

      {SAMPLES_ENABLED && menu.chains.some((c) => c.sample) && (
        <p className="mt-3 rounded-lg bg-soft px-3 py-2 text-xs text-muted">Showing fictional sample data for testing. Numbers are not real.</p>
      )}

      {/* Targets / left today */}
      <Card className="mt-4 p-4">
        {pro ? (
          <>
            <p className="app-numbers text-base">
              {remaining.calories >= 0 ? (
                <>Left today: <span className="font-bold">{formatCalories(remaining.calories)}</span>{remaining.protein !== undefined && <> · <span className="font-bold">{formatGrams(Math.max(0, remaining.protein))} protein</span></>}</>
              ) : (
                <>Over today&apos;s target by <span className="font-bold">{formatCalories(-remaining.calories)}</span></>
              )}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Calories used today" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedFraction * 100)}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${usedFraction * 100}%` }} />
            </div>
          </>
        ) : (
          <p className="app-numbers text-base">
            Your targets: <span className="font-bold">{formatCalories(settings.dailyCalories)}</span>
            {settings.dailyProtein ? <> · <span className="font-bold">{formatGrams(settings.dailyProtein)} protein</span></> : null}
          </p>
        )}
      </Card>

      {!settings.hasSetTargets && !settings.dismissedTargetsCard && (
        <Card className="mt-3 flex items-center justify-between gap-3 p-4">
          <Link href="/app/settings#targets" className="min-h-11 flex-1 font-medium">Set your targets to see what&apos;s left today</Link>
          <button type="button" className="min-h-11 min-w-11 text-sm text-muted" onClick={() => updateSettings({ dismissedTargetsCard: true })} aria-label="Dismiss">Dismiss</button>
        </Card>
      )}

      <Link href="/app/search" className="mt-4 flex min-h-12 items-center gap-3 rounded-xl border border-line bg-soft px-4 text-muted">
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
          <div>{popular.map((c) => (<ChainRow key={c.id} chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "popular" })} />))}</div>

          {favoriteChains.length > 0 && (
            <>
              <SectionTitle>Favourites</SectionTitle>
              <div>{favoriteChains.map((c) => (<ChainRow key={c.id} chain={c} onOpen={() => analytics.track({ name: "chainOpened", chainId: c.id, source: "favorite" })} />))}</div>
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
                <Link href="/app/saved" className="block rounded-xl border border-line bg-soft p-3">
                  <span className="block font-semibold">{o.name}</span>
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
