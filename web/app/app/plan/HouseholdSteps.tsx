"use client";

import { ALLERGEN_LABEL } from "@/lib/mm/allergens";
import { AGE_GROUPS, MAX_PEOPLE, NAME_MAX, PORTIONS, personShare, shareWords, type AgeGroup, type HomeMeat, type HomePerson, type Household, type PortionSize } from "@/lib/mm/household";
import { tk } from "@/lib/mm/i18n";
import { ALLERGEN_KEYS, type AllergenKey } from "@/lib/mm/types";
import { CheckIcon } from "../_components/icons";
import { inputClass } from "../_components/ui";
import { useT } from "../_lib/i18n";
import { CARD, CHIP, CHIP_ON } from "../groceries/PageBits";

// The meal plan's household screens (founder 2026-11-19: "people normally live with people ... a plan for everyone"; "first screen is how many people are they
// cooking for"; the 20-agent meeting's conclusion the same day): how many, who each other person is (an age group, an optional name, a portion), the home's
// allergies, and whether anyone doesn't eat meat. Big buttons, one question a screen; Pip says in one line what each answer does. Nothing here leaves the phone.

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
          className={`flex min-h-16 items-center justify-center gap-2 rounded-[1.25rem] px-3 text-[1.125rem] font-[800] transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${count === n ? "bg-sun text-[var(--on-accent)]" : "glass"}`}>
          {count === n && <CheckIcon aria-hidden className="h-5 w-5" />}{n === 1 ? t("Just me") : t("{n} of us", { n })}
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
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted">{t("Person {n} of {total}", { n: i + 2, total: others.length + 1 })}</p>
            <p id={`who-${p.id}`} className="mt-1 text-[1.0625rem] font-[800]">{t("Who is it?")}</p>
            <div role="radiogroup" aria-labelledby={`who-${p.id}`} className="mt-2 grid grid-cols-2 gap-2">
              {AGE_GROUPS.map((g) => (
                <button key={g} type="button" role="radio" aria-checked={p.group === g} onClick={() => set(i, { group: g })}
                  className={`flex min-h-14 flex-col items-start justify-center rounded-[1rem] px-3 py-2 text-start transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${p.group === g ? "bg-sun text-[var(--on-accent)]" : "bg-[var(--fill)]"}`}>
                  <span className="text-[1rem] font-bold leading-tight">{t(GROUP_LABEL[g])}</span>
                  <span className="text-[0.8125rem] leading-tight">{t(GROUP_AGES[g])}</span>
                </button>
              ))}
            </div>
            <label htmlFor={`name-${p.id}`} className="mt-4 block text-[1.0625rem] font-[800]">{t("Their name (you can leave it out)")}</label>
            <input id={`name-${p.id}`} value={p.name ?? ""} maxLength={NAME_MAX} autoComplete="off" placeholder={t("Person {n}", { n: i + 2 })}
              onChange={(e) => set(i, { name: e.target.value.slice(0, NAME_MAX) })} className={`${inputClass} mt-2 w-full`} />
            <p id={`portion-${p.id}`} className="mt-4 text-[1.0625rem] font-[800]">{t("How much do they usually eat?")}</p>
            <div role="radiogroup" aria-labelledby={`portion-${p.id}`} className="mt-2 flex flex-wrap gap-2">
              {PORTIONS.map((size) => (
                <button key={size} type="button" role="radio" aria-checked={p.portion === size} onClick={() => set(i, { portion: size })} className={`${p.portion === size ? CHIP_ON : CHIP} gap-1.5 px-4`}>
                  {p.portion === size && <CheckIcon aria-hidden className="h-4 w-4" />}{t(PORTION_LABEL[size])}
                </button>
              ))}
            </div>
            {/* what Pip decided, in one line (read out when it changes) */}
            <p aria-live="polite" className="mt-3 rounded-[1rem] bg-[#e4f0d0] px-3.5 py-2.5 text-[0.9375rem] leading-snug text-[#1d2320]">
              {share === 1 ? t("I'll give them a grown-up's portion.") : t("I'll give them {share} of a grown-up's portion.", { share: shareWords(share) })}
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
            {on && <CheckIcon aria-hidden className="h-4 w-4" />}{t(ALLERGEN_LABEL[k])}
          </button>
        );
      })}
    </div>
  );
}

const MEAT_CHOICES: ReadonlyArray<{ id: HomeMeat; title: string; line: string }> = [
  { id: "all", title: tk("We all eat meat"), line: tk("Meals can have meat or fish.") },
  { id: "vegetarian", title: tk("Someone is vegetarian"), line: tk("I'll cook every meal vegetarian, for everyone.") },
  { id: "vegan", title: tk("Someone is vegan"), line: tk("I'll cook every meal vegan, for everyone.") },
];

/** Whether anyone doesn't eat meat: one answer for the home (one pot, the strictest wins). */
export function MeatStep({ value, onChange }: { value: HomeMeat; onChange: (v: HomeMeat) => void }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("Does anyone not eat meat?")} className="space-y-2.5">
      {MEAT_CHOICES.map((c) => (
        <button key={c.id} type="button" role="radio" aria-checked={value === c.id} onClick={() => onChange(c.id)}
          className={`flex min-h-16 w-full items-center gap-3 rounded-[1.25rem] p-3.5 text-start transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${value === c.id ? "bg-sun text-[var(--on-accent)]" : "glass"}`}>
          <span className="min-w-0 flex-1">
            <span className="block text-[1.0625rem] font-[800] leading-snug">{t(c.title)}</span>
            <span className="mt-0.5 block text-[0.9375rem] leading-snug">{t(c.line)}</span>
          </span>
          <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${value === c.id ? "bg-foreground text-background" : "border border-line"}`}>{value === c.id && <CheckIcon className="h-4 w-4" />}</span>
        </button>
      ))}
    </div>
  );
}

/** The allergy sentence for a list of allergens, or "No allergies at home." */
export function allergyLine(t: (s: string, v?: Record<string, string | number>) => string, allergies: readonly AllergenKey[]): string {
  if (!allergies.length) return t("No allergies at home.");
  return t(ALLERGY_LINE, { allergens: new Intl.ListFormat("en-GB", { type: "disjunction" }).format(allergies.map((k) => t(ALLERGEN_LABEL[k]).toLowerCase())) });
}

/** "You, Alex (Adult) and Sam (Child)". */
export function whoWords(t: (s: string, v?: Record<string, string | number>) => string, h: Household): string {
  const names = [t("You"), ...h.others.map((p, i) => `${personName(t, p, i)} (${t(GROUP_LABEL[p.group]).toLowerCase()})`)];
  return new Intl.ListFormat("en-GB", { type: "conjunction" }).format(names);
}
