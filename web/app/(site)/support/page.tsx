import type { Metadata } from "next";
import { site } from "@/site.config";
import { SupportForm } from "./SupportForm";

export const metadata: Metadata = { title: "Support" };

export default function Support() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <h1 className="text-4xl font-extrabold tracking-tight">Support</h1>
      <p className="mt-3 text-muted">
        Questions, ideas, or a restaurant you want added? Send a message below or email{" "}
        <a className="text-accent underline" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <SupportForm />
        <div className="space-y-5 text-sm">
          <div>
            <h2 className="font-bold">A number looks wrong</h2>
            <p className="mt-1 text-muted">Open the item in the app and tap &ldquo;Report a number&rdquo;. We check every report within 48 hours.</p>
          </div>
          <div>
            <h2 className="font-bold">Cancel or manage your subscription</h2>
            <p className="mt-1 text-muted">On your iPhone: Settings › your name › Subscriptions, or in the app: Settings › Manage subscription.</p>
          </div>
          <div>
            <h2 className="font-bold">Restore a purchase</h2>
            <p className="mt-1 text-muted">In the app: Settings › Restore purchases.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
