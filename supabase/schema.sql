-- =====================================================================
-- Find My Schemes — Supabase schema (v3)
--   • Login: mobile number verified by Phone.Email (Edge Function `phone-login`)
--   • Payments: taken OUTSIDE the platform; admins mark each report Paid
--   • Admin panel: only mobile numbers in `admin_phones`
--
-- Fresh project:  SQL Editor → paste this whole file → Run.
-- Existing v1/v2 test project:  run reset.sql first, then this file.
-- Safe to re-run.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. SETTINGS
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('report_price',       '499',      'Price (INR) of one scheme report — shown to customers and recorded on each request'),
  ('delivery_sla_hours', '24',       'Delivery promise in hours, counted from payment confirmation'),
  ('generation_mode',    '"manual"', 'manual = team prepares the report; ai = backend AI (later)'),
  ('payment_instructions',
   to_jsonb('Pay ₹499 by UPI to yourname@upi or by bank transfer (A/c 000000000000, IFSC ABCD0000000, Find My Schemes). Mention your Request ID in the payment note. We start as soon as the payment is confirmed.'::text),
   'Shown to customers after they submit a request. Edit in Admin → Settings.')
on conflict (key) do nothing;

-- settings from older versions that no longer apply
delete from public.app_settings where key in ('payment_mode', 'admin_otp_mode');

create or replace function public.setting_num(p_key text)
returns numeric language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::numeric from public.app_settings where key = p_key
$$;
create or replace function public.setting_text(p_key text)
returns text language sql stable security definer set search_path = '' as $$
  select value #>> '{}' from public.app_settings where key = p_key
$$;

-- ---------------------------------------------------------------------
-- 2. ADMIN MOBILE NUMBERS (digits with country code, e.g. 919876543210)
-- ---------------------------------------------------------------------
create table if not exists public.admin_phones (
  phone      text primary key check (phone ~ '^[0-9]{10,15}$'),
  name       text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
-- SUPER ADMINS — hard-coded. Always admin; cannot be switched off or removed (from the panel or SQL).
-- To change this list, edit it here and in supabase/functions/phone-login/index.ts, then re-run.
create or replace function public.super_admin_phones()
returns text[] language sql immutable as $$
  select array['919121422554', '918500676890']
$$;

insert into public.admin_phones (phone, name, active)
select p, 'Super admin', true from unnest(public.super_admin_phones()) as p
on conflict (phone) do update set active = true;

-- the old placeholder number is not needed any more
delete from public.admin_phones where phone = '919999999999' and name = 'Placeholder admin';

create or replace function public.protect_super_admins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.phone = any(public.super_admin_phones()) then
    raise exception 'SUPER_ADMIN_LOCKED';
  end if;
  if tg_op = 'UPDATE' and old.phone = any(public.super_admin_phones())
     and (new.phone <> old.phone or new.active is not true) then
    raise exception 'SUPER_ADMIN_LOCKED';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists admin_phones_protect_super on public.admin_phones;
create trigger admin_phones_protect_super
  before update or delete on public.admin_phones
  for each row execute function public.protect_super_admins();

-- ---------------------------------------------------------------------
-- 3. PROFILES (one per account; created automatically)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,           -- report-delivery email (NOT the login)
  full_name     text,
  mobile        text,           -- verified mobile = the login, digits e.g. 919876543210
  business_name text,
  role          text not null default 'customer' check (role in ('customer', 'admin')),
  is_internal   boolean not null default false,   -- admin accounts: hidden from customer analytics
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.profiles add column if not exists is_internal boolean not null default false;

create unique index if not exists profiles_mobile_uidx on public.profiles (mobile) where mobile is not null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_mobile text  := nullif(regexp_replace(coalesce(new.raw_app_meta_data ->> 'verified_phone',
                                                   v_meta ->> 'mobile', new.phone, ''), '\D', '', 'g'), '');
begin
  if v_mobile ~ '^[6-9][0-9]{9}$' then v_mobile := '91' || v_mobile; end if;
  insert into public.profiles (id, email, full_name, mobile, business_name, is_internal)
  values (
    new.id,
    lower(nullif(trim(v_meta ->> 'contact_email'), '')),
    nullif(trim(v_meta ->> 'full_name'), ''),
    v_mobile,
    nullif(trim(v_meta ->> 'business_name'), ''),
    v_mobile = any(public.super_admin_phones())
      or exists (select 1 from public.admin_phones where phone = v_mobile)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. REPORTS (= a customer's request, its manual payment, and the result)
--    status:          submitted → processing → ready      (or cancelled)
--    payment_status:  awaiting  → paid                     (or waived / refunded)
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id                uuid primary key default gen_random_uuid(),
  report_code       text unique not null default ('RPT-' || upper(substr(md5(random()::text), 1, 6))),
  user_id           uuid not null references auth.users (id) on delete cascade,

  -- what the customer submitted
  form_version      int  not null default 1,
  inputs            jsonb not null,
  business_name     text not null,
  industry          text,
  state             text,
  delivery_email    text not null,

  -- manual payment (outside the platform)
  amount_due        numeric(12,2) not null,
  payment_status    text not null default 'awaiting'
                    check (payment_status in ('awaiting', 'paid', 'waived', 'refunded')),
  amount_paid       numeric(12,2),
  payment_method    text,            -- UPI / Bank transfer / Cash / Card / Other
  payment_reference text,            -- UTR / transaction ID
  payment_note      text,
  paid_at           timestamptz,

  -- progress
  status            text not null default 'submitted'
                    check (status in ('submitted', 'processing', 'ready', 'cancelled')),
  generation_mode   text not null default 'manual' check (generation_mode in ('manual', 'ai')),
  assigned_to       uuid references auth.users (id),
  status_note       text,

  -- result
  summary           text,
  schemes_found     int,
  potential_benefit text,
  high_matches      int,
  report_file_path  text,
  delivered_at      timestamptz,

  -- AI bookkeeping (later)
  ai_model          text,
  ai_prompt_version text,
  ai_input_tokens   int,
  ai_output_tokens  int,
  ai_raw_output     jsonb,
  ai_error          text,
  attempts          int not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists reports_user_id_idx  on public.reports (user_id);
create index if not exists reports_status_idx   on public.reports (status, created_at);
create index if not exists reports_payment_idx  on public.reports (payment_status, created_at);
create index if not exists reports_assigned_idx on public.reports (assigned_to);

-- ---------------------------------------------------------------------
-- 5. SCHEMES CATALOG, MATCHED SCHEMES, HISTORY
-- ---------------------------------------------------------------------
create table if not exists public.schemes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  short_name         text,
  govt_level         text check (govt_level in ('Central Govt', 'State Govt')),
  state              text,
  ministry           text,
  sectors            text[],
  benefit_type       text,
  benefit_summary    text,
  eligibility        jsonb,
  documents_required text[],
  official_url       text,
  active             boolean not null default true,
  last_verified_at   date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists schemes_state_idx on public.schemes (state);

create table if not exists public.report_schemes (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports (id) on delete cascade,
  scheme_id    uuid references public.schemes (id),
  name         text not null,
  govt_level   text check (govt_level in ('Central Govt', 'State Govt')),
  sector       text,
  description  text,
  benefit      text,
  match_score  int check (match_score between 0 and 100),
  why_eligible text,
  next_steps   text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists report_schemes_report_idx on public.report_schemes (report_id);
create index if not exists report_schemes_scheme_idx on public.report_schemes (scheme_id);

create table if not exists public.report_events (
  id         bigint generated always as identity primary key,
  report_id  uuid not null references public.reports (id) on delete cascade,
  kind       text not null default 'status' check (kind in ('status', 'payment')),
  status     text not null,
  note       text,
  actor      text not null default 'system',
  created_at timestamptz not null default now()
);
alter table public.report_events add column if not exists kind text not null default 'status';
create index if not exists report_events_report_idx on public.report_events (report_id, created_at);

create or replace function public.touch_report()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'ready' and new.delivered_at is null then new.delivered_at := now(); end if;
  if new.payment_status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
    new.amount_paid := coalesce(new.amount_paid, new.amount_due);
  elsif new.payment_status = 'awaiting' then
    new.paid_at := null; new.amount_paid := null;
  end if;
  return new;
end;
$$;
drop trigger if exists reports_touch on public.reports;
create trigger reports_touch before insert or update on public.reports
  for each row execute function public.touch_report();

create or replace function public.log_report_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor text := case when auth.uid() = new.user_id then 'customer'
                             when auth.uid() is null then 'system' else 'team' end;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.report_events (report_id, kind, status, note, actor)
    values (new.id, 'status', new.status, new.status_note, v_actor);
  end if;
  if tg_op = 'INSERT' or new.payment_status is distinct from old.payment_status then
    insert into public.report_events (report_id, kind, status, note, actor)
    values (new.id, 'payment', new.payment_status,
            nullif(concat_ws(' · ', new.payment_method, new.payment_reference), ''), v_actor);
  end if;
  return null;
end;
$$;
drop trigger if exists reports_status_log on public.reports;
create trigger reports_status_log after insert or update on public.reports
  for each row execute function public.log_report_status();

-- ---------------------------------------------------------------------
-- 6. APPLICATIONS & QUERIES
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

-- Phone.Email confirmations already used (stops the same confirmation being replayed)
create table if not exists public.phone_login_used (
  url_hash   text primary key,
  user_id    uuid references auth.users (id) on delete cascade,
  used_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. WHO IS AN ADMIN — only a mobile verified by the server
--    (app_metadata.verified_phone is written by the phone-login Edge Function and
--     cannot be changed from the browser) that is listed in admin_phones.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  with me as (
    select nullif(u.raw_app_meta_data ->> 'verified_phone', '') as vp,
           case when u.phone_confirmed_at is not null
                then nullif(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), '') end as sp
      from auth.users u
     where u.id = auth.uid()
  )
  select exists (
    select 1 from me
     where vp = any(public.super_admin_phones())
        or sp = any(public.super_admin_phones())
        or exists (select 1 from public.admin_phones a where a.active and a.phone in (me.vp, me.sp))
  )
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
     where u.id = auth.uid()
       and (u.raw_app_meta_data ->> 'verified_phone') = any(public.super_admin_phones())
  )
$$;

-- =====================================================================
-- 8. ROW LEVEL SECURITY
-- =====================================================================
alter table public.app_settings     enable row level security;
alter table public.admin_phones     enable row level security;
alter table public.profiles         enable row level security;
alter table public.reports          enable row level security;
alter table public.schemes          enable row level security;
alter table public.report_schemes   enable row level security;
alter table public.report_events    enable row level security;
alter table public.applications     enable row level security;
alter table public.queries          enable row level security;
alter table public.phone_login_used enable row level security;   -- no policies: server only

-- customers
drop policy if exists "settings: public read" on public.app_settings;
create policy "settings: public read" on public.app_settings for select to anon, authenticated using (true);

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "reports: read own" on public.reports;
create policy "reports: read own" on public.reports for select to authenticated using ((select auth.uid()) = user_id);

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

-- admins: read everything
do $$
declare t text;
begin
  foreach t in array array['profiles','reports','schemes','report_schemes','report_events',
                           'applications','queries','admin_phones','app_settings']
  loop
    execute format('drop policy if exists "admin: read all" on public.%I', t);
    execute format('create policy "admin: read all" on public.%I for select to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- column-level write permissions (everything else is read-only from the browser)
revoke update on public.profiles, public.reports, public.queries, public.applications,
                 public.app_settings, public.admin_phones from authenticated;
grant update (full_name, business_name, email) on public.profiles to authenticated;   -- not mobile: it is the login

drop policy if exists "admin: update reports" on public.reports;
create policy "admin: update reports" on public.reports for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant update (status, status_note, assigned_to, summary, schemes_found, potential_benefit, high_matches,
              report_file_path, payment_status, amount_paid, payment_method, payment_reference,
              payment_note, paid_at) on public.reports to authenticated;

drop policy if exists "admin: manage report_schemes" on public.report_schemes;
create policy "admin: manage report_schemes" on public.report_schemes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant insert, update, delete on public.report_schemes to authenticated;

drop policy if exists "admin: update queries" on public.queries;
create policy "admin: update queries" on public.queries for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant update (status, admin_reply) on public.queries to authenticated;

drop policy if exists "admin: update applications" on public.applications;
create policy "admin: update applications" on public.applications for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant update (status) on public.applications to authenticated;

drop policy if exists "admin: manage schemes" on public.schemes;
create policy "admin: manage schemes" on public.schemes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant insert, update, delete on public.schemes to authenticated;

drop policy if exists "admin: manage admin_phones" on public.admin_phones;
create policy "admin: manage admin_phones" on public.admin_phones for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant insert on public.admin_phones to authenticated;
grant update (name, active) on public.admin_phones to authenticated;

drop policy if exists "admin: update settings" on public.app_settings;
create policy "admin: update settings" on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant update (value, updated_at) on public.app_settings to authenticated;

-- =====================================================================
-- 9. ADMIN VIEWS (respect the rules above)
-- =====================================================================
drop view if exists public.admin_payments_v, public.admin_ledger_v;   -- wallet-era views

create or replace view public.admin_customers_v with (security_invoker = true) as
select p.id, p.full_name, p.email, p.mobile, p.business_name, p.created_at,
       (select count(*) from public.reports r where r.user_id = p.id)                           as reports_count,
       (select coalesce(sum(amount_paid), 0) from public.reports r
         where r.user_id = p.id and r.payment_status = 'paid')                                    as total_paid,
       (select coalesce(sum(amount_due), 0) from public.reports r
         where r.user_id = p.id and r.payment_status = 'awaiting' and r.status <> 'cancelled')    as outstanding,
       greatest(p.created_at, (select max(created_at) from public.reports r where r.user_id = p.id)) as last_activity
  from public.profiles p
 where not p.is_internal;

create or replace view public.admin_reports_v with (security_invoker = true) as
select r.*, p.full_name as customer_name, p.email as customer_email, p.mobile as customer_mobile,
       extract(epoch from (coalesce(r.delivered_at, now()) - coalesce(r.paid_at, r.created_at))) / 3600.0 as age_hours
  from public.reports r
  left join public.profiles p on p.id = r.user_id;

create or replace view public.admin_queries_v with (security_invoker = true) as
select q.*, p.full_name as customer_name, p.email as customer_email, p.mobile as customer_mobile
  from public.queries q left join public.profiles p on p.id = q.user_id;

create or replace view public.admin_applications_v with (security_invoker = true) as
select a.*, p.full_name as customer_name, p.email as customer_email, p.mobile as customer_mobile, r.report_code
  from public.applications a
  left join public.profiles p on p.id = a.user_id
  left join public.reports  r on r.id = a.report_id;

revoke all on public.admin_customers_v, public.admin_reports_v, public.admin_queries_v, public.admin_applications_v from anon;
grant select on public.admin_customers_v, public.admin_reports_v, public.admin_queries_v, public.admin_applications_v to authenticated;

-- =====================================================================
-- 10. FUNCTIONS
-- =====================================================================

-- customer submits a request (no money moves here; payment happens outside)
create or replace function public.submit_report_request(p_inputs jsonb)
returns public.reports
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_report public.reports;
  v_email  text;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(trim(p_inputs ->> 'business_name'), '') = '' then raise exception 'BUSINESS_NAME_REQUIRED'; end if;
  v_email := lower(coalesce(nullif(trim(p_inputs ->> 'delivery_email'), ''),
                            (select email from public.profiles where id = v_uid)));
  if v_email is null then raise exception 'DELIVERY_EMAIL_REQUIRED'; end if;

  insert into public.reports (user_id, form_version, inputs, business_name, industry, state,
                              delivery_email, amount_due, generation_mode)
  values (v_uid, coalesce((p_inputs ->> 'form_version')::int, 1), p_inputs,
          trim(p_inputs ->> 'business_name'), p_inputs ->> 'industry', p_inputs ->> 'state',
          v_email, coalesce(public.setting_num('report_price'), 499),
          coalesce(public.setting_text('generation_mode'), 'manual'))
  returning * into v_report;
  return v_report;
end;
$$;

-- analytics for the admin dashboard. p_days: 7 / 30 / 90 / 365 / 0 (= all time). Days in IST.
create or replace function public.admin_analytics(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz    text := 'Asia/Kolkata';
  v_today date := (now() at time zone v_tz)::date;
  v_from  date;
  v_start timestamptz;
  v_sla   numeric := coalesce(public.setting_num('delivery_sla_hours'), 24);
  v_out   jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if coalesce(p_days, 0) <= 0 then
    v_from := coalesce((select min((created_at at time zone v_tz)::date) from public.profiles where not is_internal), v_today);
  else
    v_from := v_today - (p_days - 1);
  end if;
  v_start := v_from::timestamp at time zone v_tz;

  with
  cust as (select id, created_at from public.profiles where not is_internal),
  rep  as (select * from public.reports where user_id in (select id from cust)),
  paid as (select * from rep where payment_status = 'paid'),
  open_work as (select * from rep where status in ('submitted', 'processing') and payment_status in ('paid', 'waived')),
  days as (select generate_series(v_from, v_today, interval '1 day')::date as d)
  select jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_today, 'days', (v_today - v_from) + 1),
    'kpis', jsonb_build_object(
      'customers_total',      (select count(*) from cust),
      'customers_new',        (select count(*) from cust where created_at >= v_start),
      'revenue',              (select coalesce(sum(amount_paid), 0) from paid where paid_at >= v_start),
      'revenue_total',        (select coalesce(sum(amount_paid), 0) from paid),
      'payments',             (select count(*) from paid where paid_at >= v_start),
      'paying_customers',     (select count(distinct user_id) from paid where paid_at >= v_start),
      'reports',              (select count(*) from rep where created_at >= v_start),
      'awaiting_count',       (select count(*) from rep where payment_status = 'awaiting' and status <> 'cancelled'),
      'awaiting_amount',      (select coalesce(sum(amount_due), 0) from rep where payment_status = 'awaiting' and status <> 'cancelled'),
      'open_queue',           (select count(*) from open_work),
      'overdue',              (select count(*) from open_work
                                where coalesce(paid_at, created_at) < now() - make_interval(hours => v_sla::int)),
      'avg_turnaround_hours', (select round(avg(extract(epoch from (delivered_at - coalesce(paid_at, created_at))) / 3600.0)::numeric, 1)
                                 from rep where status = 'ready' and delivered_at >= v_start),
      'on_time_pct',          (select round(100.0 * avg(case when delivered_at - coalesce(paid_at, created_at)
                                                                   <= make_interval(hours => v_sla::int) then 1 else 0 end), 0)
                                 from rep where status = 'ready' and delivered_at >= v_start),
      'refunded',             (select coalesce(sum(amount_paid), 0) from rep where payment_status = 'refunded' and updated_at >= v_start),
      'cancelled',            (select count(*) from rep where status = 'cancelled' and updated_at >= v_start),
      'open_queries',         (select count(*) from public.queries where status = 'Open'),
      'sla_hours',            v_sla
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d,
               'revenue', (select coalesce(sum(amount_paid), 0) from paid where (paid_at at time zone v_tz)::date = d),
               'signups', (select count(*) from cust where (created_at at time zone v_tz)::date = d),
               'reports', (select count(*) from rep  where (created_at at time zone v_tz)::date = d)
             ) order by d), '[]'::jsonb) from days
    ),
    'reports_by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) n from rep where created_at >= v_start group by status) s),
    'reports_by_payment', (
      select coalesce(jsonb_object_agg(payment_status, n), '{}'::jsonb)
        from (select payment_status, count(*) n from rep where created_at >= v_start group by payment_status) s),
    'by_method', (
      select coalesce(jsonb_agg(jsonb_build_object('label', k, 'value', n, 'amount', amt) order by amt desc), '[]'::jsonb)
        from (select coalesce(nullif(payment_method, ''), 'Not recorded') k, count(*) n, sum(amount_paid) amt
                from paid where paid_at >= v_start group by 1) x),
    'by_industry', (
      select coalesce(jsonb_agg(jsonb_build_object('label', k, 'value', n) order by n desc, k), '[]'::jsonb)
        from (select coalesce(nullif(industry, ''), 'Not given') k, count(*) n from rep
               where created_at >= v_start group by 1 order by 2 desc limit 10) x),
    'by_state', (
      select coalesce(jsonb_agg(jsonb_build_object('label', k, 'value', n) order by n desc, k), '[]'::jsonb)
        from (select coalesce(nullif(state, ''), 'Not given') k, count(*) n from rep
               where created_at >= v_start group by 1 order by 2 desc limit 10) x),
    'by_purpose', (
      select coalesce(jsonb_agg(jsonb_build_object('label', k, 'value', n) order by n desc, k), '[]'::jsonb)
        from (select p.k, count(*) n
                from rep, jsonb_array_elements_text(coalesce(rep.inputs -> 'purpose', '[]'::jsonb)) as p(k)
               where rep.created_at >= v_start group by 1 order by 2 desc limit 10) x),
    'funnel', jsonb_build_object(
      'signed_up', (select count(*) from cust where created_at >= v_start),
      'requested', (select count(*) from cust c where c.created_at >= v_start and exists (select 1 from rep where rep.user_id = c.id)),
      'paid',      (select count(*) from cust c where c.created_at >= v_start and exists (select 1 from paid where paid.user_id = c.id)),
      'repeat',    (select count(*) from cust c where c.created_at >= v_start and (select count(*) from paid where paid.user_id = c.id) >= 2)
    )
  ) into v_out;
  return v_out;
end;
$$;

-- remove wallet-era and test-OTP-era functions if this project had them
drop function if exists public.create_payment_order(text);
drop function if exists public.credit_payment(uuid, text, jsonb);
drop function if exists public.dummy_confirm_payment(uuid);
drop function if exists public.refund_report(uuid, text);
drop function if exists public.admin_refund_report(uuid, text);
drop function if exists public.admin_adjust_wallet(uuid, numeric, text);
drop function if exists public.admin_phone_allowed(text);
drop function if exists public.admin_login_mode();
drop function if exists public.mobile_registered(text);
drop function if exists public.admin_dummy_email(text);

-- who can call what
revoke execute on function public.handle_new_user()             from public, anon, authenticated;
revoke execute on function public.log_report_status()           from public, anon, authenticated;
revoke execute on function public.touch_report()                from public, anon, authenticated;
revoke execute on function public.setting_num(text)             from public, anon, authenticated;
revoke execute on function public.setting_text(text)            from public, anon, authenticated;
revoke execute on function public.submit_report_request(jsonb)  from public, anon;
revoke execute on function public.is_admin()                    from public, anon;
revoke execute on function public.admin_analytics(int)          from public, anon;
revoke execute on function public.is_super_admin()              from public, anon;
revoke execute on function public.super_admin_phones()          from public, anon, authenticated;
revoke execute on function public.protect_super_admins()        from public, anon, authenticated;
grant  execute on function public.is_super_admin()              to authenticated;
grant  execute on function public.submit_report_request(jsonb)  to authenticated;
grant  execute on function public.is_admin()                    to authenticated;
grant  execute on function public.admin_analytics(int)          to authenticated;

-- =====================================================================
-- 11. STORAGE — private bucket for report PDFs:  reports/<user_id>/<report_code>.pdf
-- =====================================================================
insert into storage.buckets (id, name, public) values ('reports', 'reports', false)
on conflict (id) do nothing;

drop policy if exists "reports bucket: read own" on storage.objects;
create policy "reports bucket: read own" on storage.objects for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "reports bucket: admin all" on storage.objects;
create policy "reports bucket: admin all" on storage.objects for all to authenticated
  using (bucket_id = 'reports' and (select public.is_admin()))
  with check (bucket_id = 'reports' and (select public.is_admin()));
