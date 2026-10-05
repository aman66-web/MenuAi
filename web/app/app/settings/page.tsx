"use client";

import Link from "next/link";
import { useState } from "react";
import { DEV_TOOLS_ENABLED, PAYMENTS_ENABLED, PRO_PREVIEW_FROM_ENV, APP_VERSION } from "@/lib/mm/config";
import { isPro } from "@/lib/mm/entitlements";
import { dataVersionDate } from "@/lib/mm/menu-client";
import { formatDate } from "@/lib/mm/format";
import { mailtoFor } from "@/lib/mm/outbox";
import { favoritesStore, logStore, outbox, outboxStore, savedStore, settingsStore, updateSettings } from "@/lib/mm/stores";
import { DEFAULT_SETTINGS } from "@/lib/mm/user-data";
import { SUGGESTION_NOTE } from "@/lib/mm/targets";
import type { Goal } from "@/lib/mm/types";
import { site } from "@/site.config";
import { ChevronRightIcon } from "../_components/icons";
import { ContactForm } from "../_components/Submit";
import { TargetSuggestForm } from "../_components/TargetSuggestForm";
import { Button, Card, Field, inputClass, Segmented, Sheet, Toggle } from "../_components/ui";
import { menuClient } from "../_lib/menu";
import { useHydrated, useMenu, useSettings, useStore } from "../_lib/hooks";

// SPEC §7.9. Not on the web: Apple Health, Location, StoreKit's manage/restore rows (see docs/WEB_BUILD_PLAN.md).

const GOAL_OPTIONS: ReadonlyArray<{ value: Goal; label: string }> = [
  { value: "lose", label: "Lose" },
  { value: "maintain", label: "Maintain" },
  { value: "buildMuscle", label: "Build muscle" },
  { value: "glp1", label: "GLP-1" },
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
    if (!Number.isFinite(c) || c < 500 || c > 10000) return setTargetsMessage({ ok: false, text: "Calories should be between 500 and 10,000." });
    if (p !== undefined && (!Number.isFinite(p) || p <= 0 || p > 1000)) return setTargetsMessage({ ok: false, text: "Protein should be above 0 and at most 1,000 g." });
    if (settings.goal === "glp1" && (!Number.isFinite(cap) || cap < 100 || cap > 2000)) return setTargetsMessage({ ok: false, text: "Meal size should be between 100 and 2,000 calories." });
    updateSettings({ dailyCalories: c, dailyProtein: p, hasSetTargets: true, ...(settings.goal === "glp1" ? { glp1MealCap: cap } : {}) });
    setCalories(null);
    setProtein(null);
    setMealCap(null);
    setTargetsMessage({ ok: true, text: "Saved." });
  }

  return (
    <div>
      <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>

      <Section title="Goal">
        <Segmented label="Goal" value={settings.goal} options={GOAL_OPTIONS} onChange={(goal) => updateSettings({ goal })} />
        {settings.goal === "glp1" && <p className="mt-2 text-sm text-muted">Smaller, protein-first orders, capped at the meal size you set below.</p>}
      </Section>

      <Section title="Daily targets" id="targets">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories"><input className={inputClass} inputMode="numeric" value={caloriesText} onChange={(e) => { setCalories(e.target.value); setTargetsMessage(null); }} /></Field>
          <Field label="Protein (g)"><input className={inputClass} inputMode="numeric" value={proteinText} placeholder="Optional" onChange={(e) => { setProtein(e.target.value); setTargetsMessage(null); }} /></Field>
        </div>
        {settings.goal === "glp1" && (
          <div className="mt-3">
            <Field label="Comfortable meal size (calories)" hint="Best-for-you picks stay within this size. Default 450.">
              <input className={inputClass} inputMode="numeric" value={capText} onChange={(e) => { setMealCap(e.target.value); setTargetsMessage(null); }} />
            </Field>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={saveTargets}>Save targets</Button>
          <button type="button" aria-expanded={suggest} onClick={() => setSuggest((v) => !v)} className="min-h-11 font-medium text-accent underline">Suggest targets</button>
        </div>
        {targetsMessage && <p role={targetsMessage.ok ? "status" : "alert"} className={`mt-2 text-sm font-medium ${targetsMessage.ok ? "" : "text-accent"}`}>{targetsMessage.text}</p>}
        {suggest && (
          <div className="mt-3">
            <TargetSuggestForm goal={settings.goal} onApply={(c, p) => { setCalories(String(c)); setProtein(String(p)); setSuggest(false); setTargetsMessage(null); }} />
          </div>
        )}
        <p className="mt-2 text-xs text-muted">{SUGGESTION_NOTE}</p>
      </Section>

      <Section title="Preferences">
        <div className="divide-y divide-line">
          <Toggle label="Vegetarian only" checked={settings.preferences.vegetarianOnly} onChange={(v) => updateSettings({ preferences: { ...settings.preferences, vegetarianOnly: v } })} />
          <Toggle label="No pork" checked={settings.preferences.noPork} onChange={(v) => updateSettings({ preferences: { ...settings.preferences, noPork: v } })} />
          <Toggle label="No beef" checked={settings.preferences.noBeef} onChange={(v) => updateSettings({ preferences: { ...settings.preferences, noBeef: v } })} />
        </div>
      </Section>

      <Section title="Subscription">
        <Card className="p-4">
          <p className="font-semibold">{isPro(settings) ? (PRO_PREVIEW_FROM_ENV || settings.devProOverride ? "Pro (preview, for testing)" : "Pro") : "Free"}</p>
          {!PAYMENTS_ENABLED && <p className="mt-1 text-sm text-muted">Pro isn&apos;t available on the web yet. Every chain&apos;s full menu with calories and macros stays free.</p>}
        </Card>
      </Section>

      <Section title="About">
        <div className="glass divide-y divide-line overflow-hidden rounded-3xl">
          <LinkRow href="/app/settings/numbers">How we get our numbers</LinkRow>
          <button type="button" onClick={() => setContactOpen(true)} className="flex min-h-12 w-full items-center justify-between px-4 py-2 text-left hover:bg-soft-strong">Contact us<ChevronRightIcon className="h-5 w-5 text-muted" /></button>
          <LinkRow href="/privacy" external>Privacy policy</LinkRow>
          <LinkRow href="/terms" external>Terms of use</LinkRow>
        </div>
        <p className="mt-3 text-sm text-muted">
          {menu.dataVersion ? <>Menus updated {formatDate(dataVersionDate(menu.dataVersion))}. </> : menu.status === "error" ? <>Couldn&apos;t reach the menus. </> : <>No menus published yet. </>}
          <button type="button" className="min-h-11 font-medium text-accent underline" onClick={() => { menuClient.invalidate(); void menuClient.ensureManifest(true); }}>Refresh menus</button>
        </p>
        <p className="text-sm text-muted">{site.name} · {APP_VERSION}</p>
      </Section>

      {(failed.length > 0 || pending.length > 0) && (
        <Section title="Unsent messages">
          <ul className="space-y-2">
            {outboxItems.filter((i) => i.status !== "sent").map((i) => (
              <li key={i.id} className="glass rounded-3xl p-4">
                <p className="text-sm font-medium">{i.kind === "report" ? "Number report" : i.kind === "chainRequest" ? "Chain request" : "Message"} · {i.status === "failed" ? "couldn't be sent" : "will send when you're online"}</p>
                {i.status === "failed" && (
                  <div className="mt-2 flex gap-2">
                    <a className="glass inline-flex min-h-11 items-center rounded-full px-5 font-semibold" href={mailtoFor(i, site.supportEmail)}>Email instead</a>
                    <Button variant="secondary" onClick={() => outbox().remove(i.id)}>Delete</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Your data">
        <p className="text-sm text-muted">Your settings, saved orders and log stay on this device. We never receive them.</p>
        <p className="mt-2 text-sm text-muted">Browsers can clear site data they haven&apos;t seen in a while (iPhone Safari can after about a week). Adding {site.name} to your Home Screen, and opening it now and then, keeps your data safe.</p>
        <Button variant="secondary" className="mt-3" onClick={() => setClearOpen(true)}>Clear data on this device</Button>
      </Section>

      {DEV_TOOLS_ENABLED && (
        <Section title="Testing tools">
          <div className="space-y-2 rounded-3xl border border-dashed border-line p-3">
            <Toggle label="Pro preview" description="Unlock Pro features without paying (testing builds only)" checked={settings.devProOverride} onChange={(v) => updateSettings({ devProOverride: v })} />
            <Button variant="secondary" full onClick={() => updateSettings({ hasCompletedOnboarding: false })}>Reset onboarding</Button>
            <Button variant="secondary" full onClick={() => logStore.reset()}>Clear logs</Button>
          </div>
        </Section>
      )}

      <Sheet open={contactOpen} onClose={() => setContactOpen(false)} title="Contact us">
        {contactOpen && (
          <div className="pb-2">
            <ContactForm />
            <p className="mt-4 text-sm text-muted">Or email <a className="underline" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>, or see the <a className="underline" href="/support">support page</a>.</p>
          </div>
        )}
      </Sheet>

      <Sheet open={clearOpen} onClose={() => setClearOpen(false)} title="Clear data on this device">
        <p className="text-base">This removes your goal, targets, saved orders, log, favourites and any messages not sent yet from this browser. It can&apos;t be undone.</p>
        <div className="mt-4 space-y-2 pb-2">
          <Button full onClick={() => { settingsStore.set(DEFAULT_SETTINGS); savedStore.reset(); logStore.reset(); favoritesStore.reset(); outbox().clear(); setClearOpen(false); }}>Clear everything</Button>
          <Button full variant="ghost" onClick={() => setClearOpen(false)}>Cancel</Button>
        </div>
      </Sheet>
    </div>
  );
}
