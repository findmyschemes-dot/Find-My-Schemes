-- =====================================================================
-- Find My Schemes — ADMIN PANEL add-on
-- Run AFTER schema.sql:  Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run.
--
-- Who is an admin?  Only mobile numbers listed in `admin_phones`.
-- Add one:     insert into admin_phones (phone, name) values ('919876543210', 'Revanth');
-- Remove one:  update admin_phones set active = false where phone = '919876543210';
-- (digits only, with country code, no '+')
-- =====================================================================

-- ---------------------------------------------------------------------
-- A1. Allow-list of admin mobile numbers
-- ---------------------------------------------------------------------
create table if not exists public.admin_phones (
  phone      text primary key check (phone ~ '^[0-9]{10,15}$'),
  name       text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- PLACEHOLDER — replace with the real number(s)
insert into public.admin_phones (phone, name) values ('919999999999', 'Placeholder admin')
on conflict (phone) do nothing;

-- How admin login is checked:
--   'dummy' → test code 123456 (LOCAL TESTING ONLY)
--   'sms'   → real SMS OTP via Supabase phone auth (secure)
insert into public.app_settings (key, value, description) values
  ('admin_otp_mode', '"dummy"', 'dummy | sms — how admins log in')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- A2. is_admin() — the single gate every admin rule uses
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from auth.users u
      join public.admin_phones a on a.active
     where u.id = auth.uid()
       and (
         -- real SMS login: phone verified by Supabase, cannot be faked from the browser
         (u.phone_confirmed_at is not null and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = a.phone)
         -- test mode only
         or (coalesce(public.setting_text('admin_otp_mode'), 'dummy') = 'dummy'
             and (u.raw_user_meta_data ->> 'admin_phone') = a.phone
             and (u.raw_user_meta_data ->> 'is_admin_account') = 'true')
       )
  )
$$;

-- Login screen pre-check: is this number on the list? (only a yes/no)
create or replace function public.admin_phone_allowed(p_phone text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_phones
                  where active and phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'))
$$;

create or replace function public.admin_login_mode()
returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(public.setting_text('admin_otp_mode'), 'dummy')
$$;

-- Mark admin accounts so they are left out of customer analytics
alter table public.profiles add column if not exists is_internal boolean not null default false;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_internal boolean := coalesce((new.raw_user_meta_data ->> 'is_admin_account') = 'true', false)
                        or exists (select 1 from public.admin_phones
                                    where phone = regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'));
begin
  insert into public.profiles (id, email, full_name, mobile, business_name, is_internal)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'mobile', new.phone),
    new.raw_user_meta_data ->> 'business_name',
    v_internal
  )
  on conflict (id) do nothing;

  if not v_internal then
    insert into public.wallets (user_id) values (new.id) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- A3. Admin read / write rules (added next to the customer rules)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','wallets','payments','reports','wallet_transactions','schemes',
                           'report_schemes','report_events','applications','queries','admin_phones',
                           'app_settings','wallet_packs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin: read all" on public.%I', t);
    execute format('create policy "admin: read all" on public.%I for select to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- what admins may change directly (money still only moves through functions)
-- Column-level: revoke the blanket UPDATE first, then allow only these columns.
revoke update on public.reports, public.queries, public.applications,
                 public.app_settings, public.wallet_packs, public.admin_phones from authenticated;

-- 'refunded' is final and can only be set by admin_refund_report() (which also returns the money)
drop policy if exists "admin: update reports" on public.reports;
create policy "admin: update reports" on public.reports for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and status in ('submitted', 'processing', 'ready', 'failed'));
grant update (status, status_note, assigned_to, summary, schemes_found, potential_benefit,
              high_matches, report_file_path) on public.reports to authenticated;

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

drop policy if exists "admin: manage packs" on public.wallet_packs;
create policy "admin: manage packs" on public.wallet_packs for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant update (name, amount, bonus, description, sort_order, active) on public.wallet_packs to authenticated;

-- report PDFs: admins can upload / read / replace any file in the bucket
drop policy if exists "reports bucket: admin all" on storage.objects;
create policy "reports bucket: admin all" on storage.objects for all to authenticated
  using (bucket_id = 'reports' and (select public.is_admin()))
  with check (bucket_id = 'reports' and (select public.is_admin()));

-- ---------------------------------------------------------------------
-- A4. Views for admin lists (respect the rules above — customers see only their own rows)
-- ---------------------------------------------------------------------
create or replace view public.admin_customers_v with (security_invoker = true) as
select p.id, p.full_name, p.email, p.mobile, p.business_name, p.created_at,
       coalesce(w.balance, 0)                                                        as wallet_balance,
       (select count(*) from public.reports r where r.user_id = p.id)                as reports_count,
       (select coalesce(sum(amount), 0) from public.payments y
         where y.user_id = p.id and y.status = 'paid')                                as total_paid,
       greatest(p.created_at,
                (select max(created_at) from public.wallet_transactions t where t.user_id = p.id)) as last_activity
  from public.profiles p
  left join public.wallets w on w.user_id = p.id
 where not p.is_internal;

create or replace view public.admin_reports_v with (security_invoker = true) as
select r.*, p.full_name as customer_name, p.email as customer_email, p.mobile as customer_mobile,
       extract(epoch from (coalesce(r.delivered_at, now()) - r.created_at)) / 3600.0 as age_hours
  from public.reports r
  left join public.profiles p on p.id = r.user_id;

create or replace view public.admin_payments_v with (security_invoker = true) as
select y.*, p.full_name as customer_name, p.email as customer_email, p.mobile as customer_mobile
  from public.payments y
  left join public.profiles p on p.id = y.user_id;

create or replace view public.admin_ledger_v with (security_invoker = true) as
select t.*, p.full_name as customer_name, p.email as customer_email
  from public.wallet_transactions t
  left join public.profiles p on p.id = t.user_id;

create or replace view public.admin_queries_v with (security_invoker = true) as
select q.*, p.full_name as customer_name, p.email as customer_email, p.mobile as customer_mobile
  from public.queries q
  left join public.profiles p on p.id = q.user_id;

create or replace view public.admin_applications_v with (security_invoker = true) as
select a.*, p.full_name as customer_name, p.email as customer_email, p.mobile as customer_mobile,
       r.report_code
  from public.applications a
  left join public.profiles p on p.id = a.user_id
  left join public.reports  r on r.id = a.report_id;

revoke all on public.admin_customers_v, public.admin_reports_v, public.admin_payments_v,
              public.admin_ledger_v, public.admin_queries_v, public.admin_applications_v from anon;
grant select on public.admin_customers_v, public.admin_reports_v, public.admin_payments_v,
                public.admin_ledger_v, public.admin_queries_v, public.admin_applications_v to authenticated;

-- ---------------------------------------------------------------------
-- A5. Analytics — one call returns everything the dashboard needs
--     p_days: 7 / 30 / 90 / 365 / 0 (= all time). Days are counted in IST.
-- ---------------------------------------------------------------------
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
  cust  as (select id, created_at from public.profiles where not is_internal),
  pay   as (select * from public.payments where status = 'paid'),
  rep   as (select * from public.reports where user_id in (select id from cust)),
  days  as (select generate_series(v_from, v_today, interval '1 day')::date as d)
  select jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_today, 'days', (v_today - v_from) + 1),

    'kpis', jsonb_build_object(
      'customers_total',     (select count(*) from cust),
      'customers_new',       (select count(*) from cust where created_at >= v_start),
      'revenue',             (select coalesce(sum(amount), 0) from pay where paid_at >= v_start),
      'revenue_total',       (select coalesce(sum(amount), 0) from pay),
      'recharges',           (select count(*) from pay where paid_at >= v_start),
      'paying_customers',    (select count(distinct user_id) from pay where paid_at >= v_start),
      'reports',             (select count(*) from rep where created_at >= v_start),
      'report_value',        (select coalesce(sum(price_charged), 0) from rep where created_at >= v_start and status <> 'refunded'),
      'refunds',             (select coalesce(sum(price_charged), 0) from rep where status = 'refunded' and updated_at >= v_start),
      'wallet_liability',    (select coalesce(sum(balance), 0) from public.wallets where user_id in (select id from cust)),
      'open_queue',          (select count(*) from rep where status in ('submitted', 'processing')),
      'overdue',             (select count(*) from rep where status in ('submitted', 'processing')
                                and created_at < now() - make_interval(hours => v_sla::int)),
      'avg_turnaround_hours',(select round(avg(extract(epoch from (delivered_at - created_at)) / 3600.0)::numeric, 1)
                                from rep where status = 'ready' and delivered_at >= v_start),
      'on_time_pct',         (select round(100.0 * avg(case when delivered_at - created_at <= make_interval(hours => v_sla::int) then 1 else 0 end), 0)
                                from rep where status = 'ready' and delivered_at >= v_start),
      'open_queries',        (select count(*) from public.queries where status = 'Open'),
      'sla_hours',           v_sla
    ),

    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d,
               'revenue',  (select coalesce(sum(amount), 0) from pay where (paid_at at time zone v_tz)::date = d),
               'signups',  (select count(*) from cust where (created_at at time zone v_tz)::date = d),
               'reports',  (select count(*) from rep  where (created_at at time zone v_tz)::date = d)
             ) order by d), '[]'::jsonb)
        from days
    ),

    'reports_by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) n from rep where created_at >= v_start group by status) s
    ),
    'by_industry', (
      select coalesce(jsonb_agg(jsonb_build_object('label', k, 'value', n) order by n desc, k), '[]'::jsonb)
        from (select coalesce(nullif(industry, ''), 'Not given') k, count(*) n from rep
               where created_at >= v_start group by 1 order by 2 desc limit 10) x
    ),
    'by_state', (
      select coalesce(jsonb_agg(jsonb_build_object('label', k, 'value', n) order by n desc, k), '[]'::jsonb)
        from (select coalesce(nullif(state, ''), 'Not given') k, count(*) n from rep
               where created_at >= v_start group by 1 order by 2 desc limit 10) x
    ),
    'by_purpose', (
      select coalesce(jsonb_agg(jsonb_build_object('label', k, 'value', n) order by n desc, k), '[]'::jsonb)
        from (select p.k, count(*) n
                from rep, jsonb_array_elements_text(coalesce(rep.inputs -> 'purpose', '[]'::jsonb)) as p(k)
               where rep.created_at >= v_start group by 1 order by 2 desc limit 10) x
    ),
    'by_pack', (
      select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(wp.name, y.pack_id, 'Other'),
                                                   'value', y.n, 'amount', y.amt) order by y.amt desc), '[]'::jsonb)
        from (select pack_id, count(*) n, sum(amount) amt from pay where paid_at >= v_start group by pack_id) y
        left join public.wallet_packs wp on wp.id = y.pack_id
    ),
    'funnel', jsonb_build_object(
      'signed_up',    (select count(*) from cust where created_at >= v_start),
      'recharged',    (select count(*) from cust c where c.created_at >= v_start
                         and exists (select 1 from pay where pay.user_id = c.id)),
      'requested',    (select count(*) from cust c where c.created_at >= v_start
                         and exists (select 1 from rep where rep.user_id = c.id)),
      'repeat',       (select count(*) from cust c where c.created_at >= v_start
                         and (select count(*) from rep where rep.user_id = c.id) >= 2)
    )
  ) into v_out;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------
-- A6. Admin actions that touch money
-- ---------------------------------------------------------------------
create or replace function public.admin_refund_report(p_report_id uuid, p_note text default null)
returns public.wallets
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return public.refund_report(p_report_id, p_note);
end;
$$;

-- manual credit / debit (goodwill credit, correction). Always logged in the ledger.
create or replace function public.admin_adjust_wallet(p_user_id uuid, p_amount numeric, p_note text)
returns public.wallets
language plpgsql security definer set search_path = '' as $$
declare v_wallet public.wallets;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'AMOUNT_REQUIRED'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'NOTE_REQUIRED'; end if;

  insert into public.wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if v_wallet.balance + p_amount < 0 then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update public.wallets set balance = balance + p_amount, updated_at = now()
   where user_id = p_user_id returning * into v_wallet;

  insert into public.wallet_transactions (user_id, direction, amount, balance_after, reason, note)
  values (p_user_id, case when p_amount > 0 then 'credit' else 'debit' end, abs(p_amount),
          v_wallet.balance, 'adjustment', 'Admin: ' || trim(p_note));
  return v_wallet;
end;
$$;

revoke execute on function public.is_admin()                               from public, anon;
revoke execute on function public.admin_analytics(int)                     from public, anon;
revoke execute on function public.admin_refund_report(uuid, text)          from public, anon;
revoke execute on function public.admin_adjust_wallet(uuid, numeric, text) from public, anon;
grant  execute on function public.is_admin()                               to authenticated;
grant  execute on function public.admin_analytics(int)                     to authenticated;
grant  execute on function public.admin_refund_report(uuid, text)          to authenticated;
grant  execute on function public.admin_adjust_wallet(uuid, numeric, text) to authenticated;
grant  execute on function public.admin_phone_allowed(text)                to anon, authenticated;
grant  execute on function public.admin_login_mode()                       to anon, authenticated;
