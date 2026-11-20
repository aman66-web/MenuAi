"use client";

import Link from "next/link";
import { mealSlotFor } from "@/lib/mm/budget";
import { startHereDishFits, startHereRows, startHereShows, type HomeArrivalNote, type StartHereRows } from "@/lib/mm/homePages";
import { analytics } from "@/lib/mm/analytics";
import { tk } from "@/lib/mm/i18n";
import { RECIPES } from "@/lib/mm/recipeBook";
import { recipeForDiet, type Recipe } from "@/lib/mm/recipes";
import { addLogEntry, countProAction, deleteLogEntry, logStore } from "@/lib/mm/stores";
import type { LogEntry } from "@/lib/mm/user-data";
import type { Meal, MenuItem } from "@/lib/mm/types";
import { useChainIndexes, useSettings, useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { CheckIcon, ChevronRightIcon, PlusIcon } from "./icons";
import { Button } from "./ui";

// Home's "Start here" card, one time, on the first visit after the welcome screens (the onboarding redesign meeting, 20 November 2026, approved by the
// founder: "Home, first visit"). A white card directly under the numbers pages and their dots, above the cooking tools, that turns what the welcome screens
// showed into a first real action:
// - "Had something today? Add it and see what's left." with the ink "Add what you ate", which opens the real + sheet at the meal the time falls in;
// - "Had the {dish} today? Add it" for the dish shown on step 3, only if it still suits the account's own diet and allergens (checked against the settings
//   as they are now, so after sync too), isn't limited-time, and adding is free; after a tap the row says "Added to {meal}" with its own Undo, so Undo stays
//   after the toast has gone. Nothing is ever added unless the person taps;
// - "Your first recipe: {recipe}" with Open, if one was chosen on step 5 and still suits;
// - a 44 pt "Done with this", which closes it for good; it also goes once every row has been used.
// Adding a meal is shown only where it is free for this person (in 1.1 it is free for everyone): with adding paid and no recipe chosen there is no card.
// The note behind it (lib/mm/homePages.ts) is kept on this device only, with the rows used so far, so the card is still on Home on the next visit and after a
// reload (step 5 says "It'll be waiting on Home"), until "Done with this", every row used, or START_HERE_DAYS days.

const ADDED_TO_MEAL: Record<Meal, string> = { breakfast: tk("Added to Breakfast"), lunch: tk("Added to Lunch"), dinner: tk("Added to Dinner") };

export interface StartHereState {
  rows: StartHereRows;
  shows: boolean;
  dish: { item: MenuItem; chainId: string; chainName: string } | null;
  recipe: Recipe | null;
}

/** What the card would show for this note now: Home uses it to hold the targets card while the card is there. `logFree`: adding a meal is free for this person. */
export function useStartHere(note: HomeArrivalNote | null, logFree: boolean): StartHereState {
  const settings = useSettings();
  const prefs = settings.preferences;
  const dishRef = note?.card ? note.firstDish : undefined;
  const indexes = useChainIndexes(dishRef ? [dishRef.chainId] : []);
  const ix = dishRef ? indexes.get(dishRef.chainId) : undefined;
  const item = ix && ix !== "missing" && dishRef ? ix.items.get(dishRef.itemId) : undefined;
  const dishFits = !!item && !!dishRef && startHereDishFits(item, dishRef.chainId, prefs);
  const base = note?.card && note.firstRecipeId ? RECIPES.find((r) => r.id === note.firstRecipeId) : undefined;
  const recipe = base ? recipeForDiet(base, prefs) : null;
  const rows = startHereRows(note, { logFree, dishFits, recipeFits: !!recipe });
  return {
    rows,
    shows: startHereShows(rows),
    dish: item && dishRef && ix && ix !== "missing" ? { item, chainId: dishRef.chainId, chainName: ix.chain.name } : null,
    recipe,
  };
}

export function StartHere({ state, now, used, onAddWhatYouAte, onDishAdded, onDishUndone, onRecipeOpened, onDone }: {
  state: StartHereState;
  now: Date;
  /** The rows used so far (kept with the note on the phone, so the card can go once every row is used); `dishEntry` only for a dish added on this visit. */
  used: { add: boolean; dishEntry: string | null; recipe: boolean };
  /** "Add what you ate": Home opens its + sheet at this meal. */
  onAddWhatYouAte: (meal: Meal) => void;
  /** The dish was added (Home shows the one toast with its Undo). */
  onDishAdded: (entry: LogEntry, meal: Meal) => void;
  onDishUndone: (entryId: string) => void;
  onRecipeOpened: () => void;
  /** "Done with this". */
  onDone: () => void;
}) {
  const t = useT();
  const log = useStore(logStore);
  const settings = useSettings();
  const { rows, dish, recipe } = state;
  // the dish's entry while it is still in the day's log (an Undo in the toast takes it out again, and the row offers the dish again)
  const addedEntry = used.dishEntry ? log.find((e) => e.id === used.dishEntry) ?? null : null;
  const addedMeal = addedEntry?.meal && addedEntry.meal !== "snack" ? addedEntry.meal : mealSlotFor(now);
  const shop = settings.shops?.[0];

  const addDish = () => {
    if (!dish) return;
    const meal = mealSlotFor(new Date());
    const entry = addLogEntry({ chainId: dish.chainId, chainName: dish.chainName, name: dish.item.name, nutrients: dish.item.nutrients, source: "item", meal, ...(dish.item.image ? { image: dish.item.image } : {}) });
    // counted like any meal added through the + sheet (AddFoodSheet.tsx)
    analytics.track({ name: "mealLogged" });
    countProAction();
    onDishAdded(entry, meal);
  };
  const undoDish = () => {
    if (!addedEntry) return;
    deleteLogEntry(addedEntry.id);
    onDishUndone(addedEntry.id);
  };

  const ROW = "flex min-h-11 items-center gap-2 border-t border-line py-1.5";
  return (
    <section data-coach="home-start" aria-labelledby="start-here-h" className="glass mt-3 rounded-[1.25rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id="start-here-h" className="pt-2 text-[1.1875rem] font-[800] leading-tight tracking-[-0.01em]">{t("Start here")}</h2>
        <button type="button" onClick={onDone} className="-me-2 -mt-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2 text-[0.9375rem] font-semibold text-foreground underline underline-offset-2 transition hover:bg-background active:bg-background">
          {t("Done with this")}
        </button>
      </div>

      {/* once something has been added through it, this row has done its job */}
      {rows.add && !used.add && (
        <div className="mt-1">
          <p className="text-base leading-snug">{t("Had something today? Add it and see what's left.")}</p>
          <Button className="mt-3" onClick={() => onAddWhatYouAte(mealSlotFor(new Date()))}>
            <PlusIcon aria-hidden className="h-5 w-5 shrink-0" />{t("Add what you ate")}
          </Button>
        </div>
      )}

      {(rows.dish || rows.recipe) && (
        <ul className={rows.add && !used.add ? "mt-3" : "mt-2"}>
          {rows.dish && dish && (
            <li className={ROW}>
              {addedEntry ? (
                <>
                  <CheckIcon aria-hidden strokeWidth={2.6} className="h-5 w-5 shrink-0 text-ink" />
                  <span className="min-w-0 flex-1 text-base font-semibold leading-snug">{t(ADDED_TO_MEAL[addedMeal])}</span>
                  <span aria-hidden className="text-muted">·</span>
                  <button type="button" onClick={undoDish} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2 text-base font-bold text-foreground underline underline-offset-2 transition hover:bg-background active:bg-background">
                    {t("Undo")}<span className="sr-only">: {dish.item.name}</span>
                  </button>
                </>
              ) : (
                <button type="button" onClick={addDish} className="flex min-h-11 w-full min-w-0 items-center gap-2 text-start text-base font-semibold leading-snug text-foreground">
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t("Had the {dish} today? Add it", { dish: dish.item.name })}</span>
                  <PlusIcon aria-hidden className="h-5 w-5 shrink-0 text-ink" />
                </button>
              )}
            </li>
          )}
          {rows.recipe && recipe && (
            <li className={ROW}>
              <span className="min-w-0 flex-1 text-base leading-snug [overflow-wrap:anywhere]">{t("Your first recipe: {recipe}", { recipe: t(recipe.name) })}</span>
              <span aria-hidden className="text-muted">·</span>
              <Link
                href={`/app/recipes/view?id=${recipe.id}${shop ? `&r=${shop}` : ""}`}
                onClick={onRecipeOpened}
                className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-full px-2 text-base font-bold text-accent underline underline-offset-2"
              >
                {t("Open")}<span className="sr-only">: {t(recipe.name)}</span>
                <ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0" />
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
