import { TEXT_SIZE_CHOICE_ENABLED } from "@/lib/mm/config";
import { TEXT_SCALE, type TextSize } from "@/lib/mm/user-data";

/** Scale the whole app's text (rem-based sizes follow; the browser's own text-size setting still applies on top). */
export function applyTextSize(size: TextSize | undefined): void {
  if (typeof document === "undefined") return;
  // Standard for everyone while the choice is switched off (lib/mm/config.ts TEXT_SIZE_CHOICE_ENABLED)
  const scale = TEXT_SCALE[TEXT_SIZE_CHOICE_ENABLED ? (size ?? "standard") : "standard"];
  document.documentElement.style.fontSize = scale === 100 ? "" : `${scale}%`;
}
