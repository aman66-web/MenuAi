"use client";

import { warnPreferences } from "@/lib/mm/user-data";
import { useEffect, useMemo, useState } from "react";
import { assetUrl, GATING_ENABLED } from "@/lib/mm/config";
import { EXAMPLE_MEALS, exampleWeek, knownExample, shopExample, type ExampleMeal, type ShopExample } from "@/lib/mm/exampleWeek";
import { formatDate } from "@/lib/mm/format";
import { retailerName } from "@/lib/mm/groceries";
import { localeInfo, tk } from "@/lib/mm/i18n";
import { showsWeekAfter } from "@/lib/mm/mealPlan";
import { previewShop } from "@/lib/mm/planPreview";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { BasketIcon, ListIcon } from "../_components/icons";
import { PremiumBadge } from "../_components/PremiumBadge";
import { TwoWeeks } from "../plan/TwoWeeks";
import { MEAL_LOOK } from "../recipes/RecipeTile";
import { useIsPro, useSettings } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { loadShopFile, useShopManifest } from "../_lib/shopProducts";
import { ShowcaseWindow } from "./ShowcaseWindow";

// Your plan's week as a picture timetable: Monday to Sunday as rows, breakfast, lunch and dinner as columns of our own recipes' pictures (CLAUDE.md rule 2).
// It is an EXAMPLE of Meal plan, never a week worked out for the person (founder, 20 November 2026: "We shouldn't calculate the meal plan. This should just be
// an example of their meal plan, showing ... how it works ... because it depends if you want to make it a premium feature"; until then it was the real week
// from their shop, sized to their numbers and priced, which gave Meal plan away). So: no calories a day, nothing sized to them, nothing saved; only recipes
// that suit their diet and allergies (lib/mm/exampleWeek.ts). Headed "Meal plan" with the one Premium badge where Premium is sold, and "An example of what you can make." under
// it; then two small cards for what Meal plan does with it: one shopping list, the shop's own prices.
// Under the timetable, what that example's shopping comes to at their recipe shop (founder, 20 November 2026, about 21:55: "week one cost and then the week
// afterwards costs, and explain it to them ... they need to understand that we are helping them save a lot of money"): "Your first shop: about £…", "Each week
// after: about £…", two of its long-lasting things (app/app/plan/TwoWeeks.tsx, as Meal plan says it), and the shop's shelf-price line. Worked out on the phone
// after the screen shows (shopExample: our recipes priced at the shop in chunks, kept by shop and diet), the example then chosen from only what that shop can
// make. Until it is ready, page-fill bars where the two lines will be (no digits, no shimmer, never over the pictures); offline, under 18, with no shop, or
// when the shop can't make a meal: the book's example, no price.

const COLUMN: Readonly<Record<ExampleMeal, string>> = { breakfast: tk("Breakfast"), lunch: tk("Lunch"), dinner: tk("Dinner") };

/** One picture of the timetable: our recipe's illustration, or its meal's drawing on the page fill. */
function Thumb({ recipeId, meal }: { recipeId: string; meal: ExampleMeal }) {
  const [failed, setFailed] = useState(false);
  const src = RECIPE_IMAGES[recipeId];
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- our own recipe's illustration, a static file named by its hash
    return <img src={assetUrl(src)} alt="" width={160} height={160} loading="lazy" decoding="async" onError={() => setFailed(true)} className="aspect-square w-full rounded-xl bg-fill object-cover" />;
  }
  const Icon = (MEAL_LOOK[meal] ?? MEAL_LOOK.dinner).Icon;
  return <span className="grid aspect-square w-full place-items-center rounded-xl bg-fill text-muted"><Icon className="h-6 w-6" /></span>;
}

const GRID = "grid grid-cols-[2.5rem_repeat(3,minmax(0,1fr))] items-center gap-x-1.5";

/**
 * The example priced at the person's recipe shop (lib/mm/exampleWeek.ts shopExample), worked out after the screen shows: `working` while it is (only when there
 * is a shop to price at), then the example, or null (offline, or the shop can't make one of the meals). Never for an under-18.
 */
function useShopExample(under18: boolean, diet: Parameters<typeof shopExample>[1], ticked: readonly string[] | undefined): { working: boolean; example: ShopExample | null } {
  const manifest = useShopManifest();
  const shop = !under18 && manifest ? previewShop(manifest, ticked).shop : null;
  const key = shop ? JSON.stringify([shop, diet]) : "";
  const [done, setDone] = useState<{ key: string; example: ShopExample | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    const [id, d] = JSON.parse(key) as [string, typeof diet];
    if (knownExample(id, d) !== undefined) return;
    let live = true;
    void shopExample(id, d, { load: loadShopFile }).then((example) => { if (live) setDone({ key, example }); });
    return () => { live = false; };
  }, [key]);
  if (!shop) return { working: false, example: null };
  // already worked out while the app is open (Change on Your plan, or the replay): straight away, no bars
  const known = knownExample(shop, diet);
  if (known !== undefined) return { working: false, example: known };
  return done?.key === key ? { working: false, example: done.example } : { working: true, example: null };
}

/** What the example's shopping comes to at the person's shop (TwoWeeks: the first shop, each week after, why), and whose prices they are. */
function ExampleCosts({ example }: { example: ShopExample }) {
  const t = useT();
  return (
    <div className="mt-4">
      <TwoWeeks costs={example.costs} week={example.week} things={2} />
      <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">{t("Prices are {shop}'s shelf prices, checked {date}, and vary by store.", { shop: retailerName(example.shop), date: formatDate(example.checkedOn, t) })}</p>
    </div>
  );
}

/** Your plan's example week. `under18`: no week (the words-only line). `planLine`: the replay's line for someone who already has a plan this week. */
export function WeekShowcase({ under18 = false, planLine = false }: { under18?: boolean; planLine?: boolean }) {
  const t = useT();
  const settings = useSettings();
  const isPro = useIsPro();
  const premium = GATING_ENABLED && !isPro;
  const language = useLanguage();
  // the example suits what the person just told us (founder 2026-11-21: a vegan was shown chicken korma once sign-up answers stopped being filters): a preview,
  // nothing in the app is hidden
  const told = useMemo(() => warnPreferences(settings), [settings]);
  const book = useMemo(() => exampleWeek(told), [told]);
  const priced = useShopExample(under18, told, settings.shops);
  const week = priced.example?.days ?? book;
  const dayName = (i: number, weekday: "short" | "long") => new Intl.DateTimeFormat(localeInfo(language).htmlLang, { weekday }).format(new Date(2026, 10, 16 + i, 12)); // 16 November 2026 was a Monday
  const empty = week.every((d) => d.meals.length === 0);

  return (
    <>
      <ShowcaseWindow kind="week">
        {under18 || empty ? (
          <p className="text-[0.9375rem] leading-snug text-foreground">{t("Meal plan makes your week from your shop, with one shopping list.")}</p>
        ) : (
          <>
            {/* plainly an example, not the person's plan (founder 2026-11-21: "This should say example plan and show a photo of a phone screen so they know it's
                not their plan") */}
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[1.125rem] font-bold leading-tight">{t("Example plan")}</h2>
                <p className="mt-0.5 text-[0.9375rem] leading-snug text-muted">{t("What Meal plan could make you.")}</p>
              </div>
              {premium && <PremiumBadge />}
            </div>
            {/* for a screen reader, the week in words; the picture grid below is for the eye */}
            <ul className="sr-only">
              {week.map((d, i) => (
                <li key={i}>{t("{day}: {meals}.", { day: dayName(i, "long"), meals: d.meals.map((m) => t(m.name)).join(", ") })}</li>
              ))}
            </ul>
            {/* the week as a picture of the app on a phone: a dark frame, a rounded screen with the camera's pill, Meal plan's own heading, the first days, and
                the rest fading out below as a screenshot would */}
            <div aria-hidden className="mx-auto w-full max-w-[18.5rem]">
              <div className="rounded-[2.5rem] bg-ink p-2 shadow-[var(--card-shadow)]">
                <div className="relative h-[25rem] overflow-hidden rounded-[2rem] bg-background px-3 pt-8">
                  <span className="absolute left-1/2 top-2.5 h-[1.1rem] w-[4.5rem] -translate-x-1/2 rounded-full bg-ink" />
                  <p className="mb-2 text-[1rem] font-[800] leading-tight">{t("Meal plan")}</p>
                  <div className={`${GRID} pb-1.5 text-[0.75rem] font-semibold leading-tight text-muted`}>
                    <span />
                    {EXAMPLE_MEALS.map((c) => <span key={c} className="truncate text-center">{t(COLUMN[c])}</span>)}
                  </div>
                  <div className="space-y-1.5">
                    {week.map((d, i) => (
                      <div key={i} className={GRID}>
                        <span className="text-[0.8125rem] font-bold">{dayName(i, "short")}</span>
                        {EXAMPLE_MEALS.map((c) => {
                          const m = d.meals.find((x) => x.meal === c);
                          return m ? <Thumb key={c} recipeId={m.recipeId} meal={c} /> : <span key={c} className="aspect-square w-full rounded-xl bg-card" />;
                        })}
                      </div>
                    ))}
                  </div>
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
                </div>
              </div>
            </div>
            {priced.working ? (
              <div aria-hidden className="mt-4 space-y-2">
                <span className="block h-4 w-7/12 rounded-md bg-background" />
                <span className="block h-4 w-1/2 rounded-md bg-background" />
              </div>
            ) : priced.example && showsWeekAfter(priced.example.costs) && <ExampleCosts example={priced.example} />}
            {/* what Meal plan does with a week, as two small cards (one a row at the largest text sizes) */}
            <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3">
              <li className="flex min-h-14 items-center gap-2.5 rounded-[1.25rem] border border-line bg-card px-3.5 py-2.5 text-[1rem] font-bold leading-snug">
                <ListIcon aria-hidden className="h-6 w-6 shrink-0 text-accent" /><span className="min-w-0">{t("1 shopping list")}</span>
              </li>
              <li className="flex min-h-14 items-center gap-2.5 rounded-[1.25rem] border border-line bg-card px-3.5 py-2.5 text-[1rem] font-bold leading-snug">
                <BasketIcon aria-hidden className="h-6 w-6 shrink-0 text-accent" /><span className="min-w-0">{t("Your shop's prices")}</span>
              </li>
            </ul>
          </>
        )}
      </ShowcaseWindow>
      {planLine && <p className="mt-3 text-[0.9375rem] font-semibold leading-snug text-foreground">{t("You already have a plan for this week. Open Meal plan on Home.")}</p>}
    </>
  );
}
