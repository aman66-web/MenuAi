"use client";

import { useEffect } from "react";
import { WEB_PRO_ENABLED } from "@/lib/mm/config";
import { captureRefFromLocation } from "@/lib/payments/ref";

/** Notes a creator code (?ref=) from the address in the page's memory only (nothing is stored) and takes it out of the address, so the creator can be credited if the visitor pays in the same visit. Does nothing unless paid access is on. */
export function RefCapture() {
  useEffect(() => {
    if (WEB_PRO_ENABLED) captureRefFromLocation();
  }, []);
  return null;
}
