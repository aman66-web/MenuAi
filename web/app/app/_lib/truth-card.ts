import { site } from "@/site.config";
import { formatInt } from "@/lib/mm/format";
import type { T } from "@/lib/mm/i18n";
import type { Nutrients } from "@/lib/mm/types";
import type { Light } from "@/lib/mm/truth/fsaLights";
import { calorieCalloutParts, type ItemTruth } from "@/lib/mm/truth/itemTruth";
import { IMAGE_CARD_FOOTER, IMAGE_CARD_SIZE } from "@/lib/mm/truth/shareTruth";
import { pageFont, roundedRect, wrap } from "./share-card";

// The saved image card (founder's brief, D4): 1080 x 1350, the high-contrast dark card for phones and for filming, in the app's own ink, sun and white (colour
// meeting, 19 November 2026, approved by the founder that day: the Truth card's dark theme, globals.css .truth-dark, replacing #09090B, the zinc greys and a
// second lime): the ink page, white words, the light grey of the dark theme for small labels, its lighter ink for the tiles, the score in the app's lime, the
// Smart Swap on lime with #0b1a12 words, and small labels in sentence case. The chain's name is plain text (no logo,
// no photo, no brand colours: CLAUDE.md rule 2), the figures are the restaurant's published ones, and the footer says where they come from. The smallest text
// is 32 px, which is about 11 pt when the card is seen at a phone's width. The traffic-light fills are the official scheme's colours with near-black words,
// and the grey "No colour" pill is used wherever the scheme can't be applied (see lib/mm/truth/fsaLights.ts).

export interface TruthCardInput {
  chainName: string;
  itemName: string;
  nutrients: Nutrients;
  truth: ItemTruth;
  swap: { name: string; kcal: number; facts: { saves: number; moreProtein?: number } } | null;
  t: T;
}

// The .truth-dark values (globals.css): a canvas can't read the CSS variables, so they are written here.
const BG = "#1d2320"; // --ink: the page
const FG = "#ffffff"; // words and figures on the page and the tiles (16:1 on the page, 9.75:1 on a tile)
const MUTED = "#c9d1cc"; // --on-ink-2: small labels and units (10.26:1 on the page, 6.3:1 on a tile)
const SUN = "#d6efa0"; // --sun: the protein figure (12.72:1 on the page) and the Smart Swap's block
const INK = "#0b1a12"; // --foreground (--tl-ink): words on the lime and on the traffic lights
const TILE = "#3d4642"; // the dark theme's tile
// the official traffic lights (the allow-list: only on the Truth card, always with Low, Medium or High printed in them)
const FILL: Record<Light, string> = { green: "#3ddc84", amber: "#ffb020", red: "#ff6b63" };
const GREY = "#d4d4d8";
const WORD: Record<Light, string> = { green: "Low", amber: "Medium", red: "High" };
const NAME = { fat: "Fat", saturatedFat: "Saturates", sugar: "Sugars", salt: "Salt" } as const;

export async function renderTruthCard(input: TruthCardInput): Promise<Blob> {
  const { t, truth } = input;
  const { width: W, height: H } = IMAGE_CARD_SIZE;
  const M = 72;
  const CW = W - 2 * M;
  const family = pageFont();
  const font = (px: number, weight: number) => `${weight} ${px}px ${family}`;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  try {
    await Promise.all([500, 650, 800].map((w) => document.fonts.load(font(40, w))));
  } catch {
    // no FontFaceSet: the system font is used
  }
  ctx.textBaseline = "alphabetic";
  ctx.direction = "ltr";
  const spacing = (em: number) => {
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${em}em`;
  };
  const draw = (str: string, x: number, y: number, color: string, px: number, weight: number, align: CanvasTextAlign = "left") => {
    ctx.fillStyle = color;
    ctx.font = font(px, weight);
    ctx.textAlign = align;
    ctx.fillText(str, x, y);
  };

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // kicker
  const kicker = t("The truth at {chain}", { chain: input.chainName });
  ctx.font = font(32, 650);
  const kickerLines = wrap(ctx, kicker, CW, 2);
  kickerLines.forEach((line, i) => draw(line, M, M + 24 + i * 44, MUTED, 32, 650));
  let y = M + 24 + (kickerLines.length - 1) * 44;

  // the dish
  const sizes: Array<[number, number]> = [[72, 2], [60, 3], [52, 3]];
  let px = 72;
  let lines: string[] = [];
  for (const [size, most] of sizes) {
    px = size;
    ctx.font = font(size, 800);
    spacing(-0.02);
    const all = wrap(ctx, input.itemName, CW, 99);
    lines = wrap(ctx, input.itemName, CW, most);
    spacing(0);
    if (all.length <= most) break;
  }
  y += 28 + Math.round(px * 0.72);
  spacing(-0.02);
  for (const line of lines) {
    draw(line, M, y, FG, px, 800);
    y += Math.round(px * 1.08);
  }
  spacing(0);
  y -= Math.round(px * 1.08) - Math.round(px * 0.2);

  // -- sizes first, so any spare room can be shared out between the blocks (the card is never lopsided)
  const callout = calorieCalloutParts(truth.caloriePercent);
  ctx.font = font(32, 650);
  const calloutLines = callout ? wrap(ctx, t("{percent}% of the 2,000 kcal reference intake", { percent: callout.percent }), CW / 2 - 24 - 72, 2) : [];
  const blockH = 236 + Math.max(0, calloutLines.length - 1) * 40 + 40;
  const pillH = 228;
  const gap = 18;
  const BASE_GAP = 36;

  const swapLine = input.swap
    ? (input.swap.facts.moreProtein !== undefined
        ? t("Save {kcal} kcal and get {protein} g more protein in 1 swap", { kcal: formatInt(input.swap.facts.saves), protein: input.swap.facts.moreProtein })
        : t("Save {kcal} kcal in 1 swap", { kcal: formatInt(input.swap.facts.saves) }))
    : "";
  ctx.font = font(60, 800);
  const swapLines = input.swap ? wrap(ctx, swapLine, CW - 72, 3) : [];
  const looks = !input.swap ? truth.household.slice(0, 3) : [];
  const lastH = input.swap ? 130 + (swapLines.length - 1) * 70 + 62 + 44 : looks.length ? 130 + (looks.length - 1) * 66 + 44 : 0;

  const footTop = H - M - 100;
  const used = (y - 0) + BASE_GAP + blockH + BASE_GAP + pillH + (lastH ? BASE_GAP + lastH : 0);
  const spare = Math.max(0, footTop - used);
  const extra = Math.min(70, Math.floor(spare / (lastH ? 3 : 2)));

  // calories and the protein score, side by side
  const colW = (CW - 24) / 2;
  const topBlock = y + BASE_GAP + extra;
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = TILE;
    roundedRect(ctx, M + i * (colW + 24), topBlock, colW, blockH, 44);
    ctx.fill();
  }
  const kcal = formatInt(input.nutrients.calories);
  draw(t("Calories"), M + 36, topBlock + 58, MUTED, 32, 650);
  ctx.font = font(124, 800);
  spacing(-0.03);
  draw(kcal, M + 36, topBlock + 188, FG, 124, 800);
  const kcalW = ctx.measureText(kcal).width;
  spacing(0);
  draw("kcal", M + 36 + kcalW + 14, topBlock + 188, MUTED, 44, 650);
  calloutLines.forEach((line, i) => draw(line, M + 36, topBlock + 236 + i * 40, FG, 32, 650));

  const rightX = M + colW + 24 + 36;
  if (truth.score) {
    draw(t("Protein score"), rightX, topBlock + 58, MUTED, 32, 650);
    draw(String(truth.score.score), rightX, topBlock + 188, SUN, 150, 800);
    ctx.font = font(150, 800);
    const sw = ctx.measureText(String(truth.score.score)).width;
    draw("/ 5", rightX + sw + 14, topBlock + 188, MUTED, 56, 650);
    draw(`${t("Protein")} ${input.nutrients.protein ?? 0} g`, rightX, topBlock + 236, FG, 32, 650);
  } else if (input.nutrients.protein !== undefined) {
    draw(t("Protein"), rightX, topBlock + 58, MUTED, 32, 650);
    draw(String(Math.round(input.nutrients.protein)), rightX, topBlock + 188, SUN, 124, 800);
    ctx.font = font(124, 800);
    const pw = ctx.measureText(String(Math.round(input.nutrients.protein))).width;
    draw("g", rightX + pw + 12, topBlock + 188, MUTED, 56, 650);
  }
  y = topBlock + blockH;

  // the four traffic lights
  const pillW = (CW - 3 * gap) / 4;
  const lightsTop = y + BASE_GAP + extra;
  truth.lights.forEach((r, i) => {
    const x = M + i * (pillW + gap);
    ctx.fillStyle = r.light ? FILL[r.light] : GREY;
    roundedRect(ctx, x, lightsTop, pillW, pillH, 36);
    ctx.fill();
    draw(t(NAME[r.key]), x + 22, lightsTop + 52, INK, 32, 800);
    if (r.grams === undefined) {
      draw(t("Not published"), x + 22, lightsTop + 130, INK, 32, 800);
      return;
    }
    const g = Number.isInteger(r.grams) ? String(r.grams) : r.grams.toFixed(r.key === "salt" ? 2 : 1);
    draw(`${g} g`, x + 22, lightsTop + 130, INK, 52, 800);
    draw(r.light ? t(WORD[r.light]) : t("No colour"), x + 22, lightsTop + 192, INK, 32, 800);
  });
  y = lightsTop + pillH;

  // the Smart Swap, or (when there is none) what the figures look like as everyday things
  if (input.swap) {
    const top = y + BASE_GAP + (lastH ? extra : 0);
    ctx.fillStyle = SUN;
    roundedRect(ctx, M, top, CW, lastH, 44);
    ctx.fill();
    draw(t("Smart Swap at {chain}", { chain: input.chainName }).slice(0, 44), M + 36, top + 58, INK, 32, 650);
    swapLines.forEach((line, i) => draw(line, M + 36, top + 130 + i * 70, INK, 60, 800));
    ctx.font = font(36, 650);
    const named = wrap(ctx, `${input.swap.name} \u00b7 ${formatInt(input.swap.kcal)} kcal`, CW - 72, 1)[0] ?? "";
    draw(named, M + 36, top + 130 + (swapLines.length - 1) * 70 + 62, INK, 36, 650);
  } else if (looks.length) {
    const top = y + BASE_GAP + extra;
    ctx.fillStyle = TILE;
    roundedRect(ctx, M, top, CW, lastH, 44);
    ctx.fill();
    draw(t("What that looks like"), M + 36, top + 58, MUTED, 32, 650);
    looks.forEach((h, i) => draw(`= ${t(h.text)}`.slice(0, 48), M + 36, top + 130 + i * 66, FG, 48, 800));
  }

  // the footer
  draw(t("Not affiliated with {chain}.", { chain: input.chainName }).slice(0, 60), M, H - M - 52, MUTED, 32, 500);
  draw(site.name, M, H - M, FG, 46, 800);
  // the footer shares the bottom line with the name: smaller type, never overlapping it
  ctx.font = font(46, 800);
  const room = CW - ctx.measureText(site.name).width - 32;
  let footerPx = 32;
  ctx.font = font(footerPx, 500);
  while (footerPx > 22 && ctx.measureText(IMAGE_CARD_FOOTER).width > room) ctx.font = font(--footerPx, 500);
  draw(IMAGE_CARD_FOOTER, W - M, H - M, MUTED, footerPx, 500, "right");

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't create the image.");
  return blob;
}
