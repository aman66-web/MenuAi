"use client";

import { useState } from "react";
import { analytics } from "@/lib/mm/analytics";
import {
  chainRequestPayload, REPORT_FIELDS, REPORT_THANKS, reportPayload, REQUEST_THANKS, SUPPORT_THANKS, supportPayload, type ReportField,
} from "@/lib/mm/outbox";
import { prepareReportPhoto } from "@/lib/mm/photo-store";
import { outbox } from "@/lib/mm/stores";
import type { MenuItem, Nutrients } from "@/lib/mm/types";
import { useT } from "../_lib/i18n";
import { Rich } from "../_lib/Rich";
import { Button, Field, inputClass, Sheet } from "./ui";

// SPEC §12: every submission is saved in the outbox first, so the confirmation shows at once and sending is invisible.

function Done({ message, onClose }: { message: string; onClose: () => void }) {
  const t = useT();
  return (
    <div className="py-6 text-center">
      <p role="status" className="text-lg font-semibold">{message}</p>
      <Button className="mt-5" full onClick={onClose}>{t("Done")}</Button>
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
      className="space-y-4 pb-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        await outbox().enqueue("chainRequest", chainRequestPayload(name));
        analytics.track({ name: "chainRequested" });
        setSent(true);
      }}
    >
      <Field label={t("Which restaurant?")} hint={t("The most-requested chains get added first.")}>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus autoComplete="off" />
      </Field>
      <Button type="submit" full disabled={!valid || busy}>{t("Send request")}</Button>
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
      className="space-y-4 pb-2"
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
      <p className="text-sm text-muted">{t("Something look wrong at {chain}? Tell us what the menu board or the chain's guide says.", { chain: target.chainName })}</p>
      {!target.item && (
        <Field label={t("Item")}>
          <select className={inputClass} value={itemId} onChange={(e) => setItemId(e.target.value)} required>
            <option value="">{t("Choose an item…")}</option>
            {target.items.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
          </select>
        </Field>
      )}
      {target.item && <p className="text-base font-semibold">{target.item.name}</p>}
      <Field label={t("Which number?")}>
        <select className={inputClass} value={field} onChange={(e) => setField(e.target.value as ReportField)}>
          {REPORT_FIELDS.map((f) => (<option key={f.value} value={f.value}>{t(f.label)}</option>))}
        </select>
      </Field>
      {shown !== undefined && <p className="app-numbers text-sm text-muted"><Rich text={t("We show: {value}")} values={{ value: <span className="font-semibold text-foreground">{shown}</span> }} /></p>}
      <Field label={t("Correct value")}>
        <input className={inputClass} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("e.g. 640")} />
      </Field>
      <Field label={t("Note (optional)")}>
        <textarea className={`${inputClass} py-2`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label={t("Photo of the menu board (optional)")}>
        <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
      </Field>
      {error && <p role="alert" className="text-sm font-medium text-accent">{error}</p>}
      <Button type="submit" full disabled={busy}>{t("Send report")}</Button>
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
  if (sent) return <p role="status" className="py-3 text-base font-semibold">{t(SUPPORT_THANKS)}</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        await outbox().enqueue("support", supportPayload(message, email));
        setSent(true);
        onSent?.();
      }}
    >
      <Field label={t("Message")} hint={t("5 to 4,000 characters.")}>
        <textarea className={`${inputClass} py-2`} rows={5} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <Field label={t("Email (optional)")} hint={t("Only so we can reply.")}>
        <input className={inputClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" full disabled={!valid || busy}>{t("Send message")}</Button>
    </form>
  );
}
