import { Fragment, type ReactNode } from "react";

/**
 * A translated sentence with styled parts: `<Rich text={t("Every dish at {count}")} values={{ count: <strong>…</strong> }} />`.
 * Translators move the {placeholders} wherever their language needs them; each is replaced by its element.
 */
export function Rich({ text, values }: { text: string; values: Readonly<Record<string, ReactNode>> }) {
  return (
    <>
      {text.split(/(\{\w+\})/g).map((part, i) => {
        const m = /^\{(\w+)\}$/.exec(part);
        return m && m[1]! in values ? <Fragment key={i}>{values[m[1]!]}</Fragment> : part;
      })}
    </>
  );
}
