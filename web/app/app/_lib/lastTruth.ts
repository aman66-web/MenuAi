// The most recent Truth card's WhatsApp message in this page view (memory only, nothing stored), so the paywall's "share to unlock" can offer a real Smart Swap to
// share rather than a generic line. Absent until a Truth card has been opened.
let last: string | null = null;
export const setLastTruthMessage = (m: string | null) => { last = m; };
export const getLastTruthMessage = (): string | null => last;
