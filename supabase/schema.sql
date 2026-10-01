-- =====================================================================
-- Find My Schemes — Supabase schema  (v2: OTP auth + wallet + report requests)
--
-- Run once on a NEW project: Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS).
--
-- Money rules live in the DATABASE, not the browser, so nobody can edit the
-- page to pay ₹0. Change prices in `app_settings` / `wallet_packs` (section 1).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. SETTINGS & PRICING  (single source of truth)
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('report_price',    '499',        'Wallet amount (INR) deducted for one report'),
  ('payment_mode',    '"dummy"',    'dummy | razorpay — dummy lets the test checkout credit the wallet'),
  ('generation_mode', '"manual"',   'manual = team emails the report; ai = backend AI generates it'),
  ('delivery_sla_hours', '24',      'Promised delivery time shown to customers')
on conflict (key) do nothing;

create table if not exists public.wallet_packs (
  id          text primary key,                 -- e.g. 'starter'
  name        text not null,
  amount      numeric(12,2) not null check (amount > 0),   -- what the customer pays
  bonus       numeric(12,2) not null default 0 check (bonus >= 0), -- extra credit (future offers)
  description text,
  sort_order  int not null default 0,
  active      boolean not null default true
);

insert into public.wallet_packs (id, name, amount, bonus, description, sort_order) values
  ('starter', 'Starter', 499,  0, '1 scheme report',  1),
  ('growth',  'Growth',  1499, 0, '3 scheme reports', 2),
  ('pro',     'Pro',     2499, 0, '5 scheme reports', 3)
on conflict (id) do nothing;

-- helper to read a numeric setting
create or replace function public.setting_num(p_key text)
returns numeric language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::numeric from public.app_settings where key = p_key
$$;
create or replace function public.setting_text(p_key text)
returns text language sql stable security definer set search_path = '' as $$
  select value #>> '{}' from public.app_settings where key = p_key
$$;

-- ---------------------------------------------------------------------
-- 2. PROFILES + WALLETS  (created automatically at sign-up)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  full_name      text,
  mobile         text,
  business_name  text,
  role           text not null default 'customer' check (role in ('customer', 'admin')),
  mobile_verified boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  balance    numeric(12,2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, mobile, business_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'mobile', new.phone),
    new.raw_user_meta_data ->> 'business_name'
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3. PAYMENTS (one row per recharge attempt, any gateway)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  payment_code       text unique not null default ('PAY-' || upper(substr(md5(random()::text), 1, 8))),
  user_id            uuid not null references auth.users (id) on delete cascade,
  pack_id            text references public.wallet_packs (id),
  amount             numeric(12,2) not null check (amount > 0),   -- charged
  credit_amount      numeric(12,2) not null check (credit_amount > 0), -- added to wallet (amount + bonus)
  currency           text not null default 'INR',
  gateway            text not null default 'dummy',               -- dummy | razorpay | cashfree
  gateway_order_id   text,
  gateway_payment_id text,
  status             text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  gateway_response   jsonb,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz
);
create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_pack_id_idx on public.payments (pack_id);
create unique index if not exists payments_gateway_payment_uidx
  on public.payments (gateway, gateway_payment_id) where gateway_payment_id is not null;

-- ---------------------------------------------------------------------
-- 4. REPORTS  (= a customer's report request and, later, its result)
--    Lifecycle: submitted → processing → ready   (or failed → refunded)
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  report_code      text unique not null default ('RPT-' || upper(substr(md5(random()::text), 1, 6))),
  user_id          uuid not null references auth.users (id) on delete cascade,

  -- what the customer submitted
  form_version     int  not null default 1,
  inputs           jsonb not null,                 -- every form answer, as submitted
  business_name    text not null,                  -- copied out of inputs for lists/search
  industry         text,
  state            text,
  delivery_email   text not null,

  -- money
  price_charged    numeric(12,2) not null,

  -- progress
  status           text not null default 'submitted'
                   check (status in ('submitted', 'processing', 'ready', 'failed', 'refunded')),
  generation_mode  text not null default 'manual' check (generation_mode in ('manual', 'ai')),
  assigned_to      uuid references auth.users (id),   -- team member handling it (manual mode)
  status_note      text,                               -- message shown to the customer

  -- result (filled by the team today, by AI later)
  summary          text,
  schemes_found    int,
  potential_benefit text,
  high_matches     int,
  report_file_path text,       -- Storage path '<user_id>/<report_code>.pdf'  or a full https URL
  delivered_at     timestamptz,

  -- AI bookkeeping (unused until AI goes live)
  ai_model          text,
  ai_prompt_version text,
  ai_input_tokens   int,
  ai_output_tokens  int,
  ai_raw_output     jsonb,
  ai_error          text,
  attempts          int not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists reports_user_id_idx  on public.reports (user_id);
create index if not exists reports_status_idx   on public.reports (status, created_at);
create index if not exists reports_assigned_idx on public.reports (assigned_to);

-- ---------------------------------------------------------------------
-- 5. WALLET LEDGER  (append-only history of every rupee in or out)
-- ---------------------------------------------------------------------
create table if not exists public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  txn_code      text unique not null default ('TXN-' || upper(substr(md5(random()::text), 1, 8))),
  user_id       uuid not null references auth.users (id) on delete cascade,
  direction     text not null check (direction in ('credit', 'debit')),
  amount        numeric(12,2) not null check (amount > 0),
  balance_after numeric(12,2) not null check (balance_after >= 0),
  reason        text not null check (reason in ('recharge', 'report', 'refund', 'adjustment')),
  payment_id    uuid references public.payments (id),
  report_id     uuid references public.reports (id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists wallet_txn_user_idx    on public.wallet_transactions (user_id, created_at desc);
create index if not exists wallet_txn_payment_idx on public.wallet_transactions (payment_id);
create index if not exists wallet_txn_report_idx  on public.wallet_transactions (report_id);

-- ---------------------------------------------------------------------
-- 6. SCHEMES CATALOG  (master list — the AI will match against this later)
-- ---------------------------------------------------------------------
create table if not exists public.schemes (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  short_name        text,
  govt_level        text check (govt_level in ('Central Govt', 'State Govt')),
  state             text,              -- null for Central schemes
  ministry          text,
  sectors           text[],
  benefit_type      text,              -- Subsidy | Loan | Grant | Tax incentive | Other
  benefit_summary   text,
  eligibility       jsonb,             -- structured rules, for AI / filters
  documents_required text[],
  official_url      text,
  active            boolean not null default true,
  last_verified_at  date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists schemes_state_idx on public.schemes (state);

-- schemes matched inside one report
create table if not exists public.report_schemes (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports (id) on delete cascade,
  scheme_id   uuid references public.schemes (id),   -- optional link to the catalog
  name        text not null,
  govt_level  text check (govt_level in ('Central Govt', 'State Govt')),
  sector      text,
  description text,
  benefit     text,
  match_score int check (match_score between 0 and 100),
  why_eligible text,
  next_steps   text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists report_schemes_report_idx on public.report_schemes (report_id);
create index if not exists report_schemes_scheme_idx on public.report_schemes (scheme_id);

-- status history for every report (who/what changed it and when)
create table if not exists public.report_events (
  id         bigint generated always as identity primary key,
  report_id  uuid not null references public.reports (id) on delete cascade,
  status     text not null,
  note       text,
  actor      text not null default 'system',   -- customer | team | ai | system
  created_at timestamptz not null default now()
);
create index if not exists report_events_report_idx on public.report_events (report_id, created_at);

-- keep timestamps right (before save) ...
create or replace function public.touch_report()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'ready' and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists reports_touch on public.reports;
create trigger reports_touch
  before insert or update on public.reports
  for each row execute function public.touch_report();

-- ... and log every status change (after save; works for table-editor edits too)
create or replace function public.log_report_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.report_events (report_id, status, note, actor)
    values (new.id, new.status, new.status_note,
            case when auth.uid() = new.user_id then 'customer'
                 when auth.uid() is null then 'team' else 'system' end);
  end if;
  return null;
end;
$$;
drop trigger if exists reports_status_log on public.reports;
create trigger reports_status_log
  after insert or update on public.reports
  for each row execute function public.log_report_status();

-- ---------------------------------------------------------------------
-- 7. APPLICATIONS & QUERIES  (unchanged from v1)
-- ---------------------------------------------------------------------
create table if not exists public.applications (
  id          uuid primary key default gen_random_uuid(),
  app_code    text unique not null default ('APP-' || upper(substr(md5(random()::text), 1, 6))),
  user_id     uuid not null references auth.users (id) on delete cascade,
  report_id   uuid references public.reports (id) on delete set null,
  scheme_name text not null,
  status      text not null default 'Documents Required'
              check (status in ('Documents Required', 'Submitted', 'Approved', 'Rejected')),
  created_at  timestamptz not null default now()
);
create index if not exists applications_user_id_idx   on public.applications (user_id);
create index if not exists applications_report_id_idx on public.applications (report_id);

create table if not exists public.queries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  report_id   uuid references public.reports (id) on delete set null,
  subject     text not null,
  message     text not null,
  status      text not null default 'Open' check (status in ('Open', 'Resolved')),
  admin_reply text,
  created_at  timestamptz not null default now()
);
create index if not exists queries_user_id_idx   on public.queries (user_id);
create index if not exists queries_report_id_idx on public.queries (report_id);

-- =====================================================================
-- 8. ROW LEVEL SECURITY — customers read only their own rows.
--    Every money / status change goes through the functions in section 9.
-- =====================================================================
alter table public.app_settings        enable row level security;
alter table public.wallet_packs        enable row level security;
alter table public.profiles            enable row level security;
alter table public.wallets             enable row level security;
alter table public.payments            enable row level security;
alter table public.reports             enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.schemes             enable row level security;
alter table public.report_schemes      enable row level security;
alter table public.report_events       enable row level security;
alter table public.applications        enable row level security;
alter table public.queries             enable row level security;

drop policy if exists "settings: public read" on public.app_settings;
create policy "settings: public read" on public.app_settings for select to anon, authenticated using (true);

drop policy if exists "packs: public read" on public.wallet_packs;
create policy "packs: public read" on public.wallet_packs for select to anon, authenticated using (active);

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "wallets: read own" on public.wallets;
create policy "wallets: read own" on public.wallets for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "payments: read own" on public.payments;
create policy "payments: read own" on public.payments for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "reports: read own" on public.reports;
create policy "reports: read own" on public.reports for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "wallet_txn: read own" on public.wallet_transactions;
create policy "wallet_txn: read own" on public.wallet_transactions for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "schemes: read active" on public.schemes;
create policy "schemes: read active" on public.schemes for select to authenticated using (active);

drop policy if exists "report_schemes: read own" on public.report_schemes;
create policy "report_schemes: read own" on public.report_schemes for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id and r.user_id = (select auth.uid())));

drop policy if exists "report_events: read own" on public.report_events;
create policy "report_events: read own" on public.report_events for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id and r.user_id = (select auth.uid())));

drop policy if exists "applications: read own" on public.applications;
create policy "applications: read own" on public.applications for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "applications: create own" on public.applications;
create policy "applications: create own" on public.applications for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'Documents Required');

drop policy if exists "queries: read own" on public.queries;
create policy "queries: read own" on public.queries for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "queries: create own" on public.queries;
create policy "queries: create own" on public.queries for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'Open' and admin_reply is null);

-- customers may edit only these profile columns
revoke update on public.profiles from authenticated;
grant update (full_name, mobile, business_name) on public.profiles to authenticated;

-- =====================================================================
-- 9. FUNCTIONS (the only way money and reports change)
-- =====================================================================

-- 9a. Start a recharge: creates a payment row priced from wallet_packs
create or replace function public.create_payment_order(p_pack_id text)
returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_pack public.wallet_packs;
  v_pay  public.payments;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select * into v_pack from public.wallet_packs where id = p_pack_id and active;
  if not found then raise exception 'INVALID_PACK'; end if;

  insert into public.payments (user_id, pack_id, amount, credit_amount, gateway)
  values (v_uid, v_pack.id, v_pack.amount, v_pack.amount + v_pack.bonus,
          coalesce(public.setting_text('payment_mode'), 'dummy'))
  returning * into v_pay;

  -- TODO (Razorpay): an Edge Function creates the Razorpay order and stores gateway_order_id
  return v_pay;
end;
$$;

-- 9b. Mark a payment paid and credit the wallet (idempotent).
--     Called by the payment webhook (service role) — NOT callable from the browser.
create or replace function public.credit_payment(
  p_payment_id         uuid,
  p_gateway_payment_id text default null,
  p_gateway_response   jsonb default null
)
returns public.wallets
language plpgsql security definer set search_path = '' as $$
declare
  v_pay    public.payments;
  v_wallet public.wallets;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  if v_pay.status = 'paid' then           -- already credited: do nothing
    select * into v_wallet from public.wallets where user_id = v_pay.user_id;
    return v_wallet;
  end if;
  if v_pay.status <> 'created' then raise exception 'PAYMENT_NOT_PAYABLE'; end if;

  update public.payments
     set status = 'paid', paid_at = now(),
         gateway_payment_id = coalesce(p_gateway_payment_id, gateway_payment_id),
         gateway_response   = coalesce(p_gateway_response, gateway_response)
   where id = v_pay.id;

  insert into public.wallets (user_id) values (v_pay.user_id) on conflict (user_id) do nothing;
  update public.wallets
     set balance = balance + v_pay.credit_amount, updated_at = now()
   where user_id = v_pay.user_id
   returning * into v_wallet;

  insert into public.wallet_transactions (user_id, direction, amount, balance_after, reason, payment_id, note)
  values (v_pay.user_id, 'credit', v_pay.credit_amount, v_wallet.balance, 'recharge', v_pay.id,
          'Wallet recharge ' || v_pay.payment_code);

  return v_wallet;
end;
$$;

-- 9c. TEST ONLY: the dummy checkout. Works only while payment_mode = 'dummy'.
create or replace function public.dummy_confirm_payment(p_payment_id uuid)
returns public.wallets
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(public.setting_text('payment_mode'), 'dummy') <> 'dummy' then
    raise exception 'DUMMY_PAYMENTS_DISABLED';
  end if;
  if not exists (select 1 from public.payments
                 where id = p_payment_id and user_id = v_uid and gateway = 'dummy') then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  return public.credit_payment(p_payment_id, 'dummy_' || replace(gen_random_uuid()::text, '-', ''),
                               jsonb_build_object('simulated', true));
end;
$$;

-- 9d. Submit a report request: checks balance, deducts the price, saves the form.
--     All-or-nothing: if the balance is short, nothing is saved or deducted.
create or replace function public.submit_report_request(p_inputs jsonb)
returns public.reports
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_price  numeric(12,2) := coalesce(public.setting_num('report_price'), 499);
  v_wallet public.wallets;
  v_report public.reports;
  v_email  text;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(trim(p_inputs ->> 'business_name'), '') = '' then raise exception 'BUSINESS_NAME_REQUIRED'; end if;

  v_email := coalesce(nullif(trim(p_inputs ->> 'delivery_email'), ''),
                      (select email from public.profiles where id = v_uid));
  if v_email is null then raise exception 'DELIVERY_EMAIL_REQUIRED'; end if;

  -- lock the wallet row so two quick clicks can't spend the same money twice
  select * into v_wallet from public.wallets where user_id = v_uid for update;
  if not found or v_wallet.balance < v_price then
    raise exception 'INSUFFICIENT_BALANCE' using detail = format('Need %s, have %s', v_price, coalesce(v_wallet.balance, 0));
  end if;

  insert into public.reports (user_id, form_version, inputs, business_name, industry, state,
                              delivery_email, price_charged, generation_mode)
  values (v_uid, coalesce((p_inputs ->> 'form_version')::int, 1), p_inputs,
          trim(p_inputs ->> 'business_name'), p_inputs ->> 'industry', p_inputs ->> 'state',
          v_email, v_price, coalesce(public.setting_text('generation_mode'), 'manual'))
  returning * into v_report;

  update public.wallets set balance = balance - v_price, updated_at = now()
   where user_id = v_uid returning * into v_wallet;

  insert into public.wallet_transactions (user_id, direction, amount, balance_after, reason, report_id, note)
  values (v_uid, 'debit', v_price, v_wallet.balance, 'report', v_report.id,
          'Scheme report ' || v_report.report_code);

  return v_report;
end;
$$;

-- 9e. TEAM: refund a report back to the wallet (e.g. could not be delivered)
create or replace function public.refund_report(p_report_id uuid, p_note text default null)
returns public.wallets
language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports;
  v_wallet public.wallets;
begin
  select * into v_report from public.reports where id = p_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if v_report.status = 'refunded' then raise exception 'ALREADY_REFUNDED'; end if;

  update public.reports set status = 'refunded', status_note = coalesce(p_note, 'Amount refunded to wallet')
   where id = p_report_id;

  update public.wallets set balance = balance + v_report.price_charged, updated_at = now()
   where user_id = v_report.user_id returning * into v_wallet;

  insert into public.wallet_transactions (user_id, direction, amount, balance_after, reason, report_id, note)
  values (v_report.user_id, 'credit', v_report.price_charged, v_wallet.balance, 'refund', v_report.id,
          coalesce(p_note, 'Refund for ' || v_report.report_code));
  return v_wallet;
end;
$$;

-- who can call what
revoke execute on function public.create_payment_order(text)        from public, anon;
revoke execute on function public.dummy_confirm_payment(uuid)       from public, anon;
revoke execute on function public.submit_report_request(jsonb)      from public, anon;
revoke execute on function public.credit_payment(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.refund_report(uuid, text)         from public, anon, authenticated;
revoke execute on function public.handle_new_user()                 from public, anon, authenticated;
revoke execute on function public.log_report_status()              from public, anon, authenticated;
revoke execute on function public.touch_report()                   from public, anon, authenticated;
revoke execute on function public.setting_num(text)                 from public, anon, authenticated;
revoke execute on function public.setting_text(text)                from public, anon, authenticated;
grant  execute on function public.create_payment_order(text)        to authenticated;
grant  execute on function public.dummy_confirm_payment(uuid)       to authenticated;
grant  execute on function public.submit_report_request(jsonb)      to authenticated;

-- =====================================================================
-- 10. STORAGE — private bucket for report PDFs.
--     Team uploads to:  reports / <customer user_id> / <report_code>.pdf
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

drop policy if exists "reports bucket: read own" on storage.objects;
create policy "reports bucket: read own" on storage.objects for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
