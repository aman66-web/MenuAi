"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { formatCalories, formatGrams } from "@/lib/mm/format";
import { hasMacros } from "@/lib/mm/nutrients";
import { search, type ItemHit } from "@/lib/mm/search";
import { savedStore } from "@/lib/mm/stores";
import { ItemThumb } from "../ItemPhoto";
import { ErrorBanner } from "../Note";
import { ErrorBox, Spinner } from "../ui";
import { useChainIndexes, useMenu, useSearchIndex, useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { menuClient } from "../../_lib/menu";
import { linesImage } from "./EntryPicture";
import { AddPill, PICK_LIST, PickRow, SheetSearch, type NewEntry } from "./parts";

// "Choose a restaurant meal": a dish found in the menus, or an order the person saved. A dish is added as the restaurant publishes it (one
// serving, all of its figures). One from a restaurant that publishes calories only is added with its calories alone (usability test 2026-11-19:
// Elsie, who counts calories, couldn't log a Pizza Express dish at all): its protein, carbs and fat stay absent, never 0, as typed numbers can.
// Each row leads with the chain's own photo of the dish (founder 2026-11-17, "use images please when possible"): a search hit's from the search
// file, a saved meal's first dish with one from its chain's menu (loaded for the few saved meals shown); the grey fork tile where there is none
// or it doesn't load, so every name starts at the same place. The photo is kept on the entry, for Home and Today.

const SAVED_SHOWN = 5;
/** The lists here sit on the sheet's grey: a dish without a photo gets ItemThumb's fork tile in white (like the photos' own white), so it still reads as a tile. */
const dishLead = (image: string | undefined) => <span className="contents [&>span]:bg-card"><ItemThumb image={image} placeholder /></span>;

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

  const hits = useMemo(() => (searchIndex && deferred.length >= 2 ? search(searchIndex, deferred, 10).items : []), [searchIndex, deferred]);

  const addHit = async (h: ItemHit) => {
    setBusy(`${h.chainId}:${h.itemId}`);
    setFailed(null);
    try {
      const ix = await menuClient.loadChain(h.chainId);
      if (!here.current) return;
      const item = ix.items.get(h.itemId);
      if (!item) setFailed(t("Couldn't load this menu."));
      else onAdd({ chainId: ix.chain.id, chainName: ix.chain.name, name: item.name, nutrients: item.nutrients, source: "item", ...(item.image ? { image: item.image } : {}) });
    } catch {
      if (here.current) setFailed(t("Couldn't load this menu."));
    } finally {
      if (here.current) setBusy(null);
    }
  };

  const shownSaved = deferred.length === 0 ? [...saved].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, SAVED_SHOWN) : [];
  // the chains of the saved meals shown (five at most, usually already loaded): their dishes' photos
  const savedIndexes = useChainIndexes(shownSaved.map((o) => o.chainId));
  const savedImage = (o: (typeof shownSaved)[number]) => {
    const ix = savedIndexes.get(o.chainId);
    return ix && ix !== "missing" ? linesImage(ix, o.lines) : undefined;
  };

  return (
    <div className="space-y-4 pb-2 pt-4">
      <SheetSearch value={query} onChange={(v) => { setQuery(v); setFailed(null); }} label={t("Search restaurants and items")} placeholder={t("Type a dish or restaurant, e.g. chicken burger")} />
      {failed && <ErrorBanner heading={null}>{failed}</ErrorBanner>}

      {shownSaved.length > 0 && (
        <section aria-labelledby="addfood-saved">
          <h3 id="addfood-saved" className="mb-2.5 text-[0.9375rem] font-semibold leading-snug">{t("Your saved meals")}</h3>
          <ul className={PICK_LIST}>
            {shownSaved.map((o) => {
              const image = savedImage(o);
              return (
                <PickRow
                  key={o.id}
                  lead={dishLead(image)}
                  title={o.name}
                  line={`${o.chainName} · ${hasMacros(o.nutrients) ? t("{kcal} · {protein} protein", { kcal: formatCalories(o.nutrients.calories), protein: formatGrams(o.nutrients.protein ?? 0) }) : formatCalories(o.nutrients.calories)}`}
                  action={<AddPill name={o.chainName ? t("{name} from {chain}", { name: o.name, chain: o.chainName }) : o.name} onClick={() => onAdd({ chainId: o.chainId, chainName: o.chainName, name: o.name, nutrients: o.nutrients, source: "savedOrder", ...(image ? { image } : {}) })} />}
                />
              );
            })}
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
                lead={dishLead(h.image)}
                title={h.name}
                line={`${h.chainName} · ${formatCalories(h.calories)}`}
                action={<AddPill name={t("{name} from {chain}", { name: h.name, chain: h.chainName })} disabled={busy !== null} busy={busy === `${h.chainId}:${h.itemId}`} onClick={() => void addHit(h)} />}
              />
            ))}
          </ul>
        ))}

    </div>
  );
}
