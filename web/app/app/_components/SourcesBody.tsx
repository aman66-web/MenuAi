"use client";

import Link from "next/link";
import { site } from "@/site.config";
import { formatDate, formatInt } from "@/lib/mm/format";
import { DEFAULT_GLP1_MEAL_CAP } from "@/lib/mm/budget";
import { DEFAULT_WATER_GOAL_ML } from "@/lib/mm/water";
import { CALORIE_ADJUSTMENT, FAT_SHARE, MIN_SUGGESTED_CALORIES, PROTEIN_PER_KG, PROTEIN_SHARE_MAX, PROTEIN_SHARE_MIN, PROTEIN_SHARE_WITHOUT_TARGET } from "@/lib/mm/targets";
import { TARGET_SOURCES_CHECKED, targetSource, type TargetSource } from "@/lib/mm/targetSources";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";

// "Where these numbers come from" (App Review 1.4.1, 30 October 2026: citations for the health information, easy to find). One list of what the app
// suggests, and for each part either the published source (a link) or a plain statement that it is Numbite's own starting point. Nothing here claims a source
// that was not read (lib/mm/targetSources.ts), and every figure in the words is read from the same constants the suggestions use, so the two cannot drift apart.
// Shown in a sheet (Settings, onboarding) and as a page (Settings > About), so a person in onboarding never has to leave it.

const percent = (share: number) => `${Math.round(share * 100)}%`;
const perKg = (n: number) => String(n);

function SourceLink({ source }: { source: TargetSource }) {
  const t = useT();
  return (
    <p className="mt-2.5 text-[0.9375rem] leading-snug">
      <a className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4" href={source.url} target="_blank" rel="noopener noreferrer">
        <span>{source.citation}<span className="sr-only"> {t("(opens in a new tab)")}</span></span>
      </a>
    </p>
  );
}

type Level = "h2" | "h3";

function Block({ title, level, children }: { title: string; level: Level; children: React.ReactNode }) {
  const H = level;
  return (
    <section className="rounded-[1.25rem] bg-soft p-4 [.sheet-panel_&]:bg-soft">
      <H className="text-base font-bold leading-snug">{title}</H>
      <div className="mt-1.5 space-y-2 text-[0.9375rem] leading-relaxed">{children}</div>
    </section>
  );
}

/** `level`: the headings inside, one below the title they sit under (the sheet's title is an h2, the page's an h1). */
export function SourcesBody({ withNumbersLink, level = "h3" }: { withNumbersLink?: boolean; level?: Level }) {
  const t = useT();
  const app = site.name;
  return (
    <div className="space-y-3.5 pb-2">
      <p className="text-base leading-relaxed">{t("{app} suggests daily calories, protein, carbs and fat as a starting point. They are not medical advice, and you can change any of them. This page says where each part comes from.", { app })}</p>

      <Block level={level} title={t("Calories your body uses at rest")}>
        <p>{t("We estimate the calories your body uses at rest with the Mifflin-St Jeor equation, from your sex, age, weight and height. It was published for healthy people.")}</p>
        <SourceLink source={targetSource("mifflin")} />
        <p>{t("If you don't say whether you are male or female, we use a figure halfway between the two. That choice is {app}'s own, not from the paper.", { app })}</p>
      </Block>

      <Block level={level} title={t("How many calories people need")}>
        <p>{t("The NHS says an average man needs about {man} kcal a day and an average woman about {woman} kcal, and that this can differ with your age, weight, height and how much exercise you do. It also says you're likely to lose weight if you eat and drink fewer calories than you use.", { man: formatInt(2500), woman: formatInt(2000) })}</p>
        <SourceLink source={targetSource("nhs-calories")} />
      </Block>

      <Block level={level} title={t("Protein")}>
        <p>{t("The International Society of Sports Nutrition says that {low} to {high} grams of protein per kilogram of body weight a day is enough for most people who exercise. That paper is about healthy people who exercise.", { low: perKg(1.4), high: perKg(2) })}</p>
        <SourceLink source={targetSource("issn-protein")} />
        <p>{t("The exact figures {app} starts from ({low} to {high} grams per kilogram, depending on your goal) are its own starting points.", { app, low: perKg(PROTEIN_PER_KG.maintain), high: perKg(PROTEIN_PER_KG.buildMuscle) })}</p>
      </Block>

      <Block level={level} title={t("{app}'s own starting points", { app })}>
        <p>{t("These are not taken from a published source. They are just where {app} starts, and you can change all of them in Settings.", { app })}</p>
        <ul className="list-disc space-y-1.5 ps-5">
          <li>{t("The four activity levels, from mostly sitting to very active, and the numbers we multiply your resting calories by.")}</li>
          <li>{t("For the lose-weight and GLP-1 goals, {lose} kcal a day below that estimate. To build muscle, {gain} kcal a day above it.", { lose: formatInt(Math.abs(CALORIE_ADJUSTMENT.lose)), gain: formatInt(CALORIE_ADJUSTMENT.buildMuscle) })}</li>
          <li>{t("We never suggest fewer than {min} kcal a day, and we show a note if you type less than that.", { min: formatInt(MIN_SUGGESTED_CALORIES) })}</li>
          <li>{t("Protein kept between {low} and {high} of your calories. For a vegetarian or vegan diet, the grams per kilogram start a little higher.", { low: percent(PROTEIN_SHARE_MIN), high: percent(PROTEIN_SHARE_MAX) })}</li>
          <li>{t("When you leave protein, carbs and fat empty: protein at about {protein} of your calories, fat at about {fat}, and carbs the rest.", { protein: percent(PROTEIN_SHARE_WITHOUT_TARGET), fat: percent(FAT_SHARE) })}</li>
          <li>{t("A water goal of {ml} ml until you set your own.", { ml: formatInt(DEFAULT_WATER_GOAL_ML) })}</li>
          <li>{t("For the GLP-1 goal, a comfortable meal size that starts at {kcal} kcal. It only decides which orders {app} shows as smaller, protein-first ones.", { kcal: formatInt(DEFAULT_GLP1_MEAL_CAP), app })}</li>
        </ul>
      </Block>

      <p className="text-[0.9375rem] leading-relaxed text-muted">{t("A doctor or dietitian can give advice that fits you. {app} doesn't give medical advice.", { app })}</p>
      <p className="text-[0.9375rem] leading-relaxed text-muted">{t("Links open in your browser. Sources checked on {date}.", { date: formatDate(TARGET_SOURCES_CHECKED, t) })}</p>
      {withNumbersLink && (
        <p className="text-[0.9375rem] leading-relaxed">
          <Rich text={t("Numbers for restaurants, shops and recipes: {link}.")} values={{ link: <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4" href="/app/settings/numbers">{t("How we get our numbers")}</Link> }} />
        </p>
      )}
    </div>
  );
}
