import { describe, expect, it } from "vitest";
import { defaultView, MAX_REMEMBERED, readChainView, writeChainView, type ChainView } from "../app/app/chain/chainView";
import type { SortKind } from "../lib/mm/menu-view";

// A restaurant's full menu remembers its sort, the sections opened and how far a sorted list was shown (for this browser tab), so Back from a dish
// and coming back to the Eat out tab find it as it was. What is read back comes from storage anyone could have edited: it is checked, never trusted.

const PAGE = 60;
const ALL: SortKind[] = ["menu", "protein", "calories", "density"];
const opts = { page: PAGE, sorts: ALL };
const view = (v: Partial<ChainView>): ChainView => ({ ...defaultView(PAGE), ...v });

describe("a restaurant's menu view, stored and read back", () => {
  it("round-trips", () => {
    const stored = writeChainView(null, "kfc", view({ sort: "protein", expanded: ["Burgers", "Sides"], limit: 180 }), PAGE);
    expect(readChainView(JSON.parse(JSON.stringify(stored)), "kfc", opts)).toEqual({ sort: "protein", expanded: ["Burgers", "Sides"], limit: 180 });
  });
  it("is the default for a restaurant never seen, and for nothing stored", () => {
    expect(readChainView(null, "kfc", opts)).toEqual(defaultView(PAGE));
    expect(readChainView(writeChainView(null, "kfc", view({ sort: "calories" }), PAGE), "subway", opts)).toEqual(defaultView(PAGE));
  });
  it("keeps each restaurant apart, the one changed last first, and at most a few of them", () => {
    let stored: unknown = null;
    for (let i = 0; i < MAX_REMEMBERED + 5; i++) stored = writeChainView(stored, `chain-${i}`, view({ sort: "calories" }), PAGE);
    const list = (stored as { chains: Array<{ id: string }> }).chains;
    expect(list).toHaveLength(MAX_REMEMBERED);
    expect(list[0]!.id).toBe(`chain-${MAX_REMEMBERED + 4}`);
    expect(readChainView(stored, "chain-0", opts)).toEqual(defaultView(PAGE)); // the oldest was let go
    expect(readChainView(stored, `chain-${MAX_REMEMBERED + 4}`, opts).sort).toBe("calories");
    stored = writeChainView(stored, "chain-10", view({ sort: "density" }), PAGE);
    expect((stored as { chains: Array<{ id: string }> }).chains.filter((c) => c.id === "chain-10")).toHaveLength(1);
  });
  it("takes a restaurant out once its view is the default again", () => {
    const stored = writeChainView(writeChainView(null, "kfc", view({ sort: "protein" }), PAGE), "kfc", defaultView(PAGE), PAGE);
    expect(stored.chains).toEqual([]);
  });
  it("reads a sort this menu doesn't offer as menu order (a calories-only restaurant has no protein sort)", () => {
    const stored = writeChainView(null, "wahaca", view({ sort: "protein" }), PAGE);
    expect(readChainView(stored, "wahaca", { page: PAGE, sorts: ["menu", "calories"] }).sort).toBe("menu");
  });
  it("ignores anything that isn't what it wrote", () => {
    const junk: unknown[] = [
      "nonsense", 42, [], { v: 2, chains: [{ id: "kfc", sort: "protein" }] }, { v: 1, chains: "kfc" }, { v: 1, chains: [null, 7, "kfc"] },
    ];
    for (const raw of junk) expect(readChainView(raw, "kfc", opts), JSON.stringify(raw)).toEqual(defaultView(PAGE));
    const bad = { v: 1, chains: [{ id: "kfc", sort: "tastiest", expanded: ["Burgers", 3, "", "x".repeat(500), "Burgers", null], limit: 1e9 }] };
    expect(readChainView(bad, "kfc", opts)).toEqual({ sort: "menu", expanded: ["Burgers"], limit: PAGE });
    for (const limit of [0, -60, 59, 60.5, "120", NaN, Infinity]) expect(readChainView({ v: 1, chains: [{ id: "kfc", limit }] }, "kfc", opts).limit, String(limit)).toBe(PAGE);
    expect(readChainView({ v: 1, chains: [{ id: "kfc", expanded: Array.from({ length: 500 }, (_, i) => `S${i}`) }] }, "kfc", opts).expanded).toHaveLength(200);
  });
  it("writing over junk starts a clean list", () => {
    expect(writeChainView({ v: 1, chains: [null, "x", { id: 3 }, { id: "subway", sort: "calories" }] }, "kfc", view({ sort: "protein" }), PAGE).chains.map((c) => c.id)).toEqual(["kfc", "subway"]);
    expect(writeChainView("junk", "kfc", view({ limit: 120 }), PAGE).chains).toEqual([{ id: "kfc", sort: "menu", expanded: [], limit: 120 }]);
  });
});
