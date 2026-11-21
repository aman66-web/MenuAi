"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { IAP_ENABLED } from "@/lib/mm/config";
import { FREE_WEEK_DAYS, FREE_WEEK_NOTE } from "@/lib/mm/freeWeek";
import { freeWeekStore } from "@/lib/mm/stores";
import { welcomeSaid } from "@/lib/payments/accountAccess";
import { useAccountUser } from "../_lib/account";
import { useStore } from "../_lib/hooks";
import { useT } from "../_lib/i18n";
import { Toast } from "./Toast";

// The one line when an account's free week starts (founder, 20 November 2026: every new account has Premium free for its first week, with nothing to type):
// "Premium is yours free for 7 days.", once on this phone, on Home, as the app's usual toast. It waits for any sheet or other toast on Home to go first (the
// welcome screens' own toast on arrival), so the two are never on screen together.

const HOME = /^\/app\/?$/;

export function FreeWeekNote() {
  if (!IAP_ENABLED) return null;
  return <FreeWeekNoteInApp />;
}

function FreeWeekNoteInApp() {
  const t = useT();
  const pathname = usePathname();
  const user = useAccountUser();
  const state = useStore(freeWeekStore);
  const [shown, setShown] = useState(false);
  const due = !!user && state.user === user.id && state.status === "running" && state.welcomeDue && HOME.test(pathname);

  useEffect(() => {
    if (!due) return;
    let timer = window.setTimeout(function show() {
      if (document.querySelector("dialog[open], [data-toast-host]")) {
        timer = window.setTimeout(show, 1000);
        return;
      }
      welcomeSaid();
      setShown(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [due]);

  return shown ? <Toast onClose={() => setShown(false)}>{t(FREE_WEEK_NOTE, { days: FREE_WEEK_DAYS })}</Toast> : null;
}
