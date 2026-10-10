import Link from "next/link";
import { chainHref } from "@/lib/mm/routes";
import type { CatalogChain } from "@/lib/mm/menu-client";
import { ChainMark } from "./ChainMark";
import { ChevronRightIcon } from "./icons";
import { SampleBadge } from "./ui";

type ChainSummary = Pick<CatalogChain, "id" | "name" | "sample" | "itemCount" | "cuisine" | "nutritionLevel">;

/** "calories only" as a small pill: the chain publishes calories but not protein, carbs and fat. */
function CaloriesOnly() {
  return <span className="ml-1.5 inline-flex items-center rounded-full bg-soft-strong px-2 py-px text-[11px] font-semibold text-muted">calories only</span>;
}

/** A chain in a list: the chain's tile (official logo or our cuisine glyph, see ChainMark) and the name in plain text (CLAUDE.md rule 2). */
export function ChainRow({ chain, onOpen, compact }: { chain: ChainSummary; onOpen?: () => void; compact?: boolean }) {
  return (
    <Link
      href={chainHref(chain.id)}
      onClick={onOpen}
      className={`glass lift group flex items-center rounded-3xl hover:bg-soft-strong ${compact ? "min-h-14 gap-3 px-3 py-2" : "min-h-[4.5rem] gap-4 px-4 py-3"}`}
    >
      <ChainMark chainId={chain.id} cuisine={chain.cuisine} size={compact ? "sm" : "md"} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-bold tracking-tight ${compact ? "text-[15px]" : "text-base"}`}>{chain.name}</span>
        <span className="app-numbers block text-sm text-muted [overflow-wrap:anywhere]">
          {chain.cuisine ? `${chain.cuisine} · ` : ""}{chain.itemCount} items{chain.nutritionLevel === "calories" && <CaloriesOnly />}{chain.sample && <> <SampleBadge /></>}
        </span>
      </span>
      <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-soft-strong text-muted transition group-hover:translate-x-0.5 group-hover:text-accent">
        <ChevronRightIcon className="h-4 w-4" />
      </span>
    </Link>
  );
}

/** A chain as a tile in a two-column grid (Popular, Favourites on Home): bigger mark, name, cuisine and item count. */
export function ChainCard({ chain, onOpen }: { chain: ChainSummary; onOpen?: () => void }) {
  return (
    <Link
      href={chainHref(chain.id)}
      onClick={onOpen}
      className="glass lift group relative flex min-h-[9.5rem] min-w-0 flex-col overflow-hidden rounded-[1.75rem] p-4 hover:bg-soft-strong"
    >
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-40 blur-2xl [background:var(--sun)]" />
      <ChainMark chainId={chain.id} cuisine={chain.cuisine} size="lg" />
      <span className="mt-auto block pt-3">
        <span className="block font-extrabold leading-tight tracking-tight [overflow-wrap:anywhere]">{chain.name}</span>
        <span className="app-numbers mt-0.5 block text-[13px] leading-snug text-muted [overflow-wrap:anywhere]">
          {chain.cuisine ? `${chain.cuisine} · ` : ""}{chain.itemCount} items{chain.nutritionLevel === "calories" && <CaloriesOnly />}{chain.sample && <> <SampleBadge /></>}
        </span>
      </span>
    </Link>
  );
}
