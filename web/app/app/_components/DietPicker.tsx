"use client";

import { filterCaution } from "@/lib/mm/menu-view";
import { HALAL_CAUTION } from "@/lib/mm/halal";
import { ALLERGEN_KEYS, type AllergenKey, type Preferences } from "@/lib/mm/types";
import { CheckIcon } from "./icons";

// Diet and allergy choices as big, plain buttons (onboarding, Settings and the restaurant page all use this one picker).

const DIETS: ReadonlyArray<{ key: "vegetarianOnly" | "veganOnly" | "halalOnly" | "noPork" | "noBeef"; label: string }> = [
  { key: "vegetarianOnly", label: "Vegetarian" },
  { key: "veganOnly", label: "Vegan" },
  { key: "halalOnly", label: "Halal" },
  { key: "noPork", label: "No pork" },
  { key: "noBeef", label: "No beef" },
];

export const ALLERGEN_SHORT: Record<AllergenKey, string> = {
  gluten: "Gluten", milk: "Milk", eggs: "Eggs", peanuts: "Peanuts", nuts: "Tree nuts", soya: "Soya", fish: "Fish",
  crustaceans: "Crustaceans", molluscs: "Molluscs", sesame: "Sesame", mustard: "Mustard", celery: "Celery", lupin: "Lupin", sulphites: "Sulphites",
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
  const avoid = value.avoidAllergens ?? [];
  const toggleAllergen = (k: AllergenKey) => {
    const next = avoid.includes(k) ? avoid.filter((a) => a !== k) : [...avoid, k];
    const sorted = ALLERGEN_KEYS.filter((a) => next.includes(a));
    const { avoidAllergens: _drop, ...rest } = value; // eslint-disable-line @typescript-eslint/no-unused-vars
    onChange(sorted.length ? { ...rest, avoidAllergens: sorted } : rest);
  };
  const caution = filterCaution(value);
  return (
    <div>
      <div role="group" aria-label="Your diet" className="grid grid-cols-2 gap-2">
        {DIETS.filter((d) => halal || d.key !== "halalOnly").map((d) => (
          <Pick key={d.key} on={Boolean(value[d.key])} onClick={() => onChange({ ...value, [d.key]: !value[d.key] })}>{d.label}</Pick>
        ))}
      </div>
      {allergies && (
        <>
          <p className="mb-2 mt-5 text-sm font-bold">Allergies to avoid</p>
          <div role="group" aria-label="Allergies to avoid" className="grid grid-cols-2 gap-2">
            {ALLERGEN_ORDER.map((k) => (
              <Pick key={k} on={avoid.includes(k)} onClick={() => toggleAllergen(k)}>{ALLERGEN_SHORT[k]}</Pick>
            ))}
          </div>
        </>
      )}
      {(caution || value.halalOnly) && (
        <p className="mt-3 px-1 text-sm text-muted">{[caution, value.halalOnly ? HALAL_CAUTION : null].filter(Boolean).join(" ")}</p>
      )}
    </div>
  );
}
