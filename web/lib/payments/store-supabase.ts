import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverDb } from "../store-supabase";
import type { EntitlementRecord, EntitlementStatus, EntitlementStore, NewEntitlement } from "./store";
import type { PlanId } from "./plans";

// public.pro_entitlements through the secret key (supabase/migrations/20261113120000_pro_entitlements.sql). Every column name below is a column of that migration.

const db = (): SupabaseClient => serverDb();
const COLS = "id, email, source, plan, status, started_at, expires_at, stripe_session_id, stripe_customer_id, stripe_subscription_id, stripe_payment_intent_id, apple_original_transaction_id, ref, amount_pence, currency";

interface Row {
  id: string; email: string; source: string; plan: string; status: string; started_at: string; expires_at: string;
  stripe_session_id: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; stripe_payment_intent_id: string | null;
  apple_original_transaction_id: string | null; ref: string | null; amount_pence: number | null; currency: string | null;
}

const toRecord = (r: Row): EntitlementRecord => ({
  id: r.id, email: r.email, source: r.source === "apple" ? "apple" : "stripe", plan: r.plan as PlanId, status: r.status as EntitlementStatus,
  startedAt: Date.parse(r.started_at), expiresAt: Date.parse(r.expires_at),
  stripeSessionId: r.stripe_session_id, stripeCustomerId: r.stripe_customer_id, stripeSubscriptionId: r.stripe_subscription_id, stripePaymentIntentId: r.stripe_payment_intent_id,
  appleOriginalTransactionId: r.apple_original_transaction_id, ref: r.ref, amountPence: r.amount_pence, currency: r.currency,
});

const toRow = (n: NewEntitlement) => ({
  email: n.email, source: n.source, plan: n.plan, status: n.status, started_at: new Date(n.startedAt).toISOString(), expires_at: new Date(n.expiresAt).toISOString(),
  stripe_session_id: n.stripeSessionId, stripe_customer_id: n.stripeCustomerId, stripe_subscription_id: n.stripeSubscriptionId, stripe_payment_intent_id: n.stripePaymentIntentId,
  apple_original_transaction_id: n.appleOriginalTransactionId, ref: n.ref, amount_pence: n.amountPence, currency: n.currency,
});

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Supabase ${what} failed: ${error?.message ?? "unknown error"}`);
}

async function one(column: string, value: string): Promise<EntitlementRecord | null> {
  const { data, error } = await db().from("pro_entitlements").select(COLS).eq(column, value).order("expires_at", { ascending: false }).limit(1).maybeSingle();
  if (error) fail(`read by ${column}`, error);
  return data ? toRecord(data as Row) : null;
}

export const supabaseEntitlements: EntitlementStore = {
  async upsertBySession(rec) {
    if (rec.stripeSessionId) {
      const hit = await one("stripe_session_id", rec.stripeSessionId);
      if (hit) return hit;
    }
    const { data, error } = await db().from("pro_entitlements").insert(toRow(rec)).select(COLS).single();
    if (error) {
      // two requests for the same Checkout Session at once (the webhook and the success page): the other one won, read its row
      if ((error as { code?: string }).code === "23505" && rec.stripeSessionId) {
        const hit = await one("stripe_session_id", rec.stripeSessionId);
        if (hit) return hit;
      }
      fail("insert", error);
    }
    return toRecord(data as Row);
  },
  findBySession: (id) => one("stripe_session_id", id),
  findBySubscription: (id) => one("stripe_subscription_id", id),
  findByPaymentIntent: (id) => one("stripe_payment_intent_id", id),
  // active, or cancelled with paid time left (handlers.ts givesAccess): cancelling a subscription stops its renewal, not what was already paid for
  async findActiveByEmail(email, nowMs) {
    const { data, error } = await db().from("pro_entitlements").select(COLS).eq("email", email).in("status", ["active", "cancelled"]).gt("expires_at", new Date(nowMs).toISOString()).order("expires_at", { ascending: false }).limit(1).maybeSingle();
    if (error) fail("read by email", error);
    return data ? toRecord(data as Row) : null;
  },
  async update(id, patch) {
    const row: Record<string, unknown> = {};
    if (patch.expiresAt !== undefined) row.expires_at = new Date(patch.expiresAt).toISOString();
    if (patch.status !== undefined) row.status = patch.status;
    const { error } = await db().from("pro_entitlements").update(row).eq("id", id);
    if (error) fail("update", error);
  },
};
