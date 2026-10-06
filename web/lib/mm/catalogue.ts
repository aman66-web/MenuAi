// Honest headline numbers for the marketing site, from the published manifest (never typed in by hand).

export interface CatalogueStats {
  chains: number;
  /** e.g. "over 12,500": rounded DOWN so the claim stays true as items are held back or removed. */
  itemsLabel: string;
}

export function catalogueStats(chains: ReadonlyArray<{ sample: boolean; itemCount: number }>): CatalogueStats {
  const real = chains.filter((c) => !c.sample);
  const items = real.reduce((n, c) => n + c.itemCount, 0);
  const step = items >= 10_000 ? 500 : items >= 1_000 ? 100 : 10;
  const floor = Math.floor(items / step) * step;
  return { chains: real.length, itemsLabel: floor === items || floor === 0 ? items.toLocaleString("en-GB") : `over ${floor.toLocaleString("en-GB")}` };
}
