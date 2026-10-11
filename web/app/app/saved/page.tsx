import { ForwardToMeals } from "../meals/Forward";

// Was "My saved meals"; since 2026-10-11 it is the "Restaurant meals" tab of "My meals" (founder: one tile on Home).
export default function SavedPage() {
  return <ForwardToMeals tab="restaurant" />;
}
