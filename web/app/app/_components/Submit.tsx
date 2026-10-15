"use client";

import { useState, type ReactNode } from "react";
import { analytics } from "@/lib/mm/analytics";
import {
  chainRequestPayload, REPORT_FIELDS, REPORT_THANKS, reportPayload, REQUEST_THANKS, SUPPORT_THANKS, supportPayload, type ReportField,
} from "@/lib/mm/outbox";
import { prepareReportPhoto } from "@/lib/mm/photo-store";
import { outbox } from "@/lib/mm/stores";
import type { MenuItem, Nutrients } from "@/lib/mm/types";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { CheckIcon, ChevronRightIcon } from "./icons";
import { Button, inputClass, Sheet } from "./ui";

// SPEC §12: every submission is saved in the outbox first, so the confirmation shows at once and sending is invisible.

// ---- form pieces in Home's language (founder 2026-10-15: "the rest of the app should match that elegance") ----
// On the white sheet each field is a soft grey box (the shared inputClass: the light fill anything on a white surface gets, so it is
// plainly a place to type) under a sentence-case label (like ui.tsx Field), with its hint beneath. The main action is the black pill; a sent form
// shows a lime tick. Words and roles are unchanged.

const labelClass = "mb-2 block text-[0.9375rem] font-semibold leading-snug";
const fieldClass = `block ${inputClass}`;
const hintClass = "mt-2 block text-[0.9375rem] leading-snug text-muted";
const submitClass = "min-h-13";

/** The fields of a form, evenly spaced. */
function Group({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

/** One field: the label above it, both inside the same <label> so a tap on the label focuses the field. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className={hintClass}>{hint}</span>}
    </label>
  );
}

/** A select drawn like the other fields, with our own chevron so it looks the same in every browser. */
function SelectField({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={`${fieldClass} appearance-none pe-11`} {...rest}>{children}</select>
      <ChevronRightIcon aria-hidden className="pointer-events-none absolute end-4 top-1/2 h-5 w-5 -translate-y-1/2 rotate-90 rtl:-rotate-90 text-muted" />
    </span>
  );
}

/** The lime tick above a confirmation. */
function Tick() {
  return (
    <span aria-hidden className="bg-sun mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full text-on-accent">
      <CheckIcon className="h-6 w-6" strokeWidth={2.5} />
    </span>
  );
}

function Done({ message, onClose }: { message: string; onClose: () => void }) {
  const t = useT();
  return (
    <div className="pb-2 pt-4 text-center">
      <Tick />
      <p role="status" className="mx-auto max-w-[20rem] text-xl font-[800] leading-snug tracking-[-0.01em]">{message}</p>
      <Button className={`mt-6 ${submitClass}`} full onClick={onClose}>{t("Done")}</Button>
    </div>
  );
}

// ---- Request a chain (SPEC §12.2) ----

export function RequestChainSheet({ open, onClose, initialName = "" }: { open: boolean; onClose: () => void; initialName?: string }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("Request a chain")}>
      {open && <RequestForm onClose={onClose} initialName={initialName} />}
    </Sheet>
  );
}

function RequestForm({ onClose, initialName }: { onClose: () => void; initialName: string }) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 2 && name.trim().length <= 80;
  if (sent) return <Done message={t(REQUEST_THANKS)} onClose={onClose} />;
  return (
    <form
      className="space-y-5 pb-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        await outbox().enqueue("chainRequest", chainRequestPayload(name));
        analytics.track({ name: "chainRequested" });
        setSent(true);
      }}
    >
      <Group>
        <Row label={t("Which restaurant?")} hint={t("The most-requested chains get added first.")}>
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus autoComplete="off" />
        </Row>
      </Group>
      <Button type="submit" full className={submitClass} disabled={!valid || busy}>{t("Send request")}</Button>
    </form>
  );
}

// ---- Report a number (SPEC §12.1) ----

export interface ReportTarget {
  chainId: string;
  chainName: string;
  items: MenuItem[];
  item?: MenuItem; // preselected when opened from an item
  dataVersion?: number;
}

export function ReportSheet({ open, onClose, target }: { open: boolean; onClose: () => void; target: ReportTarget }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("Report a number")}>
      {open && <ReportForm key={target.item?.id ?? "any"} target={target} onClose={onClose} />}
    </Sheet>
  );
}

function shownValueFor(n: Nutrients | undefined, field: ReportField): number | undefined {
  if (!n || field === "other") return undefined;
  return n[field];
}

function ReportForm({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const t = useT();
  const [itemId, setItemId] = useState(target.item?.id ?? "");
  const [field, setField] = useState<ReportField>("calories");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const item = target.items.find((i) => i.id === itemId);
  const shown = shownValueFor(item?.nutrients, field);
  if (sent) return <Done message={t(REPORT_THANKS)} onClose={onClose} />;

  return (
    <form
      className="space-y-5 pb-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const reported = value.trim() === "" ? undefined : Number(value);
        if (!item) return setError(t("Choose the item first."));
        if (reported === undefined && !note.trim()) return setError(t("Add the correct value or a note."));
        if (reported !== undefined && (!Number.isFinite(reported) || reported < 0 || reported >= 100000)) return setError(t("The correct value must be a number from 0 to 99,999."));
        setError(null);
        setBusy(true);
        let blob: Blob | undefined;
        if (photo) {
          try {
            blob = await prepareReportPhoto(photo);
          } catch {
            setBusy(false);
            return setError(t("Couldn't prepare that photo. Try a JPEG or PNG, or send the report without it."));
          }
        }
        await outbox().enqueue(
          "report",
          reportPayload({
            chainId: target.chainId, itemId: item.id, itemName: item.name, field,
            ...(shown !== undefined ? { shownValue: shown } : {}),
            ...(reported !== undefined ? { reportedValue: reported } : {}),
            note, ...(target.dataVersion ? { dataVersion: target.dataVersion } : {}), hasPhoto: !!blob,
          }),
          blob,
        );
        analytics.track({ name: "numberReported", chainId: target.chainId });
        setSent(true);
      }}
    >
      <p className="text-[0.9375rem] leading-snug text-muted">{t("Something look wrong at {chain}? Tell us what the menu board or the chain's guide says.", { chain: target.chainName })}</p>
      <Group>
        {target.item ? (
          <div>
            <span className={labelClass}>{t("Item")}</span>
            <p className="text-lg font-bold leading-snug tracking-[-0.01em]">{target.item.name}</p>
          </div>
        ) : (
          <Row label={t("Item")}>
            <SelectField value={itemId} onChange={(e) => setItemId(e.target.value)} required>
              <option value="">{t("Choose an item…")}</option>
              {target.items.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
            </SelectField>
          </Row>
        )}
        {/* "We show" sits outside the <label>, so the select's name stays "Which number?" whatever the figure. */}
        <div>
          <Row label={t("Which number?")}>
            <SelectField value={field} onChange={(e) => setField(e.target.value as ReportField)}>
              {REPORT_FIELDS.map((f) => (<option key={f.value} value={f.value}>{t(f.label)}</option>))}
            </SelectField>
          </Row>
          {shown !== undefined && (
            <p className={`app-numbers ${hintClass}`}>
              <Rich text={t("We show: {value}")} values={{ value: <span className="font-mono font-semibold text-foreground">{shown}</span> }} />
            </p>
          )}
        </div>
        <Row label={t("Correct value")}>
          <input className={`${fieldClass} app-numbers`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("e.g. 640")} />
        </Row>
        <Row label={t("Note (optional)")}>
          <textarea className={`${fieldClass} resize-none py-3 leading-snug`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Row>
        <Row label={t("Photo of the menu board (optional)")}>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block min-h-11 w-full rounded-full text-[0.9375rem] text-muted file:me-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border-0 file:bg-soft-strong file:px-5 file:py-2.5 file:text-[0.9375rem] file:font-semibold file:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </Row>
      </Group>
      {error && <p role="alert" className="text-[0.9375rem] font-semibold leading-snug text-accent">{error}</p>}
      <Button type="submit" full className={submitClass} disabled={busy}>{t("Send report")}</Button>
    </form>
  );
}

// ---- Contact us (SPEC §12.4) ----

export function ContactForm({ onSent }: { onSent?: () => void }) {
  const t = useT();
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = message.trim().length >= 5 && message.trim().length <= 4000;
  if (sent) {
    return (
      <div className="rounded-[1.25rem] bg-soft px-5 py-7 text-center">
        <Tick />
        <p role="status" className="mx-auto max-w-[20rem] text-xl font-[800] leading-snug tracking-[-0.01em]">{t(SUPPORT_THANKS)}</p>
      </div>
    );
  }
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        await outbox().enqueue("support", supportPayload(message, email));
        setSent(true);
        onSent?.();
      }}
    >
      <Group>
        <Row label={t("Message")} hint={t("5 to 4,000 characters.")}>
          <textarea className={`${fieldClass} resize-none py-3 leading-snug`} rows={5} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Row>
        <Row label={t("Email (optional)")} hint={t("Only so we can reply.")}>
          <input className={fieldClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Row>
      </Group>
      <Button type="submit" full className={submitClass} disabled={!valid || busy}>{t("Send message")}</Button>
    </form>
  );
}
