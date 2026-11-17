import { afterEach, describe, expect, it } from "vitest";
import { indexChain } from "../lib/mm/chain-index";
import { setHiddenLogos } from "../lib/mm/logos";
import { RECIPE_IMAGES } from "../lib/mm/recipeImages";
import { RECIPE_THUMBS } from "../lib/mm/recipeThumbs";
import type { Chain, MenuItem } from "../lib/mm/types";
import { sanitizeLog, type LogEntry, type SavedOrder } from "../lib/mm/user-data";
import { entryPicture, legacyImage, linesImage } from "../app/app/_components/addfood/entryPictureSources";

// The picture kept on a logged entry (founder 2026-11-17, "use images please when possible"): a reference to the dish's photo, our recipe's picture or the
// supermarket's own photo of the product. The log comes back from this phone's storage and from the sync server, so each reference is checked every time it
// is read: one that isn't valid is dropped, never the entry.

const base = { id: "a", loggedAt: new Date(2026, 10, 17, 9, 0).toISOString(), chainId: "kfc", chainName: "KFC", name: "Zinger Burger", source: "item", nutrients: { calories: 450, protein: 30, carbs: 40, fat: 18 } };
const STORED = { src: "/grocery-images/sainsburys/00273735fb1f.webp", from: "stored", shop: "sainsburys" } as const;
const TESCO = { src: "https://digitalcontent.api.tesco.com/v2/media/ghs/1ae5/b38866f9.jpeg?h=225&w=225", from: "retailer", shop: "tesco" } as const;
const RECIPE = Object.keys(RECIPE_IMAGES)[0]!;

afterEach(() => setHiddenLogos([]));

describe("sanitizeLog: the picture references", () => {
  it("keeps a menu photo, a recipe id and a supermarket picture that are valid", () => {
    const [dish, recipe, product] = sanitizeLog([
      { ...base, image: "kfc/0a1b2c3d4e5f.webp" },
      { ...base, id: "b", chainId: "", chainName: "Recipe", source: "recipe", recipeId: RECIPE },
      { ...base, id: "c", chainId: "", chainName: "Groceries", source: "product", photo: STORED },
    ]);
    expect(dish?.image).toBe("kfc/0a1b2c3d4e5f.webp");
    expect(recipe?.recipeId).toBe(RECIPE);
    expect(product?.photo).toEqual(STORED);
    expect(sanitizeLog([{ ...base, photo: TESCO }])[0]?.photo).toEqual(TESCO);
  });

  it("drops one that isn't valid and keeps the entry and everything else on it", () => {
    const bad: Array<Record<string, unknown>> = [
      { image: "../secret.webp" }, { image: "kfc/x.png" }, { image: "https://evil.example/kfc/x.webp" }, { image: "kfc/a/b.webp" }, { image: 42 }, { image: `kfc/${"a".repeat(300)}.webp` },
      { recipeId: "Not An Id" }, { recipeId: "a/b" }, { recipeId: "x".repeat(81) }, { recipeId: 7 },
      { photo: { ...TESCO, src: "https://evil.example/x.jpg" } }, { photo: { ...STORED, shop: "tesco" } }, { photo: { src: "javascript:alert(1)", from: "retailer", shop: "tesco" } }, { photo: "x" },
    ];
    for (const extra of bad) {
      const list = sanitizeLog([{ ...base, meal: "lunch", ...extra }]);
      expect(list).toHaveLength(1);
      const [e] = list;
      for (const k of Object.keys(extra)) expect(e && k in e).toBe(false);
      expect(e).toMatchObject({ id: "a", name: "Zinger Burger", meal: "lunch", nutrients: base.nutrients });
    }
  });

  it("leaves an entry without pictures exactly as it was (older entries)", () => {
    expect(sanitizeLog([base])).toEqual([base]);
  });

  it("keeps a picture's own fields only (a supermarket picture is rebuilt from its checked fields)", () => {
    const [e] = sanitizeLog([{ ...base, photo: { ...STORED, extra: "<script>" } }]);
    expect(e?.photo).toEqual(STORED);
  });
});

const item = (id: string, name: string, image?: string): MenuItem => ({ id, name, image } as unknown as MenuItem);
const chain = { id: "kfc", name: "KFC", items: [item("fries", "Fries"), item("zinger", "Zinger Burger", "kfc/0a1b2c3d4e5f.webp"), item("wings", "Hot Wings", "kfc/ffeeddccbbaa.webp")], categories: [], components: [], combinations: [] } as unknown as Chain;

describe("the picture shown for an entry", () => {
  const ix = indexChain(chain);
  const entry = (extra: Partial<LogEntry> = {}): LogEntry => ({ ...(base as LogEntry), ...extra });

  it("a dish: the small copy first, then the full photo", () => {
    expect(entryPicture(entry({ image: "kfc/0a1b2c3d4e5f.webp" }))).toEqual({
      key: "dish:kfc/0a1b2c3d4e5f.webp", kind: "dish", srcs: ["/menu-images/thumbs/kfc/0a1b2c3d4e5f.webp", "/menu-images/kfc/0a1b2c3d4e5f.webp"],
    });
  });

  it("a recipe: its small copy, then its picture; an id the book doesn't have shows none", () => {
    expect(entryPicture(entry({ chainId: "", recipeId: RECIPE }))).toEqual({ key: `recipe:${RECIPE}`, kind: "recipe", srcs: [RECIPE_THUMBS[RECIPE], RECIPE_IMAGES[RECIPE]].filter(Boolean) });
    expect(entryPicture(entry({ chainId: "", recipeId: "no-such-recipe" }))).toBeUndefined();
  });

  it("a product: the supermarket's picture, none when the shop is on the taken-down list", () => {
    expect(entryPicture(entry({ chainId: "", photo: { ...TESCO } }))).toEqual({ key: `product:${TESCO.src}`, kind: "product", srcs: [TESCO.src] });
    setHiddenLogos(["shop:tesco"]);
    expect(entryPicture(entry({ chainId: "", photo: { ...TESCO } }))).toBeUndefined();
  });

  it("a chain on the taken-down list shows no dish photo", () => {
    setHiddenLogos(["kfc"]);
    expect(entryPicture(entry({ image: "kfc/0a1b2c3d4e5f.webp" }))).toBeUndefined();
  });

  it("the first dish with a photo is the one kept for an order", () => {
    expect(linesImage(ix, [{ itemId: "fries" }, { itemId: "wings" }, { itemId: "zinger" }])).toBe("kfc/ffeeddccbbaa.webp");
    expect(linesImage(ix, [{ itemId: "fries" }])).toBeUndefined();
  });

  it("an older entry: the dish by its name, a saved order of the same name, or the first named part of an order", () => {
    const saved = [{ id: "s", chainId: "kfc", name: "My lunch", lines: [{ kind: "item", itemId: "fries", qty: 1, modifierIds: [] }, { kind: "item", itemId: "wings", qty: 1, modifierIds: [] }] }] as unknown as SavedOrder[];
    expect(legacyImage(entry(), ix, [])).toBe("kfc/0a1b2c3d4e5f.webp");
    expect(legacyImage(entry({ name: "My lunch", source: "savedOrder" }), ix, saved)).toBe("kfc/ffeeddccbbaa.webp");
    expect(legacyImage(entry({ name: "Fries + Hot Wings", source: "combination" }), ix, [])).toBe("kfc/ffeeddccbbaa.webp");
    expect(legacyImage(entry({ name: "Something else" }), ix, [])).toBeUndefined();
    expect(legacyImage(entry(), undefined, [])).toBeUndefined(); // the chain is still loading
    expect(legacyImage(entry({ image: "kfc/ffeeddccbbaa.webp" }), ix, [])).toBeUndefined(); // it has its own
  });
});
