"use client";

// Relative imports (not "@/"), so the unit tests can load TOUR_STOPS (tests/tour.test.ts).
import { COMMUNITY_ENABLED, COMMUNITY_FRIENDS_ENABLED, FOOD_SCAN_ENABLED, PHOTO_RECIPES_ENABLED } from "../../../lib/mm/config";
import { tk } from "../../../lib/mm/i18n";
import {
  BasketIcon, CalendarIcon, CameraIcon, DropIcon, ForkIcon, GearIcon, GridIcon, HeartIcon, ListIcon, PeopleIcon, PinIcon, PlusIcon, PodiumIcon, ScanIcon, SearchIcon, SunriseIcon,
} from "../_components/icons";
import { Pip, type PipMood } from "../_components/Mascot";
import { TabLabel } from "../_components/TabLabel";
import { useT } from "../_lib/i18n";
import { TABS } from "../_lib/tabs";
import { CAPS } from "./parts";

// Pip's walk through the app (founder 2026-10-15, made fuller 2026-11-17): one stop per tab, in the order of the tab bar. Each stop has Pip's excited line
// over a copy of the bar (the real bar's icons and words, the stop's tab lit), then "What you can do": a row for each real control, with that control's own
// icon and one plain sentence that names it in words ("the + next to Breakfast…", "the gear at the top"). No figures, no good/bad words (CLAUDE.md rule 3).

type Icon = (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;
/** One thing the person can do on a tab. `when: false` leaves the row out (a feature that is switched off on this build). */
export type TourRow = { Icon: Icon; text: string /* tk() */; when?: boolean };
export type TourStopId = "home" | "eatOut" | "groceries" | "recipes" | "community";

const ALL_STOPS: ReadonlyArray<{ id: TourStopId; says: string; mood: PipMood; rows: TourRow[] }> = [
  {
    id: "home",
    says: tk("This is Home. It keeps track of your day, so you can always see what's left!"),
    mood: "wave",
    rows: [
      { Icon: PlusIcon, text: tk("Tap + next to Breakfast, Lunch or Dinner to add what you ate: a restaurant dish, a recipe, a supermarket product, or your own numbers.") },
      { Icon: CameraIcon, text: tk("Scan your food: take a photo of your plate for an estimate of its calories, protein, carbs and fat. It's part of Premium."), when: FOOD_SCAN_ENABLED },
      { Icon: CalendarIcon, text: tk("Tap the calendar next to the date to see another day."), when: !FOOD_SCAN_ENABLED },
      { Icon: GearIcon, text: tk("Settings, at the top, has your goal, diet, text size, and this tour again.") },
      { Icon: DropIcon, text: tk("Further down Home, add the water you drink and set your own reminders.") },
    ],
  },
  {
    id: "recipes",
    says: tk("Cooking at home? These recipes use real products, with the cost of each serving!"),
    mood: "point",
    rows: [
      { Icon: SunriseIcon, text: tk("Tap Breakfast, Lunch, Dinner or Snacks to see recipes for that meal, or More for every filter.") },
      { Icon: CalendarIcon, text: tk("Meal plan makes a week of meals for your goal and budget, with the shopping list. It's part of Premium.") },
      { Icon: HeartIcon, text: tk("Tap the heart on a recipe to keep it in My recipes.") },
      { Icon: PlusIcon, text: tk("Open a recipe to add everything it needs to your shopping list in one tap."), when: !PHOTO_RECIPES_ENABLED },
      { Icon: CameraIcon, text: tk("Make it at home turns a photo of a dish into a recipe. It's part of Premium."), when: PHOTO_RECIPES_ENABLED },
    ],
  },
  {
    id: "groceries",
    says: tk("Going shopping? Pick your supermarket and look up its products and prices!"),
    mood: "think",
    rows: [
      { Icon: GridIcon, text: tk("Tap a supermarket to see its products and prices.") },
      { Icon: ScanIcon, text: tk("Scan a barcode to look up a product you're holding.") },
      { Icon: PodiumIcon, text: tk("Nutrition leaderboards rank the supermarket products by protein, fibre and more.") },
      { Icon: BasketIcon, text: tk("Your shopping list: tick things off as you shop.") },
    ],
  },
  {
    id: "eatOut",
    says: tk("Going out to eat? Look the place up first and know the numbers before you order!"),
    mood: "point",
    rows: [
      { Icon: SearchIcon, text: tk("Search for any restaurant or dish by name.") },
      { Icon: PinIcon, text: tk("Near me shows the places to eat around you on a map.") },
      { Icon: ForkIcon, text: tk("Open a restaurant to see the numbers for each dish. Best for you lists orders that fit your goal.") },
    ],
  },
  {
    id: "community",
    says: COMMUNITY_FRIENDS_ENABLED ? tk("Read short food articles, and send your shopping list to friends!") : tk("Short articles to read, all in one place!"),
    mood: "wave",
    rows: [
      { Icon: ListIcon, text: tk("Food blogs are short, easy reads about eating out, shopping and cooking.") },
      { Icon: PeopleIcon, text: tk("Sign in to add friends with a code, then send each other shopping lists."), when: COMMUNITY_FRIENDS_ENABLED },
    ],
  },
];

/** One stop a tab, for the tabs this build shows (no Community stop while Community is off, lib/mm/config.ts). */
export const TOUR_STOPS = ALL_STOPS.filter((s) => COMMUNITY_ENABLED || s.id !== "community");

/** The rows this build shows (a row whose feature is switched off is left out). */
export const visibleRows = (rows: readonly TourRow[]): TourRow[] => rows.filter((r) => r.when !== false);

/**
 * Pip on the tab bar: a copy of the real bar (the same icons in the same 32×48 pill, the same measured words under them, the stop's tab lit lime), Pip
 * standing on the stop's tab and hopping to the next one, and a bubble over Pip whose tail follows. The bar and Pip are decorative (aria-hidden); the bubble's
 * words are read out. The bubble keeps the same height at every stop, so Pip and the bar stay where they are while the words change.
 */
export function PipTour({ stop }: { stop: number }) {
  const t = useT();
  const here = TOUR_STOPS[stop]!;
  // Where Pip stands: over the open tab, but never so near the edge that Pip's 96 px box leaves the screen (the bubble's tail follows).
  const at = `clamp(48px, ${((stop + 0.5) / TABS.length) * 100}%, calc(100% - 48px))`;
  return (
    <div className="mt-5">
      <div className="mx-auto w-full max-w-[22rem]">
        <p className="speech-tour bubble-pop flex min-h-[6.5rem] items-center rounded-3xl px-5 py-4 text-[1.0625rem] font-medium leading-snug" style={{ "--tail": at } as React.CSSProperties}>
          <span key={stop} className="rise block">{t(here.says)}</span>
        </p>
        <div aria-hidden className="relative mt-7 h-[106px]">
          {/* Pip is 96 px wide (px, not rem: the drawing doesn't grow with the text size): -ms-[48px] puts the middle of Pip on the tab; inset-inline-start follows the reading direction */}
          <span className="pip-walk absolute bottom-0 -ms-[48px] w-[96px]" style={{ insetInlineStart: at }}>
            <span key={stop} className="pip-hop block"><Pip mood={here.mood} size={96} /></span>
          </span>
        </div>
        <ul aria-hidden className="flex rounded-[2rem] bg-[#1d2320] p-[6px] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.55)]">
          {TABS.map(({ href, label, Icon }, i) => (
            <li key={href} className="min-w-0 flex-1">
              <span className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1.5rem] text-center text-[0.8125rem] font-semibold leading-[1.1] transition-colors duration-500 ${i === stop ? "text-[#d6efa0]" : "text-[#c2c9c4]"}`}>
                <span className={`inline-flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-500 ${i === stop ? "bg-[#d6efa0] text-[#0b1a12]" : ""}`}><Icon className="h-5 w-5" /></span>
                <TabLabel text={t(label)} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** "What you can do" on a tab: each row is the real control's own icon in a grey circle and one plain sentence. */
export function TourRows({ rows }: { rows: readonly TourRow[] }) {
  const t = useT();
  return (
    <div className="glass mt-5 rounded-[1.25rem] p-4 pb-5">
      <h2 className={CAPS}>{t("What you can do")}</h2>
      <ul className="mt-3 space-y-3">
        {visibleRows(rows).map(({ Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft-strong"><Icon className="h-[18px] w-[18px]" /></span>
            <span className="min-w-0 pt-2 text-base leading-snug [overflow-wrap:anywhere]">{t(text)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
