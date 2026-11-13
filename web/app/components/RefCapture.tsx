"use client";

import { useEffect } from "react";
import { WEB_PRO_ENABLED } from "@/lib/mm/config";
import { captureRef } from "@/lib/payments/client";

/** Notes a creator code (?ref=) from the address for this browser tab's session, so the creator can be credited if the visitor pays in the same visit. Does nothing unless paid access is on. */
export function RefCapture() {
  useEffect(() => {
    if (WEB_PRO_ENABLED) captureRef(window.location.search);
  }, []);
  return null;
}
