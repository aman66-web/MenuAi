"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { APP_BUILD, DEV_TOOLS_ENABLED, GATING_ENABLED, IAP_ENABLED, PAID_ACCESS_ENABLED, PAYMENTS_ENABLED, PRO_PREVIEW_FROM_ENV, APP_VERSION, TEXT_SIZE_CHOICE_ENABLED } from "@/lib/mm/config";
import { isPro } from "@/lib/mm/entitlements";
import { dataVersionDate } from "@/lib/mm/menu-client";
import { formatDate } from "@/lib/mm/format";
import { mailtoFor } from "@/lib/mm/outbox";
import { COACH_ARMED } from "@/lib/mm/coach";
import { paidActive, shareUnlockActive } from "@/lib/mm/paid";
import { manageSubscriptions } from "@/lib/payments/iap";
import { YOUR_DATA_SYNCED } from "@/lib/mm/syncStores";
import { coachStore, paidStore, logStore, outbox, outboxStore, tourStore, updateSettings, homePagesStore } from "@/lib/mm/stores";
import type { TextSize } from "@/lib/mm/user-data";
import { CARB_FAT_NOTE, GLP1_NOTE, isLowCalories, LOW_CALORIES_NOTE, MAX_MACRO_TARGET, suggestCarbFat, suggestProtein, SUGGESTION_NOTE, type PlanNote } from "@/lib/mm/targets";
import type { Goal } from "@/lib/mm/types";
import { DEFAULT_WATER_GOAL_ML, MAX_WATER_GOAL_ML, MIN_WATER_GOAL_ML } from "@/lib/mm/water";
import { site } from "@/site.config";
import { AlertCircleIcon, ChevronRightIcon } from "../_components/icons";
import { Pip } from "../_components/Mascot";
import { AppStoreAccountButtons } from "../_components/AppStorePlans";
import { PageHeader } from "../_components/PageHeader";
import { PlanNotes } from "../_components/BodyFields";
import { NumberDone } from "../_components/SearchDone";
import { trialDaysOf, useStoreProducts } from "../_lib/storeProducts";
import { travelBack } from "../_lib/backNav";
import { tk } from "@/lib/mm/i18n";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { ContactForm } from "../_components/Submit";
import { AccountSection } from "../_components/AccountSection";
import { DietPicker } from "../_components/DietPicker";
import { ShopPicker } from "../_components/ShopPicker";
import { applyTextSize } from "../_lib/textSize";
import { focusTargetBox, TargetSuggestForm } from "../_components/TargetSuggestForm";
import { Badge, Button, Card, ChoiceMark, LinkButton, radioKeyNav, Segmented, Sheet, Toggle } from "../_components/ui";
import { SourcesLink } from "../_components/SourcesLink";
import { menuClient } from "../_lib/menu";
import { useHydrated, useMenu, useNow, useSettings, useStore } from "../_lib/hooks";
import { clearDeviceData } from "../_lib/clearData";
import { useAccountUser } from "../_lib/account";
import { setCreatorMode, useCreatorMode } from "../_lib/creator";

// SPEC §7.9. Not on the web: Apple Health, Location, StoreKit's manage/restore rows (see docs/WEB_BUILD_PLAN.md).
// Look (founder 2026-10-15, "the rest of the app should match [Home's] elegance"): a compact heavy title, group labels in sentence case (.kicker: 13 px
// semibold, the secondary grey), white cards with the 1px line on the grey page, one ink pill per card for its main action. The colour meeting (19 November
// 2026, approved by the founder that day): Back and no Settings cog on this page itself; ink chevrons on rows; goals as radios (an empty grey ring, chosen
// lime with the dark green edge and dot); switches say On or Off; the destructive buttons are white with a red edge, last and apart, and their confirm
// sheet has Cancel beside a red Clear everything.

const TEXT_OPTIONS: ReadonlyArray<{ value: TextSize; label: string }> = [
  { value: "standard", label: tk("Standard") },
  { value: "large", label: tk("Large") },
  { value: "xlarge", label: tk("Extra large") },
];

// the same names as the welcome screens' goal question (the overnight audit, 20 November 2026)
const GOAL_OPTIONS: ReadonlyArray<{ value: Goal; label: string }> = [
  { value: "lose", label: tk("Lose weight") },
  { value: "maintain", label: tk("Maintain") },
  { value: "buildMuscle", label: tk("Build muscle") },
  { value: "glp1", label: tk("I'm on a GLP-1 medication") },
  { value: "other", label: tk("Other") },
];

/** What "Clear data on this device" removes, as a short list (app/_lib/clearData.ts does it; tests/clearData.test.ts checks it misses nothing). */
const CLEAR_LIST = [
  tk("Your goal and daily targets"),
  tk("Saved orders and favourites"),
  tk("Your food log and the water you added"),
  tk("Your reminders"),
  tk("Your shopping lists"),
  tk("Your meal plan and earlier plans"),
  tk("The people you cook for"),
  tk("Recipes you saved or Pip made for you, and their photos"),
  tk("The foods you said you have"),
  tk("What you picked to compare"),
  tk("Recent searches and the area you typed for Near me"),
  tk("Messages not sent yet"),
];

/** A typed number as the person meant it: "2,000" and "2 000" are 2000, and a decimal is rounded (the targets are whole numbers). NaN for anything else. */
const typedNumber = (text: string): number => {
  const n = Number(text.replace(/[,\s]/g, ""));
  return text.trim() === "" ? NaN : Math.round(n);
};

type TargetField = "calories" | "protein" | "carbs" | "fat" | "water" | "cap";
const TARGETS_ERROR_ID = "targets-error";

/**
 * A target as a figure tile, like the figures on Home: a quiet label at the top and the number below it in a large regular weight, on the
 * light grey fill of anything that sits on a white card. The whole tile is the <label>, so a tap anywhere on it focuses the field, and the
 * ring goes round the tile. An empty carbs or fat field shows the suggestion in grey (the placeholder). `auto`: an empty box is worked out from the
 * others (protein, carbs, fat), so a small "Worked out" tag under the grey number says it isn't a saved figure.
 */
function TargetTile({ label, hint, value, placeholder, onChange, wide, auto, invalid }: { label: string; hint?: string; value: string; placeholder?: string; onChange: (v: string) => void; wide?: boolean; auto?: boolean; invalid?: boolean }) {
  const t = useT();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const worked = auto && value.trim() === "";
  // the label is only the box's name; the "Worked out" tag, the hint and an error are read after it as its description (the audit, 20 November 2026)
  const described = [worked && `${id}-auto`, hint && `${id}-hint`, invalid && TARGETS_ERROR_ID].filter(Boolean).join(" ") || undefined;
  return (
    // a tap anywhere on the tile goes to its box, as when the whole tile was the label
    <div onClick={() => input.current?.focus()} className={`block min-w-0 cursor-text rounded-[1rem] border-[1.5px] bg-card px-4 pb-3 pt-3.5 transition-shadow focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${invalid ? "border-danger" : "border-edge"} ${wide ? "col-span-full" : ""}`}>
      <label htmlFor={id} className="block cursor-text text-[0.8125rem] font-semibold leading-snug text-muted [overflow-wrap:anywhere]">{label}</label>
      <input
        ref={input}
        id={id}
        className="app-numbers mt-1 block w-full min-w-0 bg-transparent text-[1.625rem] font-medium leading-tight tracking-[-0.01em] placeholder:text-placeholder focus-visible:outline-none!"
        inputMode="numeric"
        enterKeyHint="done"
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={described}
        onChange={(e) => onChange(e.target.value)}
      />
      {worked && <span id={`${id}-auto`} className="mt-1.5 block"><Badge>{t("Worked out")}</Badge></span>}
      {hint && <span id={`${id}-hint`} className="mt-1.5 block text-[0.8125rem] leading-snug text-muted">{hint}</span>}
    </div>
  );
}

/** A message under the target tiles (a caution, what went wrong): plain semi-bold text, never a grey box, which on a white card would
 *  read as one more field. */
const messageClass = "mt-3 text-[0.9375rem] font-semibold leading-snug";

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-7 scroll-mt-4">
      <h2 className="kicker mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** One choice per row in a white card, as radios: an empty grey ring, the chosen one lime with the 2 px dark green edge and a dark green dot, its words bold. */
function OptionList<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="glass divide-y divide-line overflow-hidden rounded-[1.25rem]">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => radioKeyNav(e, i, options.length, (n) => onChange(options[n]!.value))}
            className={`flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2 text-start text-base transition hover:bg-background focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]! ${on ? "font-bold" : "font-medium"}`}
          >
            <ChoiceMark on={on} kind="radio" />
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function LinkRow({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  const cls = "flex min-h-[3.25rem] items-center justify-between gap-3 px-4 py-2 text-base font-semibold transition hover:bg-background focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]!";
  return external ? (
    <a href={href} className={cls}>{children}<ChevronRightIcon className="h-5 w-5 shrink-0 text-ink" /></a>
  ) : (
    <Link href={href} className={cls}>{children}<ChevronRightIcon className="h-5 w-5 shrink-0 text-ink" /></Link>
  );
}

export default function SettingsPage() {
  const hydrated = useHydrated();
  const creator = useCreatorMode();
  const paid = useStore(paidStore);
  // the free trial this Apple ID can still have (iPhone app only): the Subscription link offers it (founder 2026-11-16: "they can claim the free trial later")
  const trial = trialDaysOf(useStoreProducts(IAP_ENABLED).products);
  const nowMs = useNow().getTime();
  const settings = useSettings();
  const t = useT();
  const menu = useMenu();
  const outboxItems = useStore(outboxStore);
  const [contactOpen, setContactOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [suggest, setSuggest] = useState(false);
  // after a change of goal (not GLP-1): the targets stay as they were, and the page says so (the audit, 20 November 2026)
  const [goalChanged, setGoalChanged] = useState(false);
  // the notes of a suggestion just used ("Use these"): a caution about the measurements, the 1,200 floor...
  const [planNotes, setPlanNotes] = useState<readonly PlanNote[]>([]);
  // Refresh menus: what the last check found
  const [menuCheck, setMenuCheck] = useState<"checking" | "same" | "new" | "failed" | null>(null);
  // "Save your new targets?": where the person was going when they left with typed targets not saved
  const [leaving, setLeaving] = useState<{ href: string } | { back: true } | null>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const account = useAccountUser();
  const router = useRouter();

  // Drafts for the number fields: they commit with "Save targets".
  const [calories, setCalories] = useState<string | null>(null);
  const [protein, setProtein] = useState<string | null>(null);
  const [carbs, setCarbs] = useState<string | null>(null);
  const [fat, setFat] = useState<string | null>(null);
  const [water, setWater] = useState<string | null>(null);
  const [mealCap, setMealCap] = useState<string | null>(null);
  const [targetsMessage, setTargetsMessage] = useState<{ ok: boolean; text: string; field?: TargetField } | null>(null);

  // the saved (or failed) line is scrolled into view above the tab bar
  useEffect(() => {
    if (targetsMessage) status.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [targetsMessage]);

  // Typed targets not saved yet: leaving the page asks first ("Save your new targets?"), for any link out of it (the tab bar, a row of this page) and for
  // closing or reloading the website. The header's Back asks through its own onClick (below), so links inside [data-leave-own] are left to it.
  const dirtyNow = hydrated && isDirty();
  useEffect(() => {
    if (!dirtyNow) return;
    const onClick = (e: globalThis.MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || a.closest("[data-leave-own]") || a.getAttribute("target") === "_blank") return;
      const url = new URL((a as HTMLAnchorElement).href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving({ href: url.pathname + url.search + url.hash });
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirtyNow]);

  if (!hydrated) return null;

  const caloriesText = calories ?? String(settings.dailyCalories);
  const proteinText = protein ?? (settings.dailyProtein ? String(settings.dailyProtein) : "");
  const carbsText = carbs ?? (settings.dailyCarbs ? String(settings.dailyCarbs) : "");
  const fatText = fat ?? (settings.dailyFat ? String(settings.dailyFat) : "");
  const waterText = water ?? (settings.dailyWater ? String(settings.dailyWater) : "");
  // Left empty, protein follows the calories and carbs and fat follow the calories and protein typed above (shown as the placeholder).
  const draftCalories = Number(caloriesText);
  const draftProtein = proteinText.trim() === "" ? undefined : Number(proteinText);
  const suggestedCarbFat = suggestCarbFat(Number.isFinite(draftCalories) ? draftCalories : settings.dailyCalories, draftProtein !== undefined && Number.isFinite(draftProtein) ? draftProtein : undefined);
  const capText = mealCap ?? String(settings.glp1MealCap);
  const failed = outboxItems.filter((i) => i.status === "failed");
  const pending = outboxItems.filter((i) => i.status === "pending");
  const dirty = isDirty();
  const nowPremium = isPro(settings, paid, nowMs);
  const paying = paidActive(paid, nowMs);
  const subscribed = paying && (paid.plan === "annual" || paid.plan === "monthly");

  /**
   * Everything else on this page saves on the tap, but typed targets save with "Save targets" ("Use these" saves at once): a typed change is said to be not
   * saved yet until then, and leaving the page asks first. (A function, so the effect above can ask before the page has drawn.)
   */
  function isDirty(): boolean {
    const saved = { c: String(settings.dailyCalories), p: settings.dailyProtein ? String(settings.dailyProtein) : "", cb: settings.dailyCarbs ? String(settings.dailyCarbs) : "", f: settings.dailyFat ? String(settings.dailyFat) : "", w: settings.dailyWater ? String(settings.dailyWater) : "", cap: String(settings.glp1MealCap) };
    const drafts: Array<[string | null, string]> = [[calories, saved.c], [protein, saved.p], [carbs, saved.cb], [fat, saved.f], [water, saved.w], ...(settings.goal === "glp1" ? [[mealCap, saved.cap] as [string | null, string]] : [])];
    return drafts.some(([d, was]) => d !== null && d.trim() !== was);
  }

  function clearDrafts() {
    setCalories(null);
    setProtein(null);
    setCarbs(null);
    setFat(null);
    setWater(null);
    setMealCap(null);
  }

  // Carbs and fat that were the worked-out figures follow a change of calories (usability test 2026-11-19: Barbara changed 2,000 to 1,400 and carbs and fat
  // stayed at 190 and 50): they are emptied, so the boxes show the new worked-out figures; ones the person typed themselves are kept.
  function followCalories() {
    const was = suggestCarbFat(settings.dailyCalories, settings.dailyProtein);
    if (carbs === null && settings.dailyCarbs !== undefined && Math.abs(settings.dailyCarbs - was.carbs) <= 5) setCarbs("");
    if (fat === null && settings.dailyFat !== undefined && Math.abs(settings.dailyFat - was.fat) <= 5) setFat("");
  }

  /** Save the typed targets. False (and the reason shown under the boxes, on the box it is about) when one isn't right. */
  function saveTargets(): boolean {
    const c = typedNumber(caloriesText);
    const p = proteinText.trim() === "" ? undefined : typedNumber(proteinText);
    const cb = carbsText.trim() === "" ? undefined : typedNumber(carbsText);
    const ft = fatText.trim() === "" ? undefined : typedNumber(fatText);
    const wt = waterText.trim() === "" ? undefined : typedNumber(waterText);
    const cap = typedNumber(capText);
    const fail = (field: TargetField, text: string) => (setTargetsMessage({ ok: false, text, field }), false);
    if (!Number.isFinite(c) || c < 500 || c > 10000) return fail("calories", tk("Calories should be between 500 and 10,000."));
    if (p !== undefined && (!Number.isFinite(p) || p <= 0 || p > 1000)) return fail("protein", tk("Protein should be above 0 and at most 1,000 g."));
    if (cb !== undefined && (!Number.isFinite(cb) || cb <= 0 || cb > MAX_MACRO_TARGET)) return fail("carbs", tk("Carbs and fat should be above 0 and at most 2,000 g."));
    if (ft !== undefined && (!Number.isFinite(ft) || ft <= 0 || ft > MAX_MACRO_TARGET)) return fail("fat", tk("Carbs and fat should be above 0 and at most 2,000 g."));
    if (wt !== undefined && (!Number.isFinite(wt) || wt < MIN_WATER_GOAL_ML || wt > MAX_WATER_GOAL_ML)) return fail("water", tk("Water should be between 250 and 6,000 ml."));
    if (settings.goal === "glp1" && (!Number.isFinite(cap) || cap < 100 || cap > 2000)) return fail("cap", tk("Meal size should be between 100 and 2,000 calories."));
    updateSettings({ dailyCalories: c, dailyProtein: p, dailyCarbs: cb, dailyFat: ft, dailyWater: wt, hasSetTargets: true, ...(settings.goal === "glp1" ? { glp1MealCap: cap } : {}) });
    clearDrafts();
    setGoalChanged(false);
    setTargetsMessage({ ok: true, text: tk("Saved.") });
    return true;
  }

  /** "Use these" under a suggestion: saved at once (it used to fill the boxes and wait for "Save targets", and was lost on leaving). */
  function applySuggestion(s: { calories: string; protein: string; carbs: string; fat: string }, notes: readonly PlanNote[], extra: { glp1MealCap?: number }) {
    updateSettings({
      dailyCalories: Number(s.calories), dailyProtein: Number(s.protein), dailyCarbs: Number(s.carbs), dailyFat: Number(s.fat), hasSetTargets: true,
      ...(settings.goal === "glp1" && extra.glp1MealCap !== undefined ? { glp1MealCap: extra.glp1MealCap } : {}),
    });
    clearDrafts();
    setSuggest(false);
    setGoalChanged(false);
    setPlanNotes(notes);
    setTargetsMessage({ ok: true, text: tk("Saved. These are your new targets.") });
  }

  /** Where "Leave without saving" (or a good "Save") goes: on to the link that was tapped, or Back as the header's Back would have. */
  function goOn(to: { href: string } | { back: true }) {
    setLeaving(null);
    clearDrafts();
    if ("href" in to) router.push(to.href);
    else if (!travelBack(router, "/app")) router.push("/app");
  }

  async function refreshMenus() {
    const before = menu.dataVersion;
    setMenuCheck("checking");
    menuClient.invalidate();
    await menuClient.ensureManifest(true);
    const after = menuClient.getSnapshot();
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    setMenuCheck(after.status === "error" || offline ? "failed" : after.dataVersion !== before ? "new" : "same");
  }

  async function clearEverything() {
    setClearing(true);
    await clearDeviceData();
    setClearing(false);
    setClearOpen(false);
    router.replace("/app/welcome?cleared=1");
  }

  return (
    <div>
      {/* Settings is the cog at the top right of every page, not a tab: Back returns to the page before (Home by default); no cog on Settings itself */}
      {/* typed targets not saved: Back asks first (data-leave-own: the page's link guard leaves this one to its own onClick) */}
      <div data-leave-own>
        <PageHeader back={{ href: "/app", label: t("Back to home"), onClick: (e: MouseEvent<HTMLElement>) => { if (dirty) { e.preventDefault(); setLeaving({ back: true }); } } }} settings={false} />
      </div>
      <h1 className="mt-4 text-[1.75rem] font-[800] leading-none tracking-[-0.02em]">{t("Settings")}</h1>

      {/* The guided setup again (the welcome screens as a signed-in run of 10 steps: the questions with the saved answers ticked, the three feature screens and
          "Save and go to Home"), for anyone who skipped it or wants to go through it again (the onboarding meeting, 20 November 2026). */}
      <Link href="/app/welcome" className="glass mt-5 flex min-h-[4.75rem] items-center gap-3.5 rounded-[1.25rem] px-4 py-3 transition-colors hover:bg-background active:bg-background">
        {/* Pip bare, on no disc (he melts into one) */}
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center"><Pip mood="wave" size={44} /></span>
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span className="block text-base font-bold leading-snug">{t("Go through setup again")}</span>
          <span className="mt-0.5 block text-sm leading-snug text-muted">{t("Your goal, the foods you avoid, your shops and daily numbers, with a look at what {app} can do.", { app: site.name })}</span>
        </span>
        <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-ink" />
      </Link>

      <Section title={t("Account")} id="account">
        <AccountSection />
      </Section>

      {/* off since 2026-11-19 (founder: "Just keep standard pls"; lib/mm/config.ts TEXT_SIZE_CHOICE_ENABLED) */}
      {TEXT_SIZE_CHOICE_ENABLED && <Section title={t("Text size")}>
        <Segmented label={t("Text size")} value={settings.textSize ?? "standard"} options={TEXT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(textSize) => { updateSettings({ textSize }); applyTextSize(textSize); }} />
      </Section>}

      {/* "Show me what Numbite can do" (the onboarding meeting, 20 November 2026; it replaced "Show me around again" and the tab tour): the three feature screens
          (Eat out, recipes from your shop, your week) with the current settings, "{n} of 3", Close and Next then Done; nothing is saved, and it comes back here. */}
      <Section title={t("Help")}>
        <div className="glass divide-y divide-line overflow-hidden rounded-[1.25rem]">
          {/* near the top, where it's looked for (usability test 2026-11-19: Frank scrolled the whole of Settings to find Contact us under About) */}
          <button type="button" onClick={() => setContactOpen(true)} className="flex min-h-[3.25rem] w-full items-center justify-between gap-3 px-4 py-2 text-start text-base font-semibold transition hover:bg-background focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]!">{t("Contact us")}<ChevronRightIcon className="h-5 w-5 shrink-0 text-ink" /></button>
          <LinkRow href="/app/welcome?showcase=1">{t("Show me what {app} can do", { app: site.name })}</LinkRow>
          {/* Pip's tips on the real screens again (lib/mm/coach.ts): switched on, then Home, where the first ones show */}
          <Link href="/app" onClick={() => coachStore.set(COACH_ARMED)} className="flex min-h-[3.25rem] items-center justify-between gap-3 px-4 py-2 text-base font-semibold transition hover:bg-background focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]!">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="block">{t("Show me the buttons on each screen")}</span>
              <span className="mt-0.5 block text-sm font-normal leading-snug text-muted">{t("Takes you to Home, where Pip shows what each button does. Each tab's tips show the first time you open it.")}</span>
            </span>
            <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink" />
          </Link>
        </div>
      </Section>

      <Section title={t("Goal")}>
        <OptionList label={t("Goal")} value={settings.goal} options={GOAL_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(goal) => { if (goal !== settings.goal) setGoalChanged(goal !== "glp1"); updateSettings({ goal }); }} />
        {/* a new goal doesn't change the numbers by itself: said, with the way to new ones (the audit, 20 November 2026) */}
        {goalChanged && settings.goal !== "glp1" && (
          <p role="status" className="mt-3 text-[0.9375rem] leading-snug">
            {t("Your daily targets haven't changed. Tap Suggest targets for numbers that fit this goal.")}{" "}
            <button type="button" onClick={() => { setSuggest(true); setGoalChanged(false); focusTargetBox("#targets-suggest"); }} className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-[3px]">{t("Suggest targets")}</button>
          </p>
        )}
        {settings.goal === "glp1" && <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("Smaller, protein-first orders, capped at the meal size you set below.")}</p>}
        {settings.goal === "glp1" && <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{t(GLP1_NOTE, { app: site.name })}</p>}
        {settings.goal === "glp1" && <SourcesLink className="mt-1" />}
      </Section>

      <Section title={t("Daily targets")} id="targets">
        <Card className="p-4">
          {/* Two tiles side by side, stacked when the text is large (the minimum width is in rem, so it grows with the text). Done at the top corner while a
              box is in use: an iPhone's number pad has no Return key. */}
          <div className="group/nums relative">
            <NumberDone />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,6.5rem),1fr))] gap-2.5">
              <TargetTile label={t("Calories")} invalid={targetsMessage?.field === "calories"} value={caloriesText} onChange={(v) => { setCalories(v); setTargetsMessage(null); followCalories(); }} />
              <TargetTile auto label={t("Protein (g)")} invalid={targetsMessage?.field === "protein"} value={proteinText} placeholder={String(suggestProtein(Number.isFinite(draftCalories) ? draftCalories : settings.dailyCalories))} onChange={(v) => { setProtein(v); setTargetsMessage(null); }} />
              <TargetTile auto label={t("Carbs (g)")} invalid={targetsMessage?.field === "carbs"} value={carbsText} placeholder={String(suggestedCarbFat.carbs)} onChange={(v) => { setCarbs(v); setTargetsMessage(null); }} />
              <TargetTile auto label={t("Fat (g)")} invalid={targetsMessage?.field === "fat"} value={fatText} placeholder={String(suggestedCarbFat.fat)} onChange={(v) => { setFat(v); setTargetsMessage(null); }} />
              <TargetTile wide label={t("Water (ml)")} invalid={targetsMessage?.field === "water"} hint={t("Your goal for the day on Home. Left empty it is 2,000 ml.")} value={waterText} placeholder={String(DEFAULT_WATER_GOAL_ML)} onChange={(v) => { setWater(v); setTargetsMessage(null); }} />
              {settings.goal === "glp1" && (
                <TargetTile wide label={t("Comfortable meal size (calories)")} invalid={targetsMessage?.field === "cap"} hint={t("Best-for-you picks and your meal plan stay within this size. Default 450.")} value={capText} onChange={(v) => { setMealCap(v); setTargetsMessage(null); }} />
              )}
            </div>
          </div>
          {/* what just happened, straight under the boxes and scrolled into view above the tab bar */}
          {dirty && !(targetsMessage && !targetsMessage.ok) && <p role="status" className={`${messageClass} scroll-mb-32`}>{t("Not saved yet. Tap “Save targets” to keep them.")}</p>}
          {targetsMessage && (targetsMessage.ok
            ? <p ref={status} role="status" className="mt-3 scroll-mb-32 text-[0.9375rem] font-semibold text-foreground">{t(targetsMessage.text)}</p>
            : <p ref={status} id={TARGETS_ERROR_ID} role="alert" className={`${messageClass} flex scroll-mb-32 items-start gap-1.5 text-danger`}><AlertCircleIcon aria-hidden className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0" /><span className="min-w-0">{t(targetsMessage.text)}</span></p>)}
          {planNotes.length > 0 && <PlanNotes notes={planNotes} className="mt-3" />}
          <p className="mt-3.5 text-[0.9375rem] leading-snug text-muted">{t(CARB_FAT_NOTE)}</p>
          <SourcesLink className="mt-1" />
          {isLowCalories(typedNumber(caloriesText)) && <p role="status" className={messageClass}>{t(LOW_CALORIES_NOTE)}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button onClick={() => void saveTargets()}>{t("Save targets")}</Button>
            {/* A quiet disclosure, not a second pill: the form it opens ends with "Work out my numbers", then "Use these" saves the four numbers. */}
            {/* green words are always underlined (green means a link) */}
            <button id="targets-suggest" type="button" aria-expanded={suggest} onClick={() => setSuggest((v) => !v)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.9375rem] font-semibold text-accent underline underline-offset-[3px] transition hover:bg-background active:scale-95">
              {t("Suggest targets")}
              <ChevronRightIcon aria-hidden className={`h-4 w-4 transition-transform ${suggest ? "rotate-90 rtl:-rotate-90" : ""}`} />
            </button>
          </div>
          {suggest && (
            <div className="mt-4">
              <TargetSuggestForm goal={settings.goal} preferences={settings.preferences} onApply={(s, notes, extra) => { applySuggestion(s, notes, extra); focusTargetBox("#targets input"); }} />
            </div>
          )}
          <p className="mt-3.5 text-[0.8125rem] leading-snug text-muted">{t(SUGGESTION_NOTE)}</p>
        </Card>
      </Section>

      <Section title={t("Reminders")}>
        <div className="glass divide-y divide-line overflow-hidden rounded-[1.25rem]">
          <LinkRow href="/app/reminders">{t("Manage reminders")}</LinkRow>
        </div>
      </Section>

      <Section title={t("Diet and allergies")} id="diet">
        <DietPicker value={settings.preferences} onChange={(preferences) => updateSettings({ preferences })} />
      </Section>

      <Section title={t("Your supermarkets")}>
        <p className="-mt-1 mb-3 text-[0.9375rem] leading-snug text-muted">{t("Groceries and Recipes open on the first one you picked.")}</p>
        <ShopPicker value={settings.shops ?? []} onChange={(shops) => updateSettings({ shops: shops.length ? shops : undefined })} />
      </Section>

      {GATING_ENABLED && (
        <Section title={t("Subscription")}>
          <Card className="p-4">
            {/* A calm status in plain words, never a countdown colour (O3: "Premium" is the one name on screen). A subscription that renews shows its plan and
                no date: the date the app holds is Apple's renewal date plus a few days' grace, which read as an end date, and as a date after a free trial's first
                charge (the overnight audit, 20 November 2026). Only the 90-day pass ends on a date. No Premium badge here: beside "Free" it read as part of it. */}
            <p className="text-[1.0625rem] font-bold">
              {!nowPremium ? t("Your plan: Free")
                : PRO_PREVIEW_FROM_ENV || settings.devProOverride ? t("Premium (preview, for testing)")
                : subscribed ? (paid.plan === "annual" ? t("Premium · Annual") : t("Premium · Monthly"))
                : t("Premium")}
            </p>
            {subscribed && nowPremium && !(PRO_PREVIEW_FROM_ENV || settings.devProOverride) && (
              <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{IAP_ENABLED ? t("Renews through the App Store. Change or cancel it with Manage subscription.") : t("Renews until you cancel. To cancel, email us from the support page.")}</p>
            )}
            {paying && paid.plan === "pass90" && paid.until && <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Your pass ends on {date}.", { date: formatDate(new Date(paid.until).toISOString().slice(0, 10), t) })}</p>}
            {!paying && shareUnlockActive(paid, nowMs) && paid.unlockUntil && <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Unlocked for sharing, until {date}.", { date: formatDate(new Date(paid.unlockUntil).toISOString().slice(0, 10), t) })}</p>}
            {/* Someone who pays: Manage subscription is the main button (Apple's own screen). Everyone else: the plans, never a trial-led button (the onboarding
                meeting of 20 November 2026, App Review 3.1.2(c)): the trial this Apple ID can still have is said under it, and its price is on the plans. */}
            {PAID_ACCESS_ENABLED ? (
              subscribed ? (
                IAP_ENABLED && <Button className="mt-3 min-h-12 px-6 text-base" onClick={() => void manageSubscriptions()}>{t("Manage subscription")}</Button>
              ) : !paying && (
                <>
                  <LinkButton href="/app/pro" className="mt-3 min-h-12 px-6 text-base">{t("See plans")}</LinkButton>
                  {trial && !nowPremium && <p className="mt-2 text-[0.9375rem] leading-snug text-muted">{t("You can still have a {days}-day free trial.", { days: trial })}</p>}
                </>
              )
            ) : !PAYMENTS_ENABLED && <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Premium isn't available on the web yet. Every chain's full menu with calories and macros stays free.")}</p>}
            {/* Restore purchases (and its answer) for anyone not subscribed; a subscriber already has Manage subscription above */}
            {IAP_ENABLED && !subscribed && <AppStoreAccountButtons />}
          </Card>
        </Section>
      )}

      <Section title={t("About")}>
        <div className="glass divide-y divide-line overflow-hidden rounded-[1.25rem]">
          <LinkRow href="/app/settings/sources">{t("Where your daily targets come from")}</LinkRow>
          <LinkRow href="/app/settings/numbers">{t("How we get our numbers")}</LinkRow>
          <LinkRow href="/privacy" external>{t("Privacy policy")}</LinkRow>
          <LinkRow href="/terms" external>{t("Terms of use")}</LinkRow>
          {/* When the menus were last published, with a quiet pill to fetch them again. */}
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 text-[0.9375rem] leading-snug text-muted">
            <span className="min-w-0 flex-[1_1_10rem] [text-wrap:balance]">
              {menu.dataVersion ? <>{t("Menus updated {date}.", { date: formatDate(dataVersionDate(menu.dataVersion), t) })} </> : menu.status === "error" ? <>{t("Couldn't reach the menus.")} </> : <>{t("No menus published yet.")} </>}
              {/* what the last tap of Refresh menus found */}
              {menuCheck && menuCheck !== "checking" && <span role="status" className="mt-1 block font-semibold text-foreground">{menuCheck === "new" ? t("New menus loaded.") : menuCheck === "same" ? t("Up to date.") : t("Couldn't reach the menus. Try again when you're online.")}</span>}
            </span>
            <Button variant="secondary" className="shrink-0 px-4 text-[0.875rem]" busy={menuCheck === "checking"} busyLabel={t("Checking…")} onClick={() => void refreshMenus()}>{t("Refresh menus")}</Button>
          </p>
        </div>
      </Section>

      {(failed.length > 0 || pending.length > 0) && (
        <Section title={t("Unsent messages")}>
          <ul className="space-y-2.5">
            {outboxItems.filter((i) => i.status !== "sent").map((i) => (
              <li key={i.id} className="glass rounded-[1.25rem] p-4">
                <p className="text-[0.9375rem] font-semibold leading-snug">{i.kind === "report" ? t("Number report") : i.kind === "chainRequest" ? t("Chain request") : t("Message")} · {i.status === "failed" ? t("couldn't be sent") : t("will send when you're online")}</p>
                {i.status === "failed" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-edge bg-card px-5 text-[0.9375rem] font-semibold text-foreground transition active:scale-[0.97] hover:bg-background" href={mailtoFor(i, site.supportEmail)}>{t("Email instead")}</a>
                    <Button variant="danger" onClick={() => outbox().remove(i.id)}>{t("Delete")}</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Filming mode is for making videos of the app: shown only in testing builds, or while it is on (so it can be switched off); Shift+F works anywhere
          (the review of 2026-11-18 found it shown to everyone) */}
      {(DEV_TOOLS_ENABLED || creator) && (
      <Section title={t("Filming mode")}>
        <Card className="p-3">
          <Toggle label={t("Filming mode")} description={t("Shows the Truth and Swap cards as the dark card with bigger figures, adds a Replay button and hides the bottom bar. Shift+F switches it too.")} checked={creator} onChange={setCreatorMode} />
        </Card>
      </Section>
      )}

      <Section title={t("Your data")}>
        <Card className="p-4">
          {/* the sentence that names what syncs is kept beside the list of synced stores (lib/mm/syncStores.ts), so the two can't drift apart */}
          <p className="text-[0.9375rem] leading-snug text-muted">{account ? t(YOUR_DATA_SYNCED) : t("Your settings, saved orders and log stay on this device. We never receive them.")}</p>
          {!APP_BUILD && <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Browsers can clear site data they haven't seen in a while (iPhone Safari can after about a week). Adding {app} to your Home Screen, and opening it now and then, keeps your data safe.", { app: site.name })}</p>}
          {/* destructive: white with a red edge and red words, last in the card and apart from the rest */}
          <Button variant="danger" className="mt-5" onClick={() => setClearOpen(true)}>{t("Clear data on this device")}</Button>
        </Card>
      </Section>

      {DEV_TOOLS_ENABLED && (
        <Section title={t("Testing tools")}>
          <Card className="space-y-2 p-3">
            {GATING_ENABLED && <Toggle label={t("Premium preview")} description={t("Unlock Premium features without paying (testing builds only)")} checked={settings.devProOverride} onChange={(v) => updateSettings({ devProOverride: v })} />}
            <Button variant="secondary" full onClick={() => { updateSettings({ hasCompletedOnboarding: false }); tourStore.reset(); coachStore.reset(); homePagesStore.reset(); }}>{t("Reset onboarding")}</Button>
            <Button variant="danger" full onClick={() => logStore.reset()}>{t("Clear logs")}</Button>
          </Card>
        </Section>
      )}

      <p className="mt-10 text-center text-[0.8125rem] text-muted">{site.name} · {APP_VERSION}</p>

      <Sheet open={contactOpen} onClose={() => setContactOpen(false)} title={t("Contact us")}>
        {contactOpen && (
          <div className="pb-2 pt-1">
            <ContactForm />
            <p className="mt-5 text-[0.9375rem] leading-snug text-muted"><Rich text={t("Or email {email}, or see the {support}.")} values={{ email: <a className="font-semibold text-accent underline underline-offset-4" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>, support: <a className="font-semibold text-accent underline underline-offset-4" href="/support">{t("support page")}</a> }} /></p>
          </div>
        )}
      </Sheet>

      <Sheet open={clearOpen} onClose={() => setClearOpen(false)} title={t("Clear data on this device")}>
        {/* what goes, named (the audit, 20 November 2026: the old paragraph missed the meal plan, the household, Pip's recipes and more) */}
        <p className="pt-1 text-base leading-snug">{APP_BUILD ? t("This removes from this phone:") : t("This removes from this browser:")}</p>
        <ul className="mt-2 list-disc space-y-1 ps-6 text-base leading-snug marker:text-muted">
          {CLEAR_LIST.map((item) => <li key={item}>{t(item)}</li>)}
        </ul>
        <p className="mt-3 text-base leading-snug">{TEXT_SIZE_CHOICE_ENABLED ? t("It can't be undone. Your text size stays as it is, and the app starts again from the beginning.") : t("It can't be undone. The app starts again from the beginning.")}</p>
        {account && <p className="mt-2.5 text-base leading-snug">{t("This also signs you out of your account on this device. What is synced stays in your account.")}</p>}
        {/* Cancel first (secondary, on the left), then the red Clear everything on the right; stacked when the text is large */}
        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2 pb-2">
          <Button full variant="secondary" className="min-h-12 text-base" onClick={() => setClearOpen(false)}>{t("Cancel")}</Button>
          <Button full variant="dangerFilled" className="min-h-12 text-base" busy={clearing} onClick={() => void clearEverything()}>{t("Clear everything")}</Button>
        </div>
      </Sheet>

      {/* typed targets not saved, and the person is leaving the page */}
      <Sheet open={leaving !== null} onClose={() => setLeaving(null)} title={t("Save your new targets?")}>
        <p className="pt-1 text-base leading-snug">{t("You changed your daily targets but haven't saved them.")}</p>
        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2 pb-2">
          <Button full variant="secondary" className="min-h-12 text-base" onClick={() => leaving && goOn(leaving)}>{t("Leave without saving")}</Button>
          <Button full className="min-h-12 text-base" onClick={() => { const to = leaving; if (saveTargets() && to) goOn(to); else setLeaving(null); }}>{t("Save")}</Button>
        </div>
      </Sheet>
    </div>
  );
}
