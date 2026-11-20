"use client";

import { useEffect, useState } from "react";
import { assetUrl, GATING_ENABLED } from "@/lib/mm/config";
import { formatDate, formatInt } from "@/lib/mm/format";
import { retailerName } from "@/lib/mm/groceries";
import { localeInfo, tk } from "@/lib/mm/i18n";
import type { DietPrefs } from "@/lib/mm/pantry";
import { previewShop, weekGap, weekPreview, type PlanPerson, type ShopLoader, type WeekPreview, type WeekPreviewInputs } from "@/lib/mm/planPreview";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import type { MealType } from "@/lib/mm/recipes";
import { BasketIcon, ListIcon } from "../_components/icons";
import { PremiumBadge } from "../_components/PremiumBadge";
import { MEAL_LOOK } from "../recipes/RecipeTile";
import { useIsPro, useSettings } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { loadShopFile, loadShopManifest, useShopManifest } from "../_lib/shopProducts";
import { ShowcaseWindow } from "./ShowcaseWindow";

// Your plan's week as a picture timetable (founder, 20 November 2026): Monday to Sunday as rows, breakfast, lunch and dinner as columns of our own recipes'
// pictures (illustrations of our own recipes, CLAUDE.md rule 2; a recipe with none shows its meal's drawing on the page fill), each day's calories at the row's
// end, then two small cards: "About £{n} for the week" and "1 shopping list". It is one person's real week of our recipes from their shop, sized to their daily
// numbers, made by Meal plan's own planning with exactly its Just-me defaults (lib/mm/planPreview.ts weekPreview: no AI, the shop's real products and prices,
// no budget), so it is the week Meal plan's first open makes. It is never saved.
// - Never hidden (founder: "never hide it"): a week that can't reach the person's calories (our recipes stretch only so far: planPreview.ts explains why) is
//   shown with its real numbers anyway, each day's calories at its row's end, and one plain line says so (weekGap). A GLP-1 meal size that keeps the day under
//   the calories is said too.
// - Where Premium is sold the timetable carries the one small Premium badge (Meal plan is Premium there); no other label, no "Nothing is charged" line.
// - The money is a small card at normal size beside "1 shopping list" (never a large £ figure, so it can't be read as a charge), with the shelf-price line and
//   its date under them.
// - Timings: the week is usually ready already (worked out while How active are you? showed, prepareWeek). Otherwise page-fill squares, up to 8 s for the
//   shop's file and 2.5 s more for the sums, then the words-only line. An under-18 or too few recipes get that line too.

/** The caps: the shop's file (the website; in the iPhone app it is inside the app), then the sums once the file is there. */
const FILE_WAIT_MS = 8000;
const WORK_WAIT_MS = 2500;

const COLUMN: Readonly<Record<"breakfast" | "lunch" | "dinner", string>> = { breakfast: tk("Breakfast"), lunch: tk("Lunch"), dinner: tk("Dinner") };
const COLUMNS = ["breakfast", "lunch", "dinner"] as const;

const sleep = (ms: number) => new Promise<"late">((r) => setTimeout(() => r("late"), ms));

/** The numbers a week is sized to, as saved. */
export type WeekPerson = PlanPerson;

/** The weeks being worked out now, by their inputs, so Your plan waits for the one How active are you? started instead of doing the same sums twice. */
const inflight = new Map<string, Promise<WeekPreview>>();
function previewOnce(inputs: WeekPreviewInputs, load: ShopLoader, signal?: AbortSignal): Promise<WeekPreview> {
  const key = JSON.stringify([inputs.shop, inputs.person, inputs.diet, !!inputs.under18]);
  const known = inflight.get(key);
  if (known) return known;
  // keepNarrow: a week far from the numbers is shown with its real numbers (and said), never hidden
  const p = weekPreview(inputs, { load, keepNarrow: true, ...(signal ? { signal } : {}) }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Works the week out ahead (while How active are you? is showing, once a tile is tapped), into planPreview's cache, so Your plan and Meal plan's first open find
 * it made. Stops between chunks when `signal` is aborted (another tile was tapped, or the screen was left). Never throws.
 */
export async function prepareWeek(person: WeekPerson, diet: DietPrefs, shops: readonly string[] | undefined, signal: AbortSignal): Promise<void> {
  try {
    const { shop } = previewShop(await loadShopManifest(), shops);
    if (!shop || signal.aborted) return;
    await previewOnce({ shop, diet, person }, loadShopFile, signal);
  } catch {
    /* nothing to prepare: Your plan works it out itself */
  }
}

type Shown = { kind: "working" } | { kind: "words" } | { kind: "week"; preview: WeekPreview & { ok: true } };

/** One picture of the timetable: our recipe's illustration, or its meal's drawing on the page fill. */
function Thumb({ recipeId, meal }: { recipeId: string; meal: MealType }) {
  const [failed, setFailed] = useState(false);
  const src = RECIPE_IMAGES[recipeId];
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- our own recipe's illustration, a static file named by its hash
    return <img src={assetUrl(src)} alt="" width={160} height={160} loading="lazy" decoding="async" onError={() => setFailed(true)} className="aspect-square w-full rounded-xl bg-fill object-cover" />;
  }
  const Icon = (MEAL_LOOK[meal] ?? MEAL_LOOK.dinner).Icon;
  return <span className="grid aspect-square w-full place-items-center rounded-xl bg-fill text-muted"><Icon className="h-6 w-6" /></span>;
}

const GRID = "grid grid-cols-[2.5rem_repeat(3,minmax(0,1fr))_3.5rem] items-center gap-x-1.5";

/** Seven rows of page-fill squares where the week will be (no digits). */
function TimetableSkeleton() {
  return (
    <div aria-hidden className="space-y-1.5 pt-7">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className={GRID}>
          <span className="h-3.5 w-8 rounded bg-background" />
          {[0, 1, 2].map((j) => <span key={j} className="aspect-square w-full rounded-xl bg-background" />)}
          <span className="ms-auto h-3.5 w-10 rounded bg-background" />
        </div>
      ))}
    </div>
  );
}

/** Your plan's week. `under18`: nothing is worked out (the words-only line). `planLine`: the replay's line for someone who already has a plan this week. */
export function WeekShowcase({ under18 = false, planLine = false }: { under18?: boolean; planLine?: boolean }) {
  const t = useT();
  const settings = useSettings();
  const isPro = useIsPro();
  const premium = GATING_ENABLED && !isPro;
  const manifest = useShopManifest();
  const language = useLanguage();
  const { shop, leftAll } = previewShop(manifest, settings.shops);
  const leftNames = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(leftAll.map((id) => manifest?.retailers.find((r) => r.id === id)?.name ?? retailerName(id)));
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
      // the sums carry on after the cap (they fill the cache Meal plan's first open reads), but the screen keeps its words-only line
      const inputs = { shop, diet: settings.preferences, person };
      const work = previewOnce(inputs, () => file).then((r) => (!r.ok && r.reason === "stopped" ? weekPreview(inputs, { load: () => file, keepNarrow: true }) : r));
      const result = await Promise.race([work, sleep(WORK_WAIT_MS)]);
      show(result !== "late" && result.ok ? { kind: "week", preview: result } : { kind: "words" });
    })();
    return () => { live = false; };
  }, [key, !!manifest]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` holds every input

  const value: Shown = shown.key === key ? shown.value : { kind: "working" };
  const preview = value.kind === "week" ? value.preview : null;
  const dayName = (i: number, weekday: "short" | "long") => new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday }).format(new Date(2026, 10, 16 + i, 12)); // 16 November 2026 was a Monday
  const gap = preview ? weekGap(preview) : null;
  // a GLP-1 meal size keeps the day under the calories: said, so the row ends don't read as a mistake
  const capped = preview && settings.goal === "glp1" && preview.sizedTo < settings.dailyCalories - 30 ? settings.glp1MealCap : null;
  // the number the gap is said against: the person's own daily calories (the big number above), or the capped day under a GLP-1 meal size
  const gapTarget = preview ? (capped !== null ? preview.sizedTo : settings.dailyCalories) : 0;

  return (
    <>
      <ShowcaseWindow kind="week" loading={value.kind === "working"} status={shopName ? t("Planning your week from {shop}'s recipes…", { shop: shopName }) : undefined} quiet skeleton={<TimetableSkeleton />}>
        {preview ? (
          <>
            {/* for a screen reader, the week in words; the picture grid below is for the eye */}
            <ul className="sr-only">
              {preview.days.map((d, i) => (
                <li key={i}>{t("{day}: {meals}. {kcal} calories.", { day: dayName(i, "long"), meals: d.meals.map((m) => t(m.name)).join(", "), kcal: formatInt(d.kcal) })}</li>
              ))}
            </ul>
            {/* where Premium is sold, Meal plan's one badge (read by a screen reader too) */}
            {premium && <p className="mb-2 flex justify-end"><PremiumBadge /></p>}
            <div aria-hidden>
              <div className={`${GRID} pb-1.5 text-[0.8125rem] font-semibold leading-tight text-muted`}>
                <span />
                {COLUMNS.map((c) => <span key={c} className="truncate text-center">{t(COLUMN[c])}</span>)}
                <span className="text-end">{t("kcal")}</span>
              </div>
              <div className="space-y-1.5">
                {preview.days.map((d, i) => (
                  <div key={i} className={GRID}>
                    <span className="text-[0.9375rem] font-bold">{dayName(i, "short")}</span>
                    {COLUMNS.map((c) => {
                      const m = d.meals.find((x) => x.meal === c);
                      return m ? <Thumb key={c} recipeId={m.recipeId} meal={c} /> : <span key={c} className="aspect-square w-full rounded-xl bg-background" />;
                    })}
                    <span className="app-numbers text-end text-[1rem] font-bold">{formatInt(d.kcal)}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* never hidden: how far the week is from the numbers, in one line */}
            {gap && (
              <p className="mt-3 text-[0.9375rem] font-semibold leading-snug text-foreground">
                {gap.kind === "short"
                  ? t("Our recipes can't reach {target} kcal yet: about {kcal} a day.", { target: formatInt(gapTarget), kcal: formatInt(gap.kcal) })
                  : t("Our recipes can't go down to {target} kcal yet: about {kcal} a day.", { target: formatInt(gapTarget), kcal: formatInt(gap.kcal) })}
              </p>
            )}
            {capped !== null && <p className="mt-2 text-[0.9375rem] leading-snug text-foreground">{t("Each meal is kept to your {cap} kcal meal size.", { cap: formatInt(capped) })}</p>}
            {/* the week's shopping as two small cards side by side (one a row at the largest text sizes), at the normal text size */}
            <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3">
              <li className="app-numbers flex min-h-14 items-center gap-2.5 rounded-[1.25rem] border border-line bg-card px-3.5 py-2.5 text-[1rem] font-bold leading-snug">
                <BasketIcon aria-hidden className="h-6 w-6 shrink-0 text-accent" /><span className="min-w-0">{t("About £{n} for the week", { n: formatInt(Math.round(preview.total)) })}</span>
              </li>
              <li className="flex min-h-14 items-center gap-2.5 rounded-[1.25rem] border border-line bg-card px-3.5 py-2.5 text-[1rem] font-bold leading-snug">
                <ListIcon aria-hidden className="h-6 w-6 shrink-0 text-accent" /><span className="min-w-0">{t("1 shopping list")}</span>
              </li>
            </ul>
            {leftAll.length > 0 && <p className="mt-3 text-[0.9375rem] leading-snug text-foreground">{leftAll.length === 1 ? t("{left} isn't in recipes yet, so this week uses {shop}.", { left: leftNames, shop: shopName }) : t("{left} aren't in recipes yet, so this week uses {shop}.", { left: leftNames, shop: shopName })}</p>}
            <p className="mt-2 text-sm leading-snug text-muted">{t("Prices are {shop}'s shelf prices, checked {date}, and vary by store.", { shop: shopName, date: formatDate(preview.checkedOn, t) })}</p>
          </>
        ) : (
          <p role="status" className="text-[0.9375rem] leading-snug text-foreground">{t("Meal plan makes your week from your shop, with one shopping list.")}</p>
        )}
      </ShowcaseWindow>
      {planLine && <p className="mt-3 text-[0.9375rem] font-semibold leading-snug text-foreground">{t("You already have a plan for this week. Open Meal plan on Home.")}</p>}
    </>
  );
}
