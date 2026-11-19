"use client";

import { site } from "@/site.config";
import { formatDate, formatInt } from "@/lib/mm/format";
import { HOUSEHOLD_BASIS, type HouseholdKind } from "@/lib/mm/truth/household";
import { MENU_SOURCES_CHECKED, menuSource, type MenuSource } from "@/lib/mm/truth/menuSources";
import { MOST_PROTEIN, PROTEIN_35_G, SMALL_APPETITE, SUGAR_5_G, UNDER_500_KCAL } from "@/lib/mm/truth/presets";
import { LOW_SHARE_OVER_1000, MIN_SCORED_KCAL, SHARE_BANDS, SIZE_CAPS } from "@/lib/mm/truth/proteinScore";
import { MIN_PROTEIN_ENERGY_SHARE, MIN_PROTEIN_PER_100 } from "@/lib/mm/truth/proteinValue";
import { REFERENCE_INTAKE } from "@/lib/mm/truth/referenceIntake";
import { MIN_ORIGINAL_KCAL, MIN_SAVING_KCAL, MIN_SAVING_SHARE, MIN_SIZE_SHARE } from "@/lib/mm/truth/swap";
import type { Chain } from "@/lib/mm/types";
import { useT } from "../_lib/i18n";

// "Where these numbers come from" for the menu screens (App Review 1.4.1: citations for health information, easy to find): the numbers a dish's Truth card,
// Quick answers and Cheapest protein add to a restaurant's or shop's own figures. Each part either links the source it already links to on the card
// (lib/mm/truth/menuSources.ts: nothing new is cited) or says plainly that it is Numbite's own rule. Every figure in the words is read from the constants
// the features use, so the words and the features cannot drift apart. The targets have their own list (SourcesBody); the sources page shows both.

const percent = (share: number) => `${Math.round(share * 100)}%`;
const bandFor = (score: number) => SHARE_BANDS.find((b) => b.score === score)?.min ?? 0;
const capFor = (score: number) => SIZE_CAPS.find((c) => c.cap === score)?.maxKcal ?? 0;

const HOUSEHOLD_SOURCE: Record<HouseholdKind, MenuSource["id"]> = { sugar: "nhs-sugar", fat: "butter-fat", protein: "egg-protein" };

function SourceLink({ source }: { source: MenuSource }) {
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

/** `level`: the headings inside, one below the title they sit under (a sheet's title is an h2, the page's an h1). `withAdvice`: the "not medical advice" line (the sources page already shows it once). */
export function MenuSourcesBody({ level = "h3", withAdvice = true, chain }: { level?: Level; withAdvice?: boolean; chain?: Pick<Chain, "name" | "source"> }) {
  const t = useT();
  const app = site.name;
  return (
    <div className="space-y-3.5 pb-2">
      {/* on a restaurant's screens, its own figures come first (usability test 2026-11-19: Harold looked here for where Nando's numbers come from) */}
      {chain && (
        <Block level={level} title={t("{chain}'s own figures", { chain: chain.name })}>
          <p>{t("Each dish's figures, and its allergens where they're shown, are {chain}'s own, as it publishes them, checked {date}. {app} doesn't estimate any of them.", { chain: chain.name, date: formatDate(chain.source.checkedOn, t), app })}</p>
          <p className="mt-2.5 text-[0.9375rem] leading-snug">
            <a className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4" href={chain.source.url} target="_blank" rel="noopener noreferrer">
              <span>{chain.source.title}<span className="sr-only"> {t("(opens in a new tab)")}</span></span>
            </a>
          </p>
        </Block>
      )}
      <p className="text-base leading-relaxed">{t("On a dish's Truth card, in Quick answers and in Cheapest protein, {app} adds a few numbers to the restaurant's or shop's own figures. This says where each one comes from.", { app })}</p>

      <Block level={level} title={t("Reference intakes")}>
        <p>
          {t("Percentages are of the UK reference intakes that food labels use for an average adult: {kcal} kcal of energy, {protein} g of protein, {fat} g of fat, {saturates} g of saturates, {sugars} g of sugars and {salt} g of salt a day. They are not a target for you.", {
            kcal: formatInt(REFERENCE_INTAKE.calories),
            protein: REFERENCE_INTAKE.protein,
            fat: REFERENCE_INTAKE.fat,
            saturates: REFERENCE_INTAKE.saturatedFat,
            sugars: REFERENCE_INTAKE.sugar,
            salt: REFERENCE_INTAKE.salt,
          })}
        </p>
        <SourceLink source={menuSource("reference-intakes")} />
      </Block>

      <Block level={level} title={t("Traffic lights")}>
        <p>{t("The colours follow the UK government's guidance for front-of-pack labels, for fat, saturates, sugars and salt only. A figure above the guidance's high level for one portion is red. Green and amber need the dish's weight, so they are only shown when the restaurant publishes it.")}</p>
        <SourceLink source={menuSource("fsa-front-of-pack")} />
      </Block>

      <Block level={level} title={t("What that looks like")}>
        {(["sugar", "fat", "protein"] as const).map((kind) => (
          <div key={kind}>
            <p>{t(HOUSEHOLD_BASIS[kind])}</p>
            <SourceLink source={menuSource(HOUSEHOLD_SOURCE[kind])} />
          </div>
        ))}
      </Block>

      <Block level={level} title={t("{app}'s own rules", { app })}>
        <p>{t("These are not taken from a published source. They are {app}'s own, and they only sort and compare the figures each restaurant or shop publishes.", { app })}</p>
        <ul className="list-disc space-y-1.5 ps-5">
          <li>
            {t("Protein score: 5 needs at least {p5} of an item's calories to come from protein, 4 needs {p4}, 3 needs {p3} and 2 needs {p2}; below that it is 1. Items up to {k5} kcal can score 5, up to {k4} kcal 4, up to {k3} kcal 3, and larger ones 2 at most (1 if under {low} of their calories come from protein). Drinks, sauces, add-ons and items under {min} kcal aren't scored.", {
              p5: percent(bandFor(5)),
              p4: percent(bandFor(4)),
              p3: percent(bandFor(3)),
              p2: percent(bandFor(2)),
              k5: formatInt(capFor(5)),
              k4: formatInt(capFor(4)),
              k3: formatInt(capFor(3)),
              low: percent(LOW_SHARE_OVER_1000),
              min: formatInt(MIN_SCORED_KCAL),
            })}
          </li>
          <li>
            {t("Quick answers: meals of {under} kcal or less; meals with {p35} g of protein or more; for a small appetite, {small} kcal or less with at least {smallP} g of protein; {sugar} g of sugar or less; and for the most protein for the calories, meals of {mostK} kcal or more with at least {mostP} g of protein.", {
              under: formatInt(UNDER_500_KCAL),
              p35: PROTEIN_35_G,
              small: formatInt(SMALL_APPETITE.maxKcal),
              smallP: SMALL_APPETITE.minProtein,
              sugar: SUGAR_5_G,
              mostK: formatInt(MOST_PROTEIN.minKcal),
              mostP: MOST_PROTEIN.minProtein,
            })}
          </li>
          <li>
            {t("Smart Swap: a dish from the same restaurant and the same part of the menu that fits your diet and allergy settings, saves at least {kcal} kcal and at least {share} of the calories, is at least {size} of the original's calories, and has at least as much protein where the restaurant publishes protein. Dishes under {min} kcal get no swap.", {
              kcal: formatInt(MIN_SAVING_KCAL),
              share: percent(MIN_SAVING_SHARE),
              size: percent(MIN_SIZE_SHARE),
              min: formatInt(MIN_ORIGINAL_KCAL),
            })}
          </li>
          <li>
            {t("Cheapest protein: a food counts as a protein food when it has at least {g} g of protein in every 100 g and at least {share} of its calories come from protein.", {
              g: MIN_PROTEIN_PER_100,
              share: percent(MIN_PROTEIN_ENERGY_SHARE),
            })}
          </li>
        </ul>
      </Block>

      {withAdvice && <p className="text-[0.9375rem] leading-relaxed text-muted">{t("A doctor or dietitian can give advice that fits you. {app} doesn't give medical advice.", { app })}</p>}
      <p className="text-[0.9375rem] leading-relaxed text-muted">{t("Links open in your browser. Sources checked on {date}.", { date: formatDate(MENU_SOURCES_CHECKED, t) })}</p>
    </div>
  );
}
