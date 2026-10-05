// Official restaurant logos, shown unmodified next to a chain's plain-text name to identify it (founder's decision
// 2026-10-05, see docs/PROGRESS.md and CLAUDE.md rule 2). A logo appears only if its file is listed here AND exists in
// public/logos/. Nothing is drawn or recreated by us: each file is the chain's own artwork from its own brand/press
// page, and its source and terms are recorded in public/logos/SOURCES.md. Remove a chain's line to take its logo down.
//
//   "kfc": "/logos/kfc.svg",
export const CHAIN_LOGOS: Readonly<Record<string, string>> = {};

export function logoFor(chainId: string | undefined): string | undefined {
  return chainId ? CHAIN_LOGOS[chainId] : undefined;
}
