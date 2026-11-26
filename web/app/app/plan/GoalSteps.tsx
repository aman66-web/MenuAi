"use client";

import { useState } from "react";
import {
  BODY_SET_LABEL, BODY_SETS, changeWords, DAY_TO_DAY, DAY_TO_DAY_LABEL, DAY_TO_DAY_LINE, EXERCISE_CHOICE_LABEL, EXERCISE_CHOICES, EXERCISE_HOW, EXERCISE_LABEL,
  FOCUS_LABEL, GAIN_SURPLUS, GOAL_PACES, LIFTING, LIFTING_LABEL, LOSE_SHARE_A_WEEK, MAX_LOSS_KG_A_WEEK, PACE_LABEL, REPLAN_WEEKS, SESSION_LABEL, SESSION_MINUTES,
  SPORT_KIND_LABEL, SPORT_KIND_LINE, SPORT_KINDS, TRAINING_KIND_LABEL, TRAINING_KINDS, weeksAfter, weightWords,
  type BodyGoal, type ExerciseChoice, type ExerciseDay, type GoalAim, type GoalOutcome, type GoalPace, type Lifting, type SessionMinutes, type SportKind,
  type TrainingKind,
} from "@/lib/mm/bodyGoal";
import { cmToFeetInches, kgToStonePounds, readAge } from "@/lib/mm/bodyUnits";
import { formatInt } from "@/lib/mm/format";
import { localeInfo, tk } from "@/lib/mm/i18n";
import { heightCmOf, weightKgOf, type HeightAnswer, type WeightAnswer } from "@/lib/mm/onboardingPlan";
import { BIG_MEALS, type BigMeal } from "@/lib/mm/planAi";
import { SUGGESTION_NOTE, UNDER_18_COPY } from "@/lib/mm/targets";
import { AgeField, BODY_CARD, HeightField, WeightField } from "../_components/BodyFields";
import { Button } from "../_components/ui";
import { useLanguage, useT } from "../_lib/i18n";
import { BodyFatPicker } from "./BodyFatPicker";
import { Rows } from "./PipSteps";

// Meal plan's goal questions (founder 2026-11-26, "consider the questions you ask like a flowchart to the end, because different questions may need to be asked
// based on what they put for earlier questions"): the screens the aim leads to (page.tsx goalSteps), one question a screen in Meal plan's own look, and "Your
// numbers", the coach's card that explains the day's food, protein, the time to the goal and each day's exercise (lib/mm/bodyGoal.ts works them all out).
// Every body answer stays on this phone (CLAUDE.md rule 4): it lives in the page's state and the saved plan, never in what is sent to Pip.

const NOTE = "text-[0.9375rem] leading-snug";

/** The boxes for a weight, from kilograms (stone and pounds first, as onboarding's). */
function weightBoxes(kg: number | undefined, unit: "kg" | "st" | undefined): WeightAnswer {
  if (kg === undefined) return { unit: unit ?? "st", major: "", minor: "" };
  if (unit === "kg") return { unit: "kg", major: String(Math.round(kg * 10) / 10), minor: "", exact: kg };
  const { st, lb } = kgToStonePounds(kg);
  return { unit: "st", major: String(st), minor: String(lb), exact: kg };
}

function heightBoxes(cm: number | undefined): HeightAnswer {
  if (cm === undefined) return { unit: "ft", major: "", minor: "" };
  const { ft, inch } = cmToFeetInches(cm);
  return { unit: "ft", major: String(ft), minor: String(inch), exact: cm };
}

/** A weight question (the weight now, or the goal): typed in stone and pounds or kilograms. */
export function WeightStep({ kg, unit, onChange }: { kg: number | undefined; unit: "kg" | "st" | undefined; onChange: (kg: number | undefined, unit: "kg" | "st") => void }) {
  const [boxes, setBoxes] = useState<WeightAnswer>(() => weightBoxes(kg, unit));
  return (
    <div className={BODY_CARD}>
      <WeightField value={boxes} onChange={(w) => { setBoxes(w); onChange(weightKgOf(w), w.unit); }} />
    </div>
  );
}

export function HeightStep({ cm, onChange }: { cm: number | undefined; onChange: (cm: number | undefined) => void }) {
  const [boxes, setBoxes] = useState<HeightAnswer>(() => heightBoxes(cm));
  return (
    <div className={BODY_CARD}>
      <HeightField value={boxes} onChange={(h) => { setBoxes(h); onChange(heightCmOf(h)); }} />
    </div>
  );
}

/** About you: female or male (for the drawings, and the lightest goal planned), and age (under 18: no numbers). */
export function AboutYouStep({ body, onBody }: { body: BodyGoal; onBody: (patch: Partial<BodyGoal>) => void }) {
  const t = useT();
  const [age, setAge] = useState(body.age !== undefined ? String(body.age) : "");
  const typeAge = (v: string) => {
    setAge(v);
    const r = readAge(v);
    onBody({ age: r.kind === "ok" ? r.age : r.kind === "under18" ? Math.max(1, Math.round(Number(v))) : undefined });
  };
  return (
    <div className="space-y-4">
      <Rows label={t("Your body")} options={BODY_SETS} value={body.set} onChange={(set) => onBody({ set })} name={(s) => t(BODY_SET_LABEL[s])} />
      <div className={BODY_CARD}><AgeField value={age} onChange={typeAge} /></div>
      {body.age !== undefined && body.age < 18 && <p className={`${NOTE} font-semibold`}>{t(UNDER_18_COPY)}</p>}
    </div>
  );
}

/** Body fat: typed if they know it; "What's my body fat?" opens the drawings (founder: only when they ask). */
export function BodyFatStep({ body, onBody }: { body: BodyGoal; onBody: (patch: Partial<BodyGoal>) => void }) {
  const t = useT();
  const [text, setText] = useState(body.bodyFat !== undefined ? String(body.bodyFat) : "");
  const [pictures, setPictures] = useState(false);
  const type = (v: string) => {
    setText(v);
    const n = Number(v.replace(",", ".").replace("%", "").trim());
    onBody({ bodyFat: v.trim() && Number.isFinite(n) && n >= 4 && n <= 60 ? n : undefined });
  };
  const bad = text.trim() !== "" && body.bodyFat === undefined;
  return (
    <div className="space-y-4">
      <div className={BODY_CARD}>
        <label htmlFor="body-fat" className="mb-2 block text-[0.8125rem] font-semibold text-muted">{t("Body fat %")}</label>
        <input
          id="body-fat"
          className="app-numbers min-h-14 w-full rounded-2xl border-[1.5px] border-edge bg-card px-4 text-[1.375rem] font-bold text-foreground placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          inputMode="decimal"
          autoComplete="off"
          placeholder={t("For example 25")}
          value={text}
          aria-invalid={bad || undefined}
          onChange={(e) => type(e.target.value)}
        />
        {bad && <p role="alert" className={`${NOTE} mt-2 font-medium`}>{t("Type a number from 4 to 60, or pick a drawing.")}</p>}
      </div>
      {!pictures ? (
        <Button variant="secondary" full className="min-h-12" onClick={() => setPictures(true)} aria-expanded={false}>{t("What's my body fat?")}</Button>
      ) : (
        <div>
          <p className="mb-3 text-[1.0625rem] font-bold leading-snug">{t("Choose the one closest to you")}</p>
          <BodyFatPicker set={body.set ?? "female"} value={body.bodyFat} onPick={(bodyFat) => { setText(String(bodyFat)); onBody({ bodyFat }); }} />
        </div>
      )}
    </div>
  );
}

export function PregnantStep({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  const t = useT();
  return <Rows label={t("Pregnant or breastfeeding")} options={[false, true] as const} value={value} onChange={onChange} name={(v) => (v ? t("Yes") : t("No"))} />;
}

export function DayToDayStep({ value, onChange }: { value: BodyGoal["dayToDay"]; onChange: (v: BodyGoal["dayToDay"]) => void }) {
  const t = useT();
  return <Rows label={t("Day to day")} options={DAY_TO_DAY} value={value} onChange={onChange} name={(d) => t(DAY_TO_DAY_LABEL[d])} line={(d) => t(DAY_TO_DAY_LINE[d])} />;
}

export function SportKindStep({ value, onChange }: { value: SportKind | undefined; onChange: (v: SportKind | undefined) => void }) {
  const t = useT();
  return <Rows label={t("Your sport")} options={SPORT_KINDS} value={value} onChange={onChange} name={(k) => t(SPORT_KIND_LABEL[k])} line={(k) => t(SPORT_KIND_LINE[k])} />;
}

export function TrainingKindStep({ value, onChange }: { value: TrainingKind | undefined; onChange: (v: TrainingKind | undefined) => void }) {
  const t = useT();
  return <Rows label={t("What you train")} options={TRAINING_KINDS} value={value} onChange={onChange} name={(k) => t(TRAINING_KIND_LABEL[k])} />;
}

export function LiftingStep({ value, onChange }: { value: Lifting | undefined; onChange: (v: Lifting | undefined) => void }) {
  const t = useT();
  return <Rows label={t("Lifting weights")} options={LIFTING} value={value} onChange={onChange} name={(k) => t(LIFTING_LABEL[k])} />;
}

const EXERCISE_LINE: Record<ExerciseChoice, string> = {
  plan: tk("Strength training and walks for each day, with what they burn"),
  own: tk("I'll count what your own training burns"),
};

export function ExerciseStep({ value, onChange }: { value: ExerciseChoice | undefined; onChange: (v: ExerciseChoice | undefined) => void }) {
  const t = useT();
  return <Rows label={t("Your exercise")} options={EXERCISE_CHOICES} value={value} onChange={onChange} name={(k) => t(EXERCISE_CHOICE_LABEL[k])} line={(k) => t(EXERCISE_LINE[k])} />;
}

export function SessionStep({ value, onChange }: { value: SessionMinutes | undefined; onChange: (v: SessionMinutes | undefined) => void }) {
  const t = useT();
  return <Rows label={t("A usual session")} options={SESSION_MINUTES} value={value} onChange={onChange} name={(m) => t(SESSION_LABEL[m])} />;
}

/** How fast, with what it means for them: a weight a week (losing) or kcal over (gaining). */
export function PaceStep({ aim, body, value, onChange }: { aim: "loseFat" | "muscle"; body: BodyGoal; value: GoalPace | undefined; onChange: (v: GoalPace | undefined) => void }) {
  const t = useT();
  const line = (p: GoalPace) => aim === "loseFat"
    ? t("About {amount} a week", { amount: changeWords(Math.min(MAX_LOSS_KG_A_WEEK, LOSE_SHARE_A_WEEK[p] * (body.weightKg ?? 70)), body.unit) })
    : t("{kcal} kcal a day over what you burn", { kcal: formatInt(GAIN_SURPLUS[p]) });
  return <Rows label={t("How fast")} options={GOAL_PACES} value={value} onChange={onChange} name={(p) => t(PACE_LABEL[p])} line={line} />;
}

const BIG_LABEL: Record<BigMeal, string> = { breakfast: tk("Breakfast"), lunch: tk("Lunch"), dinner: tk("Dinner") };

export function BigMealStep({ meals, value, onChange }: { meals: readonly string[]; value: BigMeal | undefined; onChange: (v: BigMeal | undefined) => void }) {
  const t = useT();
  return <Rows label={t("Your biggest meal")} options={BIG_MEALS.filter((m) => meals.includes(m))} value={value} onChange={onChange} name={(m) => t(BIG_LABEL[m])} />;
}

// ------------------------------------------------------------------------------------------------ the exercise

const DAY_NAME: Record<number, string> = { 1: tk("Monday"), 2: tk("Tuesday"), 3: tk("Wednesday"), 4: tk("Thursday"), 5: tk("Friday"), 6: tk("Saturday"), 0: tk("Sunday") };

/** One day's exercise in words: "Strength training, upper body". */
export function exerciseName(t: ReturnType<typeof useT>, d: ExerciseDay): string {
  return d.focus && d.kind === "strength" ? t("{what}, {focus}", { what: t(EXERCISE_LABEL[d.kind]), focus: t(FOCUS_LABEL[d.focus]) }) : t(EXERCISE_LABEL[d.kind]);
}

/** "45 min · about 150 kcal" (none for a rest day). */
export function exerciseFigures(t: ReturnType<typeof useT>, d: ExerciseDay): string | null {
  if (d.kind === "rest") return null;
  const time = d.minutes >= 60 && d.minutes % 60 === 0 ? (d.minutes === 60 ? t("1 hour") : t("{n} hours", { n: String(d.minutes / 60) })) : t("{n} min", { n: String(d.minutes) });
  return t("{time} · about {kcal} kcal", { time, kcal: formatInt(d.kcal) });
}

/** A day's exercise as a card (the plan's day view), with what to do. */
export function ExerciseDayCard({ day }: { day: ExerciseDay }) {
  const t = useT();
  const figures = exerciseFigures(t, day);
  return (
    <div className={`${BODY_CARD} mt-4`}>
      <p className="text-[0.8125rem] font-semibold text-muted">{t("Exercise")}</p>
      <p className="mt-0.5 text-[1.0625rem] font-bold leading-snug">{exerciseName(t, day)}</p>
      {figures && <p className="app-numbers mt-0.5 text-[0.9375rem] font-semibold leading-snug">{figures}</p>}
      <p className={`${NOTE} mt-1 text-muted`}>{t(EXERCISE_HOW[day.kind])}</p>
    </div>
  );
}

/** The week's exercise as rows, Monday first. */
export function ExerciseWeek({ days }: { days: readonly ExerciseDay[] }) {
  const t = useT();
  return (
    <ul className="mt-2 divide-y divide-line">
      {days.map((d) => {
        const figures = exerciseFigures(t, d);
        return (
          <li key={d.day} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-semibold text-muted">{t(DAY_NAME[d.day]!)}</span>
              <span className="block text-[0.9375rem] font-semibold leading-snug">{exerciseName(t, d)}</span>
            </span>
            {figures && <span className="app-numbers shrink-0 text-end text-[0.875rem] leading-snug text-muted">{figures}</span>}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------------------------------------ your numbers

function useDate(): (d: Date) => string {
  const language = useLanguage();
  const f = new Intl.DateTimeFormat(localeInfo(language).htmlLang, { day: "numeric", month: "long", year: "numeric" });
  return (d) => f.format(d);
}

/** The time to the goal in words: "75 kg in about 16 to 21 weeks: between 18 March and 22 April 2027, if you follow the meals and the exercise most days." */
export function goalTimeLine(t: ReturnType<typeof useT>, date: (d: Date) => string, o: { weeks: [number, number] | null; goalKg?: number; unit?: "kg" | "st"; start: string }): string {
  const goal = o.goalKg !== undefined ? weightWords(o.goalKg, o.unit) : "";
  if (!o.weeks) return t("{goal} is more than 3 years away at this pace. Try a nearer goal first.", { goal });
  const [a, b] = o.weeks;
  const from = date(weeksAfter(o.start, a));
  const to = date(weeksAfter(o.start, b));
  return a === b
    ? t("{goal} in about {a} weeks, around {from}, if you follow the meals and the exercise most days.", { goal, a: String(a), from })
    : t("{goal} in about {a} to {b} weeks: between {from} and {to}, if you follow the meals and the exercise most days.", { goal, a: String(a), b: String(b), from, to });
}

/** "Your numbers": the coach's card (or why there are none). */
export function NumbersCard({ aim, outcome, body, start }: { aim: GoalAim; outcome: GoalOutcome; body: BodyGoal; start: string }) {
  const t = useT();
  const date = useDate();
  if (outcome.kind === "under18") return <p className={`${NOTE} font-semibold`}>{t(UNDER_18_COPY)}</p>;
  if (outcome.kind === "pregnant") return <p className={`${NOTE} font-semibold`}>{t("While you're pregnant or breastfeeding, please ask your midwife or GP about your numbers. I'll plan your meals to your daily targets as they are.")}</p>;
  if (outcome.kind === "wrongWay") return <p className={`${NOTE} font-semibold`}>{aim === "loseFat" ? t("Your goal is above your weight now. Pick a lower goal, or choose Build muscle.") : t("Your goal is below your weight now. Pick a higher goal, or choose Lose fat.")}</p>;
  if (outcome.kind === "tooLean") return <p className={`${NOTE} font-semibold`}>{t("I don't plan goals under {kg} for you: that would be very lean. Please talk to your GP first.", { kg: weightWords(outcome.lowestKg, body.unit) })}</p>;
  if (outcome.kind === "incomplete") return <p className={`${NOTE} font-semibold`}>{t("Answer the questions before this one to see your numbers.")}</p>;
  const o = outcome;
  const burn = o.burnBody + o.burnExercise;
  return (
    <div className="space-y-4">
      <div className={`${BODY_CARD} app-numbers grid grid-cols-2 divide-x divide-line text-center`}>
        <span className="px-2">
          <span className="block text-[1.75rem] font-[800] leading-tight tracking-[-0.01em]">{formatInt(o.kcal)}</span>
          <span className="block text-[0.8125rem] font-semibold text-muted">{t("kcal a day")}</span>
        </span>
        <span className="px-2">
          <span className="block text-[1.75rem] font-[800] leading-tight tracking-[-0.01em]">{t("{n} g", { n: formatInt(o.protein) })}</span>
          <span className="block text-[0.8125rem] font-semibold text-muted">{t("protein a day")}</span>
        </span>
      </div>
      <div className={`${BODY_CARD} app-numbers space-y-2.5`}>
        <p className={NOTE}>{o.burnExercise > 0
          ? t("You burn about {burn} kcal a day: {body} from your body and your day, and {exercise} from exercise.", { burn: formatInt(burn), body: formatInt(o.burnBody), exercise: formatInt(o.burnExercise) })
          : t("You burn about {burn} kcal a day.", { burn: formatInt(burn) })}</p>
        <p className={NOTE}>{aim === "loseFat"
          ? t("Eating {kcal} kcal a day, you'll lose about {amount} a week.", { kcal: formatInt(o.kcal), amount: changeWords(o.weeklyKg, body.unit) })
          : aim === "muscle"
          ? t("Eating a little over that, you'll gain about {amount} a week, for muscle with little extra fat.", { amount: changeWords(o.weeklyKg, body.unit) })
          : t("This covers your training, so you keep your weight. Training days get meals with more carbs.")}</p>
        {o.floored && <p className={NOTE}>{t("I kept your food at {kcal} kcal a day, the least I plan, so it takes a little longer.", { kcal: formatInt(o.kcal) })}</p>}
        <p className={NOTE}>{aim === "sport"
          ? t("Protein: 1.6 g for each kg you weigh, for recovery.")
          : t("Protein: 2 g for each kg of your lean mass, to keep and build muscle.")}</p>
        {aim !== "sport" && <p className={`${NOTE} font-semibold`}>{goalTimeLine(t, date, { weeks: o.weeks, goalKg: body.goalKg, unit: body.unit, start })}</p>}
        {aim !== "sport" && <p className={NOTE}>{t("Make a new plan every {n} weeks with your new weight, so your numbers keep up.", { n: String(REPLAN_WEEKS) })}</p>}
      </div>
      {o.exercise.some((d) => d.kind !== "rest") && (
        <div className={BODY_CARD}>
          <p className="text-[1.0625rem] font-bold">{t("Your exercise each week")}</p>
          <ExerciseWeek days={o.exercise} />
        </div>
      )}
      <p className="text-[0.8125rem] leading-snug text-muted">{t(SUGGESTION_NOTE)}</p>
    </div>
  );
}
