"use client";

import { StartPrompt } from "./_components/StartPrompt";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ADD_TO, ADDED_TO } from "@/lib/mm/addFood";
import { entryMeal, isSameLocalDay, LOG_MEAL_LABEL, LOG_MEALS, loggedGaps, loggedToday, mealBudget } from "@/lib/mm/budget";
import { PAYMENTS_ENABLED, SAMPLES_ENABLED } from "@/lib/mm/config";
import { dayHref, dayParam, loggedDayKeys, shortDate, weekOf } from "@/lib/mm/day";
import { needsPaywall } from "@/lib/mm/entitlements";
import { formatInt } from "@/lib/mm/format";
import { macroTargets } from "@/lib/mm/targets";
import { localeInfo } from "@/lib/mm/i18n";
import { deleteLogEntry, logStore, savedStore, updateSettings } from "@/lib/mm/stores";
import type { LogEntry } from "@/lib/mm/user-data";
import type { LogMeal } from "@/lib/mm/types";
import { AddFoodSheet } from "./_components/addfood/AddFoodSheet";
import { EntryAvatars, entryPicture, legacyImage, type EntryPicture } from "./_components/addfood/EntryPicture";
import { DayPicker } from "./_components/DayPicker";
import { HomeLabels } from "./_components/HomeLabels";
import { HOME_PAGE_NAMES, HomePages } from "./_components/HomePages";
import { HomeToday } from "./_components/HomeToday";
import { HomeWeek } from "./_components/HomeWeek";
import { useGate } from "./_components/Paywall";
import { RemindersSection } from "./_components/RemindersSection";
import { WaterCard } from "./_components/WaterCard";
import { ChevronRightIcon, FlameIcon, PlusIcon } from "./_components/icons";
import { PageHeader } from "./_components/PageHeader";
import { RecipeTools } from "./_components/RecipeTools";
import { Toast } from "./_components/Toast";
import { Button, Card, Spinner } from "./_components/ui";
import { useChainIndexes, useHydrated, useIsPro, useMenu, useNow, useSettings, useStore } from "./_lib/hooks";
import { useLanguage, useT } from "./_lib/i18n";

// Home is today (founder 2026-10-10). Founder 2026-10-14, from a reference picture: "Home" with a round button (a calendar, now a gear to Settings: founder 2026-10-16) and this week's days
// on top, then today's calories (a dial) beside protein, carbs and fat, then two cards, "Shopping list" and "My meals", then today's
// meals as rows (Breakfast, Lunch, Dinner) with what was eaten and a + to add more. The rows use SPEC §6.3: a logged item goes under the
// meal its time falls in (mealSlotFor), unless it was added from a row's + (founder 2026-10-15: the Add food sheet), when it stays in that row
// (budget.ts entryMeal); each meal's figure is its share of the day (mealBudget). Founder 2026-10-15,
// same picture again ("make the home page look absolutely identical"): its sizes and spacing, past days as dark circles, the dial with a
// grey centre, and carbs and fat with targets and bars too (worked out from calories and protein unless typed in Settings: targets.ts
// macroTargets). The picture's bodyweight card is left out (the app doesn't track weight) and Numbite's lime stays (founder's answers).
// Under the meals, "Water" (founder 2026-10-15): today's millilitres against the person's own goal, a small bottle and a + that opens "Add water" (WaterCard).
// Logging follows the real gate (needsPaywall("log"), lib/mm/entitlements.ts): on a build where it is paid (SPEC §7.8, NEXT_PUBLIC_PRO=1) a free user's + opens the
// paywall, Home shows the log card and the week and labels pages say their numbers come once you log; where logging is free (the paid tier alone, as in the 1.1
// In-App Purchase build: PAID_TIER_ONLY) none of that is shown, so Home never sells what + already does for free (the onboarding meeting, 2026-11-19).
// Each meal row shows up to two pictures of what was eaten (founder 2026-11-17, "use images please when possible"): the dish's, the recipe's or the
// product's, kept on the entry when it was logged (EntryPicture.tsx; older entries: the dish found by its name). One that doesn't load is left out.
// The colour meeting (19 November 2026, approved by the founder that day): the date itself is the calendar button (an ink chevron after it, 44 pt), which makes
// room at the top right for the Shopping list and the cog with its word (PageHeader); the week strip shows today in lime with its dark-green edge, a dot and the
// word "Today", the days gone by white with the control edge and a small ink dot when food was logged, the days ahead plain; the meal rows' icon wells are the
// page fill with an ink icon (never green beside a food figure); the log card's "See Premium" is a secondary button; what was added is said in the one toast.

export default function HomePage() {
  const t = useT();
  const language = useLanguage();
  const hydrated = useHydrated();
  const settings = useSettings();
  const pro = useIsPro();
  const menu = useMenu();
  const { gate, showPaywall } = useGate();
  const log = useStore(logStore);
  const savedOrders = useStore(savedStore);
  const now = useNow();
  // The + on a meal opens the Add food sheet for that meal; what it adds is offered back with an Undo for a few seconds.
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [addTo, setAddTo] = useState<LogMeal | null>(null);
  const [added, setAdded] = useState<{ entry: LogEntry; meal: LogMeal } | null>(null);
  const todays = log.filter((e) => isSameLocalDay(new Date(e.loggedAt), now));
  // only for entries logged before entries kept their picture: their dish is looked up in its chain's menu
  const indexes = useChainIndexes(todays.filter((e) => e.chainId && !e.image && !e.recipeId && !e.photo).map((e) => e.chainId));

  if (!hydrated) return <Spinner />;

  const profile = { goal: settings.goal, dailyCalories: settings.dailyCalories, glp1MealCap: settings.glp1MealCap, ...(settings.dailyProtein ? { dailyProtein: settings.dailyProtein } : {}) };
  const eaten = loggedToday(log, now);
  const gaps = loggedGaps(log, now);
  const targets = macroTargets(settings);
  const htmlLang = localeInfo(language).htmlLang;
  const narrow = new Intl.DateTimeFormat(htmlLang, { weekday: "narrow" });
  const longDay = new Intl.DateTimeFormat(htmlLang, { weekday: "long", day: "numeric", month: "long" });
  const loggedDays = loggedDayKeys(log);
  // whether logging is paid for this person on this build (the same check the + makes through gate("log"))
  const logPaid = needsPaywall("log", { pro });

  const pictureOf = (e: LogEntry): EntryPicture | undefined => entryPicture(e, legacyImage(e, indexes.get(e.chainId), savedOrders));
  const byMeal = (meal: LogMeal) => todays.filter((e) => entryMeal(e) === meal).sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));

  return (
    <div>
      {/* Today's date in short form, month first in English ("Oct 16": founder 2026-10-16), and itself the calendar button (colour meeting, 19 November 2026):
          pick any day to see its macros and meals (founder 2026-10-16). The page keeps its name "Home" for screen readers; the button's name starts with the date
          it shows ("Nov 20, Choose a day"), so a Voice Control user can say what they see. Then the shopping list, with how many things are left to pick up
          (founder 2026-11-19), and the Settings cog with its word at the far right (PageHeader: the same top right on every page). */}
      <PageHeader
        coach="home-top"
        list
        title={
          <>
            <span className="sr-only">{t("Home")}, </span>
            <button type="button" onClick={() => setPicking(true)} aria-haspopup="dialog" className="-ms-1 inline-flex min-h-11 max-w-full items-center gap-1 rounded-xl px-1 text-start transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <span className="whitespace-nowrap">{shortDate(now, htmlLang)}</span>
              <span className="sr-only">, {t("Choose a day")}</span>
              <ChevronRightIcon aria-hidden strokeWidth={2.4} className="h-5 w-5 shrink-0 rotate-90 text-ink rtl:scale-x-100!" />
            </button>
          </>
        }
      />
      {/* what Home is for, in one line (founder 2026-11-18: "everyone needs to understand the point for each screen") */}
      <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("Your food today: what you've eaten and what's left.")}</p>

      <ol aria-label={t("This week")} className="mt-4 grid grid-cols-7 gap-2 text-center">
        {weekOf(now).map((d) => {
          const today = isSameLocalDay(d, now);
          const future = !today && d > now;
          const logged = loggedDays.has(dayParam(d));
          const name = longDay.format(d);
          const label = today ? t("{day} (today)", { day: name }) : future ? name : logged ? t("{day}: food logged", { day: name }) : t("{day}: nothing logged", { day: name });
          // Today (the day Home shows) is lime with the 2 px dark-green edge, a dark-green figure and a dot (a lime day always carries its mark), with the word
          // "Today" under it; every day gone by is white with the 1.5 px edge of a control you can tap, and a small ink dot under it when food was logged; the
          // days ahead are plain, in the secondary grey (colour meeting, 19 November 2026). Screen readers hear all of it in the day's name.
          const look = today ? "border-2 border-on-sun bg-sun font-bold text-on-sun" : future ? "font-semibold text-muted" : "border-[1.5px] border-edge bg-card font-semibold text-foreground";
          const inner = (
            <>
              <span aria-hidden className="text-[0.8125rem] font-semibold leading-none text-muted">{narrow.format(d)}</span>
              {/* today's dot sits under its figure (the two centred together), so they never touch on a narrow phone */}
              <span aria-hidden className={`app-numbers flex aspect-square w-full max-w-12 flex-col items-center justify-center rounded-full text-[0.875rem] ${look}`}>
                <span className="leading-none">{d.getDate()}</span>
                {today && <span className="mt-[3px] h-[5px] w-[5px] rounded-full bg-on-sun" />}
              </span>
              <span aria-hidden className="flex h-4 items-center justify-center">
                {today ? (
                  <span className="whitespace-nowrap text-[0.8125rem] font-semibold leading-none text-foreground">{t("Today")}</span>
                ) : logged && !future ? (
                  <span data-logged-dot="" className="h-1.5 w-1.5 rounded-full bg-ink" />
                ) : null}
              </span>
            </>
          );
          return (
            <li key={dayParam(d)} className="min-w-0">
              {future ? (
                // the same box as the links (their padding included), so all seven circles share one baseline
                <span className="-mx-1 flex flex-col items-center gap-2 px-1 py-0.5">
                  {inner}
                  <span className="sr-only">{label}</span>
                </span>
              ) : (
                // every day up to today opens that day's page (founder 2026-10-16: "when they click the number at the top it shows what they got on that day");
                // the link reaches into the gap on each side so a narrow phone still gets a full-size tap target
                // (the spoken name is text inside the link, not an aria-label: the letter and number drawn above are the day's visible text, and an
                // aria-label that doesn't contain them is what axe's label-content-name-mismatch rule flags)
                <Link href={dayHref(d, now)} aria-current={today ? "date" : undefined} className="-mx-1 flex flex-col items-center gap-2 rounded-2xl px-1 py-0.5 transition active:scale-95">
                  {inner}
                  <span className="sr-only">{label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {SAMPLES_ENABLED && menu.chains.some((c) => c.sample) && (
        <p className="glass mt-4 rounded-2xl px-4 py-2.5 text-xs text-muted">{t("Showing fictional sample data for testing. Numbers are not real.")}</p>
      )}

      {/* the day's numbers as three pages you slide sideways, with three dots under them (founder 2026-11-19; the 20-person meeting): Today (the two dark cards,
          as before), Calories and protein this week, and Today: sugar, salt and fibre */}
      <HomePages
        now={now}
        pages={[
          { name: t(HOME_PAGE_NAMES.today), node: <><h2 className="sr-only">{t(HOME_PAGE_NAMES.today)}</h2><HomeToday calories={eaten.calories} target={settings.dailyCalories} targets={targets} eaten={eaten} /></> },
          { name: t(HOME_PAGE_NAMES.week), node: <HomeWeek log={log} now={now} target={settings.dailyCalories} logPaid={logPaid} htmlLang={htmlLang} /> },
          { name: t(HOME_PAGE_NAMES.labels), node: <HomeLabels log={log} now={now} logPaid={logPaid} /> },
        ]}
      />
      {/* the word "today" keeps it true under any of the pages */}
      {gaps.any && <p className="mt-3 px-1 text-sm leading-snug text-muted">{t("Some meals you added today have no protein, carbs or fat entered, so today's figures only count the rest.")}</p>}

      {logPaid && (
        <Card className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-4">
          <p className="min-w-[10rem] flex-1 text-base leading-snug">{t("Log your meals to see what's left today.")}</p>
          {/* "Premium", the one name on screen (the onboarding meeting, 19 November 2026; approved by the founder) */}
          <Button variant="secondary" onClick={() => showPaywall("log")}>
            {PAYMENTS_ENABLED ? t("Try Premium free") : t("See Premium")}
          </Button>
        </Card>
      )}

      <StartPrompt className="mt-3" />

      {!settings.hasSetTargets && !settings.dismissedTargetsCard && settings.hasCompletedOnboarding && (
        <Card className="mt-3 flex items-center justify-between gap-3 p-4">
          <Link href="/app/settings#targets" className="min-h-11 flex-1 font-medium">{t("Set your targets to see what's left today")}</Link>
          <button type="button" className="min-h-11 min-w-11 text-sm text-muted" onClick={() => updateSettings({ dismissedTargetsCard: true })} aria-label={t("Dismiss")}>{t("Dismiss")}</button>
        </Card>
      )}

      {/* the cooking tools between the day's numbers and the things below (founder 2026-11-19) */}
      <h2 className="sr-only">{t("Cooking")}</h2>
      <div className="mt-1"><RecipeTools /></div>

      {/* founder 2026-11-18: "I don't want My Meals anymore. I just want the option where they can scan food": no My meals on Home where the scanner is (the
          saved recipes and orders are still in Recipes › My recipes); the website, which has no scanner, keeps the My meals card */}

      <h2 className="mt-7 text-xl font-extrabold tracking-tight">{t("Today's meals")}</h2>
      <ul className="mt-3 space-y-3">
        {/* Breakfast, Lunch, Dinner, then Snacks (founder 2026-11-19): Snacks shows what was eaten there, with no share of the day of its own */}
        {LOG_MEALS.map((meal) => {
          const entries = byMeal(meal);
          const kcal = entries.reduce((s, e) => s + e.nutrients.calories, 0);
          const budget = meal === "snack" ? null : mealBudget(profile, 0, meal).budget;
          const title = t(LOG_MEAL_LABEL[meal]);
          // up to two different pictures (EntryAvatars leaves out one that doesn't load), then what was eaten by the names the person logged
          const pictures = entries.map(pictureOf).filter((p): p is EntryPicture => !!p);
          return (
            <li key={meal} className="glass flex min-w-0 items-center gap-3 rounded-[1.75rem] p-4">
              <Link href="/app/today" className="min-w-0 flex-1 break-words">
                <span className="flex items-center gap-1 text-lg font-extrabold leading-snug tracking-tight">{title}<ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 text-ink" /></span>
                <span className="mt-1.5 flex items-center gap-2">
                  {/* a page-fill well with an ink flame (colour meeting, 19 November 2026: lime is only for chosen and today, and green beside a food figure
                      would read as "good") */}
                  <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-fill text-ink"><FlameIcon className="h-[18px] w-[18px]" /></span>
                  <span className="app-numbers text-lg font-bold"><span className="whitespace-nowrap">{budget === null ? formatInt(kcal) : `${formatInt(kcal)} / ${formatInt(budget)}`}</span> <span className="text-sm font-semibold text-muted">kcal</span></span>
                </span>
                {/* Snacks has no share of the day of its own, so its "0 kcal" could read as "no snacks allowed" (the onboarding meeting's dietitian): one plain line
                    says where they come from (no constant changes: CLAUDE.md rule 8) */}
                {meal === "snack" && <span className="mt-1 block text-[0.9375rem] leading-snug text-muted">{t("Snacks come out of what's left")}</span>}
                {entries.length > 0 && (
                  <span className="mt-2.5 flex items-center gap-2.5">
                    <EntryAvatars pictures={pictures} />
                    <span className="line-clamp-2 min-w-0 text-[0.9375rem] leading-snug text-muted [overflow-wrap:anywhere]">{entries.map((e) => e.name).join(", ")}</span>
                  </span>
                )}
              </Link>
              <button type="button" data-coach={meal === LOG_MEALS[0] ? "home-add" : undefined} onClick={() => gate("log", () => setAddTo(meal))} aria-label={t(ADD_TO[meal])} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink transition active:scale-95 hover:bg-ink-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <PlusIcon className="h-6 w-6" />
              </button>
            </li>
          );
        })}
      </ul>

      <WaterCard now={now} guard={(go) => gate("log", go)} />

      <RemindersSection now={now} />

      <DayPicker open={picking} onClose={() => setPicking(false)} log={log} now={now} onPick={(d) => { setPicking(false); router.push(dayHref(d, now)); }} />

      <AddFoodSheet meal={addTo} onClose={() => setAddTo(null)} onAdded={(entry, meal) => { setAddTo(null); setAdded({ entry, meal }); }} />

      {added && (
        // The one toast (Toast.tsx), at the top, clear of the meal rows and their + buttons: a second tap on the same + must never land on Undo. A new key for
        // each thing added, so its time starts afresh.
        <Toast key={added.entry.id} onClose={() => setAdded(null)} onUndo={() => { deleteLogEntry(added.entry.id); setAdded(null); }}>
          {t(ADDED_TO[added.meal], { name: added.entry.name })}
        </Toast>
      )}
    </div>
  );
}
