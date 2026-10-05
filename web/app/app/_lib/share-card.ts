import { formatCalories, formatGrams } from "@/lib/mm/format";
import type { Nutrients } from "@/lib/mm/types";

// SPEC §11: a 1080×1350 card. Plain-text chain name, no logos or brand colours. Free for everyone.

export interface ShareCardInput {
  chainName: string;
  orderName: string;
  description: string;
  nutrients: Nutrients;
  appName: string;
  siteHost: string;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
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

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  const W = 1080, H = 1350, PAD = 90;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = (px: number, weight = 600) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#5b6577";
  ctx.font = font(48, 600);
  wrap(ctx, `My order at ${input.chainName}`, W - PAD * 2, 2).forEach((l, i) => ctx.fillText(l, PAD, 170 + i * 60));

  ctx.fillStyle = "#d9481e";
  ctx.font = font(330, 800);
  const protein = String(Math.round(Number(formatGrams(input.nutrients.protein).replace("g", ""))));
  ctx.fillText(protein, PAD, 560);
  const proteinWidth = ctx.measureText(protein).width;
  ctx.font = font(84, 700);
  ctx.fillText("g protein", PAD + proteinWidth + 24, 560);

  ctx.fillStyle = "#1d2433";
  const sub = `${formatCalories(input.nutrients.calories).replace(" cal", " calories")} · ${formatGrams(input.nutrients.carbs)} carbs · ${formatGrams(input.nutrients.fat)} fat`;
  let subSize = 54;
  ctx.font = font(subSize, 700);
  while (subSize > 34 && ctx.measureText(sub).width > W - PAD * 2) ctx.font = font(--subSize, 700); // keep it on one line
  ctx.fillText(sub, PAD, 680);

  ctx.fillStyle = "#1d2433";
  ctx.font = font(46, 500);
  wrap(ctx, input.description, W - PAD * 2, 4).forEach((l, i) => ctx.fillText(l, PAD, 800 + i * 62));

  ctx.fillStyle = "#1d2433";
  ctx.font = font(60, 800);
  ctx.fillText(input.appName, PAD, H - 140);
  ctx.fillStyle = "#5b6577";
  ctx.font = font(34, 500);
  ctx.fillText(input.siteHost, PAD, H - 86);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't create the image.");
  return blob;
}

export type ShareResult = "shared" | "downloaded" | "cancelled";

/** Web Share with the image where the browser supports it, otherwise download the PNG. */
export async function shareOrderCard(input: ShareCardInput): Promise<ShareResult> {
  const blob = await renderShareCard(input);
  const file = new File([blob], "my-order.png", { type: "image/png" });
  const text = `${input.orderName} — ${formatCalories(input.nutrients.calories)}, ${formatGrams(input.nutrients.protein)} protein`;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `My order at ${input.chainName}`, text });
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
