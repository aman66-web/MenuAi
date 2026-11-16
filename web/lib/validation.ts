import { z } from "zod";

// Shapes of the JSON bodies the app and website send. Keep in sync with docs/BACKEND.md
// and the database constraints in supabase/migrations.

const id = z
  .string()
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase letters, digits and single hyphens");
const appVersion = z.string().trim().max(32).optional();
const nutrientValue = z.number().min(0).max(99999).optional(); // zod 4 numbers are finite by default
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
// Honeypot: a hidden form field real people never fill in. Bots usually do.
const honeypot = z.string().max(200).optional();

export const waitlistSchema = z.object({
  email,
  source: z.string().trim().max(64).optional(),
  website: honeypot,
});

export const reportSchema = z.object({
  chainId: id.max(80),
  itemId: id,
  itemName: z.string().trim().max(200).optional(),
  field: z.enum(["calories", "protein", "carbs", "fat", "saturatedFat", "sodium", "sugar", "fiber", "other"]),
  shownValue: nutrientValue,
  reportedValue: nutrientValue,
  note: z.string().trim().max(1000).optional(),
  dataVersion: z.number().int().positive().optional(),
  appVersion,
  photoContentType: z.enum(["image/jpeg", "image/png", "image/heic"]).optional(),
});

// "Couldn't find this at {shop}?" (RECIPES_ANY_SHOP_ENABLED): which product of which shop someone couldn't find, for which ingredient of which recipe. Nothing about
// the person: no account, name, email, location or free text. The ids are the ones the app's own lists use (lib/mm/shopProducts.ts, lib/mm/pantry.ts).
export const notFoundSchema = z.object({
  shop: z.string().regex(/^[a-z][a-z-]{1,30}$/, "must be a shop id"),
  kind: id.max(60),
  productId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9\-_.%]{0,119}$/, "must be a product id").refine((v) => !v.includes(".."), "must be a product id"),
  recipeId: id.max(80).optional(),
  appVersion,
}).strict();

export const chainRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  appVersion,
});

export const supportSchema = z.object({
  email: z.preprocess((v) => (v === "" ? undefined : v), email.optional()),
  message: z.string().trim().min(5).max(4000),
  source: z.enum(["web", "app"]).default("web"),
  appVersion,
  website: honeypot,
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export type ChainRequestInput = z.infer<typeof chainRequestSchema>;
export type NotFoundInput = z.infer<typeof notFoundSchema>;
export type SupportInput = z.infer<typeof supportSchema>;
