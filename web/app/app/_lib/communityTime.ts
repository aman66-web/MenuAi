/** When something was sent, short and in the person's own language and order ("16 Oct, 14:05"): the browser's date formatting, so no wording of ours is needed. */
export function whenSent(iso: string, htmlLang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(htmlLang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  } catch {
    return iso.slice(0, 10);
  }
}
