import { ForwardToMeals } from "../../meals/Forward";

// Was "My recipes"; since 2026-10-11 it is the "Recipes" tab of "My meals" (founder: one tile on Home).
export default function SavedRecipesPage() {
  return <ForwardToMeals tab="recipes" />;
}
