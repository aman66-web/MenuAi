// Relative imports (not "@/"), so the unit tests can load this file through the welcome tour (tests/tour.test.ts).
import { COMMUNITY_ENABLED } from "../../../lib/mm/config";
import { tk } from "../../../lib/mm/i18n";
import { BasketIcon, ForkIcon, HomeIcon, PeopleIcon, PotIcon } from "../_components/icons";

// Five tabs, one job each (founder 2026-10-10): Home is today (your numbers and your own lists), then the three things the app does —
// eat out, shop, cook — then Community (founder 2026-10-16: "The settings at the bottom right is now a community"). Settings has no tab of its
// own any more: it is the gear at the top of Home, so Home's tab stays lit on the Settings pages. Pages inside a tab keep that tab lit.
// Moved out of AppShell unchanged (2026-11-17) so the welcome tour's copy of the bar uses the very same icons and words.
const ALL_TABS = [
  { href: "/app", label: tk("Home"), Icon: HomeIcon, match: (p: string) => p === "/app" || p.startsWith("/app/today") || p.startsWith("/app/saved") || p.startsWith("/app/meals") || p.startsWith("/app/groceries/list") || p.startsWith("/app/recipes/saved") || p.startsWith("/app/settings") || p.startsWith("/app/reminders") || p.startsWith("/app/scan") },
  { href: "/app/eat-out", label: tk("Eat out"), Icon: ForkIcon, match: (p: string) => p.startsWith("/app/eat-out") || p.startsWith("/app/map") || p.startsWith("/app/chain") || p.startsWith("/app/item") || p.startsWith("/app/search") || p.startsWith("/app/builder") },
  { href: "/app/groceries", label: tk("Groceries"), Icon: BasketIcon, match: (p: string) => p.startsWith("/app/groceries") && !p.startsWith("/app/groceries/list") },
  { href: "/app/recipes", label: tk("Recipes"), Icon: PotIcon, match: (p: string) => p.startsWith("/app/recipes") && !p.startsWith("/app/recipes/saved") },
  { href: "/app/community", label: tk("Community"), Icon: PeopleIcon, match: (p: string) => p.startsWith("/app/community") },
] as const;

/** The tabs this build shows: Community only while it is switched on (lib/mm/config.ts COMMUNITY_ENABLED; off since 2026-11-18, so four tabs). */
export const TABS: ReadonlyArray<(typeof ALL_TABS)[number]> = ALL_TABS.filter((tab) => COMMUNITY_ENABLED || tab.href !== "/app/community");
