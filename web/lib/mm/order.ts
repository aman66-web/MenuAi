import type { ChainIndex } from "./chain-index";
import { lowerFirst, formatCalories, formatGrams } from "./format";
import { sumNutrients } from "./nutrients";
import type { Remaining } from "./budget";
import {
  COMPONENT_GROUPS,
  type Combination,
  type ComponentRef,
  type MenuComponent,
  type Nutrients,
  type Tag,
} from "./types";

// SPEC §6.5: order calculator. An order is a list of lines; the total is the sum of line totals.

export interface ComponentLine {
  kind: "components";
  /** The menu item whose default recipe this line started from (used for the name and the diff). */
  itemId: string;
  components: ComponentRef[];
}

export interface ItemLine {
  kind: "item";
  itemId: string;
  qty: number;
  modifierIds: string[];
}

export type OrderLine = ComponentLine | ItemLine;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

export const MAX_ITEM_QTY = 9;

// ------------------------------------------------------------------ building lines

/** One line from an item's default recipe (component items) or a plain item line (with optional modifiers). */
export function lineFromItem(ix: ChainIndex, itemId: string, modifierIds: string[] = []): OrderLine | null {
  const item = ix.items.get(itemId);
  if (!item) return null;
  if (item.components.length > 0) {
    return { kind: "components", itemId, components: item.components.map((c) => ({ ...c })) };
  }
  return { kind: "item", itemId, qty: 1, modifierIds: [...modifierIds] };
}

/** Builder start state from a pre-built combination ("Best for you" pick). Null if anything is no longer on the menu. */
export function linesFromCombination(ix: ChainIndex, combo: Combination): OrderLine[] | null {
  if (combo.components.length > 0 && combo.baseItemId) {
    return [{ kind: "components", itemId: combo.baseItemId, components: combo.components.map((c) => ({ ...c })) }];
  }
  const lines: OrderLine[] = [];
  for (const i of combo.items) {
    const line = lineFromItem(ix, i.itemId, i.modifierIds);
    if (!line) return null;
    lines.push(line);
  }
  return lines.length > 0 ? lines : null;
}

// ------------------------------------------------------------------ totals

/** Line total, or null when the item/a component/a modifier is no longer on the menu. */
export function lineNutrients(ix: ChainIndex, line: OrderLine): Nutrients | null {
  const item = ix.items.get(line.itemId);
  if (!item) return null;
  if (line.kind === "components") {
    const parts: [Nutrients, number][] = [];
    for (const ref of line.components) {
      const comp = ix.components.get(ref.id);
      if (!comp) return null;
      parts.push([comp.nutrients, ref.qty]);
    }
    return sumNutrients(parts);
  }
  const parts: [Nutrients, number][] = [[item.nutrients, 1]];
  for (const mod of orderedModifiers(ix, line)) {
    if (!mod) return null;
    parts.push([mod.nutrients, mod.kind === "remove" ? -1 : 1]);
  }
  const unit = sumNutrients(parts);
  return line.qty === 1 ? unit : sumNutrients([[unit, line.qty]]);
}

export function orderNutrients(ix: ChainIndex, lines: OrderLine[]): Nutrients | null {
  const parts: [Nutrients, number][] = [];
  for (const line of lines) {
    const n = lineNutrients(ix, line);
    if (!n) return null;
    parts.push([n, 1]);
  }
  return sumNutrients(parts);
}

/** True when everything the order refers to still exists ("No longer on the menu" otherwise). */
export function isOrderAvailable(ix: ChainIndex, lines: OrderLine[]): boolean {
  return orderNutrients(ix, lines) !== null;
}

// ------------------------------------------------------------------ tags

function combineTags(tagLists: Tag[][]): Tag[] {
  const tags = new Set<Tag>();
  for (const list of tagLists) for (const t of list) if (t !== "vegetarian") tags.add(t);
  if (tagLists.length > 0 && tagLists.every((l) => l.includes("vegetarian"))) tags.add("vegetarian");
  return [...tags].sort();
}

export function lineTags(ix: ChainIndex, line: OrderLine): Tag[] {
  const item = ix.items.get(line.itemId);
  if (line.kind === "components") {
    return combineTags(line.components.map((c) => ix.components.get(c.id)?.tags ?? []));
  }
  if (!item) return [];
  const added = orderedModifiers(ix, line)
    .filter((m): m is NonNullable<typeof m> => !!m && m.kind === "add")
    .map((m) => m.tags);
  return added.length > 0 ? combineTags([item.tags, ...added]) : [...item.tags];
}

/** Order tags: contains_* is a union; vegetarian only if every line is (so "add bacon" makes it non-vegetarian). */
export function orderTags(ix: ChainIndex, lines: OrderLine[]): Tag[] {
  return combineTags(lines.map((l) => lineTags(ix, l)));
}

// ------------------------------------------------------------------ naming

function groupIndex(c: MenuComponent): number {
  return COMPONENT_GROUPS.indexOf(c.group);
}

function byGroupThenChainOrder(ix: ChainIndex) {
  return (a: MenuComponent, b: MenuComponent) =>
    groupIndex(a) - groupIndex(b) || (ix.componentOrder.get(a.id) ?? 0) - (ix.componentOrder.get(b.id) ?? 0);
}

/** Modifiers of an item line in canonical order (removes first, then adds, each in the item's own order). */
function orderedModifiers(ix: ChainIndex, line: ItemLine) {
  const item = ix.items.get(line.itemId);
  const chosen = new Set(line.modifierIds);
  if (!item) return line.modifierIds.map(() => undefined);
  const known = item.modifiers.filter((m) => chosen.has(m.id));
  const unknown = line.modifierIds.filter((id) => !item.modifiers.some((m) => m.id === id));
  return [
    ...known.filter((m) => m.kind === "remove"),
    ...known.filter((m) => m.kind === "add"),
    ...unknown.map(() => undefined),
  ];
}

/**
 * Name = item name · changes, with exactly the pipeline's wording and order (docs/DATA.md):
 * doubles, then removals joined with ", ", then swaps, then added components.
 * Changes are derived from the line's state versus the item's default recipe, so a saved order always
 * names itself the same way. A missing default and an added component in the same group read as a swap.
 */
export function componentLineName(ix: ChainIndex, line: ComponentLine): string {
  const item = ix.items.get(line.itemId);
  if (!item) return "Custom order";
  const defaults = new Map(item.components.map((c) => [c.id, c.qty]));
  const state = new Map(line.components.map((c) => [c.id, c.qty]));
  const comp = (id: string) => ix.components.get(id);
  const sorter = byGroupThenChainOrder(ix);

  const doubles = [...state]
    .filter(([id, q]) => q === 2 && defaults.get(id) === 1)
    .map(([id]) => comp(id))
    .filter((c): c is MenuComponent => !!c)
    .sort(sorter);
  const singles = [...state]
    .filter(([id, q]) => q === 1 && defaults.get(id) === 2)
    .map(([id]) => comp(id))
    .filter((c): c is MenuComponent => !!c)
    .sort(sorter);

  const missing = item.components.map((c) => comp(c.id)).filter((c): c is MenuComponent => !!c && !state.has(c.id));
  const added = [...state.keys()]
    .filter((id) => !defaults.has(id))
    .map((id) => comp(id))
    .filter((c): c is MenuComponent => !!c)
    .sort(sorter);

  const swaps: string[] = [];
  const swappedOut = new Set<string>();
  const swappedIn = new Set<string>();
  for (const group of COMPONENT_GROUPS) {
    const out = missing.filter((c) => c.group === group);
    const inn = added.filter((c) => c.group === group);
    for (let i = 0; i < Math.min(out.length, inn.length); i++) {
      swaps.push(`${lowerFirst(inn[i]!.name)} instead of ${lowerFirst(out[i]!.name)}`);
      swappedOut.add(out[i]!.id);
      swappedIn.add(inn[i]!.id);
    }
  }
  const removals = missing.filter((c) => !swappedOut.has(c.id));
  const adds = added.filter((c) => !swappedIn.has(c.id));

  const changes: string[] = [
    ...doubles.map((c) => `double ${lowerFirst(c.name)}`),
    ...singles.map((c) => `single ${lowerFirst(c.name)}`),
  ];
  if (removals.length > 0) changes.push(removals.map((c) => `no ${lowerFirst(c.name)}`).join(", "));
  changes.push(...swaps, ...adds.map((c) => `add ${lowerFirst(c.name)}`));
  return [item.name, ...changes].join(" · ");
}

export function itemLineName(ix: ChainIndex, line: ItemLine): string {
  const item = ix.items.get(line.itemId);
  if (!item) return "Custom order";
  const mods = orderedModifiers(ix, line).filter((m): m is NonNullable<typeof m> => !!m);
  const base = [item.name, ...mods.map((m) => lowerFirst(m.label))].join(" · ");
  return line.qty > 1 ? `${line.qty} × ${base}` : base;
}

export function lineName(ix: ChainIndex, line: OrderLine): string {
  return line.kind === "components" ? componentLineName(ix, line) : itemLineName(ix, line);
}

/** Default name for Save, Log and Share: line names joined with " + ". */
export function orderName(ix: ChainIndex, lines: OrderLine[]): string {
  return lines.map((l) => lineName(ix, l)).join(" + ");
}

/** Plain description for the share card: what's in the order, e.g. "Double chicken, brown rice, black beans, no cheese". */
export function describeOrder(ix: ChainIndex, lines: OrderLine[]): string {
  const parts: string[] = [];
  const sorter = byGroupThenChainOrder(ix);
  for (const line of lines) {
    if (line.kind === "item") {
      const mods = orderedModifiers(ix, line).filter((m): m is NonNullable<typeof m> => !!m).map((m) => lowerFirst(m.label));
      const item = ix.items.get(line.itemId);
      parts.push(...(item ? [line.qty > 1 ? `${line.qty} × ${lowerFirst(item.name)}` : lowerFirst(item.name)] : []), ...mods);
      continue;
    }
    const item = ix.items.get(line.itemId);
    const present = line.components
      .map((c) => ({ ref: c, comp: ix.components.get(c.id) }))
      .filter((x): x is { ref: ComponentRef; comp: MenuComponent } => !!x.comp)
      .sort((a, b) => sorter(a.comp, b.comp));
    for (const { ref, comp } of present) parts.push(ref.qty === 2 ? `double ${lowerFirst(comp.name)}` : lowerFirst(comp.name));
    const have = new Set(line.components.map((c) => c.id));
    for (const def of item?.components ?? []) {
      const comp = ix.components.get(def.id);
      if (comp && !have.has(def.id) && !line.components.some((c) => ix.components.get(c.id)?.group === comp.group && !item?.components.some((d) => d.id === c.id))) {
        parts.push(`no ${lowerFirst(comp.name)}`);
      }
    }
  }
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ------------------------------------------------------------------ builder rules (SPEC §6.5)

export function validateOrder(lines: OrderLine[]): Result<true> {
  if (lines.length === 0) return fail("An order needs at least one item.");
  for (const line of lines) {
    if (line.kind === "components" && line.components.length === 0) return fail("An order line needs at least one ingredient.");
  }
  return ok(true);
}

function replaceComponents(line: ComponentLine, components: ComponentRef[]): ComponentLine {
  return { ...line, components };
}

/** Set a component's quantity. 2 ("Double") only when the chain publishes a double portion. */
export function setComponentQty(ix: ChainIndex, line: ComponentLine, componentId: string, qty: 1 | 2): Result<ComponentLine> {
  const comp = ix.components.get(componentId);
  if (!comp) return fail("That ingredient is no longer on the menu.");
  if (!line.components.some((c) => c.id === componentId)) return fail("That ingredient isn't in this order.");
  if (qty === 2 && !comp.allowDouble) return fail(`${comp.name} can't be doubled.`);
  return ok(replaceComponents(line, line.components.map((c) => (c.id === componentId ? { ...c, qty } : c))));
}

/** Any component can be removed, as long as one remains. */
export function removeComponent(line: ComponentLine, componentId: string): Result<ComponentLine> {
  if (!line.components.some((c) => c.id === componentId)) return fail("That ingredient isn't in this order.");
  if (line.components.length === 1) return fail("An order line needs at least one ingredient.");
  return ok(replaceComponents(line, line.components.filter((c) => c.id !== componentId)));
}

export function addComponent(ix: ChainIndex, line: ComponentLine, componentId: string): Result<ComponentLine> {
  const comp = ix.components.get(componentId);
  if (!comp) return fail("That ingredient is no longer on the menu.");
  if (line.components.some((c) => c.id === componentId)) return fail(`${comp.name} is already in this order.`);
  return ok(replaceComponents(line, [...line.components, { id: componentId, qty: 1 }]));
}

/** Swap only within the same group; keeps the position. */
export function swapComponent(ix: ChainIndex, line: ComponentLine, fromId: string, toId: string): Result<ComponentLine> {
  const from = ix.components.get(fromId);
  const to = ix.components.get(toId);
  if (!from || !to) return fail("That ingredient is no longer on the menu.");
  const current = line.components.find((c) => c.id === fromId);
  if (!current) return fail("That ingredient isn't in this order.");
  if (from.group !== to.group) return fail("You can only swap within the same kind of ingredient.");
  if (line.components.some((c) => c.id === toId)) return fail(`${to.name} is already in this order.`);
  const qty = current.qty === 2 && to.allowDouble ? 2 : 1;
  return ok(replaceComponents(line, line.components.map((c) => (c.id === fromId ? { id: toId, qty } : c))));
}

export const GROUP_LABEL: Record<string, string> = {
  base: "Base", wrap: "Wrap", protein: "Protein", topping: "Toppings", sauce: "Sauce", side: "Sides", drink: "Drinks", extra: "Extras",
};

/** A component line's ingredients in builder order (base, wrap, protein, topping, sauce, side, drink, extra). Unknown ids are dropped. */
export function sortedComponents(ix: ChainIndex, line: ComponentLine): Array<{ ref: ComponentRef; comp: MenuComponent }> {
  const sorter = byGroupThenChainOrder(ix);
  return line.components
    .map((ref) => ({ ref, comp: ix.components.get(ref.id) }))
    .filter((x): x is { ref: ComponentRef; comp: MenuComponent } => !!x.comp)
    .sort((a, b) => sorter(a.comp, b.comp));
}

/** Components of the chain that can still be added to this line, grouped in builder order. */
export function addableComponents(ix: ChainIndex, line: ComponentLine): Map<string, MenuComponent[]> {
  const present = new Set(line.components.map((c) => c.id));
  const grouped = new Map<string, MenuComponent[]>();
  for (const group of COMPONENT_GROUPS) {
    const list = ix.chain.components.filter((c) => c.group === group && !present.has(c.id));
    if (list.length > 0) grouped.set(group, list);
  }
  return grouped;
}

/** Other components in the same group, for the Swap picker. */
export function swapOptions(ix: ChainIndex, line: ComponentLine, componentId: string): MenuComponent[] {
  const comp = ix.components.get(componentId);
  if (!comp) return [];
  const present = new Set(line.components.map((c) => c.id));
  return ix.chain.components.filter((c) => c.group === comp.group && !present.has(c.id));
}

export function setItemQty(line: ItemLine, qty: number): Result<ItemLine> {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ITEM_QTY) return fail(`Choose between 1 and ${MAX_ITEM_QTY}.`);
  return ok({ ...line, qty });
}

export function toggleModifier(ix: ChainIndex, line: ItemLine, modifierId: string): Result<ItemLine> {
  const item = ix.items.get(line.itemId);
  if (!item?.modifiers.some((m) => m.id === modifierId)) return fail("That option isn't available.");
  const on = line.modifierIds.includes(modifierId);
  return ok({ ...line, modifierIds: on ? line.modifierIds.filter((m) => m !== modifierId) : [...line.modifierIds, modifierId] });
}

// ------------------------------------------------------------------ "After this"

export interface AfterThis {
  calories: number; // remaining after this order; negative = over
  protein?: number;
}

export function afterThis(remaining: Remaining, total: Nutrients): AfterThis {
  return {
    calories: remaining.calories - total.calories,
    ...(remaining.protein !== undefined ? { protein: remaining.protein - total.protein } : {}),
  };
}

/** "After this: 440 cal · 34g protein left today" or, over target, neutral "After this: 120 cal over today's target". */
export function afterThisText(a: AfterThis): string {
  if (a.calories < 0) return `After this: ${formatCalories(-a.calories)} over today's target`;
  const protein = a.protein !== undefined ? ` · ${formatGrams(Math.max(0, a.protein))} protein` : "";
  return `After this: ${formatCalories(a.calories)}${protein} left today`;
}
