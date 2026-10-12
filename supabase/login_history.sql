-- =====================================================================
-- LOGIN HISTORY — one row per login attempt (website, sign-up and admin panel).
-- Written only by the phone-login Edge Function; admins read it in Admin → Login Activity.
-- Run once in Supabase → SQL Editor (safe to run again). Needs schema.sql first.
-- =====================================================================
create table if not exists public.login_events (
  id             bigint generated always as identity primary key,
  user_id        uuid references auth.users (id) on delete set null,
  phone          text,                                   -- verified by Phone.Email, digits with country code
  mode           text not null check (mode in ('login', 'signup', 'admin')),
  outcome        text not null,                          -- success / not_registered / not_admin / failed
  verification   text check (verification in ('fresh', 'remembered')),
                 -- fresh = a new Phone.Email confirmation (OTP entered)
                 -- remembered = Phone.Email reused a remembered device (no OTP asked)
  is_new_account boolean not null default false,
  ip             text,
  user_agent     text,
  created_at     timestamptz not null default now()
);
create index if not exists login_events_created_idx on public.login_events (created_at desc);
create index if not exists login_events_user_idx    on public.login_events (user_id, created_at desc);
create index if not exists login_events_phone_idx   on public.login_events (phone);

alter table public.login_events enable row level security;

drop policy if exists "admin: read all" on public.login_events;
create policy "admin: read all" on public.login_events for select to authenticated
  using ((select public.is_admin()));
drop policy if exists "login_events: read own" on public.login_events;
create policy "login_events: read own" on public.login_events for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.login_events from anon, authenticated;
grant select on public.login_events to authenticated;
grant all on public.login_events to service_role;

create or replace view public.admin_login_events_v with (security_invoker = true) as
select e.*, p.full_name, p.is_internal,
       exists (select 1 from public.admin_phones a where a.phone = e.phone and a.active) as is_admin_number
  from public.login_events e
  left join public.profiles p on p.id = e.user_id;

revoke all on public.admin_login_events_v from anon;
grant select on public.admin_login_events_v to authenticated;
