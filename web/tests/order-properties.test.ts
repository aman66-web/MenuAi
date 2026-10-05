import { describe, expect, it } from "vitest";
import {
  addComponent, componentLineName, lineFromItem, lineNutrients, orderName, removeComponent, setComponentQty, swapComponent,
  type ComponentLine,
} from "../lib/mm/order";
import { sumNutrients } from "../lib/mm/nutrients";
import { bowl } from "./fixtures";

// A small deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("order calculator invariants under random builder operations", () => {
  const ix = bowl();
  const componentIds = ix.chain.components.map((c) => c.id);
  const itemIds = ix.chain.items.filter((i) => i.components.length > 0).map((i) => i.id);

  it("holds for 400 random operation sequences", () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const rand = rng(seed);
      const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
      const itemId = pick(itemIds);
      let line = lineFromItem(ix, itemId) as ComponentLine;
      const defaultName = ix.items.get(itemId)!.name;
      if (componentLineName(ix, line) !== defaultName) failures.push(`seed ${seed}: default recipe should be named just "${defaultName}"`);

      for (let step = 0; step < 12; step++) {
        const op = Math.floor(rand() * 4);
        const target = pick(componentIds);
        const present = line.components.map((c) => c.id);
        const result =
          op === 0 ? addComponent(ix, line, target)
          : op === 1 ? removeComponent(line, pick(present))
          : op === 2 ? setComponentQty(ix, line, pick(present), rand() < 0.5 ? 1 : 2)
          : swapComponent(ix, line, pick(present), target);
        if (!result.ok) continue; // rejected operations must leave the line untouched, which is checked below
        line = result.value as ComponentLine;

        // 1. structurally valid
        const ids = line.components.map((c) => c.id);
        if (new Set(ids).size !== ids.length) failures.push(`seed ${seed} step ${step}: duplicate component`);
        if (line.components.length < 1) failures.push(`seed ${seed} step ${step}: empty line`);
        for (const c of line.components) {
          const comp = ix.components.get(c.id)!;
          if (![1, 2].includes(c.qty) || (c.qty === 2 && !comp.allowDouble)) failures.push(`seed ${seed} step ${step}: bad qty for ${c.id}`);
        }

        // 2. total = sum of parts, never negative, optionals only when every part publishes them
        const total = lineNutrients(ix, line)!;
        const parts = line.components.map((c) => [ix.components.get(c.id)!.nutrients, c.qty] as const);
        if (JSON.stringify(total) !== JSON.stringify(sumNutrients(parts))) failures.push(`seed ${seed} step ${step}: total mismatch`);
        for (const [k, v] of Object.entries(total)) if (typeof v === "number" && v < 0) failures.push(`seed ${seed}: negative ${k}`);
        for (const key of ["saturatedFat", "sodium", "sugar", "fiber"] as const) {
          const everyPart = parts.every(([n]) => n[key] !== undefined);
          if (everyPart !== (total[key] !== undefined)) failures.push(`seed ${seed} step ${step}: optional ${key} propagation`);
        }

        // 3. the name is a pure function of the state and always starts with the item name
        const name = componentLineName(ix, line);
        if (!name.startsWith(defaultName)) failures.push(`seed ${seed} step ${step}: name ${name}`);
        if (name !== componentLineName(ix, { ...line, components: [...line.components].reverse() })) failures.push(`seed ${seed} step ${step}: name depends on component order`);
        if (orderName(ix, [line]) !== name) failures.push(`seed ${seed} step ${step}: orderName differs`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("rejected operations never change the line", () => {
    const line = lineFromItem(ix, "chicken-bowl") as ComponentLine;
    const before = JSON.stringify(line);
    expect(setComponentQty(ix, line, "cheese", 2).ok).toBe(false);
    expect(swapComponent(ix, line, "white-rice", "cheese").ok).toBe(false);
    expect(addComponent(ix, line, "chicken").ok).toBe(false);
    expect(removeComponent({ ...line, components: [line.components[0]!] }, line.components[0]!.id).ok).toBe(false);
    expect(JSON.stringify(line)).toBe(before);
  });

  it("swapping back and forth restores the default name and totals", () => {
    const start = lineFromItem(ix, "chicken-bowl") as ComponentLine;
    const there = (swapComponent(ix, start, "white-rice", "lettuce") as { ok: true; value: ComponentLine }).value;
    const back = (swapComponent(ix, there, "lettuce", "white-rice") as { ok: true; value: ComponentLine }).value;
    expect(componentLineName(ix, back)).toBe("Chicken bowl");
    expect(lineNutrients(ix, back)).toEqual(lineNutrients(ix, start));
  });
});
