import Link from "next/link";
import { chainHref } from "@/lib/mm/routes";
import type { CatalogChain } from "@/lib/mm/menu-client";
import { ChainMark } from "./ChainMark";
import { ChevronRightIcon } from "./icons";
import { SampleBadge } from "./ui";

/** A chain in a list: our own cuisine glyph and the name in plain text. No logos, brand colours or imagery (CLAUDE.md rule 2). */
export function ChainRow({ chain, onOpen }: { chain: Pick<CatalogChain, "id" | "name" | "sample" | "itemCount" | "cuisine">; onOpen?: () => void }) {
  return (
    <Link
      href={chainHref(chain.id)}
      onClick={onOpen}
      className="glass group flex min-h-[4.5rem] items-center gap-4 rounded-3xl px-4 py-3 transition active:scale-[0.99] hover:bg-soft-strong"
    >
      <ChainMark chainId={chain.id} cuisine={chain.cuisine} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold tracking-tight">{chain.name}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          {chain.itemCount} items {chain.sample && <SampleBadge />}
        </span>
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
