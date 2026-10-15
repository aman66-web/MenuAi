"use client";

import Link from "next/link";
import { isSameLocalDay, loggedToday, mealBudget, mealSlotFor, MEALS, MEAL_LABEL } from "@/lib/mm/budget";
import { PAYMENTS_ENABLED, SAMPLES_ENABLED } from "@/lib/mm/config";
import { formatGrams, formatInt } from "@/lib/mm/format";
import { macroTargets } from "@/lib/mm/targets";
import { localeInfo } from "@/lib/mm/i18n";
import { itemImageUrl } from "@/lib/mm/images";
import { logStore, shoppingStore, updateSettings } from "@/lib/mm/stores";
import type { LogEntry } from "@/lib/mm/user-data";
import type { Meal } from "@/lib/mm/types";
import { Gauge } from "./_components/Gauge";
import { useGate } from "./_components/Paywall";
import { CalendarIcon, FlameIcon, ForkIcon, PlusIcon } from "./_components/icons";
import { Card, Spinner } from "./_components/ui";
import { useChainIndexes, useHydrated, useIsPro, useMenu, useNow, useSettings, useStore } from "./_lib/hooks";
import { useLanguage, useT } from "./_lib/i18n";

// Home is today (founder 2026-10-10). Founder 2026-10-14, from a reference picture: "Home" with a calendar button and this week's days
// on top, then today's calories (a dial) beside protein, carbs and fat, then two cards, "Shopping list" and "My meals", then today's
// meals as rows (Breakfast, Lunch, Dinner) with what was eaten and a + to add more. The rows use SPEC §6.3 as it stands: a logged item
// goes under the meal its time falls in (mealSlotFor) and each meal's figure is its share of the day (mealBudget). Founder 2026-10-15,
// same picture again ("make the home page look absolutely identical"): its sizes and spacing, past days as dark circles, the dial with a
// grey centre, and carbs and fat with targets and bars too (worked out from calories and protein unless typed in Settings: targets.ts
// macroTargets). The picture's bodyweight card is left out (the app doesn't track weight) and Numbite's lime stays (founder's answers).
// Logging is Pro (SPEC §7.8): while Pro is on, a free user's + opens the paywall.

/** Two cards side by side, stacked when the text is large: the minimum width is in rem, so it grows with the text size. */
const PAIR = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.75rem),1fr))] gap-3";

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Monday to Sunday of the week that holds `now`, at local midnight. */
function weekOf(now: Date): Date[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** "PROTEIN      56g / 150g": the label in small spaced capitals, the figures in DM Mono, a thin bar under them (the founder's picture). */
function MacroRow({ label, eaten, target }: { label: string; eaten: number; target?: number }) {
  const fraction = target ? Math.min(1, Math.max(0, eaten / target)) : 0;
  return (
    <div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-1.5 gap-y-0.5">
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
        <span className="app-numbers whitespace-nowrap font-mono text-[0.78rem]">{formatGrams(eaten)}{target ? <span className="text-muted"> / {formatGrams(target)}</span> : null}</span>
      </p>
      {target ? (
        <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-[var(--ring-track)]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}>
          <div className="h-full rounded-full bg-[var(--bar)] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${fraction * 100}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function ThingCard({ href, title, line }: { href: string; title: string; line: string }) {
  const t = useT();
  return (
    <Link href={href} className="glass lift flex min-h-[10.5rem] min-w-0 flex-col justify-between gap-4 rounded-[1.75rem] p-4 [overflow-wrap:anywhere]">
      <span>
        <span className="block text-xl font-extrabold leading-snug tracking-tight">{title}</span>
        <span className="mt-1 block text-base leading-snug text-muted">{line}</span>
      </span>
      <span aria-hidden className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-foreground px-4 text-base font-bold text-background">{t("Open")}</span>
    </Link>
  );
}

/** A round picture of something eaten: the chain's own photo of the dish where we have one, otherwise a plain fork. */
function EatenThumb({ src }: { src: string | undefined }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- already resized and WebP-encoded by tools/uk_extract/images_common.py
    <img src={src} alt="" width={44} height={44} loading="lazy" decoding="async" className="h-11 w-11 rounded-full border-2 border-background bg-white object-cover" />
  ) : (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-background bg-accent-soft text-accent"><ForkIcon className="h-5 w-5" /></span>
  );
}

export default function HomePage() {
  const t = useT();
  const language = useLanguage();
  const hydrated = useHydrated();
  const settings = useSettings();
  const pro = useIsPro();
  const menu = useMenu();
  const { showPaywall } = useGate();
  const log = useStore(logStore);
  const shopping = useStore(shoppingStore);
  const now = useNow();
  const todays = log.filter((e) => isSameLocalDay(new Date(e.loggedAt), now));
  const indexes = useChainIndexes(todays.filter((e) => e.source === "item").map((e) => e.chainId));

  if (!hydrated || !settings.hasCompletedOnboarding) return <Spinner />;

  const profile = { goal: settings.goal, dailyCalories: settings.dailyCalories, glp1MealCap: settings.glp1MealCap, ...(settings.dailyProtein ? { dailyProtein: settings.dailyProtein } : {}) };
  const eaten = loggedToday(log, now);
  const used = Math.min(1, Math.max(0, eaten.calories / settings.dailyCalories));
  const targets = macroTargets(settings);
  const htmlLang = localeInfo(language).htmlLang;
  const narrow = new Intl.DateTimeFormat(htmlLang, { weekday: "narrow" });
  const longDay = new Intl.DateTimeFormat(htmlLang, { weekday: "long", day: "numeric", month: "long" });
  const loggedDays = new Set(log.map((e) => dayKey(new Date(e.loggedAt))));

  const toBuy = shopping.filter((i) => !i.done).length;
  const groceriesLine = shopping.length === 0 ? t("Your shopping list") : toBuy === 0 ? t("All picked up") : toBuy === 1 ? t("1 thing to pick up") : t("{n} things to pick up", { n: toBuy });

  const photoOf = (e: LogEntry): string | undefined => {
    const ix = e.source === "item" ? indexes.get(e.chainId) : undefined;
    if (!ix || ix === "missing") return undefined;
    for (const item of ix.items.values()) if (item.name === e.name) return itemImageUrl(item.image);
    return undefined;
  };
  const byMeal = (meal: Meal) => todays.filter((e) => mealSlotFor(new Date(e.loggedAt)) === meal).sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[2.125rem] font-bold leading-none tracking-[-0.03em]">{t("Home")}</h1>
        <Link href="/app/today" aria-label={t("Today's meals")} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-soft-strong transition active:scale-95 hover:bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]">
          <CalendarIcon className="h-5 w-5" />
        </Link>
      </div>

      <ol aria-label={t("This week")} className="mt-6 grid grid-cols-7 gap-1.5 text-center">
        {weekOf(now).map((d) => {
          const today = isSameLocalDay(d, now);
          const future = !today && d > now;
          const logged = loggedDays.has(dayKey(d));
          const name = longDay.format(d);
          const label = today ? t("{day} (today)", { day: name }) : future ? name : logged ? t("{day}: food logged", { day: name }) : t("{day}: nothing logged", { day: name });
          // Like the picture: every day gone by is a dark circle, today is the brand colour, the days ahead are grey (whether food was
          // logged is still said to screen readers).
          const look = today ? "bg-sun text-[var(--on-accent)]" : future ? "bg-soft-strong text-muted" : "bg-foreground text-background";
          return (
            <li key={dayKey(d)} className="flex min-w-0 flex-col items-center gap-1.5">
              <span aria-hidden className="text-xs font-semibold uppercase text-muted">{narrow.format(d)}</span>
              <span aria-hidden className={`app-numbers flex aspect-square w-full max-w-12 items-center justify-center rounded-full text-[0.95rem] font-semibold ${look}`}>{d.getDate()}</span>
              <span className="sr-only">{label}</span>
            </li>
          );
        })}
      </ol>

      {SAMPLES_ENABLED && menu.chains.some((c) => c.sample) && (
        <p className="glass mt-4 rounded-2xl px-4 py-2.5 text-xs text-muted">{t("Showing fictional sample data for testing. Numbers are not real.")}</p>
      )}

      <div className={`app-numbers mt-6 ${PAIR}`}>
        {/* Measured from the founder's picture of this card ("exactly like image 2"): the small label at the top, a dial about 55% of the
            card's width with a thick track and a small grey centre, plenty of room around it, the figures in a regular weight below. */}
        <Card className="flex min-h-[14.5rem] min-w-0 flex-col items-center justify-between gap-5 px-4 pb-4 pt-4 text-center">
          <p className="self-start text-[0.6875rem] font-bold uppercase tracking-[0.07em] text-muted">{t("Calories")}</p>
          <Gauge id="home" label={t("Calories used today")} fraction={used} size={100} stroke={17} disc>
            <span aria-hidden className="text-[1.45rem] font-[800] tracking-tight">{Math.round(used * 100)}%</span>
          </Gauge>
          <div>
            <p className="text-[1.25rem] font-normal leading-tight [overflow-wrap:anywhere]">
              <span className="text-accent">{formatInt(eaten.calories)}</span> <span>/ {formatInt(settings.dailyCalories)}</span>
            </p>
            <p className="mt-0.5 text-[1.125rem] font-normal leading-tight">kcal</p>
          </div>
        </Card>
        <Card className="flex min-w-0 flex-col justify-around gap-6 px-3.5 py-5">
          <MacroRow label={t("Protein")} eaten={eaten.protein} {...(targets.protein ? { target: targets.protein } : {})} />
          <MacroRow label={t("Carbs")} eaten={eaten.carbs} target={targets.carbs} />
          <MacroRow label={t("Fat")} eaten={eaten.fat} target={targets.fat} />
        </Card>
      </div>

      {!pro && (
        <Card className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-4">
          <p className="min-w-[10rem] flex-1 text-base leading-snug">{t("Log your meals to see what's left today.")}</p>
          <button type="button" onClick={() => showPaywall("log")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-soft px-4 text-sm font-bold text-accent transition active:scale-[0.97]">
            {PAYMENTS_ENABLED ? t("Try Pro free") : t("See Pro")}
          </button>
        </Card>
      )}

      {!settings.hasSetTargets && !settings.dismissedTargetsCard && (
        <Card className="mt-3 flex items-center justify-between gap-3 p-4">
          <Link href="/app/settings#targets" className="min-h-11 flex-1 font-medium">{t("Set your targets to see what's left today")}</Link>
          <button type="button" className="min-h-11 min-w-11 text-sm text-muted" onClick={() => updateSettings({ dismissedTargetsCard: true })} aria-label={t("Dismiss")}>{t("Dismiss")}</button>
        </Card>
      )}

      <h2 className="sr-only">{t("Your things")}</h2>
      <div className={`mt-3 ${PAIR}`}>
        <ThingCard href="/app/groceries/list" title={t("Shopping list")} line={groceriesLine} />
        <ThingCard href="/app/meals" title={t("My meals")} line={t("Your favourite meals")} />
      </div>

      <h2 className="mt-7 text-xl font-extrabold tracking-tight">{t("Today's meals")}</h2>
      <ul className="mt-3 space-y-3">
        {MEALS.map((meal) => {
          const entries = byMeal(meal);
          const kcal = entries.reduce((s, e) => s + e.nutrients.calories, 0);
          const { budget } = mealBudget(profile, 0, meal);
          const title = t(MEAL_LABEL[meal]);
          return (
            <li key={meal} className="glass @container flex min-w-0 items-center gap-3 rounded-[1.75rem] p-4">
              <Link href="/app/today" className="min-w-0 flex-1 break-words">
                <span className="block text-lg font-extrabold leading-snug tracking-tight">{title}</span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><FlameIcon className="h-[18px] w-[18px]" /></span>
                  <span className="app-numbers text-lg font-bold"><span className="whitespace-nowrap">{formatInt(kcal)} / {formatInt(budget)}</span> <span className="text-sm font-semibold text-muted">kcal</span></span>
                </span>
              </Link>
              {entries.length > 0 && (
                // The pictures step aside when the row is too narrow for them (large text, small phones): the numbers matter more.
                <span aria-hidden className="hidden shrink-0 -space-x-3 rtl:space-x-reverse @[17rem]:flex">
                  {entries.slice(0, 2).map((e) => <EatenThumb key={e.id} src={photoOf(e)} />)}
                  {entries.length > 2 && <span className="app-numbers inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-background bg-soft-strong text-sm font-extrabold">+{entries.length - 2}</span>}
                </span>
              )}
              {pro ? (
                <Link href="/app/eat-out" aria-label={t("Add food")} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-soft-strong transition active:scale-95 hover:bg-accent-soft hover:text-accent">
                  <PlusIcon className="h-6 w-6" />
                </Link>
              ) : (
                <button type="button" onClick={() => showPaywall("log")} aria-label={t("Add food")} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-soft-strong transition active:scale-95">
                  <PlusIcon className="h-6 w-6" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
