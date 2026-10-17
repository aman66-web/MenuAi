// The daily cron's one-line nudge when a Community report is waiting (App Review guideline 1.2 expects objectionable-content reports to be acted on promptly, and a
// table nobody is told about is easy to forget). OPTIONAL: nothing is sent unless all three server-only variables are set in Vercel (RESEND_API_KEY, REPORT_ALERT_TO,
// REPORT_ALERT_FROM). The email holds a COUNT and where to look, never a name or any of a report's words. It uses Resend's HTTP API with the standard fetch: no new package.

export interface AlertConfig {
  apiKey?: string | undefined;
  to?: string | undefined;
  from?: string | undefined;
}

export type AlertOutcome = "sent" | "not_configured" | "failed";

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SENDER = /^(?:[^<>]+<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/;

export function reportAlertText(open: number): { subject: string; text: string } {
  return {
    subject: open === 1 ? "Numbite: 1 Community report is waiting" : `Numbite: ${open} Community reports are waiting`,
    text:
      `${open} Community report${open === 1 ? " is" : "s are"} open.\n\n` +
      "Supabase > Table Editor > open_community_reports (oldest first). Please act on them within 24 hours: remove the person (docs/BACKEND.md \"Removing someone\"), " +
      "then set the report's status to actioned or dismissed.\n\n" +
      "This email only carries a count. It is sent once a day while any report is open.",
  };
}

export async function sendReportAlert(open: number, config: AlertConfig, doFetch: typeof fetch = fetch): Promise<AlertOutcome> {
  const { apiKey, to, from } = config;
  if (!apiKey || !to || !from || !ADDRESS.test(to.trim()) || !SENDER.test(from.trim())) return "not_configured";
  try {
    const mail = reportAlertText(open);
    const res = await doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: from.trim(), to: [to.trim()], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`Report alert email was refused (${res.status})`);
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("Report alert email failed", error);
    return "failed";
  }
}
