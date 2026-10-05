"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { mealSlotFor, MEALS, MEAL_LABEL } from "@/lib/mm/budget";
import { formatDate, nutrientAriaLabel } from "@/lib/mm/format";
import { filterItems, groupByCategory, isNewItem, SORT_OPTIONS, sortItems, type SortKind } from "@/lib/mm/menu-view";
import { itemHref } from "@/lib/mm/routes";
import { settingsStore, favoritesStore, toggleFavorite } from "@/lib/mm/stores";
import type { Meal, MenuItem, Preferences } from "@/lib/mm/types";
import { BestForYou } from "../_components/BestForYou";
import { ChainMark } from "../_components/ChainMark";
import { ChevronLeftIcon, ChevronRightIcon, StarIcon } from "../_components/icons";
import { MacroLine } from "../_components/Nutrition";
import { ReportSheet } from "../_components/Submit";
import { Badge, Button, Chip, EmptyState, ErrorBox, inputClass, SampleBadge, Spinner } from "../_components/ui";
import { useChain, useMenu, useNow, useStore } from "../_lib/hooks";

// SPEC §7.4: header, meal chip, Best for you, full menu (sort, filter, tags), source footer.

export function ChainScreen({ chainId }: { chainId: string }) {
  const { status, index, error, retry } = useChain(chainId);
  if (status === "loading") return (<Shell><Spinner label="Loading menu" /></Shell>);
  if (status === "error" || !index) return (<Shell><ErrorBox message={error ?? "Couldn't load this menu."} onRetry={retry} /></Shell>);
  return <Loaded key={chainId} index={index} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Link href="/app" aria-label="Back to home" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
      {children}
    </div>
  );
}

function Loaded({ index }: { index: NonNullable<ReturnType<typeof useChain>["index"]> }) {
  const { chain } = index;
  const menu = useMenu();
  const now = useNow();
  const favorites = useStore(favoritesStore);
  const isFavorite = favorites.some((f) => f.chainId === chain.id);

  const [meal, setMeal] = useState<Meal>(() => mealSlotFor(new Date()));
  const [prefs, setPrefs] = useState<Preferences>(() => settingsStore.get().preferences);
  const [sort, setSort] = useState<SortKind>("menu");
  const [reporting, setReporting] = useState<MenuItem | "any" | null>(null);

  const visible = useMemo(() => sortItems(filterItems(chain.items, prefs), sort), [chain.items, prefs, sort]);
  const sections = useMemo(() => (sort === "menu" ? groupByCategory(chain, visible) : [{ category: "", items: visible }]), [chain, visible, sort]);
  const clearFilters = () => setPrefs({ vegetarianOnly: false, noPork: false, noBeef: false });
  const anyFilter = prefs.vegetarianOnly || prefs.noPork || prefs.noBeef;

  const setPref = (key: keyof Preferences) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    analytics.track({ name: "menuFiltered", kind: key });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/app" aria-label="Back to home" className="glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong"><ChevronLeftIcon /></Link>
        <button
          type="button"
          onClick={() => toggleFavorite(chain.id)}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Remove ${chain.name} from favourites` : `Add ${chain.name} to favourites`}
          className={`glass inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 hover:bg-soft-strong ${isFavorite ? "text-accent" : "text-muted"}`}
        >
          <StarIcon filled={isFavorite} />
        </button>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="lg" />
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight">{chain.name}</h1>
          <p className="kicker flex flex-wrap items-center gap-x-2">{chain.cuisine} {chain.sample && <SampleBadge />}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Meal">
        {MEALS.map((m) => (
          <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filters">
        <Chip selected={prefs.vegetarianOnly} onClick={() => setPref("vegetarianOnly")}>Vegetarian</Chip>
        <Chip selected={prefs.noPork} onClick={() => setPref("noPork")}>No pork</Chip>
        <Chip selected={prefs.noBeef} onClick={() => setPref("noBeef")}>No beef</Chip>
      </div>

      <BestForYou index={index} meal={meal} preferences={prefs} onClearFilters={clearFilters} />

      <div className="mb-3 mt-10 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Full menu</h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Sort by</span>
          <select
            className={`${inputClass} min-h-11 w-auto py-0 text-sm`}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKind);
              analytics.track({ name: "menuSorted", kind: e.target.value });
            }}
          >
            {SORT_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nothing here matches your filters." action={anyFilter ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined} />
      ) : (
        sections.map((s) => (
          <section key={s.category || "all"} aria-label={s.category || "All items"}>
            {s.category && <h3 className="mb-2 mt-7 text-xs font-bold uppercase tracking-[0.14em] text-muted">{s.category}</h3>}
            <ul className="space-y-2">
              {s.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={itemHref(chain.id, item.id)}
                    prefetch={false}
                    aria-label={`${nutrientAriaLabel(item.name, item.nutrients)}${isNewItem(item, now) ? ", new" : ""}${item.limitedTime ? ", limited time" : ""}`}
                    onClick={() => analytics.track({ name: "itemOpened", chainId: chain.id })}
                    className="glass flex min-h-16 items-center justify-between gap-3 rounded-2xl px-4 py-3 transition active:scale-[0.99] hover:bg-soft-strong"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold tracking-tight">{item.name}</span>
                        {isNewItem(item, now) && <Badge tone="accent">New</Badge>}
                        {item.limitedTime && <Badge>Limited time</Badge>}
                      </span>
                      <MacroLine nutrients={item.nutrients} />
                    </span>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <footer className="mt-10 space-y-2 border-t border-line pt-5 text-sm text-muted">
        <p>
          Source:{" "}
          <a href={chain.source.url} target="_blank" rel="noopener noreferrer" className="underline">{chain.source.title}</a>, checked {formatDate(chain.source.checkedOn)}
        </p>
        {chain.note && <p>{chain.note}</p>}
        <p>Not affiliated with {chain.name}.</p>
        <p>
          Something look wrong?{" "}
          <button type="button" className="min-h-11 font-medium text-accent underline" onClick={() => setReporting("any")}>Report a number</button>
        </p>
      </footer>

      <ReportSheet
        open={reporting !== null}
        onClose={() => setReporting(null)}
        target={{ chainId: chain.id, chainName: chain.name, items: chain.items, ...(menu.dataVersion ? { dataVersion: menu.dataVersion } : {}) }}
      />
    </div>
  );
}
