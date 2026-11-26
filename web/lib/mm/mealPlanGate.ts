import { GATING_ENABLED } from "./config";
import { isPro, needsPaywall } from "./entitlements";
import type { PaidState } from "./paid";
import type { UserSettings } from "./user-data";

// Meal plan behind Premium with nothing in between (founder, 26 November 2026: "once a person's 7-day free trial has went, also the meal plan thing ... If they
// click on it ... It won't even go into the meal plan. If they click a meal plan, it will show up saying they'll have to get a membership. You know that thing
// when it comes with the banner saying buy a year or buy a month. That should come up basically if they click a meal plan and it's after the 7-day free trial and
// they haven't purchased"). Every way in asks this one question: Home's Meal plan card, the "Your meal plan is ready" notice, Ask Pip's "View meal plan", and
// the page itself when it is opened by its address (a link, Back, a saved page). "premium" opens the Premium sheet where the person is, and Meal plan doesn't
// open; "plan" opens Meal plan as before. The free week, a purchase, a gift and the 48-hour share unlock all count as Premium (lib/mm/paid.ts hasAccess), so
// they open the plan. On a build that sells nothing (the website: GATING_ENABLED false) it is always "plan".

export type MealPlanDoor = "plan" | "premium";

/** What opening Meal plan does for someone with (`pro`) or without Premium on this build. */
export function mealPlanDoor(pro: boolean): MealPlanDoor {
  return GATING_ENABLED && needsPaywall("mealPlan", { pro }) ? "premium" : "plan";
}

/** The same answer from what the phone keeps: the settings (the testers' Premium preview) and the paid state (a purchase, the free week, a gift), at `nowMs`. */
export function mealPlanDoorFor(settings: Pick<UserSettings, "devProOverride">, paid: PaidState, nowMs: number = Date.now()): MealPlanDoor {
  return mealPlanDoor(isPro(settings, paid, nowMs));
}
