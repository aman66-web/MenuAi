"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { barcodeDigits, barcodeShown } from "@/lib/mm/barcodes";
import type { LogMeal } from "@/lib/mm/types";
import { ScanIcon } from "../icons";
import { Button, ErrorBox, Spinner } from "../ui";
import { useSettings } from "../../_lib/hooks";
import { useT } from "../../_lib/i18n";
import { Scanner } from "../../groceries/Scanner";
import { PhotoBarcodeButton } from "../../groceries/PhotoBarcode";
import { useBarcodeLookup } from "./findByBarcode";
import type { NewEntry } from "./parts";
import { HowMuch, NotFound } from "./ProductPick";

// "Scan a barcode", the first choice in Add food (founder 2026-11-20, 12:45: scan a pack, see it, say how much, add it). The camera opens at once; the barcode (or
// the number typed under it) is looked up in our own shop lists, then the barcode catalogue, then Open Food Facts through our API (findByBarcode.ts); the product
// comes up with its ring of protein, carbs and fat and "How much?" (HowMuch), and Add puts it in the meal whose + was tapped, with the usual Added toast and Undo.
// A barcode nobody has figures for is a calm line and "Type the numbers from the pack".

// `fromPhoto` (Add food's "Barcode from a photo"; founder 2026-11-21): the camera doesn't open; "Choose a photo" picks a photo of the barcode, read on the phone
// (groceries/PhotoBarcode.tsx), and the product comes up exactly as after a scan.
export function ScanFood({ meal, onAdd, onBack, onType, header, fromPhoto = false }: { meal: LogMeal; onAdd: (entry: NewEntry) => void; onBack: () => void; onType: (name: string) => void; header: (onBack: () => void) => ReactNode; fromPhoto?: boolean }) {
  const t = useT();
  const mine = useSettings().shops ?? [];
  const [scanning, setScanning] = useState(!fromPhoto);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  // the digits as printed under the barcode, leading zeros kept (the design review of 2026-11-20: 01318180 was shown as 1318180)
  const [digits, setDigits] = useState<string | null>(null);
  const got = useRef(false);
  const [retry, setRetry] = useState(0);
  const found = useBarcodeLookup(digits, mine, digits ? t("Barcode {code}", { code: barcodeShown(digits) }) : "", retry);

  // the answer is a new step: the sheet's title takes the focus, as between the sheet's views (never a box, which would bring up the keyboard)
  const settled = found !== null && found.status !== "loading";
  useEffect(() => {
    if (settled) document.querySelector<HTMLElement>("dialog[open] h2")?.focus({ preventScroll: true });
  }, [settled, digits]);

  const scanAgain = () => setScanning(true);

  return (
    <div className="pb-2">
      {header(onBack)}
      <Scanner
        open={scanning}
        // closed with no barcode read: back to Add food's choices
        onClose={() => { setScanning(false); if (!got.current) onBack(); }}
        onCode={(raw) => {
          const d = barcodeDigits(raw);
          setScanning(false);
          if (!d) return;
          got.current = true;
          setDigits(d);
          // every scan asks again, even for the same code after "Couldn't look it up" (the meeting, Arjun)
          setRetry((n) => n + 1);
        }}
      />
      {!digits ? (
        <div className="space-y-3">
          {fromPhoto && <p className="text-[0.9375rem] leading-snug text-muted">{t("Pick a photo where the barcode is sharp and fills a good part of the picture.")}</p>}
          {photoNote && <p role="status" className="text-[0.9375rem] leading-snug">{t(photoNote)}</p>}
          {fromPhoto && <PhotoBarcodeButton variant="primary" onNote={setPhotoNote} onCode={(raw) => { const d = barcodeDigits(raw); if (!d) return; got.current = true; setDigits(d); setRetry((n) => n + 1); }} />}
          <Button full variant={fromPhoto ? "secondary" : "primary"} className="min-h-12 text-base" onClick={scanAgain}><ScanIcon aria-hidden className="h-5 w-5" />{t("Scan a barcode")}</Button>
        </div>
      ) : !found || found.status === "loading" ? (
        <Spinner label={t("Looking it up")} />
      ) : found.status === "found" ? (
        <HowMuch key={found.products[0]!.key} product={found.products[0]!} meal={meal} onAdd={(entry) => onAdd(entry)} />
      ) : (
        <div className="space-y-3">
          {found.status === "missing" ? (
            <NotFound name={found.name} code={digits} onType={onType} />
          ) : (
            <>
              {/* the connection only when it is the connection (Open Food Facts down, or our server busy, isn't: the 30-person meeting, 21 November 2026) */}
              <ErrorBox message={found.offline ? t("Couldn't look it up. Check your connection.") : t("Couldn't look it up just now. Try again.")} onRetry={() => setRetry((n) => n + 1)} />
              <Button variant="secondary" full className="min-h-12" onClick={() => onType("")}>{t("Type the numbers from the pack")}</Button>
            </>
          )}
          <Button variant="secondary" full className="min-h-12" onClick={scanAgain}><ScanIcon aria-hidden className="h-5 w-5" />{t("Scan again")}</Button>
        </div>
      )}
    </div>
  );
}
