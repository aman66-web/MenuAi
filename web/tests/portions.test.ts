// Measures for "How much?" (lib/mm/portions.ts; founder 2026-11-21): only fixed amounts of the label's own unit, never a density guess.
import { describe, expect, it } from "vitest";
import { amountIn, countIn, countText, measuresFor, measureStep, QUICK_COUNTS } from "../lib/mm/portions";

const keys = (p: Parameters<typeof measuresFor>[0]) => measuresFor(p).map((m) => `${m.key}:${m.one}`);

describe("the measures a product can be counted in", () => {
  it("a drink labelled per 100 ml: ml, its serving and pack, then glass, can, pint and spoons", () => {
    expect(keys({ per: "ml", size: "1 L", portion: "200ml" })).toEqual(["unit:1", "portion:200", "pack:1000", "glass:250", "can:330", "pint:568", "tbsp:15", "tsp:5"]);
  });

  it("a can of drink: the pack is the can, so 'can' isn't offered twice", () => {
    expect(keys({ per: "ml", size: "330ml", portion: "" })).toEqual(["unit:1", "pack:330", "glass:250", "pint:568", "tbsp:15", "tsp:5"]);
  });

  it("a food labelled per 100 g: g, its serving, one item of a multipack, then ounces; never spoons or glasses (that would need a density)", () => {
    expect(keys({ per: "g", size: "4 x 125g", portion: "125g" })).toEqual(["unit:1", "portion:125", "oz:28.35"]);
    expect(keys({ per: "g", size: "500g", portion: "30g" })).toEqual(["unit:1", "portion:30", "pack:500", "oz:28.35"]);
    expect(keys({ per: "g", size: "", portion: "" })).toEqual(["unit:1", "oz:28.35"]);
  });

  it("a label for the food cooked, prepared or drained never offers the pack or one item of it (the pack weight is as sold)", () => {
    expect(keys({ per: "g", size: "2 x 250g", portion: "", state: "grilled" })).toEqual(["unit:1", "oz:28.35"]);
    expect(keys({ per: "ml", size: "1 L", portion: "250ml", state: "as prepared" })).toEqual(["unit:1", "portion:250", "can:330", "pint:568", "tbsp:15", "tsp:5"]);
  });

  it("a serving printed in another unit than the label's is left out", () => {
    expect(keys({ per: "g", size: "", portion: "250ml" })).toEqual(["unit:1", "oz:28.35"]);
  });
});

describe("counting in a measure", () => {
  const glass = { key: "glass" as const, one: 250 };
  it("turns counts into g or ml and back", () => {
    expect(amountIn(glass, 1.5)).toBe(375);
    expect(countIn(glass, 375)).toBe(1.5);
    expect(amountIn({ key: "oz", one: 28.35 }, 2)).toBe(56.7);
  });

  it("steps half a measure; g and ml keep the box's own steps", () => {
    expect(measureStep(glass)).toBe(0.5);
    expect(measureStep({ key: "unit", one: 1 })).toBeNull();
  });

  it("says counts as people do", () => {
    expect(QUICK_COUNTS.map(countText)).toEqual(["½", "1", "2"]);
    expect(countText(1.5)).toBe("1½");
    expect(countText(0.33)).toBe("0.33");
  });
});
