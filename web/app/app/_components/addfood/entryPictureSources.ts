// Where the picture of a logged entry comes from (EntryPicture.tsx draws it): pure, so tests can check it (relative imports: the tests don't
// know the "@/" alias).
import type { ChainIndex } from "../../../../lib/mm/chain-index";
import { assetUrl } from "../../../../lib/mm/config";
import { itemPhotoSources } from "../../../../lib/mm/groceries";
import { itemImageUrl, itemThumbUrl } from "../../../../lib/mm/images";
import { RECIPE_IMAGES } from "../../../../lib/mm/recipeImages";
import { RECIPE_THUMBS } from "../../../../lib/mm/recipeThumbs";
import type { LogEntry, SavedOrder } from "../../../../lib/mm/user-data";

/** A logged entry's picture: where to load it from, best first, and what it is (a product's pack is shown whole, never cropped). */
export interface EntryPicture {
  key: string;
  srcs: string[];
  kind: "dish" | "recipe" | "product";
}

/** The photo of the first dish in these lines that has one ("<chain id>/<file>.webp"), for keeping on a log entry; images.ts decides later whether it may be shown. */
export function linesImage(ix: ChainIndex, lines: readonly { itemId: string }[]): string | undefined {
  for (const line of lines) {
    const image = ix.items.get(line.itemId)?.image;
    if (image) return image;
  }
  return undefined;
}

/**
 * For an entry logged before entries kept their picture: the dish by its name in the chain's menu, a saved order of the same name at the same
 * chain (its first dish with a photo), or the first named part of an order ("Burger + Fries"). Undefined while the chain is loading.
 */
export function legacyImage(e: LogEntry, ix: ChainIndex | "missing" | undefined, saved: readonly SavedOrder[]): string | undefined {
  if (!ix || ix === "missing" || e.image || e.recipeId || e.photo) return undefined;
  const byName = (name: string) => {
    for (const item of ix.items.values()) if (item.name === name && item.image) return item.image;
    return undefined;
  };
  const order = saved.find((o) => o.chainId === e.chainId && o.name === e.name);
  return byName(e.name) ?? (order ? linesImage(ix, order.lines) : undefined) ?? e.name.split(" + ").map(byName).find((s) => s !== undefined);
}

/** Where to load an entry's picture from, or undefined when it has none that may be shown (photos switched off or taken down included). */
export function entryPicture(e: LogEntry, fallbackImage?: string): EntryPicture | undefined {
  const image = e.image ?? fallbackImage;
  const dish = [itemThumbUrl(image), itemImageUrl(image)].filter((s): s is string => !!s);
  if (image && dish.length) return { key: `dish:${image}`, srcs: dish, kind: "dish" };
  // Own keys only: the tables are plain objects, so "constructor" would otherwise find Object's function, not a file name.
  const id = e.recipeId;
  const recipe = id ? [RECIPE_THUMBS, RECIPE_IMAGES].map((t) => (Object.prototype.hasOwnProperty.call(t, id) ? t[id] : undefined)).filter((s): s is string => typeof s === "string" && s !== "").map(assetUrl) : [];
  if (recipe.length) return { key: `recipe:${e.recipeId}`, srcs: recipe, kind: "recipe" };
  const product = e.photo ? itemPhotoSources({ photo: e.photo }).map((p) => (p.src.startsWith("/") ? assetUrl(p.src) : p.src)) : []; // a shop on the taken-down list shows none
  if (product.length) return { key: `product:${product[0]}`, srcs: product, kind: "product" };
  return undefined;
}
