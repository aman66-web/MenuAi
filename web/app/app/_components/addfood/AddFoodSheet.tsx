"use client";

import { useEffect, useRef, useState } from "react";
import { ADD_TO } from "@/lib/mm/addFood";
import { analytics } from "@/lib/mm/analytics";
import { tk } from "@/lib/mm/i18n";
import { addLogEntry, countProAction } from "@/lib/mm/stores";
import type { Meal } from "@/lib/mm/types";
import type { LogEntry } from "@/lib/mm/user-data";
import { BasketIcon, ForkIcon, PencilIcon, PotIcon } from "../icons";
import { Sheet } from "../ui";
import { useT } from "../../_lib/i18n";
import { DishPick } from "./DishPick";
import { BackBar, Choice, type NewEntry } from "./parts";
import { ProductPick } from "./ProductPick";
import { RecipePick } from "./RecipePick";
import { TypedNumbers } from "./TypedNumbers";

// The "Add food" sheet that Home's + opens on Breakfast, Lunch or Dinner (founder 2026-10-15: "a kind of menu vibe sheet should launch where you can
// either type in macros, choose a recipe perhaps, choose a meal from a restaurant or whatever"). Four plain choices, each leading to a short list
// or form; whatever is picked is added to the meal whose + was tapped (not to the meal the clock says), at the time of the tap.

type View = "menu" | "numbers" | "recipe" | "restaurant" | "product";

const TITLE: Record<Exclude<View, "menu">, string> = {
  numbers: tk("Type in your numbers"),
  recipe: tk("Choose a recipe"),
  restaurant: tk("Choose a restaurant meal"),
  product: tk("Choose a supermarket product"),
};

export function AddFoodSheet({ meal, onClose, onAdded }: { meal: Meal | null; onClose: () => void; onAdded: (entry: LogEntry, meal: Meal) => void }) {
  const t = useT();
  const [view, setView] = useState<View>("menu");

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

  return (
    <Sheet open={meal !== null} onClose={close} title={meal === null ? "" : view === "menu" ? t(ADD_TO[meal]) : t(TITLE[view])}>
      {meal !== null && view === "menu" && (
        <div className="space-y-3 pb-2">
          <Choice icon={<PencilIcon className="h-6 w-6" />} title={t("Type in your numbers")} line={t("Calories, protein, carbs and fat")} onClick={() => setView("numbers")} />
          <Choice icon={<PotIcon className="h-6 w-6" />} title={t("Choose a recipe")} line={t("A serving of one of our recipes")} onClick={() => setView("recipe")} />
          <Choice icon={<ForkIcon className="h-6 w-6" />} title={t("Choose a restaurant meal")} line={t("Search the menus, or pick a saved meal")} onClick={() => setView("restaurant")} />
          <Choice icon={<BasketIcon className="h-6 w-6" />} title={t("Choose a supermarket product")} line={t("Search, or scan its barcode")} onClick={() => setView("product")} />
        </div>
      )}
      {meal !== null && view !== "menu" && (
        <div>
          {view !== "product" && <BackBar onBack={() => setView("menu")} />}
          {view === "numbers" && <TypedNumbers meal={meal} onAdd={add} />}
          {view === "recipe" && <RecipePick meal={meal} onAdd={add} />}
          {view === "restaurant" && <DishPick onAdd={add} />}
          {view === "product" && <ProductPick meal={meal} onAdd={add} onBack={() => setView("menu")} />}
        </div>
      )}
    </Sheet>
  );
}
