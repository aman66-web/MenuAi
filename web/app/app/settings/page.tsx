"use client";

import Link from "next/link";
import { useState } from "react";
import { APP_BUILD, DEV_TOOLS_ENABLED, PAYMENTS_ENABLED, PRO_ENABLED, PRO_PREVIEW_FROM_ENV, APP_VERSION } from "@/lib/mm/config";
import { isPro } from "@/lib/mm/entitlements";
import { dataVersionDate } from "@/lib/mm/menu-client";
import { formatDate } from "@/lib/mm/format";
import { mailtoFor } from "@/lib/mm/outbox";
import { compareStore, cupboardStore, favoritesStore, recentStore, logStore, myRecipesStore, outbox, outboxStore, savedRecipesStore, savedStore, settingsStore, shoppingStore, updateSettings, waterStore, clearReminders } from "@/lib/mm/stores";
import { DEFAULT_SETTINGS, type TextSize } from "@/lib/mm/user-data";
import { CARB_FAT_NOTE, GLP1_NOTE, isLowCalories, LOW_CALORIES_NOTE, MAX_MACRO_TARGET, suggestCarbFat, suggestProtein, SUGGESTION_NOTE } from "@/lib/mm/targets";
import type { Goal } from "@/lib/mm/types";
import { DEFAULT_WATER_GOAL_ML, MAX_WATER_GOAL_ML, MIN_WATER_GOAL_ML } from "@/lib/mm/water";
import { site } from "@/site.config";
import { CheckIcon, ChevronRightIcon, GlobeIcon } from "../_components/icons";
import { BackLink } from "../groceries/PageBits";
import { LanguageList } from "../_components/LanguageList";
import { localeInfo, tk } from "@/lib/mm/i18n";
import { setLanguage, useLanguage, useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { ContactForm } from "../_components/Submit";
import { AccountSection } from "../_components/AccountSection";
import { DietPicker } from "../_components/DietPicker";
import { ShopPicker } from "../_components/ShopPicker";
import { applyTextSize } from "../_lib/textSize";
import { TargetSuggestForm } from "../_components/TargetSuggestForm";
import { Button, Card, radioKeyNav, Segmented, Sheet, Toggle } from "../_components/ui";
import { menuClient } from "../_lib/menu";
import { useHydrated, useMenu, useSettings, useStore } from "../_lib/hooks";
import { leaveForClearing, useAccountUser } from "../_lib/account";

// SPEC §7.9. Not on the web: Apple Health, Location, StoreKit's manage/restore rows (see docs/WEB_BUILD_PLAN.md).
// Look (founder 2026-10-15, "the rest of the app should match [Home's] elegance"): a compact heavy title, spaced-capital group labels,
// white cards with 20 px corners on the grey page, a grey fill for anything inside a card, one black pill per card for its main action.

const TEXT_OPTIONS: ReadonlyArray<{ value: TextSize; label: string }> = [
  { value: "standard", label: tk("Standard") },
  { value: "large", label: tk("Large") },
  { value: "xlarge", label: tk("Extra large") },
];

const GOAL_OPTIONS: ReadonlyArray<{ value: Goal; label: string }> = [
  { value: "lose", label: tk("Lose") },
  { value: "maintain", label: tk("Maintain") },
  { value: "buildMuscle", label: tk("Build muscle") },
  { value: "glp1", label: tk("GLP-1") },
  { value: "other", label: tk("Other") },
];

/**
 * A target as a figure tile, like the figures on Home: a quiet label at the top and the number below it in a large regular weight, on the
 * light grey fill of anything that sits on a white card. The whole tile is the <label>, so a tap anywhere on it focuses the field, and the
 * ring goes round the tile. An empty carbs or fat field shows the suggestion in grey (the placeholder).
 */
function TargetTile({ label, hint, value, placeholder, onChange, wide }: { label: string; hint?: string; value: string; placeholder?: string; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <label className={`block min-w-0 cursor-text rounded-[1rem] bg-[var(--fill)] px-4 pb-3 pt-3.5 transition-shadow focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${wide ? "col-span-full" : ""}`}>
      <span className="block text-[0.8125rem] font-semibold leading-snug text-muted [overflow-wrap:anywhere]">{label}</span>
      <input
        className="app-numbers mt-1 block w-full min-w-0 bg-transparent text-[1.625rem] font-medium leading-tight tracking-[-0.01em] placeholder:text-muted focus-visible:outline-none!"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="mt-1.5 block text-[0.8125rem] leading-snug text-muted">{hint}</span>}
    </label>
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

/** One choice per row in a white card, the chosen one marked with a lime tick (the same mark as the supermarket list below). */
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
            className={`flex min-h-[3.25rem] w-full items-center justify-between gap-3 px-4 py-2 text-start text-base transition hover:bg-soft-strong focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]! ${on ? "font-bold" : "font-medium"}`}
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">{o.label}</span>
            <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${on ? "bg-sun text-on-accent" : "border border-[color-mix(in_srgb,var(--foreground)_22%,transparent)]"}`}>
              {on && <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LinkRow({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  const cls = "flex min-h-[3.25rem] items-center justify-between gap-3 px-4 py-2 text-base font-semibold transition hover:bg-soft-strong focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]!";
  return external ? (
    <a href={href} className={cls}>{children}<ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" /></a>
  ) : (
    <Link href={href} className={cls}>{children}<ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" /></Link>
  );
}

export default function SettingsPage() {
  const hydrated = useHydrated();
  const settings = useSettings();
  const t = useT();
  const currentLanguage = useLanguage();
  const [languageOpen, setLanguageOpen] = useState(false);
  const menu = useMenu();
  const outboxItems = useStore(outboxStore);
  const [contactOpen, setContactOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const account = useAccountUser();

  // Drafts for the number fields: they commit with "Save targets".
  const [calories, setCalories] = useState<string | null>(null);
  const [protein, setProtein] = useState<string | null>(null);
  const [carbs, setCarbs] = useState<string | null>(null);
  const [fat, setFat] = useState<string | null>(null);
  const [water, setWater] = useState<string | null>(null);
  const [mealCap, setMealCap] = useState<string | null>(null);
  const [targetsMessage, setTargetsMessage] = useState<{ ok: boolean; text: string } | null>(null);

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

  function saveTargets() {
    const c = Number(caloriesText);
    const p = proteinText.trim() === "" ? undefined : Number(proteinText);
    const cb = carbsText.trim() === "" ? undefined : Number(carbsText);
    const ft = fatText.trim() === "" ? undefined : Number(fatText);
    const wt = waterText.trim() === "" ? undefined : Number(waterText);
    const cap = Number(capText);
    if (!Number.isFinite(c) || c < 500 || c > 10000) return setTargetsMessage({ ok: false, text: tk("Calories should be between 500 and 10,000.") });
    if (p !== undefined && (!Number.isFinite(p) || p <= 0 || p > 1000)) return setTargetsMessage({ ok: false, text: tk("Protein should be above 0 and at most 1,000 g.") });
    if ([cb, ft].some((g) => g !== undefined && (!Number.isFinite(g) || g <= 0 || g > MAX_MACRO_TARGET))) return setTargetsMessage({ ok: false, text: tk("Carbs and fat should be above 0 and at most 2,000 g.") });
    if (wt !== undefined && (!Number.isFinite(wt) || wt < MIN_WATER_GOAL_ML || wt > MAX_WATER_GOAL_ML)) return setTargetsMessage({ ok: false, text: tk("Water should be between 250 and 6,000 ml.") });
    if (settings.goal === "glp1" && (!Number.isFinite(cap) || cap < 100 || cap > 2000)) return setTargetsMessage({ ok: false, text: tk("Meal size should be between 100 and 2,000 calories.") });
    updateSettings({ dailyCalories: c, dailyProtein: p, dailyCarbs: cb, dailyFat: ft, dailyWater: wt === undefined ? undefined : Math.round(wt), hasSetTargets: true, ...(settings.goal === "glp1" ? { glp1MealCap: cap } : {}) });
    setCalories(null);
    setProtein(null);
    setCarbs(null);
    setFat(null);
    setWater(null);
    setMealCap(null);
    setTargetsMessage({ ok: true, text: tk("Saved.") });
  }

  return (
    <div>
      {/* Settings is the gear on Home, not a tab: Back returns to the page before (Home by default) */}
      <BackLink href="/app" label={t("Back to home")} />
      <h1 className="mt-4 text-[1.75rem] font-[800] leading-none tracking-[-0.02em]">{t("Settings")}</h1>

      <Section title={t("Account")} id="account">
        <AccountSection />
      </Section>

      <Section title={t("Language")}>
        <button type="button" onClick={() => setLanguageOpen(true)} className="glass flex min-h-16 w-full items-center gap-3.5 rounded-[1.25rem] px-4 py-3 text-start transition hover:bg-soft-strong active:scale-[0.99]">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-soft-strong"><GlobeIcon className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1 text-[1.0625rem] font-bold leading-snug" lang={localeInfo(currentLanguage).htmlLang}>{localeInfo(currentLanguage).name}</span>
          <span className="text-[0.9375rem] font-semibold text-accent">{t("Change")}</span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </button>
        <Sheet open={languageOpen} onClose={() => setLanguageOpen(false)} title={t("Language")}>
          <div className="pt-1">
            <LanguageList value={currentLanguage} label={t("Language")} onChange={(language) => { updateSettings({ language }); void setLanguage(language); setLanguageOpen(false); }} />
            <p className="mt-4 text-[0.9375rem] leading-snug text-muted">{t("Restaurant, dish and product names stay as each restaurant and shop writes them, in English.")}</p>
          </div>
        </Sheet>
      </Section>

      <Section title={t("Text size")}>
        <Segmented label={t("Text size")} value={settings.textSize ?? "standard"} options={TEXT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(textSize) => { updateSettings({ textSize }); applyTextSize(textSize); }} />
      </Section>

      <Section title={t("Goal")}>
        <OptionList label={t("Goal")} value={settings.goal} options={GOAL_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(goal) => updateSettings({ goal })} />
        {settings.goal === "glp1" && <p className="mt-3 text-[0.9375rem] leading-snug text-muted">{t("Smaller, protein-first orders, capped at the meal size you set below.")}</p>}
        {settings.goal === "glp1" && <p className="mt-1.5 text-[0.9375rem] leading-snug text-muted">{t(GLP1_NOTE, { app: site.name })}</p>}
      </Section>

      <Section title={t("Daily targets")} id="targets">
        <Card className="p-4">
          {/* Two tiles side by side, stacked when the text is large (the minimum width is in rem, so it grows with the text). */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,6.5rem),1fr))] gap-2.5">
            <TargetTile label={t("Calories")} value={caloriesText} onChange={(v) => { setCalories(v); setTargetsMessage(null); }} />
            <TargetTile label={t("Protein (g)")} value={proteinText} placeholder={String(suggestProtein(Number.isFinite(draftCalories) ? draftCalories : settings.dailyCalories))} onChange={(v) => { setProtein(v); setTargetsMessage(null); }} />
            <TargetTile label={t("Carbs (g)")} value={carbsText} placeholder={String(suggestedCarbFat.carbs)} onChange={(v) => { setCarbs(v); setTargetsMessage(null); }} />
            <TargetTile label={t("Fat (g)")} value={fatText} placeholder={String(suggestedCarbFat.fat)} onChange={(v) => { setFat(v); setTargetsMessage(null); }} />
            <TargetTile wide label={t("Water (ml)")} hint={t("Your goal for the day on Home. Left empty it is 2,000 ml.")} value={waterText} placeholder={String(DEFAULT_WATER_GOAL_ML)} onChange={(v) => { setWater(v); setTargetsMessage(null); }} />
            {settings.goal === "glp1" && (
              <TargetTile wide label={t("Comfortable meal size (calories)")} hint={t("Best-for-you picks stay within this size. Default 450.")} value={capText} onChange={(v) => { setMealCap(v); setTargetsMessage(null); }} />
            )}
          </div>
          <p className="mt-3.5 text-[0.9375rem] leading-snug text-muted">{t(CARB_FAT_NOTE)}</p>
          {isLowCalories(caloriesText) && <p role="status" className={messageClass}>{t(LOW_CALORIES_NOTE)}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button onClick={saveTargets}>{t("Save targets")}</Button>
            {/* A quiet disclosure, not a second pill: the form it opens ends with its own "Suggest targets" button. */}
            <button type="button" aria-expanded={suggest} onClick={() => setSuggest((v) => !v)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.9375rem] font-semibold text-accent transition hover:bg-soft-strong active:scale-95">
              {t("Suggest targets")}
              <ChevronRightIcon aria-hidden className={`h-4 w-4 transition-transform ${suggest ? "rotate-90 rtl:-rotate-90" : ""}`} />
            </button>
          </div>
          {targetsMessage && (targetsMessage.ok
            ? <p role="status" className="mt-3 text-[0.9375rem] font-semibold text-accent">{t(targetsMessage.text)}</p>
            : <p role="alert" className={messageClass}>{t(targetsMessage.text)}</p>)}
          {suggest && (
            <div className="mt-4">
              <TargetSuggestForm goal={settings.goal} onApply={(c, p) => { setCalories(String(c)); setProtein(String(p)); setSuggest(false); setTargetsMessage(null); }} />
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

      {PRO_ENABLED && (
        <Section title={t("Subscription")}>
          <Card className="p-4">
            <p className="text-[1.0625rem] font-bold">{isPro(settings) ? (PRO_PREVIEW_FROM_ENV || settings.devProOverride ? t("Pro (preview, for testing)") : t("Pro")) : t("Free")}</p>
            {!PAYMENTS_ENABLED && <p className="mt-1 text-[0.9375rem] leading-snug text-muted">{t("Pro isn't available on the web yet. Every chain's full menu with calories and macros stays free.")}</p>}
          </Card>
        </Section>
      )}

      <Section title={t("About")}>
        <div className="glass divide-y divide-line overflow-hidden rounded-[1.25rem]">
          <LinkRow href="/app/settings/numbers">{t("How we get our numbers")}</LinkRow>
          <button type="button" onClick={() => setContactOpen(true)} className="flex min-h-[3.25rem] w-full items-center justify-between gap-3 px-4 py-2 text-start text-base font-semibold transition hover:bg-soft-strong focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]!">{t("Contact us")}<ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" /></button>
          <LinkRow href="/privacy" external>{t("Privacy policy")}</LinkRow>
          <LinkRow href="/terms" external>{t("Terms of use")}</LinkRow>
          {/* When the menus were last published, with a quiet pill to fetch them again. */}
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 text-[0.9375rem] leading-snug text-muted">
            <span className="min-w-0 flex-[1_1_10rem] [text-wrap:balance]">{menu.dataVersion ? <>{t("Menus updated {date}.", { date: formatDate(dataVersionDate(menu.dataVersion), t) })} </> : menu.status === "error" ? <>{t("Couldn't reach the menus.")} </> : <>{t("No menus published yet.")} </>}</span>
            <button type="button" className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-soft-strong px-4 text-[0.875rem] font-bold text-foreground transition active:scale-95 hover:bg-[color-mix(in_srgb,var(--foreground)_12%,var(--soft-strong))]" onClick={() => { menuClient.invalidate(); void menuClient.ensureManifest(true); }}>{t("Refresh menus")}</button>
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
                    <a className="glass inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-semibold" href={mailtoFor(i, site.supportEmail)}>{t("Email instead")}</a>
                    <Button variant="secondary" onClick={() => outbox().remove(i.id)}>{t("Delete")}</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t("Your data")}>
        <Card className="p-4">
          <p className="text-[0.9375rem] leading-snug text-muted">{account ? t("Because you're signed in, your settings, saved meals, shopping list, favourites and today's log are also saved in your account, so they follow you to your other devices. Everything else stays on this device.") : t("Your settings, saved orders and log stay on this device. We never receive them.")}</p>
          {!APP_BUILD && <p className="mt-2.5 text-[0.9375rem] leading-snug text-muted">{t("Browsers can clear site data they haven't seen in a while (iPhone Safari can after about a week). Adding {app} to your Home Screen, and opening it now and then, keeps your data safe.", { app: site.name })}</p>}
          <Button variant="secondary" className="mt-4" onClick={() => setClearOpen(true)}>{t("Clear data on this device")}</Button>
        </Card>
      </Section>

      {DEV_TOOLS_ENABLED && (
        <Section title={t("Testing tools")}>
          <Card className="space-y-2 p-3">
            {PRO_ENABLED && <Toggle label={t("Pro preview")} description={t("Unlock Pro features without paying (testing builds only)")} checked={settings.devProOverride} onChange={(v) => updateSettings({ devProOverride: v })} />}
            <Button variant="secondary" full onClick={() => updateSettings({ hasCompletedOnboarding: false })}>{t("Reset onboarding")}</Button>
            <Button variant="secondary" full onClick={() => logStore.reset()}>{t("Clear logs")}</Button>
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
        <p className="pt-1 text-base leading-snug">{APP_BUILD ? t("This removes your goal, targets, saved orders, log, water you added, reminders you set, favourites, recent searches, the area you typed for Near me, your shopping list, recipes you saved, what you picked to compare and any messages not sent yet from this phone. It can't be undone.") : t("This removes your goal, targets, saved orders, log, water you added, reminders you set, favourites, recent searches, the area you typed for Near me, your shopping list, recipes you saved, what you picked to compare and any messages not sent yet from this browser. It can't be undone.")}</p>
        {account && <p className="mt-2.5 text-base leading-snug">{t("This also signs you out of your account on this device. What is synced stays in your account.")}</p>}
        <div className="mt-5 space-y-2 pb-2">
          <Button full className="min-h-12 text-base" onClick={async () => { await leaveForClearing(); settingsStore.set(DEFAULT_SETTINGS); savedStore.reset(); logStore.reset(); waterStore.reset(); clearReminders(); favoritesStore.reset(); shoppingStore.reset(); myRecipesStore.reset(); savedRecipesStore.reset(); cupboardStore.reset(); recentStore.reset(); compareStore.reset(); outbox().clear(); try { localStorage.removeItem("mm.v1.recentSearches"); sessionStorage.removeItem("mm.browseType"); sessionStorage.removeItem("mm.finder"); sessionStorage.removeItem("mm.sharedAdded"); localStorage.removeItem("mm.v1.mapArea"); } catch { /* storage blocked */ } setClearOpen(false); }}>{t("Clear everything")}</Button>
          <Button full variant="ghost" onClick={() => setClearOpen(false)}>{t("Cancel")}</Button>
        </div>
      </Sheet>
    </div>
  );
}
