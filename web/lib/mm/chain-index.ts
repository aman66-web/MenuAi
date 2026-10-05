import type { Chain, Combination, MenuComponent, MenuItem } from "./types";

/** In-memory lookups for one chain (SPEC §5: items by id, components by id). Build once per loaded chain. */
export interface ChainIndex {
  chain: Chain;
  items: Map<string, MenuItem>;
  components: Map<string, MenuComponent>;
  combinations: Map<string, Combination>;
  /** Position of each component in the chain file, used for stable ordering in names and lists. */
  componentOrder: Map<string, number>;
}

export function indexChain(chain: Chain): ChainIndex {
  return {
    chain,
    items: new Map(chain.items.map((i) => [i.id, i])),
    components: new Map(chain.components.map((c) => [c.id, c])),
    combinations: new Map(chain.combinations.map((c) => [c.id, c])),
    componentOrder: new Map(chain.components.map((c, i) => [c.id, i])),
  };
}
