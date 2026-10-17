"use client";

import { useEffect, useRef, useState } from "react";
import { blockPerson, removeFriend } from "../_lib/community";
import { failureText } from "../_lib/communityText";
import { useT } from "../_lib/i18n";
import { BlockIcon, FlagIcon } from "./communityIcons";
import { CheckIcon, CloseIcon } from "./icons";
import { ReportForm, type ReportTarget } from "./ReportForm";
import { Button, Sheet, Spinner } from "./ui";

// What you can do about a person in Community, in one sheet: report them, block them, or (a friend) remove them. Used on the friends page (a friend, or a request
// waiting for you) and on a shopping list someone sent you. Blocking and removing are asked about once more in plain words before anything happens. The person
// is never told: a blocked person's view is the same as a removed friend's. (App Review guideline 1.2: report and block are in the app, one tap from the person.)

export type PersonOutcome = "removed" | "blocked" | "reported";
type View = "menu" | "remove" | "block" | "report" | "thanks";

export function PersonSheet({ target, onClose, onDone }: { target: ReportTarget | null; onClose: () => void; onDone?: (what: PersonOutcome, username: string) => void }) {
  const t = useT();
  const [state, setState] = useState<{ forId: string; view: View }>({ forId: "", view: "menu" });
  const view: View = target && state.forId === target.id ? state.view : "menu";
  const go = (v: View) => setState({ forId: target?.id ?? "", view: v });
  const close = () => { setState({ forId: "", view: "menu" }); onClose(); }; // reopened later, it starts at the menu again
  const name = target?.username ?? "";
  const panel = useRef<HTMLDivElement>(null);
  const thanks = useRef<HTMLParagraphElement>(null);
  // When the sheet moves on to its next view the button that was pressed is gone, so focus goes to the new view (its title, or the thanks) where a screen reader and
  // the keyboard pick it up; without this it dropped to the page behind. Not on first opening: the dialog places focus itself.
  const shown = useRef<View>(view);
  useEffect(() => {
    if (shown.current === view) return;
    shown.current = view;
    if (view === "thanks") thanks.current?.focus();
    else panel.current?.closest("dialog")?.querySelector<HTMLElement>("h2")?.focus();
  }, [view]);
  const title = view === "report" || view === "thanks" ? t("Report {name}", { name }) : view === "block" ? t("Block {name}", { name }) : view === "remove" ? t("Remove {name}", { name }) : name;
  return (
    <Sheet open={target !== null} onClose={close} title={title}>
      {target && (
        <div ref={panel} className="pb-2 pt-1">
          {view === "menu" && <Menu target={target} go={go} />}
          {view === "remove" && <Confirm target={target} kind="remove" onCancel={() => go("menu")} onDone={() => { close(); onDone?.("removed", target.username); }} />}
          {view === "block" && <Confirm target={target} kind="block" onCancel={() => go("menu")} onDone={() => { close(); onDone?.("blocked", target.username); }} />}
          {view === "report" && <ReportForm target={target} onCancel={() => go("menu")} onSent={(blocked) => { if (blocked) { close(); onDone?.("blocked", target.username); } else { onDone?.("reported", target.username); go("thanks"); } }} />}
          {view === "thanks" && (
            <>
              <p ref={thanks} tabIndex={-1} role="status" className="flex items-start gap-2 text-base font-semibold leading-snug text-accent outline-none"><CheckIcon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={3} />{t("Thank you. We'll look at your report.")}</p>
              <Button full className="mt-5 min-h-12 text-base" onClick={close}>{t("Done")}</Button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** One big row in the menu. */
function Row({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3.5 rounded-2xl bg-[var(--fill)] px-4 py-2.5 text-start text-base font-semibold leading-snug transition active:scale-[0.99] hover:bg-soft-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</span>
    </button>
  );
}

function Menu({ target, go }: { target: ReportTarget; go: (v: View) => void }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Row icon={<FlagIcon />} onClick={() => go("report")}>{t("Report {name}", { name: target.username })}</Row>
      <Row icon={<BlockIcon />} onClick={() => go("block")}>{t("Block {name}", { name: target.username })}</Row>
      {target.kind === "friend" && <Row icon={<CloseIcon />} onClick={() => go("remove")}>{t("Remove {name}", { name: target.username })}</Row>}
    </div>
  );
}

/** "Are you sure?" for removing a friend and for blocking: what happens, in plain words. */
function Confirm({ target, kind, onCancel, onDone }: { target: ReportTarget; kind: "remove" | "block"; onCancel: () => void; onDone: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = kind === "remove" ? await removeFriend(target.id) : await blockPerson(target.kind === "list" ? { listId: target.id } : { friendId: target.id });
      if (r.ok) onDone();
      else setError(failureText(r, t, target.username));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="text-base leading-snug [overflow-wrap:anywhere]">
        {kind === "remove"
          ? t("Remove {name} from your friends? You won't be able to send each other lists unless you add each other's codes again. They aren't told.", { name: target.username })
          : t("Block {name}? You'll stop seeing each other, and you won't be able to send each other lists or friend requests. They aren't told.", { name: target.username })}
      </p>
      {error && <p role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-snug">{error}</p>}
      {/* aria-disabled, not disabled, while it is working: a disabled button drops the keyboard focus to the page */}
      <Button full variant="danger" className="mt-5 min-h-12 text-base" aria-disabled={busy || undefined} onClick={() => void run()}>
        {busy ? <Spinner /> : kind === "remove" ? t("Remove {name}", { name: target.username }) : t("Block {name}", { name: target.username })}
      </Button>
      <Button full variant="ghost" className="mt-1.5" disabled={busy} onClick={onCancel}>{t("Cancel")}</Button>
    </>
  );
}
