import Link from "next/link";
import { chainHref } from "@/lib/mm/routes";
import type { CatalogChain } from "@/lib/mm/menu-client";
import { useT } from "../_lib/i18n";
import { ChainMark } from "./ChainMark";
import { ChevronRightIcon } from "./icons";
import { SampleBadge } from "./ui";

type ChainSummary = Pick<CatalogChain, "id" | "name" | "sample" | "itemCount" | "cuisine" | "nutritionLevel">;

// Restaurants in lists (founder 2026-10-15, "the rest of the app should match that elegance"): rows sit together in one white card with
// hairlines between them (`chainGroupClass`), like a settings list, instead of a stack of separate cards; the name is plain text next
// to the chain's tile (CLAUDE.md rule 2) with a quiet chevron at the end. Tiles in a grid (Popular) keep their own 20 px card.

/** The white card that holds a run of `ChainRow`s (put it on a `div` or a `ul`). */
export const chainGroupClass = "glass divide-y divide-line overflow-hidden rounded-[1.25rem]";

/** "calories only" as a small pill: the chain publishes calories but not protein, carbs and fat. */
function CaloriesOnly() {
  const t = useT();
  return <span className="inline-flex items-center rounded-full bg-soft-strong px-2 py-px text-[0.6875rem] font-semibold text-muted">{t("calories only")}</span>;
}

/** "Burgers · 151 items", then the small pills; a pill that needs a new line starts at the line's edge (no stray indent). */
function Meta({ chain, className }: { chain: ChainSummary; className: string }) {
  const t = useT();
  return (
    <span className={`app-numbers mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 leading-snug text-muted [overflow-wrap:anywhere] ${className}`}>
      <span>{chain.cuisine ? `${t(chain.cuisine)} · ` : ""}{t("{n} items", { n: chain.itemCount })}</span>
      {chain.nutritionLevel === "calories" && <CaloriesOnly />}
      {chain.sample && <SampleBadge />}
    </span>
  );
}

/** A chain as a row of a `chainGroupClass` card: the chain's tile (official logo or our cuisine glyph, see ChainMark) and the name in plain text. */
export function ChainRow({ chain, onOpen, compact }: { chain: ChainSummary; onOpen?: () => void; compact?: boolean }) {
  return (
    <Link
      href={chainHref(chain.id)}
      onClick={onOpen}
      className={`group flex items-center gap-3.5 px-4 transition-colors hover:bg-[var(--fill)] active:bg-soft-strong focus-visible:rounded-[1.25rem] focus-visible:outline-offset-[-3px]! ${compact ? "min-h-[4.25rem] py-2.5" : "min-h-[4.75rem] py-3"}`}
    >
      <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]">{chain.name}</span>
        <Meta chain={chain} className="text-sm" />
      </span>
      <ChevronRightIcon aria-hidden className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** A chain as a tile in a two-column grid (Popular; favourite restaurants on My meals): bigger mark, name, cuisine and item count. */
export function ChainCard({ chain, onOpen }: { chain: ChainSummary; onOpen?: () => void }) {
  return (
    <Link
      href={chainHref(chain.id)}
      onClick={onOpen}
      className="glass lift group relative flex min-h-[9.5rem] min-w-0 flex-col overflow-hidden rounded-[1.25rem] p-4 hover:bg-soft-strong"
    >
      <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="lg" />
      <span className="mt-auto block pt-3.5">
        <span className="block text-base font-bold leading-snug [overflow-wrap:anywhere]">{chain.name}</span>
        <Meta chain={chain} className="text-[0.8125rem]" />
      </span>
    </Link>
  );
}
