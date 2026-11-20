// Relative imports (not "@/"), so the unit tests can load this file through the welcome tour (tests/tour.test.ts).
import { COMMUNITY_ENABLED } from "../../../lib/mm/config";
import { tk } from "../../../lib/mm/i18n";
import { BasketIcon, ForkIcon, HomeIcon, PeopleIcon, PotIcon } from "../_components/icons";

// Five tabs, one job each (founder 2026-10-10): Home is today (your numbers and your own lists), then the three things the app does —
// eat out, shop, cook — then Community (founder 2026-10-16: "The settings at the bottom right is now a community"). Settings has no tab of its
// own any more: it is the cog at the top right of every tab, so no tab is lit on the Settings pages or Reminders (the overnight audit, 20 November 2026: Settings
// opened from Recipes lit Home). Pages inside a tab keep that tab lit.
// Moved out of AppShell unchanged (2026-11-17) so the welcome tour's copy of the bar uses the very same icons and words.
// The order (founder 2026-11-19): Home, Recipes, Groceries, then Eat out.
/** Home's cooking tools, opened from Home's cards though their addresses sit under Recipes: Home stays lit there (founder 2026-11-20: "If I press click on what
 *  you already have ... it says that I'm on the recipes page, but it should still be like on the home page"). */
const HOME_TOOLS = ["/app/recipes/fridge", "/app/recipes/photo"];

const ALL_TABS = [
  { href: "/app", label: tk("Home"), Icon: HomeIcon, match: (p: string) => p === "/app" || p.startsWith("/app/today") || p.startsWith("/app/saved") || p.startsWith("/app/meals") || p.startsWith("/app/recipes/saved") || HOME_TOOLS.some((t) => p.startsWith(t)) || p.startsWith("/app/scan") || p.startsWith("/app/plan") || p.startsWith("/app/stats") },
  { href: "/app/recipes", label: tk("Recipes"), Icon: PotIcon, match: (p: string) => p.startsWith("/app/recipes") && !p.startsWith("/app/recipes/saved") && !HOME_TOOLS.some((t) => p.startsWith(t)) },
  { href: "/app/groceries", label: tk("Groceries"), Icon: BasketIcon, match: (p: string) => p.startsWith("/app/groceries") }, // the shopping list too (usability test 2026-11-19: four testers expected Groceries lit there)
  { href: "/app/eat-out", label: tk("Eat out"), Icon: ForkIcon, match: (p: string) => p.startsWith("/app/eat-out") || p.startsWith("/app/map") || p.startsWith("/app/chain") || p.startsWith("/app/item") || p.startsWith("/app/search") || p.startsWith("/app/builder") },
  { href: "/app/community", label: tk("Community"), Icon: PeopleIcon, match: (p: string) => p.startsWith("/app/community") },
] as const;

/** The tabs this build shows: Community only while it is switched on (lib/mm/config.ts COMMUNITY_ENABLED; off since 2026-11-18, so four tabs). */
export const TABS: ReadonlyArray<(typeof ALL_TABS)[number]> = ALL_TABS.filter((tab) => COMMUNITY_ENABLED || tab.href !== "/app/community");

/** Pages opened from several tabs: a recipe (from Recipes, from Home's meal plan or cooking tools, from Groceries' list). They keep lit the tab the person came
 *  from (founder 2026-11-20: "This should still be part of the homepage ... all of that"); opened first, with nowhere before, their own tab is lit. */
export const SHARED_PAGES = ["/app/recipes/view"];

/** The tab to light: on a shared page the tab lit on the page before (`cameFrom`), else the tab whose pages these are. */
export function litTab(pathname: string, cameFrom: string | null): string | null {
  if (cameFrom && SHARED_PAGES.some((p) => pathname.startsWith(p)) && TABS.some((t) => t.href === cameFrom)) return cameFrom;
  return TABS.find((t) => t.match(pathname))?.href ?? null;
}
