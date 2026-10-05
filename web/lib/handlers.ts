import { z } from "zod";
import type { Store, Table } from "./store";
import { TABLES } from "./store";
import { chainRequestSchema, reportSchema, supportSchema, waitlistSchema } from "./validation";

// Pure request handlers: (body, context) -> { status, body }. No Next.js or Supabase imports,
// so they're easy to test (tests/handlers.test.ts). Route files in app/api wire them up.

export type Result = { status: number; body: Record<string, unknown> };
export type Ctx = { store: Store; ipHash: string | null; now?: Date };

/** Max submissions per caller per hour. */
export const RATE_LIMITS: Record<Table, number> = {
  waitlist: 5,
  support_messages: 5,
  number_reports: 30,
  chain_requests: 30,
};
export const IP_HASH_RETENTION_DAYS = 30;
const PHOTO_UPLOAD_TTL_SECONDS = 2 * 60 * 60; // Supabase signed upload URLs last 2 hours

const ok = (body: Record<string, unknown> = { ok: true }, status = 200): Result => ({ status, body });
const invalid = (error: z.ZodError): Result => ({
  status: 400,
  body: { error: "invalid_request", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
});
const tooMany: Result = { status: 429, body: { error: "rate_limited", message: "Too many requests. Try again later." } };

async function overLimit(ctx: Ctx, table: Table): Promise<boolean> {
  if (!ctx.ipHash) return false;
  const since = new Date((ctx.now ?? new Date()).getTime() - 60 * 60 * 1000).toISOString();
  return (await ctx.store.countRecent(table, ctx.ipHash, since)) >= RATE_LIMITS[table];
}

export async function handleWaitlist(raw: unknown, ctx: Ctx): Promise<Result> {
  const parsed = waitlistSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { email, source, website } = parsed.data;
  if (website) return ok(); // honeypot filled: pretend success, store nothing
  if (await overLimit(ctx, "waitlist")) return tooMany;
  await ctx.store.insertWaitlist({ email, source: source || null, ip_hash: ctx.ipHash });
  return ok(); // same answer whether or not the email was already there
}

export async function handleReport(raw: unknown, ctx: Ctx): Promise<Result> {
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  if (await overLimit(ctx, "number_reports")) return tooMany;
  const r = parsed.data;
  const { id } = await ctx.store.insert("number_reports", {
    chain_id: r.chainId,
    item_id: r.itemId,
    item_name: r.itemName ?? null,
    field: r.field,
    shown_value: r.shownValue ?? null,
    reported_value: r.reportedValue ?? null,
    note: r.note || null,
    data_version: r.dataVersion ?? null,
    app_version: r.appVersion ?? null,
    ip_hash: ctx.ipHash,
  });
  if (!r.photoContentType) return ok({ id }, 201);

  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic" }[r.photoContentType];
  const month = (ctx.now ?? new Date()).toISOString().slice(0, 7);
  const path = `${month}/${id}.${ext}`;
  const { signedUrl } = await ctx.store.createPhotoUploadUrl(path);
  await ctx.store.setReportPhotoPath(id, path);
  return ok(
    {
      id,
      photoUpload: {
        url: signedUrl,
        method: "PUT",
        headers: { "Content-Type": r.photoContentType },
        expiresInSeconds: PHOTO_UPLOAD_TTL_SECONDS,
      },
    },
    201,
  );
}

export async function handleChainRequest(raw: unknown, ctx: Ctx): Promise<Result> {
  const parsed = chainRequestSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  if (await overLimit(ctx, "chain_requests")) return tooMany;
  await ctx.store.insert("chain_requests", {
    name: parsed.data.name,
    app_version: parsed.data.appVersion ?? null,
    ip_hash: ctx.ipHash,
  });
  return ok({ ok: true }, 201);
}

export async function handleSupport(raw: unknown, ctx: Ctx): Promise<Result> {
  const parsed = supportSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const s = parsed.data;
  if (s.website) return ok();
  if (await overLimit(ctx, "support_messages")) return tooMany;
  await ctx.store.insert("support_messages", {
    email: s.email ?? null,
    message: s.message,
    source: s.source,
    app_version: s.appVersion ?? null,
    ip_hash: ctx.ipHash,
  });
  return ok({ ok: true }, 201);
}

/** Daily cron: forget IP hashes older than the retention period. */
export async function handleCleanup(authorization: string | null, cronSecret: string | undefined, ctx: Ctx): Promise<Result> {
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) return { status: 401, body: { error: "unauthorized" } };
  const before = new Date((ctx.now ?? new Date()).getTime() - IP_HASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const cleared: Record<string, number> = {};
  for (const t of TABLES) cleared[t] = await ctx.store.clearIpHashes(t, before);
  return ok({ ok: true, cleared });
}
