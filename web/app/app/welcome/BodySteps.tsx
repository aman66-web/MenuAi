"use client";

import { readAge } from "@/lib/mm/bodyUnits";
import { tk } from "@/lib/mm/i18n";
import { switchHeightUnit, switchWeightUnit, typeHeight, typeWeight, type BodyAnswers, type BodyProblem } from "@/lib/mm/onboardingPlan";
import type { Activity, Sex } from "@/lib/mm/targets";
import { ActivityTiles } from "../_components/BodyFields";
import { PickTile } from "../_components/DietPicker";
import { ShieldIcon } from "../_components/icons";
import { NumberDone } from "../_components/SearchDone";
import { radioKeyNav, Segmented } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { H1 } from "./Frame";
import { GAP, HEADLINE, SUBLINE } from "./parts";
import { CounterText } from "./QuestionSteps";

// The questions about the person (founder, 20 November 2026): screen 5, About you, asks everything on one clean screen (Male, Female or Prefer not to say as big
// tiles, then age, height and weight as big number boxes), and screen 6, How active are you?, is the activity tiles. Height and weight each have their own unit
// (founder 2026-11-20: "The person might know feet in kilograms, or the person might know centimeters and stone ... they should be interchangeable"): feet and
// inches or cm, stone and pounds or kg. Everything here is optional, and the screen says so (founder, the same day: "the person should definitely know that they
// don't have to add any of these"); both screens can be skipped (page.tsx's top-right Skip, and About you's own button while nothing is typed). The age only, never a date of birth. What is typed is kept in the page's React state only and used once, to work out the
// suggested targets (CLAUDE.md rule 4: never stored, never sent), and About you says so on its own line before anything is typed. No Pip on either.

/** `counter`: "Step n of N", read by a screen reader with the headline. */
interface StepProps { body: BodyAnswers; change: (patch: Partial<BodyAnswers>) => void; counter?: string }

/** The id of each box, so a tap on the grey Continue can take the person to the first one that needs them. */
export const BODY_BOX = { age: "welcome-age", heightMajor: "welcome-height", heightMinor: "welcome-height-minor", weightMajor: "welcome-weight", weightMinor: "welcome-weight-minor" } as const;

// Male first (the founder's order), "Prefer not to say" on its own row
const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: "male", label: tk("Male") },
  { value: "female", label: tk("Female") },
  { value: "unspecified", label: tk("Prefer not to say") },
];

/** A big number box with its unit after it ("34 years", "5 ft"). `wide`: three digits and a decimal (age, cm, kg). */
function NumberBox({ id, label, unit, value, onChange, decimal, wide, invalid }: { id: string; label: string; unit: string; value: string; onChange: (v: string) => void; decimal?: boolean; wide?: boolean; invalid?: boolean }) {
  return (
    <label htmlFor={id} className="inline-flex min-w-0 items-center gap-1.5">
      <input
        id={id}
        aria-label={label}
        inputMode={decimal ? "decimal" : "numeric"}
        autoComplete="off"
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`app-numbers h-14 min-w-0 scroll-mb-52 scroll-mt-24 rounded-2xl border-[1.5px] bg-card px-1 text-center text-[2rem] font-semibold leading-none ${invalid ? "border-ink" : "border-edge"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${wide ? "w-[6.5rem]" : "w-[4.5rem]"}`}
      />
      <span aria-hidden className="shrink-0 text-[1.0625rem] font-semibold text-muted">{unit}</span>
    </label>
  );
}

/** One row: its name at the start, its boxes after it, and under the boxes its own unit switch (`units`) where it has one. */
function Row({ name, children, units }: { name: string; children: React.ReactNode; units?: React.ReactNode }) {
  return (
    <div role="group" aria-label={name} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 py-1.5">
      <span aria-hidden className="w-[4.5rem] shrink-0 text-[1.125rem] font-bold">{name}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">{children}</span>
      {units && <div className="w-full ps-[5.25rem] pb-1"><div className="max-w-[15rem]">{units}</div></div>}
    </div>
  );
}

/**
 * Screen 5. `sex`: the tile tapped, or null while none is (the sums use "Prefer not to say" until then). `shown`: the problems to point out (after a tap on the
 * grey Continue; a part of a stone or foot at once).
 */
export function AboutYouStep({ body, sex, change, counter, shown }: StepProps & { sex: Sex | null; shown: readonly BodyProblem[] }) {
  const t = useT();
  const cm = body.height.unit === "cm";
  const kg = body.weight.unit === "kg";
  // a switch each, as in Settings: what is typed is converted to the other unit
  const setHeightUnit = (u: "ft" | "cm") => change({ height: switchHeightUnit(body.height, u) });
  const setWeightUnit = (u: "st" | "kg") => change({ weight: switchWeightUnit(body.weight, u) });
  const bad = (p: BodyProblem) => shown.includes(p);
  return (
    <>
      <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("About you")}<CounterText text={counter} /></h1>
      {/* the screen's one grey line (the founder's examples), with the shield that says it is about privacy */}
      <p className={`${SUBLINE} flex items-start gap-2`}>
        <ShieldIcon aria-hidden className="mt-[0.2rem] h-[1.125rem] w-[1.125rem] shrink-0 text-accent" />
        <span><strong className="font-bold text-foreground">{t("All optional.")}</strong> {t("Only used to work out your numbers. Never saved or sent.")}</span>
      </p>
      <div role="radiogroup" aria-label={t("Sex")} className={`${GAP} grid grid-cols-2 gap-2.5`}>
        {SEX_OPTIONS.map((o, i) => (
          <PickTile
            key={o.value}
            on={o.value === sex}
            role="radio"
            aria-checked={o.value === sex}
            // with none ticked yet, the first takes the Tab key, so the group can be reached
            tabIndex={o.value === sex || (sex === null && i === 0) ? 0 : -1}
            onClick={() => change({ sex: o.value })}
            onKeyDown={(e) => radioKeyNav(e, i, SEX_OPTIONS.length, (n) => change({ sex: SEX_OPTIONS[n]!.value }))}
            className={`text-[1.125rem] font-bold leading-tight ${i === SEX_OPTIONS.length - 1 ? "col-span-full" : ""}`}
          >
            {t(o.label)}
          </PickTile>
        ))}
      </div>
      {/* the Done pill (an iPhone's number pad has no Return key) answers to the boxes below */}
      <div className="group/nums relative mt-3 divide-y divide-line">
        <Row name={t("Age")}>
          <NumberBox id={BODY_BOX.age} label={t("Age in years")} unit={t("years")} value={body.age} onChange={(age) => change({ age })} wide invalid={bad("age")} />
        </Row>
        <Row name={t("Height")} units={<Segmented label={t("Height unit")} value={cm ? "cm" : "ft"} options={[{ value: "ft", label: t("ft and in") }, { value: "cm", label: "cm" }]} onChange={setHeightUnit} />}>
          {cm ? (
            <NumberBox id={BODY_BOX.heightMajor} label={t("Centimetres")} unit="cm" value={body.height.major} onChange={(v) => change({ height: typeHeight(body.height, { major: v }) })} decimal wide invalid={bad("height")} />
          ) : (
            <>
              <NumberBox id={BODY_BOX.heightMajor} label={t("Feet")} unit="ft" value={body.height.major} onChange={(v) => change({ height: typeHeight(body.height, { major: v }) })} invalid={bad("height") || bad("height-part")} />
              <NumberBox id={BODY_BOX.heightMinor} label={t("Inches")} unit="in" value={body.height.minor} onChange={(v) => change({ height: typeHeight(body.height, { minor: v }) })} decimal invalid={bad("height")} />
            </>
          )}
        </Row>
        <Row name={t("Weight")} units={<Segmented label={t("Weight unit")} value={kg ? "kg" : "st"} options={[{ value: "st", label: t("st and lb") }, { value: "kg", label: "kg" }]} onChange={setWeightUnit} />}>
          {kg ? (
            <NumberBox id={BODY_BOX.weightMajor} label={t("Kilograms")} unit="kg" value={body.weight.major} onChange={(v) => change({ weight: typeWeight(body.weight, { major: v }) })} decimal wide invalid={bad("weight")} />
          ) : (
            <>
              <NumberBox id={BODY_BOX.weightMajor} label={t("Stone")} unit="st" value={body.weight.major} onChange={(v) => change({ weight: typeWeight(body.weight, { major: v }) })} invalid={bad("weight") || bad("weight-part")} />
              <NumberBox id={BODY_BOX.weightMinor} label={t("Pounds")} unit="lb" value={body.weight.minor} onChange={(v) => change({ weight: typeWeight(body.weight, { minor: v }) })} decimal invalid={bad("weight")} />
            </>
          )}
        </Row>
        <NumberDone />
      </div>
    </>
  );
}

/** Whether the age typed is under 18 (nothing is worked out then, so height, weight and activity aren't needed). */
export const typedUnder18 = (age: string): boolean => readAge(age).kind === "under18";

/**
 * The one line beside About you's grey Continue: what is missing, or the first thing to check (a part of a stone or a foot is said at once; a number that
 * can't be right after a tap on the grey button).
 */
export function aboutProblemLine(t: ReturnType<typeof useT>, body: BodyAnswers, problems: readonly BodyProblem[]): string | null {
  if (problems.length === 0) return null;
  if (problems.includes("weight-part")) return t("Use the pounds box for part of a stone.");
  if (problems.includes("height-part")) return t("Use the inches box for part of a foot.");
  const typed = (p: BodyProblem) => (p === "age" ? body.age.trim() !== "" : p === "height" ? `${body.height.major}${body.height.minor}`.trim() !== "" : `${body.weight.major}${body.weight.minor}`.trim() !== "");
  const wrong = problems.find((p) => typed(p));
  if (wrong === "age") return t("Enter your age as a whole number from 18 to 100.");
  if (wrong === "height") return t("That height doesn't look right. Please check it.");
  if (wrong === "weight") return t("That weight doesn't look right. Please check it.");
  return t("Add your age, height and weight, or tap Skip.");
}

/** Screen 6. `activity` is null until the person taps a tile (nothing is picked for them); `pick` is their tap. */
export function ActivityStep({ activity, pick, counter }: { activity: Activity | null; pick: (a: Activity) => void; counter?: string }) {
  const t = useT();
  return (
    <>
      <h1 tabIndex={-1} className={`${HEADLINE} ${H1}`}>{t("How active are you?")}<CounterText text={counter} /></h1>
      <div className={GAP}>
        <ActivityTiles value={activity} onChange={pick} />
      </div>
    </>
  );
}
