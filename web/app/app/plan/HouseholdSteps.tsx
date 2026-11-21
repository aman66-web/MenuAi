"use client";

import { useState } from "react";
import { ALLERGEN_LABEL } from "@/lib/mm/allergens";
import { assetUrl } from "@/lib/mm/config";
import { AGE_GROUPS, ALL_HOME_DIETS, HOME_DIETS, MAX_PEOPLE, MORE_HOME_DIETS, NAME_MAX, PORTIONS, noMeatLeft, personShare, shareWords, toggleHomeDiet, type AgeGroup, type HomeDiet, type HomePerson, type Household, type PortionSize } from "@/lib/mm/household";
import { tk } from "@/lib/mm/i18n";
import { EATING_STYLES, HIGH_FIBRE_MIN_G, HIGH_PROTEIN_MIN, KETO_CARBS_MAX, LOW_FAT_MAX, LOWER_CARB_MAX, LOWER_SALT_MAX_G, LOWER_SUGAR_MAX_G, styleInDiet, stylePicture, type EatingStyle } from "@/lib/mm/mealPlan";
import { QUICK_MINUTES } from "@/lib/mm/recipes";
import type { DietPrefs } from "@/lib/mm/pantry";
import { RECIPES } from "@/lib/mm/recipeBook";
import { RECIPE_IMAGES } from "@/lib/mm/recipeImages";
import { RECIPE_THUMBS } from "@/lib/mm/recipeThumbs";
import { ALLERGEN_KEYS, type AllergenKey } from "@/lib/mm/types";
import { ChevronRightIcon, ForkIcon } from "../_components/icons";
import { InfoBanner } from "../_components/Note";
import { ChoiceMark, inputClass } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { CARD, CHIP, CHIP_ON } from "../groceries/PageBits";

// The meal plan's household screens (founder 2026-11-19: "people normally live with people ... a plan for everyone"; "first screen is how many people are they
// cooking for"; the 20-agent meeting's conclusion the same day): how many, who each other person is (an age group, an optional name, a portion), the home's
// allergies, and the diets anyone at home follows (until 20 November one meat answer; now every diet the person's own picker knows, the six newer ones behind
// "More diets"). Big buttons, one question a screen; Pip says in one line at the top what each answer does (one Pip a screen: the person cards say their
// portion in plain words). Nothing here leaves the phone. Also the step both flows share, how the person likes to eat (StyleStep, founder 2026-11-20).
// Every answer is in the one choice look (colour meeting, 19 November 2026, approved by the founder that day): unchosen, white with the 1.5 px edge and an empty
// ring; chosen, lime with the 2 px dark green edge, bold dark green words and a tick (never a dark disc, and never a grey tile that looks switched off).

/** A big answer tile: the choice look, its mark in the tick slot so the words never jump when it is chosen. */
const TILE = "flex items-center gap-2 border-[1.5px] text-start transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const TILE_OFF = "border-edge bg-card text-foreground hover:bg-background";
const TILE_ON = "border-on-sun bg-sun text-on-sun shadow-[0_0_0_0.5px_var(--on-sun)]";
const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export const GROUP_LABEL: Record<AgeGroup, string> = { adult: tk("Adult"), teen: tk("Teenager"), child: tk("Child"), little: tk("Little one") };
export const GROUP_AGES: Record<AgeGroup, string> = { adult: tk("18 or over"), teen: tk("11 to 17"), child: tk("5 to 10"), little: tk("1 to 4") };
const PORTION_LABEL: Record<PortionSize, string> = { smaller: tk("Smaller"), usual: tk("Usual"), bigger: tk("Bigger") };
/** The one allergy sentence, word for word everywhere (the meeting: never a promise of safety). */
export const ALLERGY_LINE = tk("Recipes made with {allergens} are left out. Always check the label.");

/** "Sam", or "Person 2" when no name was given (the person using the app is person 1). */
export function personName(t: (s: string, v?: Record<string, string | number>) => string, p: HomePerson, index: number): string {
  return p.name || t("Person {n}", { n: index + 2 });
}

/** How many people are cooked for, the person using the app counted: big tiles, "Just me" to "6 of us". */
export function CountStep({ count, onChange }: { count: number; onChange: (n: number) => void }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("How many people are you cooking for?")} className="grid grid-cols-2 gap-2.5">
      {Array.from({ length: MAX_PEOPLE }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={count === n} onClick={() => onChange(n)}
          className={`${TILE} min-h-16 justify-center rounded-[1.25rem] px-3 text-[1.125rem] font-[800] ${count === n ? TILE_ON : TILE_OFF}`}>
          <ChoiceMark on={count === n} />{n === 1 ? t("Just me") : t("{n} of us", { n })}
        </button>
      ))}
    </div>
  );
}

/** One card for each other person: who they are (an age group), an optional name, and how much they usually eat. */
export function WhoStep({ others, onChange }: { others: HomePerson[]; onChange: (others: HomePerson[]) => void }) {
  const t = useT();
  const set = (i: number, patch: Partial<HomePerson>) => onChange(others.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <ul className="space-y-3">
      {others.map((p, i) => {
        const share = personShare(p);
        return (
          <li key={p.id} className={`${CARD} p-4`}>
            <p className="text-[0.8125rem] font-semibold text-muted">{t("Person {n} of {total}", { n: i + 2, total: others.length + 1 })}</p>
            <p id={`who-${p.id}`} className="mt-1 text-[1.0625rem] font-[800]">{t("Who is it?")}</p>
            <div role="radiogroup" aria-labelledby={`who-${p.id}`} className="mt-2 grid grid-cols-2 gap-2">
              {AGE_GROUPS.map((g) => (
                <button key={g} type="button" role="radio" aria-checked={p.group === g} onClick={() => set(i, { group: g })}
                  className={`${TILE} min-h-14 rounded-[1rem] px-3 py-2 ${p.group === g ? TILE_ON : TILE_OFF}`}>
                  <ChoiceMark on={p.group === g} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[1rem] font-bold leading-tight">{t(GROUP_LABEL[g])}</span>
                    <span className="text-[0.8125rem] leading-tight">{t(GROUP_AGES[g])}</span>
                  </span>
                </button>
              ))}
            </div>
            <label htmlFor={`name-${p.id}`} className="mt-4 block text-[1.0625rem] font-[800]">{t("Their name (optional)")}</label>
            <input id={`name-${p.id}`} value={p.name ?? ""} maxLength={NAME_MAX} autoComplete="off" placeholder={t("Person {n}", { n: i + 2 })}
              onChange={(e) => set(i, { name: e.target.value.slice(0, NAME_MAX) })} className={`${inputClass} mt-2 w-full`} />
            <p id={`portion-${p.id}`} className="mt-4 text-[1.0625rem] font-[800]">{t("How much do they usually eat?")}</p>
            <div role="radiogroup" aria-labelledby={`portion-${p.id}`} className="mt-2 flex flex-wrap gap-2">
              {PORTIONS.map((size) => (
                <button key={size} type="button" role="radio" aria-checked={p.portion === size} onClick={() => set(i, { portion: size })} className={`${p.portion === size ? CHIP_ON : CHIP} gap-1.5 px-4`}>
                  {t(PORTION_LABEL[size])}
                </button>
              ))}
            </div>
            {/* their portion in one plain line (read out when it changes); one Pip a screen, at the top */}
            <p aria-live="polite" className="mt-3 flex items-start gap-2 text-[0.9375rem] font-semibold leading-snug">
              <ForkIcon aria-hidden className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 text-ink" />
              <span className="min-w-0">{share === 1 ? t("They get a grown-up's portion.") : t("They get {share} of a grown-up's portion.", { share: shareWords(share) })}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** The home's allergies: one list for everyone, never tied to a person. */
export function AllergiesStep({ value, onChange }: { value: AllergenKey[]; onChange: (v: AllergenKey[]) => void }) {
  const t = useT();
  return (
    <div role="group" aria-label={t("Any food allergies at home?")} className="flex flex-wrap gap-2">
      {ALLERGEN_KEYS.map((k) => {
        const on = value.includes(k);
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])} className={`${on ? CHIP_ON : CHIP} gap-1.5 px-4`}>
            {t(ALLERGEN_LABEL[k])}
          </button>
        );
      })}
    </div>
  );
}

/** Each diet's name as the person's own diet picker says it (DietPicker), and the second line on the hard ones. */
export const HOME_DIET_LABEL: Record<HomeDiet, string> = {
  vegetarianOnly: tk("Vegetarian"), veganOnly: tk("Vegan"), pescatarianOnly: tk("Pescatarian"), halalOnly: tk("Halal"), noPork: tk("No pork"), noBeef: tk("No beef"),
  jain: tk("Jain"), noOnionGarlic: tk("No onion or garlic"), kosherStyle: tk("Kosher style"), noRedMeat: tk("No red meat"), noAlcohol: tk("No alcohol"), noHalalKosherMeat: tk("No halal or kosher meat"),
};
const HOME_DIET_HINT: Partial<Record<HomeDiet, string>> = { pescatarianOnly: tk("fish, no meat"), kosherStyle: tk("We can't check kosher certification.") };

/**
 * The diets anyone at home follows: one answer for the home (one pot), every meal fitting all of them. The six everyone knows, then "More diets" for the rest
 * (open from the start when one of them is already ticked). Nothing ticked: the bottom button says "No diets at home".
 */
export function HomeDietStep({ value, onChange, own = {} }: { value: readonly HomeDiet[]; onChange: (v: HomeDiet[]) => void; own?: DietPrefs }) {
  const t = useT();
  const [more, setMore] = useState(() => value.some((d) => MORE_HOME_DIETS.includes(d)));
  const tile = (d: HomeDiet) => {
    const on = value.includes(d);
    const hint = HOME_DIET_HINT[d];
    return (
      <button key={d} type="button" aria-pressed={on} onClick={() => onChange(toggleHomeDiet(value, d))}
        className={`${TILE} min-h-14 w-full gap-3 rounded-[1.25rem] px-4 py-2.5 ${on ? TILE_ON : TILE_OFF}`}>
        <span className="min-w-0 flex-1">
          <span className="block text-[1.0625rem] font-[800] leading-snug">{t(HOME_DIET_LABEL[d])}</span>
          {hint && <span className={`mt-0.5 block text-[0.9375rem] leading-snug ${on ? "" : "text-muted"}`}>{t(hint)}</span>}
        </span>
        <ChoiceMark on={on} kind="circle" />
      </button>
    );
  };
  return (
    <div>
      <div role="group" aria-label={t("Diets at home")} className="space-y-2">{HOME_DIETS.map(tile)}</div>
      <button type="button" aria-expanded={more} aria-controls={more ? "more-home-diets" : undefined} onClick={() => setMore((m) => !m)}
        className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full border-[1.5px] border-edge bg-card px-5 text-[0.9375rem] font-bold text-foreground transition active:scale-[0.97] hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {t("More diets")}<ChevronRightIcon aria-hidden className={`h-4 w-4 transition-transform motion-reduce:transition-none ${more ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {more && <div id="more-home-diets" role="group" aria-label={t("More diets")} className="mt-3 space-y-2">{MORE_HOME_DIETS.map(tile)}</div>}
      {/* halal meat only, and no meat sold as halal: none is left (said where it is ticked, read out as it changes) */}
      <div aria-live="polite">{noMeatLeft(value, own) && <InfoBanner heading={null} className="mt-3 font-semibold">{t("With Halal and No halal or kosher meat both ticked, meals have no meat.")}</InfoBanner>}</div>
    </div>
  );
}

/**
 * The home's diets in words for the check screen: "No diets at home: meals can have meat or fish." or "For everyone: Vegetarian (yours), No alcohol". `own`:
 * the person's own diets from Settings, which a household plan applies to everyone too (household.ts homeDiet), marked "(yours)".
 */
export function homeDietLine(t: (s: string, v?: Record<string, string | number>) => string, diets: readonly HomeDiet[], own: readonly HomeDiet[] = []): string {
  const all = ALL_HOME_DIETS.filter((d) => diets.includes(d) || own.includes(d));
  if (!all.length) return t("No diets at home: meals can have meat or fish.");
  return t("For everyone: {diets}", { diets: all.map((d) => (diets.includes(d) ? t(HOME_DIET_LABEL[d]) : t("{diet} (yours)", { diet: t(HOME_DIET_LABEL[d]) }))).join(", ") });
}

/**
 * The allergy sentence for a list of allergens, or "No allergies at home." `own`: the person's own allergies from Settings, which a household plan leaves out
 * for everyone too, marked "(yours, from Settings)" where the home's answer doesn't have them.
 */
export function allergyLine(t: (s: string, v?: Record<string, string | number>) => string, allergies: readonly AllergenKey[], own: readonly AllergenKey[] = []): string {
  const all = [...allergies, ...own.filter((k) => !allergies.includes(k))];
  if (!all.length) return t("No allergies at home.");
  const words = all.map((k) => (allergies.includes(k) ? t(ALLERGEN_LABEL[k]).toLowerCase() : t("{allergen} (yours, from Settings)", { allergen: t(ALLERGEN_LABEL[k]).toLowerCase() })));
  return t(ALLERGY_LINE, { allergens: new Intl.ListFormat("en-GB", { type: "disjunction" }).format(words) });
}

/**
 * Each eating style's name (lib/mm/mealPlan.ts EATING_STYLES), and its one line on the tile: the plain rule, with the figure from the rule itself and the
 * nutrient first (so the line keeps to two lines on a half-width tile at 375 px), or what is in the meals. Never "healthy" or any claim (CLAUDE.md rule 3).
 */
export const STYLE_LABEL: Record<EatingStyle, string> = {
  balanced: tk("Balanced"), longevity: tk("Longevity"), highProtein: tk("High protein"), lowerCarb: tk("Lower carb"), keto: tk("Keto"), mediterranean: tk("Mediterranean"),
  vegetarian: tk("Vegetarian"), vegan: tk("Vegan"), pescatarian: tk("Pescatarian"), paleo: tk("Paleo"), quick: tk("Quick"), lowFat: tk("Lower fat"), highFibre: tk("More fibre"),
  lowerSugar: tk("Lower sugar"), lowerSalt: tk("Lower salt"),
};
const pct = (share: number) => Math.round(share * 100);
function styleLine(t: (s: string, v?: Record<string, string | number>) => string, style: EatingStyle): string {
  switch (style) {
    case "balanced": return t("Any of our recipes");
    case "longevity": return t("Vegetables, beans, nuts, olive oil and fish");
    case "highProtein": return t("Protein: at least {pct}% of calories", { pct: pct(HIGH_PROTEIN_MIN) });
    case "lowerCarb": return t("Carbs: at most {pct}% of calories", { pct: pct(LOWER_CARB_MAX) });
    case "keto": return t("Carbs: at most {pct}% of calories", { pct: pct(KETO_CARBS_MAX) });
    case "mediterranean": return t("Olive oil, vegetables, fish and beans");
    case "vegetarian": return t("No meat or fish");
    case "vegan": return t("Nothing from animals");
    // the home diets' own words for it (HOME_DIET_HINT), capitalised by the tile
    case "pescatarian": return t("fish, no meat");
    case "paleo": return t("Meat, fish, eggs, vegetables, fruit and nuts");
    case "quick": return t("Ready in {n} minutes or less", { n: QUICK_MINUTES });
    case "lowFat": return t("Fat: at most {pct}% of calories", { pct: pct(LOW_FAT_MAX) });
    case "highFibre": return t("Fibre: at least {g} g a meal", { g: HIGH_FIBRE_MIN_G });
    case "lowerSugar": return t("Sugars: at most {g} g a meal", { g: LOWER_SUGAR_MAX_G });
    case "lowerSalt": return t("Salt: at most {g} g a meal", { g: LOWER_SALT_MAX_G });
  }
}

/**
 * How the person likes to eat (founder 2026-11-20: "How do you like to eat?", big picture tiles; laid out as the founder's example of the same day, "provide
 * images of the diet": two to a row, the picture filling each tile's top, the name in bold and one short grey line under it; 22:00: "as many options as you can
 * think about people would choose"). Balanced first, Longevity second (the founder's own pick), then the rest in EATING_STYLES' order; a style the person's own
 * diet already is (Vegetarian for a vegan) has no tile (mealPlan.ts styleInDiet). Each picture is one of our own recipes of that style that suits the diet,
 * never the same picture on two tiles (mealPlan.ts stylePicture; none for High protein and a vegan diet, or a picture that can't load: the plate drawing).
 * The choice look on a picture tile: the ring (a tick when chosen) on the picture's corner, and the chosen tile lime with the dark green edge. A style the
 * person's shops have too few of for their diet (`short`: its reason, mealPlan.ts styleTooFew) is greyed, its picture faded, the reason in place of its line,
 * and can't be chosen (it stays chosen if it already was, so nothing changes behind the person's back). An odd last tile sits in the middle of its row, the
 * same size as the others. On a short screen (under 700 px high, a 375 x 667 phone) the pictures are flatter (5:2). `note`: what the shops' recipes leave short
 * for the chosen style, said under the tiles as it is known.
 */
export function StyleStep({ value, onChange, diet, note, short = {} }: { value: EatingStyle; onChange: (s: EatingStyle) => void; diet: DietPrefs; note?: string | null; short?: Partial<Record<EatingStyle, string>> }) {
  const t = useT();
  // a picture that couldn't load (offline before it was seen once): the plate drawing instead
  const [failed, setFailed] = useState<readonly string[]>([]);
  const shown = EATING_STYLES.filter((s) => s === value || !styleInDiet(s, diet));
  const odd = shown.length % 2 === 1;
  return (
    <div>
      <div role="radiogroup" aria-label={t("How do you like to eat?")} className="grid grid-cols-2 gap-2.5">
        {shown.map((s, i) => {
          const on = value === s;
          const greyed = short[s];
          const id = stylePicture(s, diet, (x) => RECIPE_BY_ID.get(x));
          const src = id ? RECIPE_IMAGES[id] ?? RECIPE_THUMBS[id] : undefined;
          const pic = src && !failed.includes(src) ? src : undefined;
          const last = odd && i === shown.length - 1;
          return (
            <button key={s} type="button" role="radio" aria-checked={on} aria-disabled={greyed && !on ? true : undefined} onClick={() => { if (!greyed || on) onChange(s); }}
              className={`flex flex-col overflow-hidden rounded-[1.25rem] border-[1.5px] text-start transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${greyed && !on ? "cursor-default border-line bg-background text-muted" : `active:scale-[0.98] ${on ? TILE_ON : TILE_OFF}`} ${last ? "col-span-2 w-[calc(50%-0.3125rem)] justify-self-center" : ""}`}>
              <span aria-hidden className="relative grid aspect-[8/5] w-full shrink-0 place-items-center overflow-hidden bg-fill [@media(max-height:700px)]:aspect-[5/2]">
                {pic
                  // eslint-disable-next-line @next/next/no-img-element -- static file named by its hash; decorative, the style's name is under it
                  ? <img src={assetUrl(pic)} alt="" width={800} height={600} decoding="async" loading={i < 4 ? "eager" : "lazy"} onError={() => setFailed((f) => [...f, pic])} className={`h-full w-full object-cover ${greyed ? "opacity-45 grayscale" : ""}`} />
                  : <span className="grid h-14 w-14 place-items-center rounded-full border border-line bg-card text-ink"><ForkIcon className="h-7 w-7" strokeWidth={1.6} /></span>}
                {!(greyed && !on) && <span className="absolute end-2 top-2 rounded-full shadow-[var(--photo-chip-shadow)]"><ChoiceMark on={on} kind="circle" /></span>}
              </span>
              <span className="block flex-1 px-3.5 pb-3.5 pt-2.5">
                <span className="block text-[1.125rem] font-[800] leading-tight">{t(STYLE_LABEL[s])}</span>
                <span className={`mt-1 block text-[0.9375rem] leading-snug first-letter:uppercase ${on ? "" : greyed ? "font-semibold" : "text-muted"}`}>{greyed ?? styleLine(t, s)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-3 text-[0.9375rem] font-semibold leading-snug empty:hidden">{note}</p>
    </div>
  );
}

/** "You, Alex (Adult) and Sam (Child)". */
export function whoWords(t: (s: string, v?: Record<string, string | number>) => string, h: Household): string {
  const names = [t("You"), ...h.others.map((p, i) => `${personName(t, p, i)} (${t(GROUP_LABEL[p.group]).toLowerCase()})`)];
  return new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names);
}
