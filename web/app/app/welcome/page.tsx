"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import { SUGGESTION_NOTE } from "@/lib/mm/targets";
import { settingsStore, updateSettings } from "@/lib/mm/stores";
import type { Goal } from "@/lib/mm/types";
import { TEXT_SCALE, type TextSize } from "@/lib/mm/user-data";
import { DietPicker } from "../_components/DietPicker";
import { BoltIcon, CheckIcon, ForkIcon, GiftIcon, ListIcon, PillIcon, ScaleIcon, ShieldIcon, TrendDownIcon } from "../_components/icons";
import { Pip, PipSays } from "../_components/Mascot";
import { TargetSuggestForm } from "../_components/TargetSuggestForm";
import { Button, Field, inputClass, radioKeyNav } from "../_components/ui";
import { useMenu } from "../_lib/hooks";
import { applyTextSize } from "../_lib/textSize";

// SPEC §7.1 and §8, made friendlier at the founder's request (2026-10-10): Pip the mascot says what each step is for, buttons are big,
// one question per screen, and a text-size step so everyone can read it. The SPEC's step headings are kept. Skip on steps 1–4 skips
// that step only (defaults stay); the last step has only Start. Step 3 asks about foods to leave out (the web app has no location step).

const GOALS: ReadonlyArray<{ value: Goal; label: string; hint: string; Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode }> = [
  { value: "lose", label: "Lose weight", hint: "Orders that fit a lower calorie target", Icon: TrendDownIcon },
  { value: "maintain", label: "Maintain", hint: "Stay where you are", Icon: ScaleIcon },
  { value: "buildMuscle", label: "Build muscle", hint: "More protein in every order", Icon: BoltIcon },
  { value: "glp1", label: "I'm on a GLP-1 medication", hint: "Smaller, protein-first orders", Icon: PillIcon },
];

const SIZES: ReadonlyArray<{ value: TextSize; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "Extra large" },
];

const STEPS = 5;

export default function WelcomePage() {
  const router = useRouter();
  const menu = useMenu();
  const initial = settingsStore.get();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>(initial.goal);
  const [calories, setCalories] = useState(String(initial.dailyCalories));
  const [protein, setProtein] = useState(initial.dailyProtein ? String(initial.dailyProtein) : "");
  const [mealCap, setMealCap] = useState(String(initial.glp1MealCap));
  const [prefs, setPrefs] = useState(initial.preferences);
  const [size, setSize] = useState<TextSize>(initial.textSize ?? "standard");
  const [showSuggest, setShowSuggest] = useState(false);

  const next = () => {
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  };
  const skip = () => {
    analytics.track({ name: "onboardingSkipped", step });
    next();
  };
  const chooseSize = (s: TextSize) => {
    setSize(s);
    applyTextSize(s); // preview straight away
  };

  const caloriesNumber = Number(calories);
  const caloriesValid = Number.isFinite(caloriesNumber) && caloriesNumber >= 500 && caloriesNumber <= 10000;
  const proteinNumber = protein.trim() === "" ? undefined : Number(protein);
  const proteinValid = proteinNumber === undefined || (Number.isFinite(proteinNumber) && proteinNumber > 0 && proteinNumber <= 1000);
  const capNumber = Number(mealCap);
  const capValid = Number.isFinite(capNumber) && capNumber >= 100 && capNumber <= 2000;
  const restaurants = menu.chains.filter((c) => !c.sample).length;

  if (step === 0) {
    return (
      <div className="flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col items-center text-center">
        <div className="relative mt-6 flex w-full justify-center">
          <span aria-hidden className="absolute top-6 h-44 w-44 rounded-full opacity-70 blur-3xl [background:var(--sun)]" />
          <div className="pop-in relative"><Pip mood="wave" size={176} /></div>
        </div>
        <h1 className="mt-4 text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.03em]">Hi, I&apos;m <span className="serif-em sun-text pr-0.5">Pip</span>!</h1>
        <p className="mt-3 max-w-[22rem] text-lg leading-snug text-muted">
          I&apos;ll show you the calories and protein in every dish at {restaurants > 0 ? <strong className="app-numbers text-foreground">{restaurants} UK restaurants</strong> : "UK restaurants"}, straight from each restaurant&apos;s own guide.
        </p>
        <ul className="stagger mt-6 grid w-full grid-cols-3 gap-2">
          {[
            { Icon: ShieldIcon, text: "No account needed" },
            { Icon: CheckIcon, text: "Stays on your phone" },
            { Icon: GiftIcon, text: "Every menu free" },
          ].map(({ Icon, text }) => (
            <li key={text} className="glass flex flex-col items-center gap-2 rounded-3xl px-2 py-3 text-[13px] font-semibold leading-tight">
              <span aria-hidden className="icon-bubble-soft h-9 w-9"><Icon className="h-[18px] w-[18px]" /></span>
              {text}
            </li>
          ))}
        </ul>
        <div className="mt-auto w-full pt-8">
          <Button full className="min-h-14 text-lg" onClick={next}>Let&apos;s go</Button>
          <p className="mt-3 text-sm text-muted">Takes about a minute.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh_-_max(1.25rem,env(safe-area-inset-top))_-_2rem)] flex-col">
      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold text-muted" aria-live="polite">Step {step} of {STEPS}</p>
        <div aria-hidden className="flex flex-1 gap-1.5">
          {Array.from({ length: STEPS }, (_, i) => i + 1).map((n) => (
            <span key={n} className={`h-2 flex-1 rounded-full transition-colors duration-300 ${n <= step ? "bg-sun" : "bg-soft-strong"}`} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <section className="mt-4 flex flex-1 flex-col">
          <PipSays mood="think">First, what are you aiming for? I&apos;ll use it to suggest orders for you.</PipSays>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight">What&apos;s your <span className="serif-em sun-text pr-0.5">goal</span>?</h1>
          <div role="radiogroup" aria-label="Your goal" className="mt-6 space-y-3">
            {GOALS.map((g, i) => {
              const on = goal === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setGoal(g.value)}
                  onKeyDown={(e) => radioKeyNav(e, i, GOALS.length, (n) => setGoal(GOALS[n]!.value))}
                  className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-3xl border px-4 py-3 text-left transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "hero-card" : "glass hover:bg-soft-strong"}`}
                >
                  <span aria-hidden className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${on ? "icon-bubble" : "icon-bubble-soft"}`}><g.Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold leading-tight">{g.label}</span>
                    <span className="block text-sm text-muted">{g.hint}</span>
                  </span>
                  <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${on ? "bg-sun border-transparent text-on-accent" : "border-line"}`}>
                    {on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <Actions onContinue={() => { updateSettings({ goal }); next(); }} onSkip={skip} />
        </section>
      )}

      {step === 2 && (
        <section className="mt-4 flex flex-1 flex-col">
          <PipSays mood="point">Not sure of your numbers? Tap &ldquo;Suggest targets for me&rdquo; and I&apos;ll help.</PipSays>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight">Your daily <span className="serif-em sun-text pr-0.5">targets</span></h1>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Field label="Calories"><input className={`${inputClass} min-h-14 text-lg`} inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} /></Field>
            <Field label="Protein (g)"><input className={`${inputClass} min-h-14 text-lg`} inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="Optional" /></Field>
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
          <button type="button" className="mt-4 min-h-12 text-left text-base font-semibold text-accent underline underline-offset-4" onClick={() => setShowSuggest((v) => !v)} aria-expanded={showSuggest}>
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
        <section className="mt-4 flex flex-1 flex-col">
          <PipSays mood="wave">Tell me what you don&apos;t eat. I&apos;ll leave it out of your top picks.</PipSays>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight">Anything you <span className="serif-em sun-text pr-0.5">avoid</span>?</h1>
          <p className="mb-4 mt-2 text-muted">Tap everything that applies. Change it any time.</p>
          <DietPicker value={prefs} onChange={setPrefs} />
          <Actions onContinue={() => { updateSettings({ preferences: prefs }); next(); }} onSkip={skip} />
        </section>
      )}

      {step === 4 && (
        <section className="mt-4 flex flex-1 flex-col">
          <PipSays mood="point">Pick the size that&apos;s comfortable to read. You can change it any time in Settings.</PipSays>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight">Easy to <span className="serif-em sun-text pr-0.5">read</span></h1>
          <div role="radiogroup" aria-label="Text size" className="mt-6 space-y-3">
            {SIZES.map((s, i) => {
              const on = size === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => chooseSize(s.value)}
                  onKeyDown={(e) => radioKeyNav(e, i, SIZES.length, (n) => chooseSize(SIZES[n]!.value))}
                  className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-3xl border px-5 py-3 text-left transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "hero-card" : "glass hover:bg-soft-strong"}`}
                >
                  <span aria-hidden className="w-14 shrink-0 font-extrabold leading-none" style={{ fontSize: `${(TEXT_SCALE[s.value] / 100) * 1.6}rem` }}>Aa</span>
                  <span className="flex-1 text-lg font-bold">{s.label}</span>
                  <span aria-hidden className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${on ? "bg-sun border-transparent text-on-accent" : "border-line"}`}>
                    {on && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <Actions onContinue={() => { updateSettings({ textSize: size }); next(); }} onSkip={() => { chooseSize(initial.textSize ?? "standard"); skip(); }} />
        </section>
      )}

      {step === 5 && (
        <section className="relative mt-4 flex flex-1 flex-col">
          <Confetti />
          <PipSays mood="cheer">You&apos;re all set! Here&apos;s how it works.</PipSays>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight">Here&apos;s how it <span className="serif-em sun-text pr-0.5">works</span></h1>
          <ol className="stagger mt-6 space-y-3">
            {[
              { Icon: ForkIcon, text: "Pick a restaurant" },
              { Icon: ListIcon, text: "See every item's calories and protein" },
              { Icon: BoltIcon, text: "Build the order that fits your day" },
            ].map(({ Icon, text }, i) => (
              <li key={text} className="glass flex min-h-16 items-center gap-4 rounded-3xl px-4 py-3 text-lg font-semibold leading-snug">
                <span aria-hidden className="icon-bubble relative h-12 w-12 shrink-0"><Icon className="h-6 w-6" /><span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[11px] font-extrabold text-background">{i + 1}</span></span>
                {text}
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-8">
            <Button
              full
              className="min-h-14 text-lg"
              onClick={() => {
                updateSettings({ hasCompletedOnboarding: true });
                analytics.track({ name: "onboardingCompleted", goal: settingsStore.get().goal });
                // Back to the page the visitor first opened (a shared link), if it's inside the app.
                const target = new URLSearchParams(window.location.search).get("next");
                router.replace(target && /^\/app(?![\w-])/.test(target) && !target.startsWith("//") && !target.startsWith("/app/welcome") ? target : "/app");
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
      <Button full className="min-h-14 text-lg" onClick={onContinue} disabled={continueDisabled}>Continue</Button>
      <Button full variant="ghost" className="min-h-12 text-base" onClick={onSkip}>Skip</Button>
    </div>
  );
}

/** A little burst of colour on the last step (decorative; hidden for reduced motion). */
function Confetti() {
  const colours = ["#a3e635", "#34d399", "#10b981", "#38bdf8", "#c084fc", "#fbbf24"];
  return (
    <div aria-hidden className="confetti -mx-5">
      {Array.from({ length: 18 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 53) % 100}%`, background: colours[i % colours.length], animationDelay: `${(i % 6) * 0.12}s`, transform: `rotate(${i * 37}deg)` }} />
      ))}
    </div>
  );
}
