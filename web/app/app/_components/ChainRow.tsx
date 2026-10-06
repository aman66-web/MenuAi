import Link from "next/link";
import { chainHref } from "@/lib/mm/routes";
import type { CatalogChain } from "@/lib/mm/menu-client";
import { ChainMark } from "./ChainMark";
import { ChevronRightIcon } from "./icons";
import { SampleBadge } from "./ui";

/** A chain in a list: our own cuisine glyph and the name in plain text. No logos, brand colours or imagery (CLAUDE.md rule 2). */
export function ChainRow({ chain, onOpen, compact }: { chain: Pick<CatalogChain, "id" | "name" | "sample" | "itemCount" | "cuisine">; onOpen?: () => void; compact?: boolean }) {
  return (
    <Link
      href={chainHref(chain.id)}
      onClick={onOpen}
      className={`glass group flex items-center rounded-3xl transition active:scale-[0.99] hover:bg-soft-strong ${compact ? "min-h-14 gap-3 px-3 py-2" : "min-h-[4.5rem] gap-4 px-4 py-3"}`}
    >
      <ChainMark chainId={chain.id} cuisine={chain.cuisine} size={compact ? "sm" : "md"} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-bold tracking-tight ${compact ? "text-[15px]" : "text-base"}`}>{chain.name}</span>
        <span className="app-numbers block text-sm text-muted [overflow-wrap:anywhere]">
          {chain.cuisine ? `${chain.cuisine} · ` : ""}{chain.itemCount} items{chain.sample && <> <SampleBadge /></>}
        </span>
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
