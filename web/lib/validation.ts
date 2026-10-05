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
export type SupportInput = z.infer<typeof supportSchema>;
