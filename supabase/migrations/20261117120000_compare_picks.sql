-- Pip's pick on the Compare screen: the answers kept so the AI is asked once per pair of products (founder 2026-11-17: "if someone compares the same two products, you
-- should have saved what the AI thinks, so that we don't have to use the AI API key again").
--
-- What this adds, and ONLY this: one table. Nothing is touched in the tables that already exist.
--
--   compare_picks  one row per answer: `key` is a SHA-256 of the two products (their keys, names and every figure shown, in a fixed order), the goal and the diet words,
--                  so the same two products with the same figures give the same key whichever one was added first; `pick` is { pick: 0 | 1 | "tie", sentence, reasons: [..] }
--                  in that fixed order. It holds NO email, user id, IP address or anything about a person: a product pair, a goal and a sentence.
--
-- Same security model as every other table (docs/BACKEND.md): the app and the website never talk to Supabase directly; only the Vercel API does, with the server-only
-- secret key; RLS is on with NO policies and anon/authenticated privileges are revoked, so the publishable key can read or write nothing.
-- The route works before this is applied (a missing table is just a miss, said once in the log), and rows can be deleted at any time: the next compare asks the AI again.
--
-- NOT applied by Claude: you read it, then run it in the Supabase SQL Editor (never `supabase db push`).

create table public.compare_picks (
  key        text primary key check (key ~ '^[0-9a-f]{64}$'),
  pick       jsonb not null check (jsonb_typeof(pick) = 'object' and octet_length(pick::text) <= 2000),
  model      text not null check (char_length(model) between 1 and 80),
  created_at timestamptz not null default now()
);
comment on table public.compare_picks is 'Pip''s pick answers kept for reuse: a hash of two products + goal + diet words, and the answer. No personal data. Written only by the API.';

alter table public.compare_picks enable row level security;
revoke all on public.compare_picks from anon, authenticated;
