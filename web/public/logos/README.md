# Restaurant logos

Official logo files go here, one per chain, named after the chain id (`kfc.svg`, `greggs.png`...), and each is listed
in `web/lib/mm/logos.ts`. Rules (CLAUDE.md rule 2):

- The chain's **own** artwork, from its own website: its brand/press page if it has one, otherwise the logo file its own site
  serves (saved byte for byte; robots.txt honoured; a site that blocks or challenges us is skipped, never worked around). Never redrawn, recoloured, cropped, outlined, animated
  or put on a coloured background that changes how it reads. Use the file as published.
- Shown only to identify the restaurant, small, next to its name. Never as this app's icon or branding, never on the
  marketing pages as if the chain were a partner, and "Not affiliated with {chain}" stays on the chain and item pages.
- Choose the neutral tile in `logos.ts` (`tile: "dark"` only for artwork the chain publishes in white for a dark header).
- Record each file's source URL and the terms page you relied on in `SOURCES.md` (create it with the first logo).
- Take a logo down (delete its line in `logos.ts`, then the file) the day its owner asks.
