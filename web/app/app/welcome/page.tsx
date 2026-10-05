"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { SUGGESTION_NOTE } from "@/lib/mm/targets";
import { settingsStore, updateSettings } from "@/lib/mm/stores";
import type { Goal } from "@/lib/mm/types";
import { BoltIcon, CheckIcon, ForkIcon, ListIcon } from "../_components/icons";
import { TargetSuggestForm } from "../_components/TargetSuggestForm";
import { Button, Field, inputClass, radioKeyNav, Toggle } from "../_components/ui";

// SPEC §7.1 and §8. Skip on steps 1–3 skips that step only (defaults stay) and moves on; step 4 has only Start.
// Step 3 differs from the spec: the spec asks for location, but the web app has no nearby feature, so this
// step asks about foods to leave out instead (docs/WEB_BUILD_PLAN.md).

const GOALS: ReadonlyArray<{ value: Goal; label: string }> = [
  { value: "lose", label: "Lose weight" },
  { value: "maintain", label: "Maintain" },
  { value: "buildMuscle", label: "Build muscle" },
  { value: "glp1", label: "I'm on a GLP-1 medication" },
];

export default function WelcomePage() {
  const router = useRouter();
  const initial = settingsStore.get();
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<Goal>(initial.goal);
  const [calories, setCalories] = useState(String(initial.dailyCalories));
  const [protein, setProtein] = useState(initial.dailyProtein ? String(initial.dailyProtein) : "");
  const [mealCap, setMealCap] = useState(String(initial.glp1MealCap));
  const [prefs, setPrefs] = useState(initial.preferences);
  const [showSuggest, setShowSuggest] = useState(false);

  const next = () => setStep((s) => s + 1);
  const skip = () => {
    analytics.track({ name: "onboardingSkipped", step });
    next();
  };

  const caloriesNumber = Number(calories);
  const caloriesValid = Number.isFinite(caloriesNumber) && caloriesNumber >= 500 && caloriesNumber <= 10000;
  const proteinNumber = protein.trim() === "" ? undefined : Number(protein);
  const proteinValid = proteinNumber === undefined || (Number.isFinite(proteinNumber) && proteinNumber > 0 && proteinNumber <= 1000);
  const capNumber = Number(mealCap);
  const capValid = Number.isFinite(capNumber) && capNumber >= 100 && capNumber <= 2000;

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col">
      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold text-muted" aria-live="polite">Step {step} of 4</p>
        <div aria-hidden className="flex flex-1 gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${n <= step ? "bg-sun" : "bg-soft-strong"}`} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <section className="mt-3 flex flex-1 flex-col">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight">What&apos;s your <span className="serif-em sun-text pr-0.5">goal</span>?</h1>
          <p className="mt-2 text-muted">We&apos;ll use this to rank orders for you. Change it any time.</p>
          <div role="radiogroup" aria-label="Your goal" className="mt-8 space-y-3">
            {GOALS.map((g, i) => (
              <button
                key={g.value}
                type="button"
                role="radio"
                aria-checked={goal === g.value}
                tabIndex={goal === g.value ? 0 : -1}
                onClick={() => setGoal(g.value)}
                onKeyDown={(e) => radioKeyNav(e, i, GOALS.length, (n) => setGoal(GOALS[n]!.value))}
                className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-3xl border px-5 text-left text-lg font-semibold transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${goal === g.value ? "hero-card" : "glass hover:bg-soft-strong"}`}
              >
                {g.label}
                <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${goal === g.value ? "bg-sun border-transparent text-on-accent" : "border-line"}`}>
                  {goal === g.value && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                </span>
              </button>
            ))}
          </div>
          <Actions
            onContinue={() => {
              updateSettings({ goal });
              next();
            }}
            onSkip={skip}
          />
        </section>
      )}

      {step === 2 && (
        <section className="mt-3 flex flex-1 flex-col">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight">Your daily <span className="serif-em sun-text pr-0.5">targets</span></h1>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Field label="Calories"><input className={inputClass} inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} /></Field>
            <Field label="Protein (g)"><input className={inputClass} inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="Optional" /></Field>
          </div>
          {goal === "glp1" && (
            <div className="mt-4">
              <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
                <span>Comfortable meal size:</span>
                <input className={`${inputClass} w-24`} inputMode="numeric" aria-label="Comfortable meal size in calories" value={mealCap} onChange={(e) => setMealCap(e.target.value)} />
                <span>calories</span>
              </label>
              <p className="mt-1 text-xs text-muted">Orders are capped at this size. The default is 450.</p>
            </div>
          )}
          <button type="button" className="mt-4 min-h-11 text-left font-medium text-accent underline" onClick={() => setShowSuggest((v) => !v)} aria-expanded={showSuggest}>
            Not sure? Suggest targets for me
          </button>
          {showSuggest && (
            <div className="mt-2">
              <TargetSuggestForm goal={goal} onApply={(c, p) => { setCalories(String(c)); setProtein(String(p)); setShowSuggest(false); }} />
            </div>
          )}
          <p className="mt-4 text-xs text-muted">{SUGGESTION_NOTE}</p>
          {(!caloriesValid || !proteinValid || (goal === "glp1" && !capValid)) && (
            <p role="alert" className="mt-3 text-sm font-medium text-accent">Calories should be 500–10,000, protein above 0, and the meal size 100–2,000.</p>
          )}
          <Actions
            continueDisabled={!caloriesValid || !proteinValid || (goal === "glp1" && !capValid)}
            onContinue={() => {
              updateSettings({
                dailyCalories: caloriesNumber,
                hasSetTargets: true,
                ...(proteinNumber !== undefined ? { dailyProtein: proteinNumber } : { dailyProtein: undefined }),
                ...(goal === "glp1" ? { glp1MealCap: capNumber } : {}),
              });
              next();
            }}
            onSkip={skip}
          />
        </section>
      )}

      {step === 3 && (
        <section className="mt-3 flex flex-1 flex-col">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight">Anything you <span className="serif-em sun-text pr-0.5">avoid</span>?</h1>
          <p className="mt-2 text-muted">We&apos;ll leave matching items out of your top picks. Change it any time.</p>
          <div className="glass mt-6 divide-y divide-line rounded-3xl px-5">
            <Toggle label="Vegetarian only" checked={prefs.vegetarianOnly} onChange={(v) => setPrefs({ ...prefs, vegetarianOnly: v })} />
            <Toggle label="No pork" checked={prefs.noPork} onChange={(v) => setPrefs({ ...prefs, noPork: v })} />
            <Toggle label="No beef" checked={prefs.noBeef} onChange={(v) => setPrefs({ ...prefs, noBeef: v })} />
          </div>
          <Actions
            onContinue={() => {
              updateSettings({ preferences: prefs });
              next();
            }}
            onSkip={skip}
          />
        </section>
      )}

      {step === 4 && (
        <section className="mt-3 flex flex-1 flex-col">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight">Here&apos;s how it <span className="serif-em sun-text pr-0.5">works</span></h1>
          <ul className="mt-8 space-y-4">
            {[
              { Icon: ForkIcon, text: "Pick a restaurant" },
              { Icon: ListIcon, text: "See every item's calories and protein" },
              { Icon: BoltIcon, text: "Build the order that fits your day" },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-4 text-lg font-semibold">
                <span className="glass inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl text-accent"><Icon /></span>
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8">
            <Button
              full
              onClick={() => {
                updateSettings({ hasCompletedOnboarding: true });
                analytics.track({ name: "onboardingCompleted", goal: settingsStore.get().goal });
                // Back to the page the visitor first opened (a shared link), if it's inside the app.
                const next = new URLSearchParams(window.location.search).get("next");
                router.replace(next && /^\/app(?![\w-])/.test(next) && !next.startsWith("//") && !next.startsWith("/app/welcome") ? next : "/app");
              }}
            >
              Start
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function Actions({ onContinue, onSkip, continueDisabled }: { onContinue: () => void; onSkip: () => void; continueDisabled?: boolean }) {
  return (
    <div className="mt-auto space-y-2 pt-8">
      <Button full onClick={onContinue} disabled={continueDisabled}>Continue</Button>
      <Button full variant="ghost" onClick={onSkip}>Skip</Button>
    </div>
  );
}
