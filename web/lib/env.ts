import "server-only";
import { z } from "zod";

// Server environment variables. Set them in Vercel › Project › Settings › Environment Variables
// (and in web/.env.local for local development). See web/.env.example.
const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  IP_HASH_SALT: z.string().min(16),
  CRON_SECRET: z.string().min(16).optional(),
  // Sign in with Apple account deletion (lib/auth/apple.ts): all three together, or revoking Apple tokens is skipped.
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  // Optional daily email when a Community report is open (lib/reportAlert.ts): all three together, or nothing is sent. Checked when used, not here, so an empty value can't stop the server.
  RESEND_API_KEY: z.string().optional(),
  REPORT_ALERT_TO: z.string().optional(),
  REPORT_ALERT_FROM: z.string().optional(),
});

let cached: z.infer<typeof schema> | null = null;

export function serverEnv() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Missing or invalid server environment variables: ${missing}. See web/.env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}
