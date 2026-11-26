import { GATING_ENABLED } from "./config";
import { tk } from "./i18n";
import { EATING_STYLES, type EatingStyle } from "./mealPlan";
import type { PlanAnswers } from "./planAi";
import type { AllergenKey, Goal } from "./types";

// Ask Pip (founder 2026-11-26: "an advanced, friendly chatbot ... like a nutrition coach who knows what they want"): a chat with Pip, "your food guide and
// nutrition coach" (never a dietitian or nutritionist: a protected title in the UK), opened from the Pip button on Home, My recipes, Groceries and Eat out.
// This file is what the phone and the server share: the switch, the limits, the request the phone sends, the lines the server streams back, the cards and the
// guard that keeps every figure honest. Pure; unit-tested (tests/askPip.test.ts).
//
// CLAUDE.md rule 1, never a made-up number: Pip answers through tools (lib/askPipTools.ts) that search the app's own menus, supermarket labels and recipes and
// return their real figures; the cards on screen are drawn from those results, never from the model's words. The model's own text is held back a sentence at a
// time (takeSentences) and a sentence that states a calorie, gram, percentage or price figure that no tool returned (and that isn't one of the person's own
// targets) is dropped before it reaches the phone (checkSentence). Rule 3: a sentence that calls food healthy, unhealthy, good or bad, clean or junk is dropped
// the same way. Rule 4: the chat goes only through our own route (POST /api/v1/pip/chat) to Anthropic; the conversation is kept on this phone only.

/** The chat's route answers with NEXT_PUBLIC_ASK_PIP=1 (founder switched it on 2026-11-26 after raising the Anthropic spending cap to $200 a month; it still
 *  needs a paid token and ANTHROPIC_API_KEY), so the website serves the apps' Premium chat. The privacy page describes the chat whenever the route answers. */
export const ASK_PIP_API_ENABLED = process.env.NEXT_PUBLIC_ASK_PIP === "1";
/** The Pip button, the onboarding screen, the Premium list line and the AI permission's words: only on a build where free and paid are told apart
 *  (GATING_ENABLED, the apps), like Make it at home, because the route answers Premium only and nothing is sold on the website. */
export const ASK_PIP_ENABLED = ASK_PIP_API_ENABLED && GATING_ENABLED;
/** Messages one account may send Pip a day (checked on the server; founder's default 2026-11-26, can change). */
export const ASK_PIP_DAILY_LIMIT = 40;
/** In any ten minutes, so a stuck button can't spend the day's allowance at once. */
export const ASK_PIP_TEN_MINUTE_LIMIT = 15;
/** The longest message someone can type. */
export const MAX_ASK_CHARS = 500;
/** How much of the conversation goes with each message (the newest turns; older ones stay on the phone only). */
export const MAX_HISTORY = 12;
/** The longest earlier Pip reply sent back as context. */
export const MAX_PIP_CHARS = 2000;
/** Most conversations kept on this phone (the newest). */
export const MAX_KEPT_MESSAGES = 60;

// ----------------------------------------------------------------------------------------------------------------------- what the phone sends

/** One line of the conversation as it goes to the server: what the person typed, or what Pip said (with the names of the cards he showed, no figures). */
export interface ChatTurn {
  role: "user" | "pip";
  text: string;
}

/** The person, as the chat needs them: no name, email or account id, ever. */
export interface AboutMe {
  goal: Goal;
  /** Daily calories and protein (grams), and carbs and fat when the person set them. */
  kcal: number;
  protein: number;
  carbs?: number;
  fat?: number;
  /** The meal size under the smaller, protein-first goal (glp1), in kcal. */
  mealCap?: number;
  /** Their diet choices (the filters on, and what they told us at sign-up), as the app's keys. */
  diet: DietWord[];
  /** Allergens to avoid (contains or may contain). */
  avoid: AllergenKey[];
  /** Their supermarkets, most used first (retailer ids). */
  shops: string[];
  /** The phone's local time: weekday and hh:mm, so "dinner tonight" means something. */
  now: string;
}

export const DIET_WORDS = ["vegetarianOnly", "veganOnly", "pescatarianOnly", "halalOnly", "noPork", "noBeef", "noRedMeat", "noOnionGarlic", "jain", "kosherStyle", "noAlcohol", "noHalalKosherMeat"] as const;
export type DietWord = (typeof DIET_WORDS)[number];

/** Today's food diary as the app shows it (each entry's own logged figures; the totals and what's left worked out on the phone by budget.ts). */
export interface MyDay {
  entries: Array<{ name: string; meal: string; kcal: number; protein: number | null; carbs: number | null; fat: number | null; estimate?: boolean }>;
  total: { kcal: number; protein: number; carbs: number; fat: number };
  left: { kcal: number; protein: number };
}

/** The week's meal plan: its first day and each day's recipe ids in slot order. */
export interface MyPlan {
  start: string;
  slots: string[];
  days: Array<Array<string | null>>;
}

/**
 * The request (POST /api/v1/pip/chat). The person's targets, diet and shops go with every message (nearly every answer needs them); the food diary, the saved
 * recipes and the meal plan go to our server with it but reach the AI only when it asks for them (the get_my_* tools), so each answer sends only what it needs.
 */
export interface AskPipRequest {
  messages: ChatTurn[];
  me: AboutMe;
  day: MyDay | null;
  saved: string[];
  plan: MyPlan | null;
}

// ----------------------------------------------------------------------------------------------------------------------- what the server streams back

export interface RecipeCardItem { id: string; name: string; meal: string; minutes: number; kcal: number; protein: number; carbs: number; fat: number; cost: number | null }
export interface DishCardItem { id: string; name: string; serving: string; kcal: number; protein: number | null; carbs: number | null; fat: number | null; image?: string; clash: string[] }
export interface ProductCardItem { id: string; name: string; price: number | null; per: "g" | "ml"; kcal: number; protein: number; carbs: number; fat: number; clash: string[] }
export interface PlanHandoff { answers: PlanAnswers; style?: EatingStyle }

export type PipCard =
  | { kind: "recipes"; shop: { id: string; name: string }; items: RecipeCardItem[] }
  | { kind: "dishes"; chain: { id: string; name: string }; items: DishCardItem[]; total: { kcal: number; protein: number | null; carbs: number | null; fat: number | null } | null }
  | { kind: "products"; shop: { id: string; name: string }; items: ProductCardItem[] }
  | { kind: "plan"; handoff: PlanHandoff; lines: string[] };

/** One line of the server's stream (newline-delimited JSON). */
export type PipEvent =
  | { t: "say"; text: string }
  | { t: "doing"; what: "menu" | "recipes" | "products" | "day" | "plan" | "saved" | "places"; name?: string }
  | { t: "card"; card: PipCard }
  | { t: "end"; left: number }
  | { t: "fail"; error: string; message: string };

/** What the chat says when Pip can't answer (English keys). */
export const ASK_PIP_MESSAGES = {
  premium: tk("Ask Pip is part of Premium."),
  rateLimited: tk("That's all your questions for today. Pip will be back tomorrow."),
  tooFast: tk("That's a lot of questions at once. Try again in a few minutes."),
  invalid: tk("Pip couldn't read that. Please try again."),
  nothing: tk("Sorry, I couldn't answer that. Try asking another way."),
  refused: tk("I can't help with that one. Ask me about food, meals or your targets."),
} as const;

/** The first questions offered in an empty chat (English keys). */
export const ASK_PIP_STARTERS = [
  tk("What can I have for dinner tonight?"),
  tk("What fits my protein at Nando's?"),
  tk("Make me a meal plan for this week"),
  tk("How am I doing today?"),
] as const;

// ----------------------------------------------------------------------------------------------------------------------- the phone's side

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A card from the stream, checked field by field (anything odd: null, and the phone shows nothing for it). */
export function sanitizeCard(raw: unknown): PipCard | null {
  if (!isObj(raw)) return null;
  const items = Array.isArray(raw.items) ? raw.items.filter(isObj).slice(0, 8) : [];
  const shopOf = (s: unknown) => (isObj(s) && str(s.id, 40) && str(s.name, 80) ? { id: s.id as string, name: s.name as string } : null);
  const clash = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 120).slice(0, 6) : []);
  switch (raw.kind) {
    case "recipes": {
      const shop = shopOf(raw.shop);
      const list = items.flatMap((i): RecipeCardItem[] => {
        const [kcal, protein, carbs, fat, minutes] = [fin(i.kcal), fin(i.protein), fin(i.carbs), fin(i.fat), fin(i.minutes)];
        if (!str(i.id, 80) || !str(i.name) || kcal === null || protein === null || carbs === null || fat === null || minutes === null) return [];
        return [{ id: i.id as string, name: i.name as string, meal: str(i.meal, 20) ?? "", minutes, kcal, protein, carbs, fat, cost: fin(i.cost) }];
      });
      return shop && list.length ? { kind: "recipes", shop, items: list } : null;
    }
    case "dishes": {
      const chain = shopOf(raw.chain);
      const list = items.flatMap((i): DishCardItem[] => {
        const kcal = fin(i.kcal);
        if (!str(i.id, 120) || !str(i.name) || kcal === null) return [];
        const image = str(i.image, 200);
        return [{ id: i.id as string, name: i.name as string, serving: str(i.serving) ?? "", kcal, protein: fin(i.protein), carbs: fin(i.carbs), fat: fin(i.fat), ...(image ? { image } : {}), clash: clash(i.clash) }];
      });
      const t = isObj(raw.total) && fin(raw.total.kcal) !== null ? { kcal: raw.total.kcal as number, protein: fin(raw.total.protein), carbs: fin(raw.total.carbs), fat: fin(raw.total.fat) } : null;
      return chain && list.length ? { kind: "dishes", chain, items: list, total: list.length > 1 ? t : null } : null;
    }
    case "products": {
      const shop = shopOf(raw.shop);
      const list = items.flatMap((i): ProductCardItem[] => {
        const [kcal, protein, carbs, fat] = [fin(i.kcal), fin(i.protein), fin(i.carbs), fin(i.fat)];
        if (!str(i.id, 120) || !str(i.name) || kcal === null || protein === null || carbs === null || fat === null || (i.per !== "g" && i.per !== "ml")) return [];
        return [{ id: i.id as string, name: i.name as string, price: fin(i.price), per: i.per, kcal, protein, carbs, fat, clash: clash(i.clash) }];
      });
      return shop && list.length ? { kind: "products", shop, items: list } : null;
    }
    case "plan": {
      if (!isObj(raw.handoff)) return null;
      const style = (EATING_STYLES as readonly unknown[]).includes(raw.handoff.style) ? (raw.handoff.style as EatingStyle) : undefined;
      const lines = Array.isArray(raw.lines) ? raw.lines.filter((x): x is string => typeof x === "string" && x.length <= 160).slice(0, 10) : [];
      return { kind: "plan", handoff: { answers: isObj(raw.handoff.answers) ? (raw.handoff.answers as PlanAnswers) : {}, ...(style ? { style } : {}) }, lines };
    }
    default:
      return null;
  }
}

/** A line of the stream, or null for anything that isn't one. */
export function parseEvent(line: string): PipEvent | null {
  let v: unknown;
  try { v = JSON.parse(line); } catch { return null; }
  if (!isObj(v)) return null;
  switch (v.t) {
    case "say": return typeof v.text === "string" ? { t: "say", text: v.text } : null;
    case "doing": return typeof v.what === "string" ? { t: "doing", what: v.what as Extract<PipEvent, { t: "doing" }>["what"], ...(typeof v.name === "string" ? { name: v.name } : {}) } : null;
    case "card": { const card = sanitizeCard(v.card); return card ? { t: "card", card } : null; }
    case "end": return { t: "end", left: fin(v.left) ?? 0 };
    case "fail": return { t: "fail", error: typeof v.error === "string" ? v.error : "error", message: typeof v.message === "string" ? v.message : ASK_PIP_MESSAGES.nothing };
    default: return null;
  }
}

/** The names on a card, for the conversation sent back next time ("Shown: Chicken curry with rice, Shakshuka"): no figures, so none can be repeated unchecked. */
export function cardNames(card: PipCard): string {
  switch (card.kind) {
    case "recipes": return `Shown recipes (${card.shop.name}): ${card.items.map((i) => `${i.name} [${i.id}]`).join(", ")}`;
    case "dishes": return `Shown dishes (${card.chain.name} [${card.chain.id}]): ${card.items.map((i) => `${i.name} [${i.id}]`).join(", ")}`;
    case "products": return `Shown products (${card.shop.name}): ${card.items.map((i) => i.name).join(", ")}`;
    case "plan": return "Shown: the View meal plan button";
  }
}

// ----------------------------------------------------------------------------------------------------------------------- the number guard (rule 1)

/** Every number in a piece of text or JSON (thousands commas allowed: "1,850"). */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
}

const N = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const UNIT = String.raw`k?cals?\b|kcals?\b|calories?\b|kj\b|kilojoules?\b|g\b|grams?\b|mg\b|milligrams?\b|kg\b|kilos?\b|kilograms?\b|ml\b|millilitres?\b|%|per\s?cent\b|percent\b`;
// "£4.50", "£12"; "85p"
const MONEY = new RegExp(String.raw`£\s?(${N})|\b(${N})\s?p\b`, "gi");
// "450 kcal", "a 600-calorie meal", "30g", "20 %"; and ranges "300 to 400 kcal", "20-30 g"
const FIGURE = new RegExp(String.raw`(?:(${N})\s*(?:-|–|to)\s*)?(${N})\s*-?\s*(?:${UNIT})`, "gi");
// a figure in words ("five hundred calories", "thirty grams of protein"): never from a tool
const WORD_FIGURE = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)[\s-]+(?:k?cals?|calories?|grams?|kilojoules?)\b/i;
// rule 3: food is never called good, bad, healthy, clean or junk, and no detox or superfood talk
const JUDGED = /\b(?:un)?health(?:y|ier|iest)\b|\bjunk\b|\bclean eating\b|\bsuperfoods?\b|\bdetox\b|\b(?:good|bad)\s+(?:foods?|choices?|options?|meals?|snacks?|carbs?|fats?|calories)\b|\bguilt[\s-]?free\b|\bcheat (?:meals?|days?)\b/i;

/** The figures a sentence states: [the number, whether it is money (pounds)]. */
export function figuresIn(sentence: string): Array<{ value: number; money: boolean }> {
  const out: Array<{ value: number; money: boolean }> = [];
  for (const m of sentence.matchAll(MONEY)) {
    if (m[1]) out.push({ value: Number(m[1].replace(/,/g, "")), money: true });
    else if (m[2]) out.push({ value: Number(m[2].replace(/,/g, "")) / 100, money: true });
  }
  // money is cut out first, so "£4.50" isn't read again as a bare figure
  const rest = sentence.replace(MONEY, " ");
  for (const m of rest.matchAll(FIGURE)) {
    if (m[1]) out.push({ value: Number(m[1].replace(/,/g, "")), money: false });
    out.push({ value: Number(m[2]!.replace(/,/g, "")), money: false });
  }
  return out;
}

/** A figure said as the data has it, or rounded the way people round: to a whole, to one decimal, to the nearest 5 or 10 from 100 up. */
export function sameFigure(said: number, known: number, money = false): boolean {
  if (money) return Math.abs(said - known) < 0.005 || Math.abs(said - Math.round(known)) < 0.005 && Number.isInteger(said);
  if (said === known) return true;
  if (said === Math.round(known) || said === Math.round(known * 10) / 10) return true;
  if (known >= 100 && (said === Math.round(known / 10) * 10 || said === Math.round(known / 5) * 5)) return true;
  return false;
}

/** The known figures, from tool results and the person's own targets. */
export class KnownFigures {
  private values = new Set<number>();
  add(textOrJson: string): void {
    for (const n of numbersIn(textOrJson)) this.values.add(n);
  }
  has(value: number, money: boolean): boolean {
    for (const k of this.values) {
      if (sameFigure(value, k, money)) return true;
      // a price can be written in pence ("85p" for 0.85): numbersIn reads "0.85" as 0.85 already, and "85" as 85
      if (money && sameFigure(value * 100, k)) return true;
    }
    return false;
  }
}

export type SentenceCheck = { ok: true } | { ok: false; why: "figure" | "words" | "judged" };

/** Whether a sentence may be shown: every figure in it known, none in words, no food judged. */
export function checkSentence(sentence: string, known: KnownFigures): SentenceCheck {
  if (JUDGED.test(sentence)) return { ok: false, why: "judged" };
  if (WORD_FIGURE.test(sentence)) return { ok: false, why: "words" };
  for (const f of figuresIn(sentence)) if (!known.has(f.value, f.money)) return { ok: false, why: "figure" };
  return { ok: true };
}

/**
 * The complete sentences at the start of `buffer` (ending in . ! or ? and a space, or a line break) and what is left over. A decimal point ("4.5 g") never ends
 * a sentence (no space after it). `final`: the stream is over, so the rest is a sentence too.
 */
export function takeSentences(buffer: string, final = false): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i]!;
    const end = c === "\n" || ((c === "." || c === "!" || c === "?") && i + 1 < buffer.length && /\s/.test(buffer[i + 1]!));
    if (!end) continue;
    const s = buffer.slice(start, i + 1);
    if (s.trim()) sentences.push(s);
    start = i + 1;
  }
  const rest = buffer.slice(start);
  if (final && rest.trim()) return { sentences: [...sentences, rest], rest: "" };
  return { sentences, rest };
}

/** Plain text for the chat bubble: markdown's bold and headings taken out, list dashes as bullets. */
export function plainText(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/`/g, "");
}

/** The words of a figure-free Pip reply, kept short for the next request's history. */
export const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

// ----------------------------------------------------------------------------------------------------------------------- the conversation on the phone

/** One message as the phone keeps it (mm.v1.pipChat: this phone only, never synced or sent anywhere but with the next question). */
export interface ChatMessage {
  id: string;
  role: "user" | "pip";
  text: string;
  cards: PipCard[];
  /** When it was written (ms). */
  at: number;
  /** Pip couldn't answer: the text is why. */
  failed?: boolean;
}

/** The kept conversation, checked: anything odd is dropped, at most MAX_KEPT_MESSAGES (the newest). */
export function sanitizeChat(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m): ChatMessage[] => {
    if (!isObj(m) || (m.role !== "user" && m.role !== "pip") || typeof m.id !== "string" || typeof m.text !== "string" || m.text.length > 6000) return [];
    const cards = Array.isArray(m.cards) ? m.cards.map(sanitizeCard).filter((c): c is PipCard => !!c).slice(0, 6) : [];
    return [{ id: m.id.slice(0, 40), role: m.role, text: m.text, cards, at: fin(m.at) ?? 0, ...(m.failed === true ? { failed: true } : {}) }];
  }).slice(-MAX_KEPT_MESSAGES);
}

/** The conversation as it goes with the next question: the newest MAX_HISTORY turns, Pip's with the names of the cards he showed (no figures), no failures. */
export function historyFor(chat: readonly ChatMessage[]): ChatTurn[] {
  const turns = chat
    .filter((m) => !m.failed && (m.text.trim() || m.cards.length))
    .map((m): ChatTurn => (m.role === "user"
      ? { role: "user", text: clip(m.text.trim(), MAX_ASK_CHARS) }
      : { role: "pip", text: clip([m.text.trim(), ...m.cards.map(cardNames)].filter(Boolean).join("\n"), MAX_PIP_CHARS) }));
  const recent = turns.slice(-MAX_HISTORY);
  const first = recent.findIndex((t) => t.role === "user");
  return first < 0 ? [] : recent.slice(first);
}
