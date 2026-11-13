-- Paid access: who has paid, for what, until when (founder's brief of 13 Nov 2026; docs/PAYMENTS.md).
--
-- What this adds, and ONLY this: one table and one view. Nothing is touched in the tables that already exist.
--
--   pro_entitlements  one row per payment that gives access: the buyer's email address, the plan, the dates, the Stripe ids needed to follow renewals and refunds,
--                     the creator code that sent the buyer (for the payout report) and the amount. NO card detail is stored: Stripe keeps that.
--   creator_sales (view)  per creator code: how many payments and how much, for paying creators by hand. YOU read it in Supabase.
--
-- Same security model as every other table (docs/BACKEND.md): the app and the website never talk to Supabase directly; only the Vercel API does, with the
-- server-only secret key; RLS is on with NO policies and anon/authenticated privileges are revoked, so the publishable key can read or write nothing.
-- Rows are written only by the Stripe webhook and the success page's claim (lib/payments/), and read only to give a signed-in person their own access back.
--
-- Apple's In-App Purchase (the iPhone app) writes rows of source 'apple' with the same shape through the same API (docs/PAYMENTS.md "iPhone app").
--
-- NOT applied by Claude: you read it, then run it in the Supabase SQL Editor (never `supabase db push`).

create table public.pro_entitlements (
  id                            uuid primary key default gen_random_uuid(),
  email                         text not null,
  source                        text not null check (source in ('stripe', 'apple')),
  plan                          text not null check (plan in ('pass90', 'annual', 'monthly')),
  status                        text not null default 'active' check (status in ('active', 'cancelled', 'refunded', 'expired')),
  started_at                    timestamptz not null default now(),
  expires_at                    timestamptz not null,
  stripe_session_id             text,
  stripe_customer_id            text,
  stripe_subscription_id        text,
  stripe_payment_intent_id      text,
  apple_original_transaction_id text,
  ref                           text,
  amount_pence                  integer,
  currency                      text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint pro_entitlements_email_format check (email = lower(email) and char_length(email) between 3 and 254 and email like '%_@_%'),
  constraint pro_entitlements_ref_format check (ref is null or ref ~ '^[a-z0-9_-]{2,32}$'),
  constraint pro_entitlements_amount_sane check (amount_pence is null or amount_pence between 0 and 100000),
  constraint pro_entitlements_dates check (expires_at >= started_at),
  constraint pro_entitlements_one_source check (
    (source = 'stripe' and stripe_session_id is not null) or (source = 'apple' and apple_original_transaction_id is not null)
  )
);
comment on table public.pro_entitlements is 'Paid access: one row per payment that gives access. Holds an email address and Stripe ids, never card detail. Written only by the API.';

create unique index pro_entitlements_stripe_session_key on public.pro_entitlements (stripe_session_id) where stripe_session_id is not null;
create unique index pro_entitlements_apple_txn_key on public.pro_entitlements (apple_original_transaction_id) where apple_original_transaction_id is not null;
create index pro_entitlements_email_idx on public.pro_entitlements (email, expires_at desc);
create index pro_entitlements_subscription_idx on public.pro_entitlements (stripe_subscription_id) where stripe_subscription_id is not null;
create index pro_entitlements_payment_intent_idx on public.pro_entitlements (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

create or replace function public.pro_entitlements_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger pro_entitlements_touch before update on public.pro_entitlements for each row execute function public.pro_entitlements_touch();

alter table public.pro_entitlements enable row level security;
revoke all on public.pro_entitlements from anon, authenticated;

-- The payout report: creators are paid by hand from this (Stripe Checkout cannot split a payment). Refunded payments are left out.
create view public.creator_sales as
  select ref,
         count(*)                         as payments,
         sum(coalesce(amount_pence, 0))   as pence_taken,
         min(created_at)                  as first_sale,
         max(created_at)                  as last_sale
    from public.pro_entitlements
   where ref is not null and status <> 'refunded'
   group by ref
   order by pence_taken desc;
revoke all on public.creator_sales from anon, authenticated;
comment on view public.creator_sales is 'Per creator code: payments and pence taken, for paying creators by hand. Read it in the Supabase dashboard.';
