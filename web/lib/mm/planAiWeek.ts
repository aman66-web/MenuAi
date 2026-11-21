import { dishFormOf, varietyFaults, varietyReport, type DishForm } from "./dishForm";
import { fivePortionsOf } from "./fiveADay";
import { balanceFaults, balanceReport, breadLimit, MAIN_MEALS, mealBalanceOf, type BalanceLimits, type MealBalance } from "./mealBalance";
import { leavesOut, MAX_SWAP_DISTANCE, PLAN_DAYS, type PlanCandidate, type PlanIds } from "./mealPlan";
import { AI_CANDIDATES, checkAiIds, sanitizeAnswers, type AiCandidate, type AiDay, type PlanAiAnswer, type PlanAiRequest, type PlanAnswers } from "./planAi";
import { nicheOf, type CuisineId } from "./recipeBook/niches";
import type { MealType } from "./recipes";

// Meal plan with Pip, the phone's half (lib/mm/planAi.ts has what the phone and the server share). Before asking, the phone makes its own week as it always has
// (mealPlan.ts planForBudget: the draft), and sends Pip each meal's best recipes, already fitted to the person and priced from the labels. When Pip's week comes
// back, every id is checked against that meal's recipes, and the week against the plan's own rules (dishForm.ts varietyReport and mealBalance.ts balanceReport,
// with the person's bread answer): a recipe that isn't one of the meal's is replaced by the draft's for that slot, and so is any choice that leaves the week less
// varied or less balanced than the draft, one slot at a time; a week that still breaks more rules than the draft, or that comes further from the person's
// calories or protein, is not used at all (the draft is the plan). Then the week is built with buildWeek as any other, so every figure, the shopping list and the
// prices come from the labels. Pure; tests/planAi.test.ts.

/** A dish-form fault weighs this many balance faults (as in mealPlan.ts makePlan). */
const FORM_FAULT = 10;
/** The fewest recipes a meal is sent (a cuisine skipped, or the meal-size window, never leaves Pip fewer than this to choose from). */
const MIN_SENT = 8;
/** Of each meal's recipes sent, this share at most is chosen for being quick enough for weekdays (the rest are the closest fits). */
const QUICK_SHARE = 0.6;

/** The person's bread answer as the plan's balance limits (mealBalance.ts breadLimit); none: the usual limits. */
export const planLimits = (a: PlanAnswers): BalanceLimits => ({ ...(a.bread ? { breadWeek: breadLimit(a.bread) } : {}), ...(a.fruitVeg && a.fruitVeg !== "none" ? { fruitVeg: a.fruitVeg } : {}) });

/** Fruit and veg portions in the person's own serving (fiveADay.ts: a household's recipe is as written, and their portion is `plates[0]` servings of it). */
export function servingPortions(c: Pick<PlanCandidate, "recipe" | "plates">): { fruitVeg: number; pulses: number } {
  const p = fivePortionsOf(c.recipe);
  const k = c.plates?.[0] ?? 1;
  return { fruitVeg: p.fruitVeg * k, pulses: p.pulses * k };
}

/** The plan's seven days from `start` (its first day is the day the plan is made), each named, marked weekend (Saturday, Sunday) and training (the days they said). */
export function planDays(start: Date, answers: PlanAnswers): AiDay[] {
  const name = new Intl.DateTimeFormat("en-GB", { weekday: "long" });
  const days = answers.training && answers.training !== "none" ? answers.trainingDays ?? [] : [];
  return Array.from({ length: PLAN_DAYS }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
    const wd = d.getDay();
    return { name: name.format(d), weekend: wd === 0 || wd === 6, training: days.includes(wd) };
  });
}

const r0 = (n: number) => Math.round(n);

/** One candidate as Pip sees it: its own serving's figures as the labels give them, rounded, and what it is (none of it made up). */
export function aiCandidate(c: PlanCandidate): AiCandidate {
  const b = mealBalanceOf(c.recipe);
  const tags: AiCandidate["tags"] = [];
  if (leavesOut(c.recipe, ["spicy"])) tags.push("spicy");
  if (b.cheesy) tags.push("cheesy");
  if (b.bread) tags.push("bread");
  const ps = c.perServing;
  const five = servingPortions(c);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    id: c.recipe.id, name: c.recipe.name.replace(/[|\n\r]/g, " ").slice(0, 120), cuisine: nicheOf(c.recipe.id).cuisine ?? null, form: dishFormOf(c.recipe), main: b.main,
    leads: [...new Set(b.featured)], minutes: Math.max(0, r0(c.recipe.minutes)), kcal: r0(ps.kcal), protein: r0(ps.protein), carbs: r0(ps.carbs), fat: r0(ps.fat),
    fruitVeg: r1(five.fruitVeg), pulses: r1(five.pulses), cost: Math.round(c.cost * 100) / 100, tags,
  };
}

/**
 * Each meal's recipes for Pip, at most `n`: the draft's own first (so Pip can always keep a good week), then, when the person gave a weekday cooking time, the
 * closest fits that are that quick (up to QUICK_SHARE of the list), then the closest fits. Never one further from the meal size than MAX_SWAP_DISTANCE or the
 * draft's own furthest, and, for lunch and dinner, none of a cuisine they skip, unless that would leave fewer than MIN_SENT.
 */
export function aiShortlist(cands: ReadonlyMap<MealType, readonly PlanCandidate[]>, slots: readonly MealType[], draft: PlanIds, answers: PlanAnswers, n = AI_CANDIDATES): Partial<Record<MealType, AiCandidate[]>> {
  const out: Partial<Record<MealType, AiCandidate[]>> = {};
  const skip = answers.skipCuisines ?? [];
  for (const meal of [...new Set(slots)]) {
    const list = cands.get(meal) ?? [];
    const drafted = new Set(draft.flatMap((d) => d.filter((_, i) => slots[i] === meal)));
    const inDraft = list.filter((c) => drafted.has(c.recipe.id));
    const far = Math.max(MAX_SWAP_DISTANCE, ...inDraft.map((c) => c.distance)) + 1e-9;
    const skipped = (c: PlanCandidate) => { const cuisine = nicheOf(c.recipe.id).cuisine; return (meal === "lunch" || meal === "dinner") && !!cuisine && skip.includes(cuisine); };
    const kept = list.filter((c) => !skipped(c));
    const pool = kept.length >= MIN_SENT ? kept : list;
    const near = pool.filter((c) => c.distance <= far);
    const base = near.length >= MIN_SENT ? near : pool.slice(0, MIN_SENT);
    const chosen: PlanCandidate[] = [];
    const add = (c: PlanCandidate) => { if (chosen.length < n && !chosen.includes(c)) chosen.push(c); };
    inDraft.forEach(add);
    if (answers.cookWeekday && answers.cookWeekday < 60) {
      const limit = Math.max(chosen.length, Math.round(n * QUICK_SHARE));
      for (const c of base) { if (chosen.length >= limit) break; if (c.recipe.minutes <= answers.cookWeekday) add(c); }
    }
    base.forEach(add);
    out[meal] = chosen.map(aiCandidate);
  }
  return out;
}

export interface PlanAiInput {
  answers: PlanAnswers;
  style: string;
  cuisines: readonly CuisineId[];
  slots: readonly MealType[];
  targets: Partial<Record<MealType, { kcal: number; protein?: number }>>;
  daily: { kcal: number; protein: number };
  /** The plan's first day (today). */
  start: Date;
  household: PlanAiRequest["household"];
  variety: 7 | 4 | 2;
  budget: number | null;
  draft: { ids: PlanIds; cost: number };
  /** The candidates the draft was made from (sized for the household when there is one). */
  cands: ReadonlyMap<MealType, readonly PlanCandidate[]>;
}

/** What the phone sends POST /api/v1/plan/ai: the answers, the sizes, the days, who's eating (no names), the draft and each meal's recipes; nothing else. */
export function planAiRequest(o: PlanAiInput): PlanAiRequest {
  const answers = sanitizeAnswers(o.answers);
  const targets: PlanAiRequest["targets"] = {};
  for (const m of [...new Set(o.slots)]) {
    const t = o.targets[m];
    if (t) targets[m] = { kcal: r0(t.kcal), protein: r0(t.protein ?? 0) };
  }
  return {
    answers, style: o.style, cuisines: [...o.cuisines], slots: [...o.slots], targets, daily: { kcal: r0(o.daily.kcal), protein: r0(o.daily.protein) }, days: planDays(o.start, answers),
    household: o.household, variety: o.variety, budget: o.budget, draft: o.draft.ids.map((d) => [...d]), draftCost: Math.round(o.draft.cost * 100) / 100,
    candidates: aiShortlist(o.cands, o.slots, o.draft.ids, answers),
  };
}

/** How many times a recipe may come round in its meal in a week: once for "a different meal every day", twice for "some repeats", four times for meal prep. */
export const roundsFor = (variety: number, leftovers: boolean): number => Math.max(Math.ceil(PLAN_DAYS / Math.max(1, variety)), leftovers ? 2 : 1);

/**
 * How far a week is from the plan's own rules, weighed as makePlan weighs them (a dish-form fault as FORM_FAULT balance faults), with a recipe coming round more
 * often than `variety` allows (or twice in a day) counted like a dish-form fault. With leftovers, the same lunch or dinner on the day after is a planned leftover,
 * not a repeat. 0 is a week that keeps every rule.
 */
export function weekScore(ids: PlanIds, cands: ReadonlyMap<MealType, readonly PlanCandidate[]>, slots: readonly MealType[], o: ScoreOptions): number {
  return weekScorer(cands, slots, o)(ids);
}

export interface ScoreOptions { leftovers?: boolean; limits?: BalanceLimits; variety: number }

/** weekScore for many weeks from the same candidates (the repair below scores hundreds): the dish forms and balances looked up once. */
export function weekScorer(cands: ReadonlyMap<MealType, readonly PlanCandidate[]>, slots: readonly MealType[], o: ScoreOptions): (ids: PlanIds) => number {
  const formOf = new Map<string, DishForm>();
  const balOf = new Map<string, MealBalance>();
  for (const [m, list] of cands) for (const c of list) { formOf.set(`${m}:${c.recipe.id}`, dishFormOf(c.recipe)); balOf.set(`${m}:${c.recipe.id}`, mealBalanceOf(c.recipe)); }
  const limits = o.limits ?? {};
  const rounds = roundsFor(o.variety, !!o.leftovers);
  const meals = [...new Set(slots)];
  return (ids) => {
    const forms = ids.map((d) => d.map((id, i) => formOf.get(`${slots[i]}:${id}`)));
    const bal = ids.map((d) => d.map((id, i) => balOf.get(`${slots[i]}:${id}`)));
    let pairs = 0;
    let mainPairs = 0;
    if (o.leftovers) {
      ids.forEach((d, di) => d.forEach((id, i) => {
        if (di === 0 || !MAIN_MEALS.includes(slots[i]!) || ids[di - 1]![i] !== id) return;
        pairs++;
        if (bal[di]![i]?.main) mainPairs++;
      }));
    }
    const variety = varietyFaults(forms) - Math.min(varietyReport(forms).dayAfter, pairs);
    const balance = balanceFaults(bal, slots, limits) - Math.min(balanceReport(bal, slots, limits).dayAfter, mainPairs);
    let over = 0;
    for (const meal of meals) {
      const per = slots.filter((s) => s === meal).length;
      const uses = new Map<string, number>();
      ids.forEach((d) => {
        const today = new Set<string>();
        d.forEach((id, i) => {
          if (slots[i] !== meal) return;
          if (today.has(id)) over++;
          today.add(id);
          uses.set(id, (uses.get(id) ?? 0) + 1);
        });
      });
      for (const n of uses.values()) over += Math.max(0, n - rounds * per);
    }
    return FORM_FAULT * (variety + over) + balance;
  };
}

/** The week's average day: its calories and protein from the candidates' own servings (the labels). */
function averageDay(ids: PlanIds, cands: ReadonlyMap<MealType, readonly PlanCandidate[]>, slots: readonly MealType[]): { kcal: number; protein: number } {
  const byId = new Map<string, PlanCandidate>();
  for (const [m, list] of cands) for (const c of list) byId.set(`${m}:${c.recipe.id}`, c);
  let kcal = 0;
  let protein = 0;
  for (const d of ids) d.forEach((id, i) => { const c = byId.get(`${slots[i]}:${id}`); kcal += c?.perServing.kcal ?? 0; protein += c?.perServing.protein ?? 0; });
  return { kcal: kcal / Math.max(1, ids.length), protein: protein / Math.max(1, ids.length) };
}

/** A week may come this much further from the day's calories than the draft (a share of them), and this much short of the draft's protein (a share of the target). */
export const AI_KCAL_SLACK = 0.05;
export const AI_PROTEIN_SLACK = 0.1;
/** The most single-slot repairs made to Pip's week. */
const MAX_REPAIRS = 42;

export interface MergedWeek {
  ids: PlanIds;
  /** "pip": Pip's week (with `fixed` slots taken from the draft); "phone": the draft, and why Pip's couldn't be used. */
  source: "pip" | "phone";
  fixed: number;
  reason?: "noAnswer" | "unusable" | "rules" | "numbers";
}

/**
 * Pip's week made safe to use (see the top of this file): ids checked against each slot's candidates (`cands`: the ones the draft was made from), anything that
 * isn't one replaced by the draft's, then, one slot at a time, the draft's recipe put back wherever that makes the week keep the rules better, until it keeps
 * them at least as well as the draft. The draft itself when the answer is missing or unusable, still breaks more rules, or is further from the person's numbers.
 */
export function mergeAiWeek(answer: PlanAiAnswer | null, req: Pick<PlanAiRequest, "slots" | "candidates" | "days" | "draft" | "variety" | "answers" | "daily">, cands: ReadonlyMap<MealType, readonly PlanCandidate[]>): MergedWeek {
  const draft = req.draft;
  const phone = (reason: MergedWeek["reason"]): MergedWeek => ({ ids: draft.map((d) => [...d]), source: "phone", fixed: 0, reason });
  if (!answer) return phone("noAnswer");
  const checked = checkAiIds(answer.ids, req);
  if (!checked) return phone("unusable");
  // only recipes the phone priced for that meal (the shortlist is a part of them)
  const known = new Map<MealType, Set<string>>();
  for (const [m, list] of cands) known.set(m, new Set(list.map((c) => c.recipe.id)));
  let fixed = 0;
  const ids: PlanIds = checked.ids.map((d, di) => d.map((id, i) => {
    if (id && known.get(req.slots[i]!)?.has(id)) return id;
    fixed++;
    return draft[di]![i]!;
  }));
  if (fixed * 3 > ids.length * req.slots.length) return phone("unusable");
  const score = weekScorer(cands, req.slots, { leftovers: !!req.answers.leftovers, limits: planLimits(req.answers), variety: req.variety });
  const target = score(draft);
  let now = score(ids);
  // the slots that differ from the draft; putting one back (or, when no one alone helps, two of the same meal: two days Pip swapped round)
  const differ = () => ids.flatMap((d, di) => d.flatMap((id, i) => (id !== draft[di]![i] ? [[di, i] as const] : [])));
  const putBack = (cells: ReadonlyArray<readonly [number, number]>) => { for (const [d, i] of cells) ids[d]![i] = draft[d]![i]!; };
  for (let round = 0; now > target && round < MAX_REPAIRS; round++) {
    const cells = differ();
    let best: { cells: ReadonlyArray<readonly [number, number]>; s: number } | null = null;
    const look = (move: ReadonlyArray<readonly [number, number]>) => {
      const was = move.map(([d, i]) => ids[d]![i]!);
      putBack(move);
      const s = score(ids);
      move.forEach(([d, i], k) => { ids[d]![i] = was[k]!; });
      if (s < now && (!best || s < best.s)) best = { cells: move, s };
    };
    for (const c of cells) look([c]);
    if (!best) for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) if (cells[a]![1] === cells[b]![1]) look([cells[a]!, cells[b]!]);
    if (!best) break;
    const move = best as { cells: ReadonlyArray<readonly [number, number]>; s: number };
    putBack(move.cells);
    now = move.s;
    fixed += move.cells.length;
  }
  if (now > target) return phone("rules");
  const mine = averageDay(ids, cands, req.slots);
  const theirs = averageDay(draft, cands, req.slots);
  const { kcal, protein } = req.daily;
  if (Math.abs(mine.kcal - kcal) > Math.abs(theirs.kcal - kcal) + AI_KCAL_SLACK * kcal || mine.protein < theirs.protein - AI_PROTEIN_SLACK * protein) return phone("numbers");
  return { ids, source: "pip", fixed };
}

/** Whether Pip's week (as built, before any pricier products) keeps to the budget as well as the draft does: within it, or no dearer than the draft. */
export const budgetKept = (budget: number | null, pipCost: number, draftCost: number): boolean => budget === null || pipCost <= Math.max(budget, draftCost) + 0.005;
