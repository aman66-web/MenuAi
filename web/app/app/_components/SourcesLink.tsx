"use client";

import { useState } from "react";
import { useT } from "../_lib/i18n";
import { SourcesBody } from "./SourcesBody";
import { Sheet } from "./ui";

/**
 * "Where these numbers come from": a quiet link beside the suggested targets that opens the sources in a sheet over the current screen. A sheet, not a
 * page, so a person in the middle of onboarding (which sends every other address back to the questions) never loses their place or their answers.
 */
export function SourcesLink({ className = "" }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center text-start text-[0.9375rem] font-semibold text-accent underline underline-offset-4 ${className}`}
      >
        {t("Where these numbers come from")}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("Where these numbers come from")}>
        <SourcesBody />
      </Sheet>
    </>
  );
}
