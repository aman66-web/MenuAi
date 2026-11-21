"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ADD_TO, FOR_MEAL } from "@/lib/mm/addFood";
import { analytics } from "@/lib/mm/analytics";
import { FOOD_SCAN_ENABLED } from "@/lib/mm/config";
import { tk } from "@/lib/mm/i18n";
import { addLogEntry, countProAction, myRecipesStore } from "@/lib/mm/stores";
import type { LogMeal } from "@/lib/mm/types";
import type { LogEntry } from "@/lib/mm/user-data";
import { BasketIcon, CameraIcon, ChevronRightIcon, ForkIcon, PencilIcon, PotIcon, ScanIcon } from "../icons";
import { PremiumBadge } from "../PremiumBadge";
import { Sheet } from "../ui";
import { useStore } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { DishPick } from "./DishPick";
import { BackBar, Choice, type NewEntry } from "./parts";
import { ProductPick } from "./ProductPick";
import { RecipePick } from "./RecipePick";
import { ScanFood } from "./ScanFood";
import { TypedNumbers } from "./TypedNumbers";

// The "Add food" sheet that Home's + opens on Breakfast, Lunch or Dinner (founder 2026-10-15: "a kind of menu vibe sheet should launch where you can
// either type in macros, choose a recipe perhaps, choose a meal from a restaurant or whatever"). Plain choices, each leading to a short list or form, with
// "Scan a barcode" first (founder 2026-11-20: scan a pack straight into the food diary); whatever is picked is added to the meal whose + was tapped (not to
// the meal the clock says), at the time of the tap.

type View = "menu" | "barcode" | "numbers" | "recipe" | "restaurant" | "product";

const TITLE: Record<Exclude<View, "menu">, string> = {
  barcode: tk("Scan a barcode"),
  numbers: tk("Type in your numbers"),
  recipe: tk("Choose a recipe"),
  restaurant: tk("Choose a restaurant meal"),
  product: tk("Choose a supermarket product"),
};

export function AddFoodSheet({ meal, onClose, onAdded }: { meal: LogMeal | null; onClose: () => void; onAdded: (entry: LogEntry, meal: LogMeal) => void }) {
  const t = useT();
  const [view, setView] = useState<View>("menu");
  // the name "Type in your numbers" starts with: Open Food Facts' name for a scanned product it has no figures for, else none
  const [typedName, setTypedName] = useState("");
  const typeNumbers = (name: string) => { setTypedName(name); setView("numbers"); };
  const ownRecipes = useStore(myRecipesStore).length;

  // When the view changes the title changes with it: focus goes to the title (so a screen reader says where it is and a keyboard starts from the top),
  // never to a search box, which would put the keyboard over the list.
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      return;
    }
    document.querySelector<HTMLElement>("dialog[open] h2")?.focus({ preventScroll: true });
  }, [view]);

  const close = () => {
    setView("menu");
    onClose();
  };
  const add = (entry: NewEntry) => {
    if (!meal) return;
    const logged = addLogEntry({ ...entry, meal });
    analytics.track({ name: "mealLogged" });
    countProAction();
    setView("menu");
    onAdded(logged, meal);
  };

  // Back and which meal it goes to, in one row on every step (usability test 2026-11-19: "the add sheet never says which meal it is adding to"; the review of
  // 2026-11-20: the meal chip sat glued under Back, and above it in the product step)
  const header = (onBack: () => void) => (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <BackBar onBack={onBack} />
      {meal !== null && <p className="inline-flex rounded-[0.375rem] bg-fill px-3 py-1.5 text-[0.9375rem] font-bold">{t(FOR_MEAL[meal])}</p>}
    </div>
  );

  return (
    <Sheet open={meal !== null} onClose={close} title={meal === null ? "" : view === "menu" ? t(ADD_TO[meal]) : t(TITLE[view])}>
      {meal !== null && view === "menu" && (
        <div className="space-y-3 pb-2">
          {/* a photo of the barcode is the scanner's own photo button, bottom right (founder 2026-11-21: "Barcode from a photo should be inside ... You don't
              have to do a separate tab for it") */}
          <Choice icon={<ScanIcon className="h-6 w-6" />} title={t("Scan a barcode")} line={t("For food in a pack, or from a photo")} onClick={() => setView("barcode")} />
          <Choice icon={<PencilIcon className="h-6 w-6" />} title={t("Type in your numbers")} line={t("Calories, protein, carbs and fat")} onClick={() => typeNumbers("")} />
          <Choice icon={<PotIcon className="h-6 w-6" />} title={t("Choose a recipe")} line={ownRecipes > 0 ? t("A serving of one of yours, or one of ours") : t("A serving of one of our recipes")} onClick={() => setView("recipe")} />
          <Choice icon={<ForkIcon className="h-6 w-6" />} title={t("Choose a restaurant meal")} line={t("Search the menus, or pick a saved meal")} onClick={() => setView("restaurant")} />
          <Choice icon={<BasketIcon className="h-6 w-6" />} title={t("Choose a supermarket product")} line={t("Search, or scan its barcode")} onClick={() => setView("product")} />
          {/* Scan your food, where people add food (the review of 2026-11-20); the scan screen adds to this meal */}
          {FOOD_SCAN_ENABLED && (
            <Link href={`/app/scan?meal=${meal}`} onClick={close} className="glass flex min-h-[4.75rem] w-full items-center gap-3.5 rounded-[1.25rem] p-3.5 text-start transition active:scale-[0.98] hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card text-accent"><CameraIcon className="h-6 w-6" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-[800] leading-snug tracking-[-0.01em]">{t("Scan your food")}<PremiumBadge /></span>
                <span className="mt-0.5 block text-[0.9375rem] leading-snug text-muted">{t("A photo of your plate, an estimate of its numbers")}</span>
              </span>
              <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-ink" />
            </Link>
          )}
        </div>
      )}
      {meal !== null && view !== "menu" && (
        <div>
          {view !== "product" && view !== "barcode" && header(() => setView("menu"))}
          {view === "barcode" && <ScanFood meal={meal} onAdd={add} onBack={() => setView("menu")} onType={typeNumbers} header={header} />}
          {view === "numbers" && <TypedNumbers key={typedName} meal={meal} onAdd={add} startName={typedName} />}
          {view === "recipe" && <RecipePick meal={meal} onAdd={add} />}
          {view === "restaurant" && <DishPick onAdd={add} />}
          {view === "product" && <ProductPick meal={meal} onAdd={add} onBack={() => setView("menu")} header={header} onScan={() => setView("barcode")} onType={typeNumbers} />}
        </div>
      )}
    </Sheet>
  );
}
