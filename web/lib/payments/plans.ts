// The three ways to pay (founder's brief, 13 Nov 2026): a one-off 90-day pass, a year, a month. One table, so the prices on screen, in Checkout and in the
// database can't drift apart. Amounts are in pence. Stripe holds the real prices (one Price per plan, ids in the server's environment); the figures here
// are what the screens show and what the webhook cross-checks.

export const PLAN_IDS = ["pass90", "annual", "monthly"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanInfo {
  id: PlanId;
  label: string;
  /** Pence. */
  amountPence: number;
  /** "£9.99" etc., written once. */
  price: string;
  /** What the price is for: "one payment", "a year", "a month". */
  per: string;
  /** One plain line under the name. */
  tagline: string;
  mode: "payment" | "subscription";
  /** The ribbon on the card, if any. */
  badge?: string;
}

export const PLANS: Record<PlanId, PlanInfo> = {
  pass90: { id: "pass90", label: "Founding Member 90-Day Pass", amountPence: 999, price: "£9.99", per: "one payment", tagline: "No recurring subscription. 90 days of access.", mode: "payment", badge: "Most popular" },
  annual: { id: "annual", label: "Annual", amountPence: 1499, price: "£14.99", per: "a year", tagline: "About 29p a week. Renews each year until you cancel.", mode: "subscription", badge: "Best value" },
  monthly: { id: "monthly", label: "Monthly", amountPence: 299, price: "£2.99", per: "a month", tagline: "Renews each month until you cancel.", mode: "subscription" },
};

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);

/** How long the one-off pass lasts. */
export const PASS_DAYS = 90;
/** A subscription's access runs this much past each paid period, so a payment that lands a little late never locks anyone out. */
export const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_DAYS = 31;
const YEAR_DAYS = 366;

/** When a first payment's access ends (milliseconds since 1970). */
export function firstExpiry(plan: PlanId, paidAtMs: number): number {
  const days = plan === "pass90" ? PASS_DAYS : plan === "annual" ? YEAR_DAYS : MONTH_DAYS;
  return paidAtMs + (days + (plan === "pass90" ? 0 : GRACE_DAYS)) * DAY_MS;
}

/** The access end for a renewal whose paid period ends at `periodEndMs`. */
export const renewalExpiry = (periodEndMs: number): number => periodEndMs + GRACE_DAYS * DAY_MS;

/** A creator code in a link (?ref=): letters, digits, dash and underscore, 2 to 32 characters, kept lower case. */
export function cleanRef(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return /^[a-z0-9_-]{2,32}$/.test(s) ? s : null;
}
