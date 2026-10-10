import { TEXT_SCALE, type TextSize } from "@/lib/mm/user-data";

/** Scale the whole app's text (rem-based sizes follow; the browser's own text-size setting still applies on top). */
export function applyTextSize(size: TextSize | undefined): void {
  if (typeof document === "undefined") return;
  const scale = TEXT_SCALE[size ?? "standard"];
  document.documentElement.style.fontSize = scale === 100 ? "" : `${scale}%`;
}
