// The words and the figures for sharing a Truth or Smart Swap card: a WhatsApp message and the data behind the 1080 x 1350 image card.
// The message is built only from published figures; it never calls a dish good or bad. The link opens the item in the app (lib/mm/routes.ts itemHref),
// and a friend who opens it sees the same published numbers.

import { itemHref } from "../routes";
import type { MenuItem } from "../types";
import type { SwapSuggestion } from "./swap";

export interface ShareInput {
  chainId: string;
  chainName: string;
  item: Pick<MenuItem, "id" | "name" | "nutrients">;
  swap?: Pick<SwapSuggestion, "item" | "kcalSaved"> | null;
  /** The site's address without a trailing slash, e.g. https://numbite.com */
  origin: string;
}

/** The address a friend opens: the item inside the app. */
export const shareUrl = (origin: string, chainId: string, itemId: string): string => `${origin.replace(/\/$/, "")}${itemHref(chainId, itemId)}`;

const kcal = (n: number) => `${Math.round(n)} kcal`;

/**
 * The message. With a swap: "Look at the actual nutrition in this {chain} {item} ({kcal}) vs the Smart Swap ({swap}, saves {n} kcal!). …".
 * Without one, just the item. The last sentence says where the figures come from: the chain's own published nutrition guide.
 */
export function shareMessage(i: ShareInput): string {
  const url = shareUrl(i.origin, i.chainId, i.item.id);
  const head = `Look at the actual nutrition in this ${i.chainName} ${i.item.name} (${kcal(i.item.nutrients.calories)})`;
  const tail = `Figures from ${i.chainName}'s own published nutrition guide, on Numbite: ${url}`;
  if (i.swap && i.swap.kcalSaved > 0) {
    return `${head} vs the Smart Swap (${i.swap.item.name}, saves ${Math.round(i.swap.kcalSaved)} kcal!). ${tail}`;
  }
  return `${head}. ${tail}`;
}

/** wa.me link with the message encoded. The person sees the message in WhatsApp and chooses who to send it to; nothing is sent from here. */
export const whatsappUrl = (message: string): string => `https://wa.me/?text=${encodeURIComponent(message)}`;

/** The footer on the saved image card. Plain words, no logo, no photo (CLAUDE.md rule 2). */
export const IMAGE_CARD_FOOTER = "Figures from each restaurant's own guide • numbite.com";
export const IMAGE_CARD_SIZE = { width: 1080, height: 1350 } as const;

/** A file name for the saved image: lower-case words and dashes only. */
export function imageFileName(chainName: string, itemName: string): string {
  const slug = `${chainName} ${itemName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `numbite-${slug || "card"}.png`;
}
