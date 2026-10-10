"use client";

import { filterCaution } from "@/lib/mm/menu-view";
import { HALAL_CAUTION } from "@/lib/mm/halal";
import { tk } from "@/lib/mm/i18n";
import { ALLERGEN_KEYS, type AllergenKey, type Preferences } from "@/lib/mm/types";
import { useT } from "../_lib/i18n";
import { CheckIcon } from "./icons";

// Diet and allergy choices as big, plain buttons (onboarding, Settings and the restaurant page all use this one picker).

const DIETS: ReadonlyArray<{ key: "vegetarianOnly" | "veganOnly" | "halalOnly" | "noPork" | "noBeef"; label: string }> = [
  { key: "vegetarianOnly", label: tk("Vegetarian") },
  { key: "veganOnly", label: tk("Vegan") },
  { key: "halalOnly", label: tk("Halal") },
  { key: "noPork", label: tk("No pork") },
  { key: "noBeef", label: tk("No beef") },
];

export const ALLERGEN_SHORT: Record<AllergenKey, string> = {
  gluten: tk("Gluten"), milk: tk("Milk"), eggs: tk("Eggs"), peanuts: tk("Peanuts"), nuts: tk("Tree nuts"), soya: tk("Soya"), fish: tk("Fish"),
  crustaceans: tk("Crustaceans"), molluscs: tk("Molluscs"), sesame: tk("Sesame"), mustard: tk("Mustard"), celery: tk("Celery"), lupin: tk("Lupin"), sulphites: tk("Sulphites"),
};
const ALLERGEN_ORDER: readonly AllergenKey[] = ["gluten", "milk", "eggs", "peanuts", "nuts", "soya", "fish", "crustaceans", "molluscs", "sesame", "mustard", "celery", "lupin", "sulphites"];

function Pick({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-[15px] font-semibold transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? "border-transparent bg-foreground text-background shadow-[0_6px_16px_-8px_rgba(0,0,0,0.45)]" : "border-line bg-soft hover:bg-soft-strong"}`}
    >
      {on && <CheckIcon className="h-4 w-4 shrink-0" strokeWidth={3} />}
      {children}
    </button>
  );
}

export function DietPicker({ value, onChange, halal = true, allergies = true }: { value: Preferences; onChange: (p: Preferences) => void; halal?: boolean; allergies?: boolean }) {
  const t = useT();
  const avoid = value.avoidAllergens ?? [];
  const toggleAllergen = (k: AllergenKey) => {
    const next = avoid.includes(k) ? avoid.filter((a) => a !== k) : [...avoid, k];
    const sorted = ALLERGEN_KEYS.filter((a) => next.includes(a));
    const { avoidAllergens: _drop, ...rest } = value; // eslint-disable-line @typescript-eslint/no-unused-vars
    onChange(sorted.length ? { ...rest, avoidAllergens: sorted } : rest);
  };
  const caution = filterCaution(value, t);
  return (
    <div>
      <div role="group" aria-label={t("Your diet")} className="grid grid-cols-2 gap-2">
        {DIETS.filter((d) => halal || d.key !== "halalOnly").map((d) => (
          <Pick key={d.key} on={Boolean(value[d.key])} onClick={() => onChange({ ...value, [d.key]: !value[d.key] })}>{t(d.label)}</Pick>
        ))}
      </div>
      {allergies && (
        <>
          <p className="mb-2 mt-5 text-sm font-bold">{t("Allergies to avoid")}</p>
          <div role="group" aria-label={t("Allergies to avoid")} className="grid grid-cols-2 gap-2">
            {ALLERGEN_ORDER.map((k) => (
              <Pick key={k} on={avoid.includes(k)} onClick={() => toggleAllergen(k)}>{t(ALLERGEN_SHORT[k])}</Pick>
            ))}
          </div>
        </>
      )}
      {(caution || value.halalOnly) && (
        <p className="mt-3 px-1 text-sm text-muted">{[caution, value.halalOnly ? t(HALAL_CAUTION) : null].filter(Boolean).join(" ")}</p>
      )}
    </div>
  );
}
