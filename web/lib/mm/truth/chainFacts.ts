// What we can truthfully say about a whole restaurant from its published figures: the answers on its public pages (/chains/<id>), in plain sentences with real numbers.
// A sentence is produced only when the numbers exist (a restaurant that publishes calories only gets no protein answer), and every number is one printed in the
// restaurant's own nutrition guide. The same sentences are shown on the page and put in its FAQ data, so the two always agree.

import type { Chain, MenuItem } from "../types";
import { itemKind, isMealKind } from "./itemKind";
import { MIN_SCORED_KCAL, proteinShare } from "./proteinScore";
import { applyPreset } from "./presets";

export interface ChainFacts {
  /** The meal (a main or a kids' dish) with the most protein; absent for a restaurant that publishes calories only. */
  mostProtein?: MenuItem;
  /** The meal with the fewest calories (at least MIN_SCORED_KCAL, so a nibble or a dip is never "the lowest calorie meal"). */
  fewestCalories?: MenuItem;
  /** How many meals are 500 kcal or less. */
  under500: number;
  /** How many meals have 35 g or more protein; 0 for a restaurant that publishes calories only. */
  protein35: number;
  /** How many meals the restaurant lists in all. */
  meals: number;
}

const isMeal = (i: MenuItem): boolean => i.nutrients.calories >= MIN_SCORED_KCAL && isMealKind(itemKind({ name: i.name, category: i.category, calories: i.nutrients.calories }));
const byName = (a: MenuItem, b: MenuItem) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1);

export function chainFacts(chain: Pick<Chain, "items" | "nutritionLevel">): ChainFacts {
  const meals = chain.items.filter(isMeal);
  const full = chain.nutritionLevel !== "calories";
  const withProtein = full ? meals.filter((i) => i.nutrients.protein !== undefined) : [];
  const mostProtein = [...withProtein].sort((a, b) => (b.nutrients.protein as number) - (a.nutrients.protein as number) || (proteinShare(b.nutrients) ?? 0) - (proteinShare(a.nutrients) ?? 0) || byName(a, b))[0];
  const fewestCalories = [...meals].sort((a, b) => a.nutrients.calories - b.nutrients.calories || byName(a, b))[0];
  return {
    ...(mostProtein ? { mostProtein } : {}),
    ...(fewestCalories ? { fewestCalories } : {}),
    under500: meals.filter((i) => i.nutrients.calories <= 500).length,
    protein35: applyPreset("protein-35", chain.items).length * (full ? 1 : 0),
    meals: meals.length,
  };
}

const g = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} g`;
const kcal = (n: number) => `${Math.round(n).toLocaleString("en-GB")} kcal`;

export interface Faq {
  question: string;
  answer: string;
}

/** The questions and answers for a restaurant's page, only those its figures can answer. `checkedOn` is the date its guide was checked, as the manifest says. */
export function chainFaq(chain: Pick<Chain, "name" | "items" | "nutritionLevel">, checkedOn: string): Faq[] {
  const f = chainFacts(chain);
  const faq: Faq[] = [];
  const source = `from ${chain.name}'s own published nutrition guide, checked ${checkedOn}`;
  if (f.mostProtein) {
    const p = f.mostProtein.nutrients;
    faq.push({
      question: `What is the highest protein order at ${chain.name}?`,
      answer: `Of the meals on ${chain.name}'s menu, ${f.mostProtein.name} has the most protein: ${g(p.protein as number)} protein and ${kcal(p.calories)}, ${source}. Drinks, sides, desserts, sauces and add-ons are not counted.`,
    });
  }
  if (f.fewestCalories) {
    faq.push({
      question: `What is the lowest calorie meal at ${chain.name}?`,
      answer: `Of the meals on ${chain.name}'s menu, ${f.fewestCalories.name} has the fewest calories: ${kcal(f.fewestCalories.nutrients.calories)}, ${source}. Drinks, sides, desserts, sauces and add-ons are not counted.`,
    });
  }
  if (f.meals > 0) {
    faq.push({
      question: `How many ${chain.name} meals are 500 calories or fewer?`,
      answer: f.under500 === 0 ? `None of the ${f.meals} meals we list for ${chain.name} is 500 kcal or less, ${source}.` : `${f.under500} of the ${f.meals} meals we list for ${chain.name} ${f.under500 === 1 ? "is" : "are"} 500 kcal or less, ${source}.`,
    });
  }
  return faq;
}
