import { HALAL, type HalalStatement } from "./halal-data";
import { tk } from "./i18n";

// Halal is something only a restaurant can say about its own food, so this is chain-level and always shown with the chain's own
// words and the page they are on (tools/dietary/build_halal.py). Nothing is inferred from a menu.

export function halalFor(chainId: string): HalalStatement | undefined {
  return HALAL[chainId];
}

/** The chain says all its UK food (or all its meat) is halal: the only case the "Halal" filter shows. */
export function isAllHalal(chainId: string): boolean {
  return HALAL[chainId]?.scope === "all";
}

export const HALAL_CAUTION = tk("Halal is what each restaurant says on its own website. If it matters to you, check with the restaurant.");
