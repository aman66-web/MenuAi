"use client";

import Link from "next/link";
import { useState } from "react";
import { DEV_TOOLS_ENABLED, PAYMENTS_ENABLED, PRO_PREVIEW_FROM_ENV, APP_VERSION } from "@/lib/mm/config";
import { isPro } from "@/lib/mm/entitlements";
import { dataVersionDate } from "@/lib/mm/menu-client";
import { formatDate } from "@/lib/mm/format";
import { mailtoFor } from "@/lib/mm/outbox";
import { favoritesStore, logStore, myRecipesStore, outbox, outboxStore, savedStore, settingsStore, shoppingStore, updateSettings } from "@/lib/mm/stores";
import { DEFAULT_SETTINGS, type TextSize } from "@/lib/mm/user-data";
import { SUGGESTION_NOTE } from "@/lib/mm/targets";
import type { Goal } from "@/lib/mm/types";
import { site } from "@/site.config";
import { ChevronRightIcon, GlobeIcon } from "../_components/icons";
import { LanguageList } from "../_components/LanguageList";
import { localeInfo, tk } from "@/lib/mm/i18n";
import { setLanguage, useLanguage, useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { ContactForm } from "../_components/Submit";
import { DietPicker } from "../_components/DietPicker";
import { ShopPicker } from "../_components/ShopPicker";
import { applyTextSize } from "../_lib/textSize";
import { TargetSuggestForm } from "../_components/TargetSuggestForm";
import { Button, Card, Field, inputClass, Segmented, Sheet, Toggle } from "../_components/ui";
import { menuClient } from "../_lib/menu";
import { useHydrated, useMenu, useSettings, useStore } from "../_lib/hooks";

// SPEC §7.9. Not on the web: Apple Health, Location, StoreKit's manage/restore rows (see docs/WEB_BUILD_PLAN.md).

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

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-8 scroll-mt-4">
      <h2 className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-muted">{title}</h2>
      {children}
    </section>
  );
}

function LinkRow({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  const cls = "flex min-h-12 items-center justify-between px-4 py-2 hover:bg-soft-strong";
  return external ? (
    <a href={href} className={cls}>{children}<ChevronRightIcon className="h-5 w-5 text-muted" /></a>
  ) : (
    <Link href={href} className={cls}>{children}<ChevronRightIcon className="h-5 w-5 text-muted" /></Link>
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

  // Drafts for the number fields: they commit with "Save targets".
  const [calories, setCalories] = useState<string | null>(null);
  const [protein, setProtein] = useState<string | null>(null);
  const [mealCap, setMealCap] = useState<string | null>(null);
  const [targetsMessage, setTargetsMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!hydrated) return null;

  const caloriesText = calories ?? String(settings.dailyCalories);
  const proteinText = protein ?? (settings.dailyProtein ? String(settings.dailyProtein) : "");
  const capText = mealCap ?? String(settings.glp1MealCap);
  const failed = outboxItems.filter((i) => i.status === "failed");
  const pending = outboxItems.filter((i) => i.status === "pending");

  function saveTargets() {
    const c = Number(caloriesText);
    const p = proteinText.trim() === "" ? undefined : Number(proteinText);
    const cap = Number(capText);
    if (!Number.isFinite(c) || c < 500 || c > 10000) return setTargetsMessage({ ok: false, text: tk("Calories should be between 500 and 10,000.") });
    if (p !== undefined && (!Number.isFinite(p) || p <= 0 || p > 1000)) return setTargetsMessage({ ok: false, text: tk("Protein should be above 0 and at most 1,000 g.") });
    if (settings.goal === "glp1" && (!Number.isFinite(cap) || cap < 100 || cap > 2000)) return setTargetsMessage({ ok: false, text: tk("Meal size should be between 100 and 2,000 calories.") });
    updateSettings({ dailyCalories: c, dailyProtein: p, hasSetTargets: true, ...(settings.goal === "glp1" ? { glp1MealCap: cap } : {}) });
    setCalories(null);
    setProtein(null);
    setMealCap(null);
    setTargetsMessage({ ok: true, text: tk("Saved.") });
  }

  return (
    <div>
      <h1 className="text-4xl font-extrabold tracking-tight">{t("Settings")}</h1>

      <Section title={t("Language")}>
        <button type="button" onClick={() => setLanguageOpen(true)} className="glass flex min-h-14 w-full items-center gap-3 rounded-3xl px-4 text-start transition hover:bg-soft-strong active:scale-[0.99]">
          <GlobeIcon className="h-5 w-5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 text-lg font-bold" lang={localeInfo(currentLanguage).htmlLang}>{localeInfo(currentLanguage).name}</span>
          <span className="text-sm font-semibold text-accent">{t("Change")}</span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
        </button>
        <Sheet open={languageOpen} onClose={() => setLanguageOpen(false)} title={t("Language")}>
          <LanguageList value={currentLanguage} label={t("Language")} onChange={(language) => { updateSettings({ language }); void setLanguage(language); setLanguageOpen(false); }} />
          <p className="mt-3 text-sm text-muted">{t("Restaurant, dish and product names stay as each restaurant and shop writes them, in English.")}</p>
        </Sheet>
      </Section>

      <Section title={t("Text size")}>
        <Segmented label={t("Text size")} value={settings.textSize ?? "standard"} options={TEXT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(textSize) => { updateSettings({ textSize }); applyTextSize(textSize); }} />
      </Section>

      <Section title={t("Goal")}>
        <Segmented label={t("Goal")} value={settings.goal} options={GOAL_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} onChange={(goal) => updateSettings({ goal })} />
        {settings.goal === "glp1" && <p className="mt-2 text-sm text-muted">{t("Smaller, protein-first orders, capped at the meal size you set below.")}</p>}
      </Section>

      <Section title={t("Daily targets")} id="targets">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Calories")}><input className={inputClass} inputMode="numeric" value={caloriesText} onChange={(e) => { setCalories(e.target.value); setTargetsMessage(null); }} /></Field>
          <Field label={t("Protein (g)")}><input className={inputClass} inputMode="numeric" value={proteinText} placeholder={t("Optional")} onChange={(e) => { setProtein(e.target.value); setTargetsMessage(null); }} /></Field>
        </div>
        {settings.goal === "glp1" && (
          <div className="mt-3">
            <Field label={t("Comfortable meal size (calories)")} hint={t("Best-for-you picks stay within this size. Default 450.")}>
              <input className={inputClass} inputMode="numeric" value={capText} onChange={(e) => { setMealCap(e.target.value); setTargetsMessage(null); }} />
            </Field>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button onClick={saveTargets}>{t("Save targets")}</Button>
          <button type="button" aria-expanded={suggest} onClick={() => setSuggest((v) => !v)} className="min-h-11 font-medium text-accent underline">{t("Suggest targets")}</button>
        </div>
        {targetsMessage && <p role={targetsMessage.ok ? "status" : "alert"} className={`mt-2 text-sm font-medium ${targetsMessage.ok ? "" : "text-accent"}`}>{t(targetsMessage.text)}</p>}
        {suggest && (
          <div className="mt-3">
            <TargetSuggestForm goal={settings.goal} onApply={(c, p) => { setCalories(String(c)); setProtein(String(p)); setSuggest(false); setTargetsMessage(null); }} />
          </div>
        )}
        <p className="mt-2 text-xs text-muted">{t(SUGGESTION_NOTE)}</p>
      </Section>

      <Section title={t("Diet and allergies")}>
        <DietPicker value={settings.preferences} onChange={(preferences) => updateSettings({ preferences })} />
      </Section>

      <Section title={t("Your supermarkets")}>
        <p className="mb-3 text-sm text-muted">{t("Groceries and Recipes open on the first one you picked.")}</p>
        <ShopPicker value={settings.shops ?? []} onChange={(shops) => updateSettings({ shops: shops.length ? shops : undefined })} />
      </Section>

      <Section title={t("Subscription")}>
        <Card className="p-4">
          <p className="font-semibold">{isPro(settings) ? (PRO_PREVIEW_FROM_ENV || settings.devProOverride ? t("Pro (preview, for testing)") : t("Pro")) : t("Free")}</p>
          {!PAYMENTS_ENABLED && <p className="mt-1 text-sm text-muted">{t("Pro isn't available on the web yet. Every chain's full menu with calories and macros stays free.")}</p>}
        </Card>
      </Section>

      <Section title={t("About")}>
        <div className="glass divide-y divide-line overflow-hidden rounded-3xl">
          <LinkRow href="/app/settings/numbers">{t("How we get our numbers")}</LinkRow>
          <button type="button" onClick={() => setContactOpen(true)} className="flex min-h-12 w-full items-center justify-between px-4 py-2 text-start hover:bg-soft-strong">{t("Contact us")}<ChevronRightIcon className="h-5 w-5 text-muted" /></button>
          <LinkRow href="/privacy" external>{t("Privacy policy")}</LinkRow>
          <LinkRow href="/terms" external>{t("Terms of use")}</LinkRow>
        </div>
        <p className="mt-3 text-sm text-muted">
          {menu.dataVersion ? <>{t("Menus updated {date}.", { date: formatDate(dataVersionDate(menu.dataVersion), t) })} </> : menu.status === "error" ? <>{t("Couldn't reach the menus.")} </> : <>{t("No menus published yet.")} </>}
          <button type="button" className="min-h-11 font-medium text-accent underline" onClick={() => { menuClient.invalidate(); void menuClient.ensureManifest(true); }}>{t("Refresh menus")}</button>
        </p>
        <p className="text-sm text-muted">{site.name} · {APP_VERSION}</p>
      </Section>

      {(failed.length > 0 || pending.length > 0) && (
        <Section title={t("Unsent messages")}>
          <ul className="space-y-2">
            {outboxItems.filter((i) => i.status !== "sent").map((i) => (
              <li key={i.id} className="glass rounded-3xl p-4">
                <p className="text-sm font-medium">{i.kind === "report" ? t("Number report") : i.kind === "chainRequest" ? t("Chain request") : t("Message")} · {i.status === "failed" ? t("couldn't be sent") : t("will send when you're online")}</p>
                {i.status === "failed" && (
                  <div className="mt-2 flex gap-2">
                    <a className="glass inline-flex min-h-11 items-center rounded-full px-5 font-semibold" href={mailtoFor(i, site.supportEmail)}>{t("Email instead")}</a>
                    <Button variant="secondary" onClick={() => outbox().remove(i.id)}>{t("Delete")}</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t("Your data")}>
        <p className="text-sm text-muted">{t("Your settings, saved orders and log stay on this device. We never receive them.")}</p>
        <p className="mt-2 text-sm text-muted">{t("Browsers can clear site data they haven't seen in a while (iPhone Safari can after about a week). Adding {app} to your Home Screen, and opening it now and then, keeps your data safe.", { app: site.name })}</p>
        <Button variant="secondary" className="mt-3" onClick={() => setClearOpen(true)}>{t("Clear data on this device")}</Button>
      </Section>

      {DEV_TOOLS_ENABLED && (
        <Section title={t("Testing tools")}>
          <div className="space-y-2 rounded-3xl border border-dashed border-line p-3">
            <Toggle label={t("Pro preview")} description={t("Unlock Pro features without paying (testing builds only)")} checked={settings.devProOverride} onChange={(v) => updateSettings({ devProOverride: v })} />
            <Button variant="secondary" full onClick={() => updateSettings({ hasCompletedOnboarding: false })}>{t("Reset onboarding")}</Button>
            <Button variant="secondary" full onClick={() => logStore.reset()}>{t("Clear logs")}</Button>
          </div>
        </Section>
      )}

      <Sheet open={contactOpen} onClose={() => setContactOpen(false)} title={t("Contact us")}>
        {contactOpen && (
          <div className="pb-2">
            <ContactForm />
            <p className="mt-4 text-sm text-muted"><Rich text={t("Or email {email}, or see the {support}.")} values={{ email: <a className="underline" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>, support: <a className="underline" href="/support">{t("support page")}</a> }} /></p>
          </div>
        )}
      </Sheet>

      <Sheet open={clearOpen} onClose={() => setClearOpen(false)} title={t("Clear data on this device")}>
        <p className="text-base">{t("This removes your goal, targets, saved orders, log, favourites, recent searches, the area you typed on Nearby, your shopping list, recipes you saved and any messages not sent yet from this browser. It can't be undone.")}</p>
        <div className="mt-4 space-y-2 pb-2">
          <Button full onClick={() => { settingsStore.set(DEFAULT_SETTINGS); savedStore.reset(); logStore.reset(); favoritesStore.reset(); shoppingStore.reset(); myRecipesStore.reset(); outbox().clear(); try { localStorage.removeItem("mm.v1.recentSearches"); sessionStorage.removeItem("mm.browseType"); localStorage.removeItem("mm.v1.mapArea"); } catch { /* storage blocked */ } setClearOpen(false); }}>{t("Clear everything")}</Button>
          <Button full variant="ghost" onClick={() => setClearOpen(false)}>{t("Cancel")}</Button>
        </div>
      </Sheet>
    </div>
  );
}
