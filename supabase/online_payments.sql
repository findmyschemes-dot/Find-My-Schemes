-- =====================================================================
-- ONLINE PAYMENTS (Razorpay) — run once in Supabase → SQL Editor (safe to run again).
--   • payment_orders  : one row per Razorpay order (normally one per request)
--   • payment_events  : audit log of everything Razorpay told us (webhooks, checkout, checks)
--   • Only the payment server (service role) can mark a request paid online.
--   Needs schema.sql to have been run first.
-- =====================================================================

-- Admin switch: when off, customers see the manual payment instructions instead
insert into public.app_settings (key, value, description) values
  ('online_payments', 'true', 'true = customers pay online with Razorpay; false = show the manual payment instructions')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Razorpay orders
--   status: created   → order made, customer has not finished paying
--           attempted → at least one payment try failed (customer can retry)
--           paid      → money received for this order
--           superseded→ replaced by a newer order (price changed / test↔live switch)
-- ---------------------------------------------------------------------
create table if not exists public.payment_orders (
  id                     uuid primary key default gen_random_uuid(),
  report_id              uuid not null references public.reports (id) on delete cascade,
  user_id                uuid not null references auth.users (id) on delete cascade,
  provider               text not null default 'razorpay',
  mode                   text not null check (mode in ('test', 'live')),
  order_id               text not null unique,              -- Razorpay order_xxx
  amount_paise           integer not null check (amount_paise > 0),
  currency               text not null default 'INR',
  status                 text not null default 'created'
                         check (status in ('created', 'attempted', 'paid', 'superseded')),
  payment_id             text,                              -- Razorpay pay_xxx that settled it
  method                 text,                              -- upi / card / netbanking / wallet …
  failed_attempts        integer not null default 0,
  last_error_code        text,
  last_error_description text,
  last_error_reason      text,
  last_error_at          timestamptz,
  needs_review           boolean not null default false,    -- money received but something is off
  review_note            text,
  reviewed_at            timestamptz,
  paid_at                timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists payment_orders_report_idx  on public.payment_orders (report_id, created_at desc);
create index if not exists payment_orders_user_idx    on public.payment_orders (user_id);
create index if not exists payment_orders_payment_idx on public.payment_orders (payment_id);
create index if not exists payment_orders_review_idx  on public.payment_orders (needs_review) where needs_review;
-- at most one open order per request (stops two tabs creating two payable orders)
create unique index if not exists payment_orders_one_open_uidx
  on public.payment_orders (report_id) where status in ('created', 'attempted');

create or replace function public.touch_payment_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists payment_orders_touch on public.payment_orders;
create trigger payment_orders_touch before update on public.payment_orders
  for each row execute function public.touch_payment_order();

-- ---------------------------------------------------------------------
-- Audit log (webhooks are de-duplicated by Razorpay's event id)
-- ---------------------------------------------------------------------
create table if not exists public.payment_events (
  id           bigint generated always as identity primary key,
  event_id     text unique,                  -- x-razorpay-event-id (webhooks only)
  source       text not null check (source in ('webhook', 'checkout', 'verify', 'sync', 'server')),
  event        text not null,                -- payment.captured, payment.failed, order.created …
  mode         text,
  order_id     text,
  payment_id   text,
  report_id    uuid references public.reports (id) on delete set null,
  amount_paise integer,
  outcome      text,                         -- paid / failed / ignored / needs_review / error …
  processed    boolean not null default true,
  error        text,
  payload      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists payment_events_report_idx on public.payment_events (report_id, created_at);
create index if not exists payment_events_order_idx  on public.payment_events (order_id);

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.payment_orders enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists "payment_orders: read own" on public.payment_orders;
create policy "payment_orders: read own" on public.payment_orders for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "admin: read all" on public.payment_orders;
create policy "admin: read all" on public.payment_orders for select to authenticated
  using ((select public.is_admin()));
drop policy if exists "admin: review payment_orders" on public.payment_orders;
create policy "admin: review payment_orders" on public.payment_orders for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "admin: read all" on public.payment_events;
create policy "admin: read all" on public.payment_events for select to authenticated
  using ((select public.is_admin()));

revoke all on public.payment_orders, public.payment_events from anon, authenticated;
grant select on public.payment_orders, public.payment_events to authenticated;
grant update (needs_review, review_note, reviewed_at) on public.payment_orders to authenticated;
grant all on public.payment_orders, public.payment_events to service_role;

-- ---------------------------------------------------------------------
-- Server-only functions (called by the payment server with the service role key)
-- ---------------------------------------------------------------------

-- Money received for an order → mark the request paid (once). Safe to call many times.
-- Returns {result: paid | already_recorded | needs_review | amount_mismatch, report_id, report_code}
create or replace function public.record_online_payment(
  p_order_id text, p_payment_id text, p_amount_paise integer, p_method text, p_source text default 'server')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.payment_orders;
  r public.reports;
  v_result text;
begin
  select * into o from public.payment_orders where order_id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into r from public.reports where id = o.report_id for update;

  if p_amount_paise is distinct from o.amount_paise then
    update public.payment_orders
       set needs_review = true,
           review_note = format('Payment %s of ₹%s does not match the order amount ₹%s — check in Razorpay.',
                                p_payment_id, p_amount_paise / 100.0, o.amount_paise / 100.0)
     where id = o.id;
    v_result := 'amount_mismatch';

  elsif o.status = 'paid' and o.payment_id = p_payment_id then
    v_result := 'already_recorded';

  elsif o.status = 'paid' then
    update public.payment_orders
       set needs_review = true,
           review_note = format('A second payment %s arrived for an order already paid by %s — refund one in Razorpay.',
                                p_payment_id, o.payment_id)
     where id = o.id;
    v_result := 'needs_review';

  else
    update public.payment_orders
       set status = 'paid', payment_id = p_payment_id, method = nullif(p_method, ''), paid_at = now()
     where id = o.id;

    if r.payment_status = 'awaiting' and r.status <> 'cancelled' then
      update public.reports
         set payment_status    = 'paid',
             amount_paid       = p_amount_paise / 100.0,
             payment_method    = 'Razorpay' || coalesce(' · ' || upper(nullif(p_method, '')), ''),
             payment_reference = p_payment_id,
             payment_note      = case when o.mode = 'test' then 'TEST MODE payment — no real money moved'
                                      else 'Paid online via Razorpay' end,
             paid_at           = now()
       where id = r.id;
      -- any other open order for this request can no longer be used
      update public.payment_orders set status = 'superseded'
       where report_id = r.id and id <> o.id and status in ('created', 'attempted');
      v_result := 'paid';
    else
      update public.payment_orders
         set needs_review = true,
             review_note = format('Payment %s received, but the request was already %s — check and refund if needed.',
                                  p_payment_id,
                                  case when r.status = 'cancelled' then 'cancelled'
                                       else coalesce(r.payment_status, 'closed') end)
       where id = o.id;
      v_result := 'needs_review';
    end if;
  end if;

  insert into public.payment_events (source, event, mode, order_id, payment_id, report_id, amount_paise, outcome)
  values (coalesce(p_source, 'server'), 'payment.recorded', o.mode, p_order_id, p_payment_id, o.report_id, p_amount_paise, v_result);

  return jsonb_build_object('result', v_result, 'report_id', r.id, 'report_code', r.report_code);
end;
$$;

-- A payment try failed → remember why (the request stays "Awaiting payment")
create or replace function public.record_payment_failure(
  p_order_id text, p_payment_id text, p_code text, p_description text, p_reason text, p_source text default 'server')
returns void
language plpgsql security definer set search_path = '' as $$
declare o public.payment_orders;
begin
  select * into o from public.payment_orders where order_id = p_order_id for update;
  if not found then return; end if;

  -- the same failure can arrive from checkout AND the webhook; count it once
  if p_payment_id is null or not exists (
       select 1 from public.payment_events
        where order_id = p_order_id and payment_id = p_payment_id and event = 'payment.failed.recorded') then
    update public.payment_orders
       set status = case when status = 'created' then 'attempted' else status end,
           failed_attempts = failed_attempts + 1,
           last_error_code = left(p_code, 80),
           last_error_description = left(p_description, 500),
           last_error_reason = left(p_reason, 120),
           last_error_at = now()
     where id = o.id;
    insert into public.payment_events (source, event, mode, order_id, payment_id, report_id, outcome, error)
    values (coalesce(p_source, 'server'), 'payment.failed.recorded', o.mode, p_order_id, p_payment_id, o.report_id,
            'failed', left(concat_ws(' · ', p_code, p_reason, p_description), 600));
  end if;
end;
$$;

-- Refund processed in Razorpay → full refund marks the request Refunded; partial needs a human
create or replace function public.record_online_refund(
  p_payment_id text, p_refunded_paise integer, p_refund_id text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.payment_orders;
  r public.reports;
  v_result text;
begin
  select * into o from public.payment_orders where payment_id = p_payment_id for update;
  if not found then return jsonb_build_object('result', 'unknown_payment'); end if;
  select * into r from public.reports where id = o.report_id for update;

  if p_refunded_paise >= o.amount_paise and r.payment_status = 'paid' and r.payment_reference = p_payment_id then
    update public.reports
       set payment_status = 'refunded',
           payment_note = concat_ws(' · ', payment_note, 'Refunded in Razorpay (' || p_refund_id || ')')
     where id = r.id;
    v_result := 'refunded';
  else
    update public.payment_orders
       set needs_review = true,
           review_note = format('Refund %s of ₹%s processed in Razorpay for payment %s — update the request if needed.',
                                p_refund_id, p_refunded_paise / 100.0, p_payment_id)
     where id = o.id;
    v_result := 'needs_review';
  end if;

  insert into public.payment_events (source, event, mode, order_id, payment_id, report_id, amount_paise, outcome)
  values ('webhook', 'refund.recorded', o.mode, o.order_id, p_payment_id, o.report_id, p_refunded_paise, v_result);
  return jsonb_build_object('result', v_result, 'report_id', r.id);
end;
$$;

revoke execute on function public.touch_payment_order()                                         from public, anon, authenticated;
revoke execute on function public.record_online_payment(text, text, integer, text, text)        from public, anon, authenticated;
revoke execute on function public.record_payment_failure(text, text, text, text, text, text)    from public, anon, authenticated;
revoke execute on function public.record_online_refund(text, integer, text)                     from public, anon, authenticated;
grant  execute on function public.record_online_payment(text, text, integer, text, text)        to service_role;
grant  execute on function public.record_payment_failure(text, text, text, text, text, text)    to service_role;
grant  execute on function public.record_online_refund(text, integer, text)                     to service_role;

-- ---------------------------------------------------------------------
-- Admin views: add online-payment columns to requests; list of all online orders
-- ---------------------------------------------------------------------
drop view if exists public.admin_reports_v;
create view public.admin_reports_v with (security_invoker = true) as
select r.*, p.full_name as customer_name, p.email as customer_email, p.mobile as customer_mobile,
       extract(epoch from (coalesce(r.delivered_at, now()) - coalesce(r.paid_at, r.created_at))) / 3600.0 as age_hours,
       lo.status                 as online_status,
       lo.mode                   as online_mode,
       lo.last_error_description as online_error,
       coalesce(ag.failed, 0)    as online_failed_attempts,
       coalesce(ag.review, false) as online_review
  from public.reports r
  left join public.profiles p on p.id = r.user_id
  left join lateral (select o.status, o.mode, o.last_error_description
                       from public.payment_orders o where o.report_id = r.id
                      order by o.created_at desc limit 1) lo on true
  left join lateral (select sum(o.failed_attempts)::int as failed, bool_or(o.needs_review) as review
                       from public.payment_orders o where o.report_id = r.id) ag on true;

create or replace view public.admin_payment_orders_v with (security_invoker = true) as
select o.*, r.report_code, r.business_name, r.payment_status as report_payment_status, r.status as report_status,
       p.full_name as customer_name, p.email as customer_email, p.mobile as customer_mobile
  from public.payment_orders o
  join public.reports r on r.id = o.report_id
  left join public.profiles p on p.id = o.user_id;

revoke all on public.admin_reports_v, public.admin_payment_orders_v from anon;
grant select on public.admin_reports_v, public.admin_payment_orders_v to authenticated;
