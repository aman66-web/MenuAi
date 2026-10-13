// A small in-memory limit per caller and bucket (per server instance, like Pip's recipe limiter). It slows down guessing and email floods;
// Supabase has its own limits too (one email code per minute per address, an hourly cap on emails).
export type Limit = (bucket: string, who: string, max: number, windowMs: number) => boolean;

export function makeLimit(now: () => number = () => Date.now()): Limit {
  const seen = new Map<string, number[]>();
  return (bucket, who, max, windowMs) => {
    const t = now();
    const key = `${bucket}\u0000${who}`;
    const recent = (seen.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) {
      seen.set(key, recent);
      return false;
    }
    recent.push(t);
    seen.set(key, recent);
    if (seen.size > 20_000) seen.delete(seen.keys().next().value as string);
    return true;
  };
}
