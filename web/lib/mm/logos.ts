// Official restaurant logos, shown unmodified next to a chain's plain-text name to identify it (founder's decisions
// 2026-10-05 and 2026-10-06, see docs/PROGRESS.md and CLAUDE.md rule 2). A logo appears only if its file is listed here
// AND exists in public/logos/. Nothing is drawn or recreated by us: each file is the chain's own artwork, saved exactly as
// its own website serves it, and its source and terms are recorded in public/logos/SOURCES.md and <id>.source.txt.
// Remove a chain's line to take its logo down.
//
// `tile` is the plain neutral tile the file sits on: "light" (white, the default) or "dark" (near-black) for artwork the
// chain publishes in white for its own dark header. Never a brand colour.

export interface ChainLogo {
  src: string;
  tile?: "light" | "dark";
}

export const CHAIN_LOGOS: Readonly<Record<string, ChainLogo>> = {
  "abokado": { src: "/logos/abokado.png", tile: "dark" },
  "ask-italian": { src: "/logos/ask-italian.svg" },
  "aunties-anne": { src: "/logos/aunties-anne.png" },
  "bagel-factory": { src: "/logos/bagel-factory.svg" },
  "banana-tree": { src: "/logos/banana-tree.png", tile: "dark" },
  "baskin-robbins": { src: "/logos/baskin-robbins.png" },
  "be-at-one": { src: "/logos/be-at-one.svg", tile: "dark" },
  "bella-italia": { src: "/logos/bella-italia.png", tile: "dark" },
  "birds-bakery": { src: "/logos/birds-bakery.svg" },
  "burger-king": { src: "/logos/burger-king.svg" },
  "cafe-rouge": { src: "/logos/cafe-rouge.png" },
  "caffe-nero": { src: "/logos/caffe-nero.png", tile: "dark" },
  "carluccios": { src: "/logos/carluccios.svg", tile: "dark" },
  "chilango": { src: "/logos/chilango.svg", tile: "dark" },
  "chipotle": { src: "/logos/chipotle.svg" },
  "chiquito": { src: "/logos/chiquito.svg", tile: "dark" },
  "chopstix": { src: "/logos/chopstix.jpg" },
  "coco-di-mama": { src: "/logos/coco-di-mama.png", tile: "dark" },
  "cooplands": { src: "/logos/cooplands.svg", tile: "dark" },
  "cote-brasserie": { src: "/logos/cote-brasserie.svg" },
  "farmer-j": { src: "/logos/farmer-j.webp" },
  "fat-hippo": { src: "/logos/fat-hippo.svg", tile: "dark" },
  "five-guys": { src: "/logos/five-guys.svg" },
  "frankie-and-bennys": { src: "/logos/frankie-and-bennys.svg", tile: "dark" },
  "giggling-squid": { src: "/logos/giggling-squid.svg", tile: "dark" },
  "greene-king": { src: "/logos/greene-king.png", tile: "dark" },
  "greggs": { src: "/logos/greggs.svg" },
  "hickorys": { src: "/logos/hickorys.svg", tile: "dark" },
  "ikea": { src: "/logos/ikea.svg" },
  "itsu": { src: "/logos/itsu.svg" },
  "las-iguanas": { src: "/logos/las-iguanas.svg", tile: "dark" },
  "leon": { src: "/logos/leon.svg" },
  "pepes-piri-piri": { src: "/logos/pepes-piri-piri.svg" },
  "pho": { src: "/logos/pho.svg", tile: "dark" },
  "ping-pong": { src: "/logos/ping-pong.svg" },
  "pizza-express": { src: "/logos/pizza-express.svg" },
  "pizza-union": { src: "/logos/pizza-union.svg" },
  "popeyes": { src: "/logos/popeyes.png" },
  "pret": { src: "/logos/pret.png" },
  "prezzo": { src: "/logos/prezzo.svg", tile: "dark" },
  "puccinos": { src: "/logos/puccinos.png" },
  "pure": { src: "/logos/pure.png" },
  "sbarro": { src: "/logos/sbarro.png" },
  "slug-and-lettuce": { src: "/logos/slug-and-lettuce.svg", tile: "dark" },
  "starbucks": { src: "/logos/starbucks.svg" },
  "taco-bell": { src: "/logos/taco-bell.png" },
  "tim-hortons": { src: "/logos/tim-hortons.png" },
  "tortilla": { src: "/logos/tortilla.svg", tile: "dark" },
  "wagamama": { src: "/logos/wagamama.svg", tile: "dark" },
  "wendys": { src: "/logos/wendys.svg" },
  "wimpy": { src: "/logos/wimpy.svg" },
  "yo-sushi": { src: "/logos/yo-sushi.svg" },
  "zizzi": { src: "/logos/zizzi.svg" },
};

export function logoFor(chainId: string | undefined): ChainLogo | undefined {
  return chainId ? CHAIN_LOGOS[chainId] : undefined;
}
