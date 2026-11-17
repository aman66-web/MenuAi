import { USED_AS } from "./stepIngredients";

// Amounts a first-time cook can measure (founder 2026-11-17: "the method doesn't specify how much to add ... you need to be very specific with these
// people because they haven't cooked for the first time"). The method names each ingredient's amount where the step first uses it, worked out from the
// same amounts as the ingredient list (so it follows Serves and the fit to the meal). Small amounts of oils, sauces, pastes, spices and seasonings are
// given in level teaspoons and tablespoons, with the weight beside them; nothing about the nutrition changes (that comes from the grams, as before).

/** Grams in one level teaspoon (usual kitchen values). Kinds measured in ml use 5 ml a teaspoon and 15 ml a tablespoon. */
const TSP_G: Record<string, number> = {
  salt: 6, "black-pepper": 2.5, "white-pepper": 2.5, cumin: 2, paprika: 2.5, "smoked-paprika": 2.5, "chilli-powder": 2.5, "chilli-flakes": 1, cinnamon: 2.5,
  turmeric: 3, "curry-powder": 2, "mixed-herbs": 1, oregano: 1, thyme: 1, rosemary: 1, "mixed-spice": 2, nutmeg: 2.5, "fajita-seasoning": 3,
  "light-mayo": 5, mustard: 5, honey: 7, "curry-paste": 5, "thai-curry-paste": 5, "chopped-tomato-puree": 5, pesto: 5, "peanut-butter": 5,
  "sweet-chilli": 6, "bbq-sauce": 6, houmous: 5, "sesame-seeds": 3, "mixed-seeds": 3.5, "cranberry-sauce": 6, "apple-sauce": 5, mincemeat: 6, ginger: 5, garlic: 5,
};
/** Measured in ml with spoons up to this amount: oils, soy and other sauces, lemon and lime juice. */
const SPOON_ML = new Set(["olive-oil", "vegetable-oil", "soy", "teriyaki", "horseradish", "lemon-juice", "lime-juice"]);
const MAX_SPOONS = 60; // g or ml: above this a weight or a jug measure is easier

const FRACTION: Record<number, string> = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
function amountWords(n: number): string {
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 4) / 4;
  const f = FRACTION[frac] ?? "";
  return whole === 0 ? f || "0" : `${whole}${f}`;
}

/** "2 tbsp", "½ tsp", "a pinch": a small amount of a spoonable kind in level spoons; null for anything else. */
export function spoonText(amount: number, unit: "g" | "ml", kind: string | undefined): string | null {
  if (!kind || amount <= 0 || amount > MAX_SPOONS) return null;
  const tsp = unit === "ml" ? (SPOON_ML.has(kind) ? 5 : null) : TSP_G[kind] ?? null;
  if (tsp === null) return null;
  const tsps = amount / tsp;
  if (tsps < 0.2) return "a pinch";
  if (tsps >= 2.75) {
    const tbsp = Math.round((tsps / 3) * 2) / 2; // to the nearest half tablespoon
    return `${amountWords(tbsp)} tbsp`;
  }
  return `${amountWords(Math.max(0.25, Math.round(tsps * 4) / 4))} tsp`;
}

// Vegetables and fruit weighed in grams, with the usual weight of one (so "75 g" can also say "about ½ an onion").
const PIECES: Record<string, [number, string, string]> = {
  onion: [150, "onion", "onions"], "red-onion": [150, "red onion", "red onions"], carrots: [80, "carrot", "carrots"], tomatoes: [85, "tomato", "tomatoes"],
  banana: [120, "banana", "bananas"], apple: [150, "apple", "apples"], parsnips: [150, "parsnip", "parsnips"],
};
function aboutPieces(amount: number, kind: string | undefined): string | null {
  const p = kind ? PIECES[kind] : undefined;
  if (!p) return null;
  const n = Math.round((amount / p[0]) * 2) / 2; // to the nearest half
  if (n < 0.5 || n > 6) return null;
  if (n === 0.5) return `about ½ ${/^[aeiou]/.test(p[1]) ? "an" : "a"} ${p[1]}`;
  return `about ${amountWords(n)} ${n > 1 ? p[2] : p[1]}`;
}

/** An ingredient's amount for the method: `full` beside its own name ("1 tbsp, 15 g"), `short` where several share one word ("1 tsp"). */
export interface MethodAmount { full: string; short: string }

/** A count where the recipe counts it ("2 eggs"), spoons for a small amount (with the weight), a rough number of pieces for vegetables, else the weight or volume. */
export function methodAmount(spec: { amount: number; unit: "g" | "ml"; pantry?: string }, countNote: string | null, grams: string): MethodAmount {
  if (countNote) return { full: countNote, short: countNote };
  if (spec.pantry === "oil-spray") { const t = `about ${Math.max(1, Math.round(spec.amount / 0.2))} sprays`; return { full: t, short: t }; } // a spray gives about 0.2 ml
  const spoons = spoonText(spec.amount, spec.unit, spec.pantry);
  if (spoons) return spoons === "a pinch" ? { full: spoons, short: spoons } : { full: `${spoons}, ${grams}`, short: spoons };
  const pieces = aboutPieces(spec.amount, spec.pantry);
  if (pieces) return { full: `${grams}, ${pieces}`, short: pieces };
  return { full: grams, short: grams };
}

export type MethodPiece = { text: string } | { text: string; amount: string };

/**
 * A step's words with each ingredient's amount placed right after the words that name it ("Stir the mayonnaise (2 tbsp), mustard (1 tsp) and ..."). Ingredients
 * named by the same general word ("spices", "season") share one bracket that names each ("the spices (1 tsp cumin, ½ tsp turmeric)"). `items` are the
 * ingredients this step is the first to use; any the words don't name (only the step's title does) are returned in `unplaced`.
 */
export function placeAmounts(text: string, items: ReadonlyArray<{ key: string; pantry?: string; label: string; amount: MethodAmount }>): { pieces: MethodPiece[]; unplaced: string[] } {
  const at = new Map<number, { end: number; parts: Array<{ label: string; amount: MethodAmount; specific: boolean }> }>();
  const unplaced: string[] = [];
  for (const i of items) {
    const re = USED_AS[i.pantry ?? ""];
    const m = re ? new RegExp(re.source, re.flags.replace("g", "")).exec(text) : null;
    if (!m) { unplaced.push(i.key); continue; }
    const word = m[0].toLowerCase();
    // "lemon" juice, "curry" paste, "chilli" flakes: the amount goes after the whole name, never inside it
    const tail = /^(?:\s+(?:juice|sauce|paste|pur[ée]e|powder|seeds|flakes|milk|oil|cubes?|cheese|leaves|fillets?|breasts?|thighs?|mince|noodles|beans|tomatoes))+/i.exec(text.slice(m.index + m[0].length));
    const end = m.index + m[0].length + (tail ? tail[0].length : 0);
    // the label's own word ("mustard") names this one ingredient; "spices", "season", "herbs", "oil" may stand for several, so the amount names which
    const specific = !/^(spices?|season(ing|ed)?|herbs|oil|spray)$/.test(word);
    const slot = at.get(m.index) ?? { end, parts: [] };
    slot.parts.push({ label: i.label, amount: i.amount, specific });
    at.set(m.index, slot);
  }
  const pieces: MethodPiece[] = [];
  let pos = 0;
  for (const [start, slot] of [...at.entries()].sort((a, b) => a[0] - b[0])) {
    pieces.push({ text: text.slice(pos, slot.end) });
    const one = slot.parts.length === 1 && slot.parts[0]!.specific;
    // under a general word each part says what it is: "1 tsp ground cumin", "a pinch of salt", "about 5 sprays of oil spray"
    const named = (p: { label: string; amount: MethodAmount }) => `${p.amount.short}${/^(a pinch|about)/.test(p.amount.short) ? " of" : ""} ${p.label.toLowerCase()}`;
    pieces.push({ text: "", amount: one ? slot.parts[0]!.amount.full : slot.parts.map(named).join(", ") });
    pos = slot.end;
    void start;
  }
  pieces.push({ text: text.slice(pos) });
  return { pieces: pieces.filter((p) => p.text !== "" || "amount" in p), unplaced };
}
