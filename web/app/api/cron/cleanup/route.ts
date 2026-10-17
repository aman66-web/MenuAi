import { handleCleanup } from "@/lib/handlers";
import { safely } from "@/lib/http";
import { serverEnv } from "@/lib/env";
import { sendReportAlert } from "@/lib/reportAlert";
import { supabaseStore } from "@/lib/store-supabase";
import { supabaseCommunity } from "@/lib/store-supabase-community";

// Called daily by Vercel Cron (see web/vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
// Forgets old IP hashes and tidies Community (expired inbox lists, old tallies, old declined requests, old closed reports). The answer says how many Community
// reports are open; if any are, and the optional alert variables are set, a short email with the count nudges the founder (lib/reportAlert.ts).
export async function GET(request: Request) {
  return safely(async () => {
    const result = await handleCleanup(request.headers.get("authorization"), serverEnv().CRON_SECRET, { store: supabaseStore, ipHash: null, community: supabaseCommunity });
    const open = result.body.openReports;
    if (result.status === 200 && typeof open === "number" && open > 0) {
      const env = serverEnv();
      result.body.reportAlert = await sendReportAlert(open, { apiKey: env.RESEND_API_KEY, to: env.REPORT_ALERT_TO, from: env.REPORT_ALERT_FROM });
    }
    return result;
  });
}
