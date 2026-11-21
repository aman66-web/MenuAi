// The overview under Compare's table (founder 2026-11-17: "an overview ... best for price, best for protein, best for whatever ... you can just use the numbers and
// do some algorithm"). No AI: for each figure that has an official, plain meaning (price per kg or litre, protein, protein for £1, calories, sugars, salt) it
// names the item that is highest or lowest on the figures the table prints, and for dishes the protein for the calories. Ties name every item that ties; a
// figure only one item has, or that all items share, gives no entry. Items measured differently (per 100 g beside per 100 ml, or a label for the cooked food beside
// one as sold) are never compared. The wording is about one figure at a time, never about food being good or bad (CLAUDE.md rule 3): the screen says so.
import { compareRows, shownFigure, type CompareItem, type CompareRow } from "./compare";
import { tk } from "./i18n";

export type OverviewId = "price" | "protein" | "proteinMoney" | "calories" | "sugars" | "salt" | "proteinCalories";

export interface OverviewEntry {
  id: OverviewId;
  /** English label for t(). */
  label: string;
  /** Positions (in the items given) of the item(s) that lead on this figure. */
  winners: number[];
  /** The leading figure as the table prints it (kcal whole; grams and prices to at most 2 decimals; protein per 100 kcal to 1). */
  value: number;
  /** A leader's figures are community numbers or the government's figures, not a label: the screen says so beside it (2026-11-20). */
  notLabel?: true;
}

/** Why nothing is compared: "basis", some foods are per 100 g and some per 100 ml; "cooked", some labels are for the cooked or prepared food and some as sold. */
export type OverviewMix = "basis" | "cooked" | false;

export interface Overview {
  entries: OverviewEntry[];
  mixed: OverviewMix;
}

function leaders(values: ReadonlyArray<number | null>, pick: "highest" | "lowest"): { winners: number[]; value: number } | null {
  const known = values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] !== null);
  if (known.length < 2) return null;
  const nums = known.map((x) => x[0]);
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max === min) return null;
  const target = pick === "highest" ? max : min;
  return { winners: known.filter((x) => x[0] === target).map((x) => x[1]), value: target };
}

export function compareOverview(items: readonly CompareItem[]): Overview {
  const foods = items.filter((i) => i.kind === "food");
  if (new Set(foods.map((i) => i.basis)).size > 1) return { entries: [], mixed: "basis" };
  // a cooked label beside one as sold: 100 g of grilled bacon isn't 100 g of the raw pack, so no figure crowns either (the second pass, 21 November 2026, Yusuf #42)
  if (foods.some((i) => i.note) && foods.some((i) => !i.note)) return { entries: [], mixed: "cooked" };
  if (items.length < 2) return { entries: [], mixed: false };
  const rows = new Map<string, CompareRow>(compareRows(items).map((r) => [r.id, r]));
  const entries: OverviewEntry[] = [];
  const fromRow = (id: OverviewId, label: string, rowId: string, pick: "highest" | "lowest") => {
    const row = rows.get(rowId);
    if (!row) return;
    const winners = pick === "highest" ? row.highest : row.lowest;
    if (winners.length === 0) return;
    entries.push({ id, label, winners, value: shownFigure(row, row.values[winners[0]!]!), ...(winners.some((w) => items[w]!.source === "community" || items[w]!.source === "government") ? { notLabel: true as const } : {}) });
  };
  fromRow("price", tk("Best for price"), "perKg", "lowest");
  fromRow("protein", tk("Best for protein"), "protein", "highest");
  fromRow("proteinMoney", tk("Best protein for the money"), "proteinPound", "highest");
  // restaurant dishes: the protein each gives for its calories, worked out here from the two published figures (grams per 100 kcal)
  if (items.every((i) => i.kind === "dish")) {
    const density = items.map((i) => (i.numbers.protein !== null && i.numbers.kcal > 0 ? Math.round(((i.numbers.protein * 100) / i.numbers.kcal) * 10) / 10 : null));
    const lead = leaders(density, "highest");
    if (lead) entries.push({ id: "proteinCalories", label: tk("Most protein for the calories"), winners: lead.winners, value: lead.value });
  }
  fromRow("calories", tk("Fewest calories"), "kcal", "lowest");
  fromRow("sugars", tk("Lowest sugars"), "sugars", "lowest");
  fromRow("salt", tk("Lowest salt"), "salt", "lowest");
  return { entries, mixed: false };
}
