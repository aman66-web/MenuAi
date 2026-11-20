"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { dayHref, dayParam, dayTitle, parseDayParam, stepDay } from "@/lib/mm/day";
import { localeInfo } from "@/lib/mm/i18n";
import { ADD_TO, ADDED_TO } from "@/lib/mm/addFood";
import { entryMeal, loggedGaps, loggedToday, isSameLocalDay, LOG_MEALS, LOG_MEAL_LABEL, mealBudget } from "@/lib/mm/budget";
import { needsPaywall } from "@/lib/mm/entitlements";
import { formatCalories, formatGrams, formatInt } from "@/lib/mm/format";
import { macroTargets } from "@/lib/mm/targets";
import { deleteLogEntry, logStore, moveLogEntry, restoreLogEntry, savedStore, setLogPortion } from "@/lib/mm/stores";
import { halves, PORTIONS, withPortion, type LogEntry } from "@/lib/mm/user-data";
import type { LogMeal } from "@/lib/mm/types";
import { AddFoodSheet } from "../_components/addfood/AddFoodSheet";
import { EatenThumb, entryPicture, legacyImage } from "../_components/addfood/EntryPicture";
import { DayPicker } from "../_components/DayPicker";
import { useGate } from "../_components/Paywall";
import Link from "next/link";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, TrashIcon } from "../_components/icons";
import { Gauge } from "../_components/Gauge";
import { DARK_CARD, MacroRow, ON_DARK, PAIR } from "../_components/HomeToday";
import { PageHeader } from "../_components/PageHeader";
import { PremiumBadge } from "../_components/PremiumBadge";
import { Toast } from "../_components/Toast";
import { Button, Card, ChoiceMark, EmptyState, Sheet } from "../_components/ui";
import { useChainIndexes, useHydrated, useIsPro, useNow, useSettings, useStore } from "../_lib/hooks";
import { useLanguage, useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// SPEC §7.8, reached from Home's "today" card. Where logging is paid for this person (needsPaywall("log"), as Home's + checks: a NEXT_PUBLIC_PRO=1 build
// without Pro): explainer + the paywall. Otherwise (Pro, or a build where logging is free, as the 1.1 In-App Purchase one): totals against targets and the day's entries.
// Look (founder 2026-10-15, "the rest of the app should match [Home's] elegance"): one summary card in Home's voice (Home's calories dial,
// the figures in a regular weight with the eaten one in the accent, then Home's protein, carbs and fat rows with their targets and thin
// bars, so the same day reads the same on both screens), then what was eaten under Breakfast, Lunch and Dinner (SPEC §6.3 mealSlotFor,
// or the row an entry was added to from Home's +, as on Home: budget.ts entryMeal), each entry with its picture (founder 2026-11-17, "use images
// please when possible"): the dish's, the recipe's or the product's, kept on the entry when it was logged (EntryPicture.tsx; older entries: the
// dish found by its name), else, or when it doesn't load, a plain fork tile (the basket for a product).
// Any day (founder 2026-10-16: "they can find any day and click on it and see their macros and what they ate on that day"): the page is a static shell that reads
// ?d=YYYY-MM-DD (like /app/chain?id=), reached from Home's calendar and week circles; a missing, bad or future date is today. A past day shows that day's figures and
// meals measured against the person's current targets (the app keeps no target history), with Previous day / Next day and a Today shortcut.
// Adding from here (2026-11-17): on today all three meals are always shown, each with one "Add to …" control that opens Home's Add food sheet, and an
// "Added … to Lunch." line with Undo at the top, as on Home. Past days stay read-only: only meals with entries, no add controls. Times read on the app's own
// clock (en-GB "08:05").
// The colour meeting (19 November 2026, approved by the founder that day): the day's numbers are Home's own ink cards (HomeToday.tsx's pieces), "1,580 left" in
// the dial with "420 eaten" in lime, protein, carbs and fat with "18 g over" in words; the locked preview is a small picture of those cards; the bin says
// "Remove" in a 44 px target; every confirmation is the one toast.
// The 30-person audit (20 November 2026):
// - the title is the day as Home writes it ("Thu, Nov 19") and itself the calendar button (DayPicker), so any day is two taps away; on today Next day is gone;
// - a past day says what was eaten against the target ("1,100 eaten of 2,000 kcal", "120 over"), never "left"; a past day with nothing logged shows only "Nothing
//   logged on this day on this phone." (only two days sync, so a new phone has none), with no cards of zeros and no Pip;
// - each meal has one add control, the "+ Add to …" pill under it, and its heading shows its share of the day as Home does ("220 / 500 kcal"; a plain figure
//   on past days);
// - one bottom toast at a time (moving, changing an amount or removing replaces the last), removing several in a row is one "Removed 2 foods." with an Undo
//   for all; after Remove the focus goes to Undo, after Undo to the food back in its meal, after Move to the food in its new meal (never dropped to the page).

export default function TodayPage() {
  return (
    <Suspense fallback={null}>
      <TodayScreen />
    </Suspense>
  );
}

/** The bottom toast: a food moved or changed (a sentence), or the foods removed while it shows (one Undo brings them all back). */
type BottomToast = { kind: "said"; text: string; n: number } | { kind: "removed"; entries: LogEntry[]; n: number; after: FocusTarget };
/** Where the focus goes: a food's Change button, else its meal's heading. */
type FocusTarget = { id?: string; meal: LogMeal };

function TodayScreen() {
  const hydrated = useHydrated();
  const t = useT();
  const router = useRouter();
  const htmlLang = localeInfo(useLanguage()).htmlLang;
  const timeFormat = new Intl.DateTimeFormat(htmlLang, { hour: "2-digit", minute: "2-digit" });
  const pro = useIsPro();
  // the same gate as Home's + (lib/mm/entitlements.ts): where logging is free, Today is open to everyone
  const logPaid = needsPaywall("log", { pro });
  const { showPaywall } = useGate();
  const settings = useSettings();
  const log = useStore(logStore);
  const now = useNow();
  const day = parseDayParam(useSearchParams().get("d"), now);
  const isToday = dayParam(day) === dayParam(now);
  // Home's Add food sheet, opened for the meal tapped; what it adds is offered back in the toast at the top with an Undo (as on Home).
  const [addTo, setAddTo] = useState<LogMeal | null>(null);
  const [added, setAdded] = useState<{ entry: LogEntry; meal: LogMeal } | null>(null);
  const [picking, setPicking] = useState(false);
  const todays = log.filter((e) => isSameLocalDay(new Date(e.loggedAt), day)).sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
  const saved = useStore(savedStore);
  // only for entries logged before entries kept their picture: their dish is looked up in its chain's menu
  const indexes = useChainIndexes(!logPaid ? todays.filter((e) => e.chainId && !e.image && !e.recipeId && !e.photo).map((e) => e.chainId) : []);

  // a food put under the wrong meal moves to another, or its amount changes (usability test 2026-11-19); said in the one bottom toast
  const [moving, setMoving] = useState<LogEntry | null>(null);
  const [bottom, setBottom] = useState<BottomToast | null>(null);
  // where the keyboard and VoiceOver focus goes once the page has drawn the change
  const [focus, setFocus] = useState<(FocusTarget & { n: number }) | null>(null);
  useEffect(() => {
    if (!focus) return;
    const change = focus.id ? document.querySelector<HTMLElement>(`[data-change-for="${CSS.escape(focus.id)}"]`) : null;
    (change ?? document.getElementById(`today-${focus.meal}`))?.focus();
  }, [focus]);
  const focusOn = (target: FocusTarget) => setFocus((was) => ({ ...target, n: (was?.n ?? 0) + 1 }));

  if (!hydrated) return null;

  if (logPaid) {
    return (
      <div>
        <PageHeader back={{ href: "/app", label: t("Back to home") }} />
        <h1 className="mt-5 text-[1.75rem] font-[800] leading-none tracking-[-0.02em]">{t("Today's meals")}</h1>
        <Card className="mt-5 overflow-hidden p-5">
          {/* A small picture of the Premium screen, Home's ink numbers cards (no numbers: nothing here is a real figure). */}
          <div aria-hidden className={`${DARK_CARD} mb-5 flex items-center gap-5 p-4`} style={ON_DARK}>
            <Gauge id="today-preview" label="" fraction={0.68} size={84} stroke={12} wide />
            <div className="flex-1 space-y-4">
              <div className="h-2 w-4/5 rounded-full bg-ring-track"><div className="h-full w-3/5 rounded-full bg-sun" /></div>
              <div className="h-2 w-3/5 rounded-full bg-ring-track"><div className="h-full w-2/5 rounded-full bg-sun" /></div>
              <div className="h-2 w-2/3 rounded-full bg-ring-track"><div className="h-full w-1/2 rounded-full bg-sun" /></div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-xl font-[800] leading-snug tracking-[-0.01em]"><Rich text={t("Keep track of what you eat {today}")} values={{ today: <span className="serif-em pe-0.5">{t("today")}</span> }} /></p>
            <PremiumBadge />
          </div>
          <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{t("Log a meal from any order and see your calories and protein against your targets, so you always know what's left.")}</p>
          {/* the one name on the button, as on Home's card (the 30-person audit: "Try Premium free" there and here, "See Premium" elsewhere) */}
          <Button className="mt-4" onClick={() => showPaywall("log")}>{t("See Premium")}</Button>
        </Card>
      </div>
    );
  }

  const totals = loggedToday(log, day);
  const gaps = loggedGaps(log, day);
  const calFraction = Math.min(1, Math.max(0, totals.calories / settings.dailyCalories));
  const targets = macroTargets(settings);
  // what's left, from the figure shown, so eaten and left add up to the target exactly (as on Home)
  const shownKcal = Math.round(totals.calories);
  const overKcal = shownKcal > settings.dailyCalories;
  const leftN = formatInt(overKcal ? shownKcal - settings.dailyCalories : settings.dailyCalories - shownKcal);
  const leftWords = overKcal ? t("{n} over", { n: leftN }) : t("{n} left", { n: leftN });
  // Scan your food estimates (CLAUDE.md rule 1's one exception) are counted in the day's figures, and the card says so
  const estimates = todays.filter((e) => e.estimate === true).length;
  const profile = { goal: settings.goal, dailyCalories: settings.dailyCalories, glp1MealCap: settings.glp1MealCap, ...(settings.dailyProtein ? { dailyProtein: settings.dailyProtein } : {}) };
  // a day gone by is what was eaten against the target, never "left" (nothing more can be eaten on it)
  const spoken = isToday
    ? t("{eaten} of {target} kcal, {left}", { eaten: formatInt(shownKcal), target: formatInt(settings.dailyCalories), left: leftWords })
    : overKcal
      ? t("{eaten} of {target} kcal, {left}", { eaten: formatInt(shownKcal), target: formatInt(settings.dailyCalories), left: leftWords })
      : t("{eaten} of {target} kcal", { eaten: formatInt(shownKcal), target: formatInt(settings.dailyCalories) });
  const emptyPast = !isToday && todays.length === 0;

  /** "½ portion", "1 portion", "1½ portions" (one portion or less is "portion": usability test 2026-11-19, "½ portions" read wrong). */
  const portionWords = (n: number) => (n === 1 ? t("1 portion") : n < 1 ? t("{n} portion", { n: halves(n) }) : t("{n} portions", { n: halves(n) }));

  function portionTo(entry: LogEntry, portion: number) {
    setLogPortion(entry.id, portion);
    setMoving(null);
    setBottom((was) => ({ kind: "said", text: t("Changed “{name}” to {amount}.", { name: entry.name, amount: portionWords(portion) }), n: (was?.n ?? 0) + 1 }));
  }

  function moveTo(entry: LogEntry, meal: LogMeal) {
    moveLogEntry(entry.id, meal);
    setMoving(null);
    setBottom((was) => ({ kind: "said", text: t("Moved “{name}” to {meal}.", { name: entry.name, meal: t(LOG_MEAL_LABEL[meal]) }), n: (was?.n ?? 0) + 1 }));
    // the focus follows the food to its new meal (its Change button there)
    focusOn({ id: entry.id, meal });
  }

  function remove(entry: LogEntry) {
    // if the focus has to come back to the page later: the next food in the same meal, else that meal's heading
    const meal = entryMeal(entry);
    const list = byMeal(meal);
    const next = list[list.findIndex((e) => e.id === entry.id) + 1] ?? list[list.findIndex((e) => e.id === entry.id) - 1];
    deleteLogEntry(entry.id);
    setBottom((was) => ({
      kind: "removed",
      entries: was?.kind === "removed" ? [...was.entries, entry] : [entry],
      n: (was?.n ?? 0) + 1,
      after: next ? { id: next.id, meal } : { meal },
    }));
  }

  function undoRemoved(entries: LogEntry[]) {
    for (const e of entries) restoreLogEntry(e);
    setBottom(null);
    focusOn({ id: entries[0]!.id, meal: entryMeal(entries[0]!) });
  }

  const byMeal = (meal: LogMeal) => todays.filter((e) => entryMeal(e) === meal);
  const addPill = (meal: LogMeal) => (
    // the one add control a meal has (the 30-person audit: there were two), ink, a compact pill so three of them in view don't shout
    <button type="button" onClick={() => setAddTo(meal)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-base font-bold text-on-ink transition active:scale-[0.97] hover:bg-ink-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <PlusIcon aria-hidden className="h-5 w-5" />
      {t(ADD_TO[meal])}
    </button>
  );

  return (
    <div>
      <PageHeader back={{ href: "/app", label: t("Back to home") }} />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        {/* the day as Home writes it, and itself the calendar button (as Home's date is): any day is two taps away */}
        <h1 className="min-w-0 text-[1.75rem] font-[800] leading-none tracking-[-0.02em]">
          {/* as wide as its words (its -4 px start margin included), so "Today's meals" never wraps for want of 4 px */}
          {/* the heading's name stays just the day ("Today's meals", "Thu, Nov 19"); "Choose a day" is the button's description, heard after it */}
          <button type="button" onClick={() => setPicking(true)} aria-haspopup="dialog" aria-describedby="today-choose-day" className="-ms-1 inline-flex min-h-11 max-w-[calc(100%+0.25rem)] items-center gap-1 rounded-xl px-1 text-start transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <span className="min-w-0">{isToday ? t("Today's meals") : dayTitle(day, htmlLang)}</span>
            <ChevronRightIcon aria-hidden strokeWidth={2.4} className="h-6 w-6 shrink-0 rotate-90 text-ink rtl:scale-x-100!" />
          </button>
          <span id="today-choose-day" hidden>{t("Choose a day")}</span>
        </h1>
        {!isToday && <Link href="/app/today" replace className={`${DAY_PILL} px-4`}>{t("Today")}</Link>}
      </div>
      <DayNav day={day} now={now} />

      {emptyPast ? (
        // a day with nothing on it: no cards of zeros, no "left", no Pip; "on this phone", since only the last two days sync (a new phone has none before)
        <div className="mt-5">
          <EmptyState icon={<CalendarIcon />} title={t("Nothing logged on this day on this phone.")} />
        </div>
      ) : (
        <>
          {/* The day's numbers on Home's own ink cards: the dial says what's left today ("1,580 left", or "120 over" in the same words and weight, never a
              colour), and what was eaten on a day gone by; then protein, carbs and fat in their fixed order with "18 g over" in words. Stacked at large text. */}
          <div className={`app-numbers mt-5 ${PAIR}`} style={ON_DARK}>
            <div className={`${DARK_CARD} flex min-h-[14.25rem] min-w-0 flex-col items-center justify-between gap-4 px-4 pb-4 pt-4 text-center`}>
              <p className="self-start text-[0.8125rem] font-semibold leading-snug text-on-ink-2">{t("Calories")}</p>
              <Gauge id="today" label={isToday ? t("Calories used today") : t("Calories")} fraction={calFraction} size={112} stroke={13} wide valueText={spoken}>
                <span aria-hidden className="flex max-w-[4.75rem] flex-col items-center text-center text-[14px] font-semibold leading-tight">
                  {isToday || overKcal ? (
                    <Rich text={overKcal ? t("{n} over") : t("{n} left")} values={{ n: <span className="block text-[22px] font-[800] leading-none tracking-tight">{leftN}</span> }} />
                  ) : (
                    <Rich text={t("{n} eaten")} values={{ n: <span className="block text-[22px] font-[800] leading-none tracking-tight">{formatInt(shownKcal)}</span> }} />
                  )}
                </span>
              </Gauge>
              <div>
                <p className="text-[1.0625rem] font-semibold leading-tight text-sun [overflow-wrap:anywhere]">{t("{n} eaten", { n: formatInt(shownKcal) })}</p>
                <p className="mt-1 text-[0.9375rem] leading-tight [overflow-wrap:anywhere]">{t("of {n} kcal", { n: formatInt(settings.dailyCalories) })}</p>
                {estimates > 0 && <p className="mt-1.5 text-[0.8125rem] leading-snug text-on-ink-2">{estimates === 1 ? t("Includes 1 estimate") : t("Includes {n} estimates", { n: estimates })}</p>}
              </div>
            </div>
            <div className={`${DARK_CARD} flex min-w-0 flex-col justify-center gap-5 px-4 py-5`}>
              <MacroRow onDark label={t("Protein")} eaten={totals.protein} target={targets.protein} />
              <MacroRow onDark label={t("Carbs")} eaten={totals.carbs} target={targets.carbs} />
              <MacroRow onDark label={t("Fat")} eaten={totals.fat} target={targets.fat} />
            </div>
          </div>
          {/* a restaurant that publishes calories only is not "not entered": both ways a food can lack them are named */}
          {gaps.any && (
            <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">
              {isToday
                ? t("Some foods today don't have every figure (typed in without them, or from a restaurant that publishes calories only), so protein, carbs and fat count only the foods that have them.")
                : t("Some foods on this day don't have every figure (typed in without them, or from a restaurant that publishes calories only), so protein, carbs and fat count only the foods that have them.")}
            </p>
          )}
          {!isToday && <p className="mt-3 px-1 text-[0.9375rem] leading-snug text-muted">{t("These totals use your current targets.")}</p>}

          <div className="mt-5 space-y-3.5">
            {LOG_MEALS.map((meal) => {
              const entries = byMeal(meal);
              // today shows every meal so each has its "Add to …"; a past day shows only the meals with something in them
              if (!isToday && entries.length === 0) return null;
              const kcal = entries.reduce((s, e) => s + e.nutrients.calories, 0);
              // today: the meal's share of the day, as on Home (Snacks has none of its own); a past day: what was eaten
              const budget = isToday && meal !== "snack" ? mealBudget(profile, 0, meal).budget : null;
              return (
                <section key={meal} aria-labelledby={`today-${meal}`} className="glass overflow-hidden rounded-[1.25rem]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pb-1 pt-3">
                    <h2 id={`today-${meal}`} tabIndex={-1} className="text-lg font-[800] leading-snug tracking-[-0.01em] outline-none">{t(LOG_MEAL_LABEL[meal])}</h2>
                    {budget !== null ? (
                      <span className="app-numbers shrink-0 text-[0.9375rem] font-semibold text-muted">
                        <span aria-hidden className="whitespace-nowrap">{formatInt(kcal)} / {formatInt(budget)} kcal</span>
                        <span className="sr-only">{t("{eaten} of {target} kcal", { eaten: formatInt(kcal), target: formatInt(budget) })}</span>
                      </span>
                    ) : entries.length > 0 ? (
                      <span className="app-numbers shrink-0 whitespace-nowrap text-[0.9375rem] font-semibold text-muted">{formatCalories(kcal)}</span>
                    ) : null}
                  </div>
                  {entries.length > 0 && (
                    <ul className="divide-y divide-line">
                      {entries.map((e) => (
                        <li key={e.id} className="@container flex items-center gap-3.5 px-4 py-3">
                          {/* the picture steps aside when the row is narrow (large text), so the name and figures keep their room */}
                          <span className="hidden shrink-0 @[18rem]:block"><EatenThumb picture={entryPicture(e, legacyImage(e, indexes.get(e.chainId), saved))} product={e.source === "product"} /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-bold leading-snug [overflow-wrap:anywhere]">{e.name}{e.portion ? <> <span className="whitespace-nowrap font-semibold text-muted">· {portionWords(e.portion)}</span></> : null}</p>
                            <p className="mt-0.5 text-[0.875rem] leading-snug text-muted">{timeFormat.format(new Date(e.loggedAt))}{e.chainName ? ` · ${e.chainName}` : ""}</p>
                            {/* typed numbers may leave protein out: then only the calories are shown, never a 0; each figure keeps its own words on one line */}
                            {e.nutrients.protein === undefined ? (
                              <p className="app-numbers mt-1.5 whitespace-nowrap font-mono text-[0.8125rem] font-normal text-muted">{formatCalories(e.nutrients.calories)}</p>
                            ) : (
                              <p className="app-numbers mt-1.5 font-mono text-[0.8125rem] font-normal text-muted" aria-label={t("{calories} calories, {protein} grams protein", { calories: Math.round(e.nutrients.calories), protein: Math.round(e.nutrients.protein) })}>
                                <span className="whitespace-nowrap">{formatCalories(e.nutrients.calories)}</span> · <span className="whitespace-nowrap">{t("{protein} protein", { protein: formatGrams(e.nutrients.protein) })}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-stretch gap-1.5 @[26rem]:flex-row @[26rem]:items-center">
                            <Button data-change-for={e.id} variant="secondary" aria-label={t("Change {name}", { name: e.name })} onClick={() => setMoving(e)} className="px-3.5 text-[0.875rem]">
                              {t("Change")}
                            </Button>
                            {/* the bin with its word (usability: George missed the small grey bin), in a 44 px target; Undo in the toast */}
                            <Button variant="secondary" aria-label={t("Remove {name}", { name: e.name })} onClick={() => remove(e)} className="gap-1 ps-3 pe-3.5 text-[0.875rem]">
                              <TrashIcon aria-hidden className="h-[18px] w-[18px] shrink-0 text-ink" />{t("Remove")}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isToday ? (
                    <div className={`px-4 pb-4 ${entries.length > 0 ? "pt-1" : "pt-2"}`}>
                      {addPill(meal)}
                    </div>
                  ) : (
                    <div className="pb-1" />
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      <AddFoodSheet meal={addTo} onClose={() => setAddTo(null)} onAdded={(entry, meal) => { setAddTo(null); setAdded({ entry, meal }); }} />
      <DayPicker open={picking} onClose={() => setPicking(false)} log={log} now={now} onPick={(d) => { setPicking(false); router.replace(dayHref(d, now)); }} />

      {/* how much it was, and which meal it belongs to (usability test 2026-11-19: George logged the wrong amount and the wrong meal, and could only delete it) */}
      <Sheet open={moving !== null} onClose={() => setMoving(null)} title={moving ? t("Change “{name}”", { name: moving.name }) : ""}>
        {moving && (
          <div className="pb-2">
            <h3 className="text-[1.0625rem] font-bold">{t("How much did you have?")}</h3>
            <div role="group" aria-label={t("How much did you have?")} className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,6.5rem),1fr))] gap-2">
              {PORTIONS.map((n) => {
                const on = (moving.portion ?? 1) === n;
                return (
                  <button key={n} type="button" aria-pressed={on} onClick={() => portionTo(moving, n)}
                    className={`flex min-h-14 items-center justify-center gap-2 rounded-[1rem] border-[1.5px] px-2 py-1.5 text-center transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]" : "border-edge bg-card text-foreground hover:bg-background"}`}>
                    <ChoiceMark on={on} />
                    <span className="flex flex-col items-center">
                      <span className="whitespace-nowrap text-[0.9375rem] font-bold">{portionWords(n)}</span>
                      <span className={`app-numbers whitespace-nowrap text-[0.8125rem] ${on ? "" : "text-muted"}`}>{formatCalories(withPortion(moving, n).nutrients.calories)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <h3 className="mt-6 text-[1.0625rem] font-bold">{t("Move to another meal")}</h3>
            <div className="mt-2.5 space-y-2.5">
              {LOG_MEALS.filter((m) => m !== entryMeal(moving)).map((m) => (
                <Button key={m} full variant="secondary" className="min-h-14 text-lg" onClick={() => moveTo(moving, m)}>{t("Move to {meal}", { meal: t(LOG_MEAL_LABEL[m]) })}</Button>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      {/* One toast at the foot of the screen at a time: a move or a change replaces a removal's, and the other way round. Removing more while it shows adds to
          it ("Removed 2 foods."), and its Undo brings them all back. The focus goes to its Undo, and back to the page if it closes while there. */}
      {bottom?.kind === "said" && <Toast key={bottom.n} onClose={() => setBottom(null)}>{bottom.text}</Toast>}
      {bottom?.kind === "removed" && (
        <Toast
          key={bottom.n}
          duration={10000}
          focusUndo
          onClose={() => {
            const was = bottom.after;
            const inToast = !!document.activeElement?.closest("[data-toast-host]");
            setBottom(null);
            if (inToast) focusOn(was);
          }}
          onUndo={() => undoRemoved(bottom.entries)}
        >
          {bottom.entries.length === 1 ? t("Removed “{name}”.", { name: bottom.entries[0]!.name }) : t("Removed {n} foods.", { n: bottom.entries.length })}
        </Toast>
      )}

      {/* At the top, clear of the meals and their + buttons, as on Home: a second tap on the same + must never land on Undo. */}
      {added && (
        <Toast key={added.entry.id} place="top" onClose={() => setAdded(null)} onUndo={() => { deleteLogEntry(added.entry.id); setAdded(null); }}>
          {t(ADDED_TO[added.meal], { name: added.entry.name })}
        </Toast>
      )}
    </div>
  );
}

/** Previous day, Next day and Today: white with the 1.5 px edge of every control you can tap, ink words and chevron. */
const DAY_PILL = "inline-flex min-h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border-[1.5px] border-edge bg-card text-base font-semibold text-foreground transition active:scale-[0.97] hover:bg-background";

/**
 * Previous day and Next day side by side (stacked when the text is large: the minimum width is in rem). On today there is no Next day (the 30-person audit:
 * a grey pill that couldn't be pressed said nothing about why); Previous day stays its own width.
 */
function DayNav({ day, now }: { day: Date; now: Date }) {
  const t = useT();
  const isToday = dayParam(day) === dayParam(now);
  const previous = <Link href={dayHref(stepDay(day, -1, now), now)} replace className={`${DAY_PILL} ps-2.5 pe-4`}><ChevronLeftIcon className="h-5 w-5" /><span>{t("Previous day")}</span></Link>;
  if (isToday) return <div className="mt-4 flex">{previous}</div>;
  return (
    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-2">
      {previous}
      <Link href={dayHref(stepDay(day, 1, now), now)} replace className={`${DAY_PILL} pe-2.5 ps-4`}><span>{t("Next day")}</span><ChevronRightIcon className="h-5 w-5" /></Link>
    </div>
  );
}

