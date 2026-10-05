import { SAMPLES_ENABLED, MENU_SOURCES } from "@/lib/mm/config";
import { MenuClient } from "@/lib/mm/menu-client";

/** One menu client per browser tab (never used during server rendering: it only fetches from effects). */
export const menuClient = new MenuClient({
  sources: MENU_SOURCES,
  includeSamples: SAMPLES_ENABLED,
  fetch: (...args) => fetch(...args),
});
