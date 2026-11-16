"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../_lib/i18n";
import { MenuSourcesBody } from "./MenuSourcesBody";
import { Sheet } from "./ui";

/**
 * "Where these numbers come from" on the menu screens (the Truth card, Quick answers): a quiet link that opens the menu sources in a sheet over the screen,
 * so the person keeps their place. The sheet goes to the end of the page (a portal), not inside the Truth card, so the dark card's colours never reach it;
 * a second modal dialog sits on top of the first and closing it leaves the first open (ui.tsx Sheet only answers its own close).
 */
export function MenuSourcesLink({ className = "" }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // The sheet is put on the page the first time it is opened and then kept, so closing it runs the dialog's own close (focus goes back to this link).
  const [used, setUsed] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setUsed(true);
          setOpen(true);
        }}
        className={`inline-flex min-h-11 items-center text-start text-[0.9375rem] font-semibold text-accent underline underline-offset-4 ${className}`}
      >
        {t("Where these numbers come from")}
      </button>
      {used &&
        createPortal(
          <Sheet open={open} onClose={() => setOpen(false)} title={t("Where these numbers come from")}>
            <MenuSourcesBody />
          </Sheet>,
          document.body,
        )}
    </>
  );
}
