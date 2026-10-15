"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { formatCalories, formatGrams } from "@/lib/mm/format";
import { tk } from "@/lib/mm/i18n";
import { hasMacros } from "@/lib/mm/nutrients";
import { search, type ItemHit } from "@/lib/mm/search";
import { savedStore } from "@/lib/mm/stores";
import { ForkIcon } from "../icons";
import { ErrorBox, Spinner } from "../ui";
import { useMenu, useSearchIndex, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { menuClient } from "../../_lib/menu";
import { AddPill, PICK_LIST, PickRow, SheetSearch, type NewEntry } from "./parts";

// "Choose a restaurant meal": a dish found in the menus, or an order the person saved. A dish is added as the restaurant publishes it (one
// serving, all of its figures); one that publishes calories only can't be, because the log counts protein, carbs and fat too (the same rule as
// the dish's own page), and the way to log it is to type its calories in.

const SAVED_SHOWN = 5;
const CALORIES_ONLY = tk("This dish publishes calories only, so it can't be added here. You can type its calories in instead.");

const lead = <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-accent"><ForkIcon className="h-5 w-5" /></span>;

export function DishPick({ onAdd }: { onAdd: (entry: NewEntry) => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query).trim();
  const { searchIndex } = useSearchIndex();
  const menu = useMenu();
  const saved = useStore(savedStore);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // A menu can be slow to arrive: a dish picked and then given up on (Back, Close, another meal's sheet) must not be added when it finally does.
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);

  // Restaurants that publish calories only are left out of the results (they have no dish this can add).
  const caloriesOnly = useMemo(() => new Set(menu.chains.filter((c) => c.nutritionLevel === "calories").map((c) => c.id)), [menu.chains]);
  const hits = useMemo(
    () => (searchIndex && deferred.length >= 2 ? search(searchIndex, deferred, 60).items.filter((h) => !caloriesOnly.has(h.chainId)).slice(0, 10) : []),
    [searchIndex, deferred, caloriesOnly],
  );

  const addHit = async (h: ItemHit) => {
    setBusy(`${h.chainId}:${h.itemId}`);
    setFailed(null);
    try {
      const ix = await menuClient.loadChain(h.chainId);
      if (!here.current) return;
      const item = ix.items.get(h.itemId);
      if (!item) setFailed(t("Couldn't load this menu."));
      else if (!hasMacros(item.nutrients)) setFailed(t(CALORIES_ONLY));
      else onAdd({ chainId: ix.chain.id, chainName: ix.chain.name, name: item.name, nutrients: item.nutrients, source: "item" });
    } catch {
      if (here.current) setFailed(t("Couldn't load this menu."));
    } finally {
      if (here.current) setBusy(null);
    }
  };

  const shownSaved = deferred.length === 0 ? [...saved].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, SAVED_SHOWN) : [];

  return (
    <div className="space-y-4 pb-2 pt-4">
      <SheetSearch value={query} onChange={(v) => { setQuery(v); setFailed(null); }} label={t("Search restaurants and items")} placeholder={t("Type a dish or restaurant, e.g. chicken burger")} />
      {failed && <p role="alert" className="text-[0.9375rem] font-semibold leading-snug">{failed}</p>}

      {shownSaved.length > 0 && (
        <section aria-labelledby="addfood-saved">
          <h3 id="addfood-saved" className="mb-2.5 text-[0.9375rem] font-semibold leading-snug">{t("Your saved meals")}</h3>
          <ul className={PICK_LIST}>
            {shownSaved.map((o) => (
              <PickRow
                key={o.id}
                lead={lead}
                title={o.name}
                line={`${o.chainName} · ${t("{kcal} · {protein} protein", { kcal: formatCalories(o.nutrients.calories), protein: formatGrams(o.nutrients.protein ?? 0) })}`}
                action={<AddPill name={o.name} onClick={() => onAdd({ chainId: o.chainId, chainName: o.chainName, name: o.name, nutrients: o.nutrients, source: "savedOrder" })} />}
              />
            ))}
          </ul>
        </section>
      )}

      {deferred.length >= 2 &&
        (menu.status === "error" && !menu.searchReady ? (
          <ErrorBox message={t("Couldn't reach the menus. Check your connection and try again.")} onRetry={() => void menuClient.ensureManifest(true).then(() => menuClient.ensureSearch())} />
        ) : !searchIndex ? (
          <Spinner label={t("Loading restaurants")} />
        ) : hits.length === 0 ? (
          <p className="text-[0.9375rem] text-muted">{t("No dishes match.")}</p>
        ) : (
          <ul className={PICK_LIST}>
            {hits.map((h) => (
              <PickRow
                key={`${h.chainId}:${h.itemId}`}
                lead={lead}
                title={h.name}
                line={`${h.chainName} · ${formatCalories(h.calories)}`}
                action={<AddPill name={h.name} disabled={busy !== null} busy={busy === `${h.chainId}:${h.itemId}`} onClick={() => void addHit(h)} />}
              />
            ))}
          </ul>
        ))}

      <p className="text-[0.9375rem] leading-snug text-muted">{t("Restaurants that publish calories only aren't listed here. You can type their calories in instead.")}</p>
    </div>
  );
}
