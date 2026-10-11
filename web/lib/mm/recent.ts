// "Recently viewed" (founder 2026-10-11: "if you click on McDonald's again, it'll say recently viewed Happy Meal ... it should only last for a day and then
// just go back to normal"): the dishes opened in the last 24 hours, per restaurant, newest first. On this device only (mm.v1.recentItems).

export interface RecentView {
  chainId: string;
  itemId: string;
  /** ISO time the dish was last opened. */
  viewedAt: string;
}

export const RECENT_TTL_MS = 24 * 60 * 60 * 1000;
/** At most this many remembered in all, and shown per restaurant. */
export const RECENT_MAX = 60;
export const RECENT_SHOWN = 5;

const ID = /^[A-Za-z0-9][A-Za-z0-9\-_.]{0,119}$/;
const fresh = (v: RecentView, now: number) => {
  const t = Date.parse(v.viewedAt);
  return Number.isFinite(t) && t <= now + 60_000 && now - t < RECENT_TTL_MS;
};

/** Remember that a dish was opened: it moves to the front; anything older than a day is forgotten. */
export function recordView(list: readonly RecentView[], chainId: string, itemId: string, now = new Date()): RecentView[] {
  const t = now.getTime();
  const rest = list.filter((v) => fresh(v, t) && !(v.chainId === chainId && v.itemId === itemId));
  return [{ chainId, itemId, viewedAt: now.toISOString() }, ...rest].slice(0, RECENT_MAX);
}

/** The dishes of one restaurant opened in the last day, newest first. */
export function recentFor(list: readonly RecentView[], chainId: string, now = new Date(), max = RECENT_SHOWN): string[] {
  const t = now.getTime();
  return list.filter((v) => v.chainId === chainId && fresh(v, t)).sort((a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt)).slice(0, max).map((v) => v.itemId);
}

export function sanitizeRecent(raw: unknown): RecentView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is RecentView => !!v && typeof v === "object" && ID.test((v as RecentView).chainId) && ID.test((v as RecentView).itemId) && typeof (v as RecentView).viewedAt === "string" && Number.isFinite(Date.parse((v as RecentView).viewedAt)))
    .map((v) => ({ chainId: v.chainId, itemId: v.itemId, viewedAt: v.viewedAt }))
    .slice(0, RECENT_MAX);
}
