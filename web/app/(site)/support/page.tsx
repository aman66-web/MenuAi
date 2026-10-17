import type { Metadata } from "next";
import { PRO_ENABLED } from "@/lib/mm/config";
import { site } from "@/site.config";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = { title: "Support" };

// Layout only (founder 2026-10-15: "the rest of the app should match that elegance too"); no words changed. Two light grey cards on the
// website's white page, like Home's two cards: the message form and the short answers, each as rows.
const FILL = "bg-[#f4f5f6]";

export default function Support() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-10 pt-10 sm:pt-14">
      <h1 className="text-[2rem] font-[800] leading-none tracking-[-0.02em] sm:text-[2.5rem]">Support</h1>
      <p className="mt-4 max-w-xl text-base leading-[1.65] text-muted">
        Questions, ideas, or a restaurant you want added? Send a message below or email{" "}
        <a className="font-semibold text-accent underline decoration-[1.5px] underline-offset-[3px] [overflow-wrap:anywhere]" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>

      <div className="mt-8 grid gap-3.5 sm:grid-cols-2">
        <SupportForm />
        <div className={`${FILL} rounded-[1.25rem] px-[20px] py-1.5`}>
          <div className="divide-y divide-line">
            <div className="py-4">
              <h2 className="text-base font-bold tracking-[-0.01em]">A number looks wrong</h2>
              <p className="mt-1 text-[0.9375rem] leading-[1.6] text-muted">Open the item in the app and tap &ldquo;Report a number&rdquo;. We check every report within 48 hours.</p>
            </div>
            {PRO_ENABLED ? (
              <>
                <div className="py-4">
                  <h2 className="text-base font-bold tracking-[-0.01em]">Cancel or manage your subscription</h2>
                  <p className="mt-1 text-[0.9375rem] leading-[1.6] text-muted">On your iPhone: Settings › your name › Subscriptions, or in the app: Settings › Manage subscription.</p>
                </div>
                <div className="py-4">
                  <h2 className="text-base font-bold tracking-[-0.01em]">Restore a purchase</h2>
                  <p className="mt-1 text-[0.9375rem] leading-[1.6] text-muted">In the app: Settings › Restore purchases.</p>
                </div>
              </>
            ) : (
              <div className="py-4">
                <h2 className="text-base font-bold tracking-[-0.01em]">Is anything paid?</h2>
                <p className="mt-1 text-[0.9375rem] leading-[1.6] text-muted">No. Every feature is free and there is nothing to buy.</p>
              </div>
            )}
            <div className="py-4">
              <h2 className="text-base font-bold tracking-[-0.01em]">Someone is bothering me, or a username or list is offensive</h2>
              <p className="mt-1 text-[0.9375rem] leading-[1.6] text-muted">In the app, open Community › Friends, tap the three dots next to their name, then choose Report or Block. For a shopping list a friend sent you, open it in Community › Shared with you and choose Report or block. A blocked person is not told. You can also email us.</p>
            </div>
            <div className="py-4">
              <h2 className="text-base font-bold tracking-[-0.01em]">Your data</h2>
              <p className="mt-1 text-[0.9375rem] leading-[1.6] text-muted">You don&apos;t need an account (only friends, in the Community tab, need one). Everything you set up stays on your phone unless you sign in to sync it across your devices (Settings › Account). Settings › Account › Delete my account removes the account and what was synced; Settings › Clear data on this device removes what is on the phone.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
