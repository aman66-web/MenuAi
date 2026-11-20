"use client";

import { useEffect, useState } from "react";
import { GATING_ENABLED } from "@/lib/mm/config";
import { formatInt } from "@/lib/mm/format";
import { retailerName } from "@/lib/mm/groceries";
import { tk } from "@/lib/mm/i18n";
import type { DietPrefs } from "@/lib/mm/pantry";
import { previewShop, weekPreview, type PlanPerson, type ShopLoader, type WeekPreview, type WeekPreviewInputs } from "@/lib/mm/planPreview";
import type { MealType } from "@/lib/mm/recipes";
import { useIsPro, useSettings } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { loadShopFile, loadShopManifest, useShopManifest } from "../_lib/shopProducts";
import { FREE_PREMIUM_LINE } from "./parts";
import { alsoInPremium, ShowcaseWindow } from "./ShowcaseWindow";

// Step 10 of the welcome steps, "Your week, planned" (the onboarding redesign meeting of 20 November 2026, build list 4; approved by the founder): one person's
// real week of our recipes from their shop, sized to their daily numbers, on one shopping list, made by Meal plan's own planning with exactly its Just-me
// defaults (lib/mm/planPreview.ts weekPreview: no AI, the shop's real products and prices). Shown as Monday's three meals, the day's average against their
// target and the week's shopping as a labelled line at normal size (never a large £ figure, so it can't be read as a charge). It is never saved: Meal plan's
// first open starts on this same week. The one place Premium is named during setup, honestly and with no price: where Premium is sold, the window's ink
// badge with "Nothing is charged during setup.", then "Also in Premium: ..." and the free and Premium line under it; on the website, where nothing is sold,
// none of that. Scan your food is named, never demonstrated (CLAUDE.md rule 1). Pip is off: the screen carries figures and money.
// Timings: the week is usually ready already (worked out while "Your daily targets" was showing, prepareWeek). Otherwise a status line and page-fill bars, up to
// 8 s for the shop's file and 2.5 s more for the sums, then the words-only form; an under-18, a narrow diet or too few recipes get that form too. The screen and
// its counter keep their place whatever happens.

/** The meeting's caps: the shop's file (the website; in the iPhone app it is inside the app), then the sums once the file is there. */
const FILE_WAIT_MS = 8000;
const WORK_WAIT_MS = 2500;

const MEAL_ROW: Readonly<Record<MealType, string>> = {
  breakfast: tk("Breakfast · {recipe}"),
  lunch: tk("Lunch · {recipe}"),
  dinner: tk("Dinner · {recipe}"),
  snack: tk("Snack · {recipe}"),
};

const sleep = (ms: number) => new Promise<"late">((r) => setTimeout(() => r("late"), ms));

/** The numbers a week is sized to, as saved (or, while "Your daily targets" is showing, as typed there). */
export type WeekPerson = PlanPerson;

/** The weeks being worked out now, by their inputs, so step 10 waits for the one "Your daily targets" started instead of doing the same sums twice. */
const inflight = new Map<string, Promise<WeekPreview>>();
function previewOnce(inputs: WeekPreviewInputs, load: ShopLoader, signal?: AbortSignal): Promise<WeekPreview> {
  const key = JSON.stringify([inputs.shop, inputs.person, inputs.diet, !!inputs.under18]);
  const known = inflight.get(key);
  if (known) return known;
  const p = weekPreview(inputs, { load, ...(signal ? { signal } : {}) }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Works the week out ahead (while "Your daily targets" is showing, 600 ms after the last change), into planPreview's cache, so step 10 and Meal plan's first open
 * find it made. Stops between chunks when `signal` is aborted (a number changed again, or the screen was left). Never throws.
 */
export async function prepareWeek(person: WeekPerson, diet: DietPrefs, shops: readonly string[] | undefined, signal: AbortSignal): Promise<void> {
  try {
    const { shop } = previewShop(await loadShopManifest(), shops);
    if (!shop || signal.aborted) return;
    await previewOnce({ shop, diet, person }, loadShopFile, signal);
  } catch {
    /* nothing to prepare: step 10 works it out itself */
  }
}

type Shown = { kind: "working" } | { kind: "words" } | { kind: "week"; preview: WeekPreview & { ok: true } };

/** Step 10's window and the lines under it. `under18`: nothing is worked out. `planLine`: the replay's line for someone who already has a plan this week. */
export function WeekShowcase({ under18 = false, planLine = false }: { under18?: boolean; planLine?: boolean }) {
  const t = useT();
  const settings = useSettings();
  const isPro = useIsPro();
  const manifest = useShopManifest();
  const { shop, left } = previewShop(manifest, settings.shops);
  const shopName = shop ? manifest?.retailers.find((r) => r.id === shop)?.name ?? retailerName(shop) : "";
  const person: WeekPerson = { goal: settings.goal, dailyCalories: settings.dailyCalories, dailyProtein: settings.dailyProtein, glp1MealCap: settings.glp1MealCap };
  const key = JSON.stringify([shop, under18, person, settings.preferences]);
  const [shown, setShown] = useState<{ key: string; value: Shown }>({ key: "", value: { kind: "working" } });

  useEffect(() => {
    if (!manifest) return;
    let live = true;
    const show = (value: Shown) => { if (live) setShown({ key, value }); };
    if (under18 || !shop) {
      show({ kind: "words" });
      return () => { live = false; };
    }
    void (async () => {
      const file = loadShopFile(shop);
      const loaded = await Promise.race([file.then(() => "ready" as const, () => "failed" as const), sleep(FILE_WAIT_MS)]);
      if (loaded !== "ready") return show({ kind: "words" });
      // the sums carry on after the cap (they fill the cache Meal plan's first open reads), but the screen keeps its words-only form
      const inputs = { shop, diet: settings.preferences, person };
      const work = previewOnce(inputs, () => file).then((r) => (!r.ok && r.reason === "stopped" ? weekPreview(inputs, { load: () => file }) : r));
      const result = await Promise.race([work, sleep(WORK_WAIT_MS)]);
      show(result !== "late" && result.ok ? { kind: "week", preview: result } : { kind: "words" });
    })();
    return () => { live = false; };
  }, [key, !!manifest]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` holds every input

  const value: Shown = shown.key === key ? shown.value : { kind: "working" };
  const preview = value.kind === "week" ? value.preview : null;
  const meals = preview?.firstDay ?? [];
  const average = preview ? t("About {kcal} kcal and {protein} g protein a day (your target is {target} kcal).", { kcal: formatInt(preview.average.kcal), protein: formatInt(preview.average.protein), target: formatInt(settings.dailyCalories) }) : "";
  const total = preview ? formatInt(Math.round(preview.total)) : "";
  const names = meals.map((m) => t(m.name));
  const spoken = preview
    ? GATING_ENABLED
      ? t("Example from Meal plan, part of Premium: Monday: {breakfast}, {lunch}, {dinner}. About {kcal} calories and {protein} grams of protein a day. A week's shopping at {shop}, about £{total}.", { breakfast: names[0] ?? "", lunch: names[1] ?? "", dinner: names[2] ?? "", kcal: formatInt(preview.average.kcal), protein: formatInt(preview.average.protein), shop: shopName, total })
      : t("Example from Meal plan: Monday: {breakfast}, {lunch}, {dinner}. About {kcal} calories and {protein} grams of protein a day. A week's shopping at {shop}, about £{total}.", { breakfast: names[0] ?? "", lunch: names[1] ?? "", dinner: names[2] ?? "", kcal: formatInt(preview.average.kcal), protein: formatInt(preview.average.protein), shop: shopName, total })
    : undefined;
  const also = alsoInPremium();

  return (
    <>
      {left && preview && <p className="mt-2 text-[0.9375rem] leading-snug text-foreground">{t("{left} isn't in recipes yet, so this week uses {shop}.", { left: retailerName(left), shop: shopName })}</p>}
      <ShowcaseWindow kind="week" loading={value.kind === "working"} status={shopName ? t("Planning your week from {shop}'s recipes…", { shop: shopName }) : undefined} rows={3}>
        {preview ? (
          <>
            <p className="sr-only">{spoken}</p>
            <div aria-hidden>
              <h2 className="text-[1.0625rem] font-[800] leading-snug tracking-[-0.01em]">{t("Monday")}</h2>
              <ul className="mt-1.5 divide-y divide-line">
                {meals.map((m, i) => (
                  <li key={`${m.meal}-${m.recipeId}`} className="py-2 text-base font-semibold leading-snug [overflow-wrap:anywhere]">{t(MEAL_ROW[m.meal], { recipe: names[i] ?? m.name })}</li>
                ))}
              </ul>
              <p className="app-numbers mt-2 text-[0.9375rem] leading-snug text-foreground">{average}</p>
              <p className="app-numbers mt-1.5 text-[0.9375rem] font-semibold leading-snug text-foreground">{t("Shopping for the week at {shop}: about £{total}", { shop: shopName, total })}</p>
              <p className="mt-1.5 text-[0.9375rem] leading-snug text-foreground">{t("Everything goes on one shopping list.")}</p>
            </div>
            <p className="mt-3 border-t border-line pt-3 text-[0.9375rem] leading-snug text-muted">{t("This week isn't kept. Open Meal plan on Home to make it yours, for you or everyone you cook for.")}</p>
          </>
        ) : (
          <p role="status" className="text-[0.9375rem] leading-snug text-foreground">{t("Meal plan plans a week of meals from your shop, sized to your numbers, with one shopping list. You'll find it on Home.")}</p>
        )}
      </ShowcaseWindow>
      <div className="mt-3 space-y-2 text-[0.9375rem] leading-snug text-foreground">
        {planLine && <p className="font-semibold">{t("You already have a plan for this week. Open Meal plan on Home.")}</p>}
        {also && <p>{t(also)}</p>}
        {GATING_ENABLED && !isPro && <p>{t(FREE_PREMIUM_LINE)}</p>}
        {preview && <p>{t("Prices are {shop}'s shelf prices and vary by store.", { shop: shopName })}</p>}
      </div>
    </>
  );
}
