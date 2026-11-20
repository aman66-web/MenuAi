"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { APP_BUILD } from "@/lib/mm/config";
import { formatDate, formatInt } from "@/lib/mm/format";
import { logoFor } from "@/lib/mm/logos";
import { restaurantDietNote } from "@/lib/mm/menu-view";
import { showcaseCandidates, showcaseChips, type ShowcaseChip, type ShowcaseGroupId } from "@/lib/mm/showcase";
import { GLP1_NOTE } from "@/lib/mm/targets";
import type { Chain, Goal, Preferences } from "@/lib/mm/types";
import type { FirstDish } from "@/lib/mm/welcomeSteps";
import { site } from "@/site.config";
import { ChainMark } from "../_components/ChainMark";
import { ALLERGEN_SHORT } from "../_components/DietPicker";
import { radioKeyNav } from "../_components/ui";
import { useHiddenLogos } from "../_lib/hiddenLogos";
import { useMenu } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { menuClient } from "../_lib/menu";
import { fadeIn } from "./Frame";
import { ShowcaseWindow } from "./ShowcaseWindow";

// Step 3 of the welcome steps, "Know before you order" (the onboarding redesign meeting of 20 November 2026, build list 4; approved by the founder): real dishes
// at a restaurant the person goes to, from the list that fits their goal, with the restaurant's own published figures (lib/mm/showcase.ts: which list, which
// restaurants, which dishes; display only). Everything here is free, the same free top two every visitor sees on that restaurant's page, and nothing is opened,
// logged or favourited: the rows can't be tapped (a flat window, no chevrons). No food photos, search, Truth card or expand control.
// - Up to four chips, one per kind of place (fast food, bakery and sandwiches, coffee shops, sit-down), the first already chosen, so dishes show with no tap. The
//   chain's name is always plain text; its small official logo sits beside it only where logos are on and it isn't taken down (alt="": the name is written).
// - A chip swap crossfades the rows in 180 ms inside the window's fixed height (instant under Reduce Motion); the focus stays on the chip and a polite live
//   region reads the new dishes.
// - While the menus load: the window's page-fill bars with no digits. On the website, after about 3 s with nothing, a plain line instead (the menus need a
//   connection the first time); in the iPhone app the menus are inside the app. If nothing at these places fits what the person avoids, a plain line too, and the
//   screen keeps its place either way.

/** How long the website waits for the four menus before saying they need a connection (the meeting: about 3 s). */
const MENU_WAIT_MS = 3000;

/** The first menu of each kind of place, started loading as soon as the person leaves "Anything you avoid?" (about 340 KB on the website, none over 150 KB). */
export function preloadShowcaseMenus(): void {
  void menuClient.ensureManifest().then(() => {
    const state = menuClient.getSnapshot();
    for (const { chainIds } of showcaseCandidates(state.chains)) if (chainIds[0]) void menuClient.loadChain(chainIds[0]).catch(() => undefined);
  }).catch(() => undefined);
}

export function EatOutShowcase({ goal, prefs, onDish }: { goal: Goal | null; prefs: Preferences; onDish?: (dish: FirstDish | null) => void }) {
  const t = useT();
  const menu = useMenu();
  const hidden = useHiddenLogos();
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [chosen, setChosen] = useState<ShowcaseGroupId | null>(null);
  const [waited, setWaited] = useState(false);
  const real = useMemo(() => menu.chains.filter((c) => !c.sample), [menu.chains]);
  const candidates = useMemo(() => (menu.status === "ready" ? showcaseCandidates(menu.chains, hidden) : []), [menu.status, menu.chains, hidden]);
  const menuFor = (id: string): Chain | null | undefined => menu.indexes.get(id)?.chain ?? (failed.has(id) ? null : undefined);
  const { chips, pending } = showcaseChips(candidates, menuFor, goal, prefs);
  const pendingKey = pending.map((p) => p.chainId).join("|");

  // load the menu each waiting kind of place needs next (the first, or the next one after a menu that couldn't be loaded or gives fewer than two dishes)
  useEffect(() => {
    for (const id of pendingKey ? pendingKey.split("|") : []) {
      menuClient.loadChain(id).catch(() => setFailed((f) => new Set([...f, id])));
    }
  }, [pendingKey]);
  useEffect(() => {
    const id = window.setTimeout(() => setWaited(true), MENU_WAIT_MS);
    return () => window.clearTimeout(id);
  }, []);

  // the chips show once every kind of place has its answer (so the first chip, already chosen, doesn't change under the person), or after the wait with what there is
  const settled = menu.status === "ready" && pending.length === 0;
  const showChips = settled || (waited && chips.length > 0);
  const chip: ShowcaseChip | undefined = showChips ? chips.find((c) => c.group === chosen) ?? chips[0] : undefined;

  // the chain left showing and its top dish: a navigation hint for Home's Start here card (never logged, never favourited)
  const hint = chip ? `${chip.chainId}|${chip.dishes[0]!.itemId}` : "";
  useEffect(() => {
    if (!onDish) return;
    const [chainId, itemId] = hint ? hint.split("|") : [];
    onDish(chainId && itemId ? { chainId, itemId } : null);
  }, [hint]); // eslint-disable-line react-hooks/exhaustive-deps -- reports the dish only when it changes

  // the new dishes fade in when a chip is swapped (not on the first draw: the window itself fades in)
  const rows = useRef<HTMLDivElement>(null);
  const shownChip = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!chip) return;
    if (shownChip.current && shownChip.current !== chip.chainId) fadeIn(rows.current, 180);
    shownChip.current = chip.chainId;
  }, [chip?.chainId]); // eslint-disable-line react-hooks/exhaustive-deps -- only on a swap

  const allergens = (prefs.avoidAllergens ?? []).map((k) => t(ALLERGEN_SHORT[k]).toLowerCase());
  const list = (names: readonly string[]) => new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names);
  const dietNote = restaurantDietNote(prefs, t);
  const offline = !showChips && (menu.status === "error" || (!APP_BUILD && waited));
  const noneFit = settled && chips.length === 0;
  const figures = (d: ShowcaseChip["dishes"][number]) =>
    d.serving
      ? t("{kcal} kcal · {protein} g protein · {serving}", { kcal: formatInt(d.kcal), protein: formatInt(d.protein), serving: d.serving })
      : t("{kcal} kcal · {protein} g protein", { kcal: formatInt(d.kcal), protein: formatInt(d.protein) });
  const spoken = chip
    ? `${t("Example from the Eat out tab: {dish} at {chain}: {kcal} calories, {protein} grams of protein, from {chain}'s own figures.", { dish: chip.dishes[0]!.name, chain: chip.chainName, kcal: formatInt(chip.dishes[0]!.kcal), protein: formatInt(chip.dishes[0]!.protein) })} ${t("Also {dish}: {kcal} calories, {protein} grams of protein.", { dish: chip.dishes[1]!.name, kcal: formatInt(chip.dishes[1]!.kcal), protein: formatInt(chip.dishes[1]!.protein) })}`
    : "";

  return (
    <>
      {showChips && chips.length > 0 && (
        <div role="radiogroup" aria-label={t("Restaurants")} className="mt-4 grid grid-cols-2 gap-2">
          {chips.map((c, i) => {
            const on = c.chainId === chip?.chainId;
            return (
              <button
                key={c.group}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setChosen(c.group)}
                onKeyDown={(e) => radioKeyNav(e, i, chips.length, (n) => setChosen(chips[n]!.group))}
                className={`flex min-h-11 min-w-0 items-center gap-2 rounded-[0.875rem] text-start text-[0.9375rem] leading-tight transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-2 border-on-sun bg-sun px-2.5 py-1.5 font-bold text-on-sun" : "border-[1.5px] border-edge bg-card px-[10.5px] py-[6.5px] font-semibold text-foreground hover:bg-background"}`}
              >
                {logoFor(c.chainId) && <ChainMark chainId={c.chainId} size="xs" />}
                <span className="min-w-0 [overflow-wrap:anywhere]">{c.chainName}</span>
              </button>
            );
          })}
        </div>
      )}
      {real.length > 0 && <p className="mt-3 text-[0.9375rem] leading-snug text-foreground">{t("Somewhere else? All {n} restaurants are in Eat out.", { n: formatInt(real.length) })}</p>}

      <ShowcaseWindow kind="eatOut" loading={!chip && !offline && !noneFit} status={t("Loading the menus…")} quiet>
        {chip ? (
          <>
            {/* the list really used, with the restaurant's name */}
            <h2 className="text-[1.0625rem] font-[800] leading-snug tracking-[-0.01em]">{t(chip.heading, { chain: chip.chainName })}</h2>
            <div aria-live="polite" className="sr-only">{spoken}</div>
            <div ref={rows} aria-hidden className="mt-2 divide-y divide-line">
              {chip.dishes.map((d) => (
                <div key={d.itemId} className="py-2.5">
                  <p className="text-base font-semibold leading-snug [overflow-wrap:anywhere]">{d.name}</p>
                  <p className="app-numbers mt-0.5 text-[0.9375rem] leading-snug text-muted">{figures(d)}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[0.875rem] leading-snug text-muted">
              {t("From {chain}'s own published figures, checked {date}.", { chain: chip.chainName, date: formatDate(chip.checkedOn, t) })} {t("Not affiliated with {chain}.", { chain: chip.chainName })}
            </p>
          </>
        ) : (
          <p role="status" className="text-[0.9375rem] leading-snug text-foreground">
            {noneFit
              ? t("Nothing at these places fits what you avoid. Once you're in, search all {n} restaurants in Eat out.", { n: formatInt(real.length) })
              : t("Menus need a connection the first time. Every restaurant is in Eat out.")}
          </p>
        )}
      </ShowcaseWindow>

      {allergens.length > 0 && <p className="mt-3 text-[0.9375rem] leading-snug text-foreground">{t("Dishes that list {allergens}, or have no allergy information, are left out. Always check with staff.", { allergens: list(allergens) })}</p>}
      {dietNote && <p className="mt-2 text-[0.9375rem] leading-snug text-foreground">{dietNote}</p>}
      {goal === "glp1" && <p className="mt-2 text-[0.9375rem] leading-snug text-foreground">{t(GLP1_NOTE, { app: site.name })}</p>}
    </>
  );
}
