"use client";

import type { ReactNode } from "react";
import { useT } from "../_lib/i18n";
import { AlertCircleIcon, InfoIcon, WarningIcon } from "./icons";

// The app's notes, one look each wherever they appear (colour meeting, 19 November 2026; approved by the founder that day):
// - "allergy": the one amber note. A pale amber fill, a full 2 px amber edge, the triangle, a bold heading ("Allergy" unless the caller names it) and the words
//   in the body's ink (17.3:1). Only for the person's or household's own allergens, a Contains match and "not checked for your diet", at most one in view,
//   so people keep noticing amber.
// - "info": a calm line that can't be tapped, like the generic "always check the label": 6 px corners (so it never looks like a button), an info icon and
//   ink words; white with the card line on the page, the page fill with no edge inside a card or a sheet.
// - "banner": a "please note" (offline, not switched on yet, can't go on yet): a white card with the line, a 4 px grey bar at its start, the info icon.
// - "error": an app failure (no connection, sign-in failed, purchase failed): the pale red fill, a 4 px red bar, the circle-! and a red bold title over
//   ink words. Its shape and icon differ from the allergy note's, because the two are nearly the same colour to colour-blind eyes.
// None of them ever sits on a food figure or a price, and none adds words of its own except the allergy note's heading.

export type NoteKind = "allergy" | "info" | "banner" | "error";

export interface NoteProps {
  kind?: NoteKind;
  /** The bold first line. Leave it out for the allergy note's "Allergy"; `null` for none. */
  heading?: ReactNode | null;
  children?: ReactNode;
  className?: string;
  id?: string;
}

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/** Inside a white card or a sheet the info line lies flat in the page fill with no edge; on the page it is white with the card line. */
const FLAT_IN_CARD = "[:is(.glass,.hero-card,.inset-card,.sheet-panel)_&]:border-transparent [:is(.glass,.hero-card,.inset-card,.sheet-panel)_&]:bg-fill";

const BOX: Record<NoteKind, string> = {
  allergy: "gap-3 rounded-[1.25rem] border-2 border-note-edge bg-note-bg p-4",
  info: `gap-2 rounded-[0.375rem] border border-line bg-card px-3 py-2 ${FLAT_IN_CARD}`,
  banner: "gap-3 rounded-[1.25rem] border border-s-4 border-line border-s-edge bg-card p-4",
  error: "gap-3 rounded-[1.25rem] border-s-4 border-danger bg-danger-bg p-4",
};

export function Note({ kind = "allergy", heading, children, className, id }: NoteProps) {
  const t = useT();
  const title = heading === undefined ? (kind === "allergy" ? t("Allergy") : null) : heading;
  const icon =
    kind === "allergy" ? <WarningIcon className="mt-0.5 h-5 w-5 shrink-0 text-note-edge" />
    : kind === "error" ? <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
    : kind === "info" ? <InfoIcon className="mt-px h-[1.125rem] w-[1.125rem] shrink-0 text-foreground" />
    : <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-ink" />;
  return (
    <div id={id} role={kind === "error" ? "alert" : kind === "banner" ? "status" : "note"} className={cx("flex text-[0.9375rem] leading-snug text-foreground", BOX[kind], className)}>
      {icon}
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {title != null && title !== false && <p className={cx("font-bold", kind === "error" && "text-danger")}>{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** The calm grey line that can't be tapped ("Always check the label on the pack."). */
export function InfoLine(props: Omit<NoteProps, "kind">) {
  return <Note kind="info" {...props} />;
}

/** "Please note": offline, not switched on yet, can't go on yet. Never red. */
export function InfoBanner(props: Omit<NoteProps, "kind">) {
  return <Note kind="banner" {...props} />;
}

/** An app failure: no connection, sign-in failed, purchase failed. Red only for failures. */
export function ErrorBanner(props: Omit<NoteProps, "kind">) {
  return <Note kind="error" {...props} />;
}
