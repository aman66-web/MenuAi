import Link from "next/link";
import type { CatalogChain } from "@/lib/mm/menu-client";
import { ChevronRightIcon } from "./icons";
import { SampleBadge } from "./ui";

/** A chain in a list. Plain-text name only: no logos, brand colours or imagery (CLAUDE.md rule 2). */
export function ChainRow({ chain, onOpen }: { chain: Pick<CatalogChain, "id" | "name" | "sample" | "itemCount">; onOpen?: () => void }) {
  return (
    <Link
      href={`/app/chain/${chain.id}`}
      onClick={onOpen}
      className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-1 py-2 last:border-b-0 hover:bg-soft"
    >
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold">{chain.name}</span>
        <span className="flex items-center gap-2 text-sm text-muted">
          {chain.itemCount} items {chain.sample && <SampleBadge />}
        </span>
      </span>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  );
}
