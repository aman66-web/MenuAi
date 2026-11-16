// What the payment handlers need from the database, behind a small interface (the real one is store-supabase.ts; tests use the in-memory one below).
// An entitlement is "this email has paid for access until this date". It holds an email address (so a person who signs in with the same address gets their access
// back on another device) and the Stripe ids needed to follow renewals and refunds. It holds no card detail: Stripe keeps that.

import type { PlanId } from "./plans";

export type EntitlementStatus = "active" | "cancelled" | "refunded" | "expired";

export interface EntitlementRecord {
  id: string;
  /** The buyer's email: always set for a website payment; absent for an App Store purchase (which is tied to the signed-in account instead). */
  email: string | null;
  source: "stripe" | "apple";
  plan: PlanId;
  status: EntitlementStatus;
  /** Milliseconds since 1970. */
  startedAt: number;
  expiresAt: number;
  stripeSessionId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePaymentIntentId: string | null;
  appleOriginalTransactionId: string | null;
  /** The creator code that sent the buyer, for the payout report. */
  ref: string | null;
  amountPence: number | null;
  currency: string | null;
}

export type NewEntitlement = Omit<EntitlementRecord, "id">;

export interface EntitlementStore {
  /** Inserts, or returns the row already there for the same Checkout Session (a webhook and the success page can both ask). */
  upsertBySession(rec: NewEntitlement): Promise<EntitlementRecord>;
  findBySession(sessionId: string): Promise<EntitlementRecord | null>;
  findBySubscription(subscriptionId: string): Promise<EntitlementRecord | null>;
  findByPaymentIntent(paymentIntentId: string): Promise<EntitlementRecord | null>;
  /** The active, unexpired entitlement for this email that ends last, or null. */
  findActiveByEmail(email: string, nowMs: number): Promise<EntitlementRecord | null>;
  update(id: string, patch: Partial<Pick<EntitlementRecord, "expiresAt" | "status">>): Promise<void>;
}

/** An in-memory store for tests. */
export function memoryEntitlementStore(): EntitlementStore & { rows: EntitlementRecord[] } {
  const rows: EntitlementRecord[] = [];
  let n = 0;
  return {
    rows,
    async upsertBySession(rec) {
      const hit = rec.stripeSessionId ? rows.find((r) => r.stripeSessionId === rec.stripeSessionId) : undefined;
      if (hit) return hit;
      const row = { ...rec, id: `ent-${++n}` };
      rows.push(row);
      return row;
    },
    async findBySession(id) { return rows.find((r) => r.stripeSessionId === id) ?? null; },
    async findBySubscription(id) { return rows.find((r) => r.stripeSubscriptionId === id) ?? null; },
    async findByPaymentIntent(id) { return rows.find((r) => r.stripePaymentIntentId === id) ?? null; },
    async findActiveByEmail(email, now) {
      return rows.filter((r) => r.email === email && r.status === "active" && r.expiresAt > now).sort((a, b) => b.expiresAt - a.expiresAt)[0] ?? null;
    },
    async update(id, patch) {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
    },
  };
}
