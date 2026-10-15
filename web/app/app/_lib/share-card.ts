import { formatCalories, formatGrams, formatInt } from "@/lib/mm/format";
import type { T } from "@/lib/mm/i18n";
import type { Nutrients } from "@/lib/mm/types";
import { hasNative, nativeCall } from "@/lib/mm/native";

// SPEC §11: a 1080×1350 card. Plain-text chain name, no logos, photos or brand colours. Free for everyone.
// It is drawn in the language of the app's Home (2026-10-15): the text sits straight on the flat light grey page like Home's title
// ("MY ORDER AT {CHAIN}" in small spaced capitals, then the order in a heavy weight), protein is the one highlighted tile in the
// app's lime ("50" large, "g protein" beside it), calories, carbs and fat are three white tiles beside each other, and the app's
// name and address close it. Figures are a medium weight with a smaller unit, like Home's "1,030 / 2,800 kcal". No boxes inside
// boxes, no gradients, glows or shadows.
// The words are the card's own from SPEC §11, unchanged in every language: "{n} calories", "{g} carbs", "{g} fat", "{g} protein".
// Each white tile carries one of them, its number large and its word under it in the order the translation gives (so the "·"
// between them in a one-line version is the gap between the tiles). The smallest text is 34 px, about 12 pt when the card is seen
// at a phone's width.

export interface ShareCardInput {
  chainName: string;
  orderName: string;
  description: string;
  nutrients: Nutrients;
  appName: string;
  siteHost: string;
  /** The app's language (the card's own words are translated; names and numbers are not). */
  t: T;
}

// The app's colours (globals.css, the app surface).
const PAGE = "#f4f5f6";
const TILE = "#ffffff";
const LIME = "#d6efa0"; // --sun: the one highlighted tile
const OLIVE = "#4d6127"; // the small label on the lime (5.5:1)
const FG = "#0b1a12";
const MUTED = "#5f6361";

/** The page's own font (Urbanist, loaded by next/font) so the card matches the app; system fonts if it isn't there. */
function pageFont(): string {
  try {
    const style = getComputedStyle(document.body);
    const loaded = style.getPropertyValue("--font-sans-loaded").trim();
    const ext = style.getPropertyValue("--font-sans-ext").trim();
    return [loaded, ext, "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"].filter(Boolean).join(", ");
  } catch {
    return 'system-ui, -apple-system, "Segoe UI", sans-serif';
  }
}

/** Letter-spacing and uppercase suit Latin text only: joined or marked scripts (Arabic, Urdu, Gurmukhi, Bengali, Gujarati) must not be spaced. */
const isLatin = (s: string) => /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]*$/u.test(s);
/** Text with Arabic or Hebrew letters reads right to left; anything else (a dish's English name, a number) keeps its own direction
 *  even on an Urdu or Arabic card, so "White rice, chicken," keeps its commas at the end of its words. */
const readsRtl = (s: string) => /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(s);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1]!.replace(/[,\s]*\S*$/, "") + "…";
  }
  return lines;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const { t } = input;
  const W = 1080, H = 1350;
  const M = 80; // the page's side and top margin
  const CW = W - 2 * M; // content width
  const GAP = 24; // between tiles (Home's 14 px gap at this scale)
  const R = 52; // tile corners (Home's 20 px at this scale)
  const IN = 48; // padding inside the lime tile
  const TIN = 36; // padding inside a white tile
  const SMALL = 34; // the smallest text on the card: about 12 pt at a phone's width (×0.36)
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const start = rtl ? W - M : M;
  const family = pageFont();
  const font = (px: number, weight: number) => `${weight} ${px}px ${family}`;
  /** Joined and marked scripts (Arabic, Urdu, Bengali, Gujarati, Gurmukhi) look smaller than Latin capitals at the same size. */
  const scaled = (px: number, str: string) => (isLatin(str) ? px : Math.round(px * 1.15));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  // The canvas only draws a web font that is already loaded: ask for each weight first (resolves at once when it is).
  try {
    await Promise.all([500, 650, 800].map((w) => document.fonts.load(font(40, w))));
  } catch {
    // no FontFaceSet (old browser): the system font is used
  }
  ctx.textBaseline = "alphabetic";
  const spacing = (em: number, text: string) => {
    if ("letterSpacing" in ctx) ctx.letterSpacing = isLatin(text) ? `${em}em` : "0px";
  };
  /** Draw from the layout's start edge (the right on an Urdu or Arabic card), or from its end edge. */
  const text = (str: string, x: number, y: number, edge: "start" | "end" = "start") => {
    ctx.direction = readsRtl(str) ? "rtl" : "ltr";
    ctx.textAlign = (edge === "start") !== rtl ? "left" : "right";
    ctx.fillText(str, x, y);
  };
  const width = (str: string) => {
    ctx.direction = readsRtl(str) ? "rtl" : "ltr";
    return ctx.measureText(str).width;
  };
  const caps = (str: string) => str.toLocaleUpperCase();
  /**
   * A figure in a medium weight with a smaller unit after it on the same baseline: "g" for grams (none for calories), then a word
   * if one is given ("g protein"). "67g" stays one piece read left to right, as the app shows grams in every language, so on an
   * Urdu or Arabic card the "g" sits to the right of the number at the start edge and the word follows to its left.
   */
  const measureFigure = (value: string, grams: boolean, word: string, size: number, unitRatio: number) => {
    ctx.font = font(size, 500);
    spacing(-0.03, value);
    const vw = width(value);
    spacing(0, "");
    ctx.font = font(Math.round(size * unitRatio), 500);
    const gap = grams ? Math.round(size * 0.08) : 0;
    const gw = grams ? width("g") : 0;
    const space = word ? width(" ") : 0;
    const ww = word ? width(word) : 0;
    return { vw, gap, gw, space, ww, total: vw + gap + gw + space + ww };
  };
  /** The size at which a figure and its unit fit `maxW` (never below half of `px`). */
  const figureSize = (value: string, grams: boolean, word: string, maxW: number, px: number, unitRatio: number) => {
    let size = px;
    while (measureFigure(value, grams, word, size, unitRatio).total > maxW && size > px * 0.5) size -= 2;
    return size;
  };
  const figure = (value: string, grams: boolean, word: string, x: number, base: number, size: number, unitRatio: number, valueColor: string, unitColor: string) => {
    const m = measureFigure(value, grams, word, size, unitRatio);
    const unitFont = font(Math.round(size * unitRatio), 500);
    const valueAt = rtl ? x - m.gw - m.gap : x; // on a right-to-left card the "g" comes first, at the start edge
    ctx.fillStyle = valueColor;
    ctx.font = font(size, 500);
    spacing(-0.03, value);
    ctx.direction = "ltr";
    ctx.textAlign = rtl ? "right" : "left";
    ctx.fillText(value, valueAt, base);
    spacing(0, "");
    ctx.fillStyle = unitColor;
    ctx.font = unitFont;
    if (grams) {
      ctx.direction = "ltr";
      ctx.textAlign = rtl ? "right" : "left";
      ctx.fillText("g", rtl ? x : x + m.vw + m.gap, base);
    }
    if (word) text(word, rtl ? valueAt - m.vw - m.space : x + m.vw + m.gap + m.gw + m.space, base);
  };
  /** A short line of words in a medium weight, shrunk a little (never below 85%) if a translation is long. */
  const words = (str: string, x: number, base: number, maxW: number, px: number, color: string) => {
    ctx.fillStyle = color;
    let size = scaled(px, str);
    const least = Math.round(size * 0.85);
    for (;;) {
      ctx.font = font(size, 500);
      if (width(str) <= maxW || size <= least) break;
      size -= 1;
    }
    text(str, x, base);
  };

  // the page
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, W, H);

  // "MY ORDER AT {CHAIN}": the small label above the title, like the app's kickers
  const kicker = caps(t("My order at {chain}", { chain: input.chainName }));
  const kickerPx = scaled(SMALL, kicker);
  const kickerStep = Math.round(kickerPx * 1.42);
  let y = M + Math.round(kickerPx * 0.72); // its first baseline: the capitals' top on the margin
  ctx.fillStyle = MUTED;
  ctx.font = font(kickerPx, 650);
  spacing(0.12, kicker);
  const kickerLines = wrap(ctx, kicker, CW, 2);
  kickerLines.forEach((line, i) => text(line, start, y + i * kickerStep));
  y += (kickerLines.length - 1) * kickerStep; // the kicker's last baseline
  spacing(0, "");

  // what the order is: heavy, like Home's title. A dish's name is large; a longer order (a list of what's in it) steps down a
  // size rather than shouting over three lines, and never runs past four.
  const sizes: Array<[number, number]> = [[76, 2], [64, 3], [56, 3], [50, 4]];
  let titlePx = 76;
  let titleLines: string[] = [];
  for (const [px, most] of sizes) {
    titlePx = px;
    ctx.font = font(px, 800);
    spacing(-0.02, input.description);
    const all = wrap(ctx, input.description, CW, 99);
    titleLines = wrap(ctx, input.description, CW, most);
    spacing(0, "");
    if (all.length <= most) break;
  }
  const lead = Math.round(titlePx * 1.06);
  let base = y + 34 + Math.round(titlePx * 0.72); // a gap under the kicker, then the title's cap height
  ctx.fillStyle = FG;
  ctx.font = font(titlePx, 800);
  spacing(-0.02, input.description);
  for (const line of titleLines) {
    text(line, start, base);
    base += lead;
  }
  spacing(0, "");
  y = base - lead + Math.round(titlePx * 0.22); // the title's last descender

  // the footer: the app's name at the start, its address at the end, on one baseline
  const footBase = H - M;
  ctx.fillStyle = FG;
  ctx.font = font(46, 800);
  spacing(-0.02, input.appName);
  text(input.appName, start, footBase);
  spacing(0, "");
  ctx.fillStyle = MUTED;
  ctx.font = font(scaled(36, input.siteHost), 500);
  text(input.siteHost, rtl ? M : W - M, footBase, "end");

  // three white tiles above the footer: SPEC §11's "{n} calories · {g} carbs · {g} fat", one in each tile. The number is drawn
  // large ("g" small beside it, as on the lime tile) and the words under it, or above it if the translation puts them first.
  const N = "\uE000"; // stands in for the number, to find where the translation puts it
  const [calBefore = "", calAfter = ""] = t("{n} calories", { n: N }).split(N);
  const tiles: Array<{ before: string; value: string; grams: boolean; after: string }> = [
    { before: calBefore.trim(), value: formatInt(input.nutrients.calories), grams: false, after: calAfter.trim() },
    { before: "", value: formatGrams(input.nutrients.carbs ?? 0).replace(/g$/, ""), grams: true, after: t("carbs") },
    { before: "", value: formatGrams(input.nutrients.fat ?? 0).replace(/g$/, ""), grams: true, after: t("fat") },
  ];
  const tileW = (CW - 2 * GAP) / 3;
  const inner = tileW - 2 * TIN;
  const unitRatio = 0.42;
  const figPx = Math.min(...tiles.map((tl) => figureSize(tl.value, tl.grams, "", inner, 80, unitRatio))); // one size for all three
  const figCap = Math.round(figPx * 0.72);
  const wordStep = 54; // from a line of words' baseline to the next baseline
  const hasBefore = tiles.some((tl) => tl.before);
  const tileH = 48 + (hasBefore ? wordStep : 0) + figCap + wordStep + 48;
  const tilesTop = footBase - 46 - 64 - tileH;
  tiles.forEach((tl, i) => {
    const left = rtl ? W - M - (i + 1) * tileW - i * GAP : M + i * (tileW + GAP);
    const tStart = rtl ? left + tileW - TIN : left + TIN;
    ctx.fillStyle = TILE;
    roundedRect(ctx, left, tilesTop, tileW, tileH, R);
    ctx.fill();
    let line = tilesTop + 48;
    if (hasBefore) {
      line += Math.round(SMALL * 0.72);
      if (tl.before) words(tl.before, tStart, line, inner, SMALL, MUTED);
      line += wordStep - Math.round(SMALL * 0.72);
    }
    line += figCap;
    figure(tl.value, tl.grams, "", tStart, line, figPx, unitRatio, FG, MUTED);
    if (tl.after) words(tl.after, tStart, line + wordStep, inner, SMALL, MUTED);
  });

  // protein: the one lime tile, filling the room between the title and the three tiles; "50" as large as the tile allows and
  // "g protein" beside it (SPEC §11's "{g} protein"), centred top to bottom
  const limeTop = y + 52;
  const limeH = Math.max(300, tilesTop - GAP - limeTop);
  ctx.fillStyle = LIME;
  roundedRect(ctx, M, limeTop, CW, limeH, R + 4);
  ctx.fill();
  const pStart = rtl ? W - M - IN : M + IN;
  const protein = String(Math.round(Number(formatGrams(input.nutrients.protein ?? 0).replace(/g$/, ""))));
  const proteinWord = t("protein");
  const proteinRatio = 0.24;
  const proteinPx = figureSize(protein, true, proteinWord, CW - 2 * IN, Math.min(420, Math.round(limeH * 0.64)), proteinRatio);
  const proteinBase = limeTop + Math.round((limeH + proteinPx * 0.72) / 2);
  figure(protein, true, proteinWord, pStart, proteinBase, proteinPx, proteinRatio, FG, OLIVE);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't create the image.");
  return blob;
}

export type ShareResult = "shared" | "downloaded" | "cancelled";

/** Web Share with the image where the browser supports it, otherwise download the PNG. */
export async function shareOrderCard(input: ShareCardInput): Promise<ShareResult> {
  const blob = await renderShareCard(input);
  const file = new File([blob], "my-order.png", { type: "image/png" });
  const { t } = input;
  const text = `${input.orderName} — ${formatCalories(input.nutrients.calories)}, ${formatGrams(input.nutrients.protein ?? 0)} ${t("protein")}`;
  if (hasNative()) {
    // In the iPhone app: the iPhone's own share sheet, with the picture
    const imageDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const r = await nativeCall("share", { title: t("My order at {chain}", { chain: input.chainName }), text, imageDataUrl });
    if (r.done || r.error === "cancelled") return r.done ? "shared" : "cancelled";
  }
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: t("My order at {chain}", { chain: input.chainName }), text });
      return "shared";
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-order.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
