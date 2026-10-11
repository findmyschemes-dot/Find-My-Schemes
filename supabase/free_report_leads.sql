-- =====================================================================
-- FREE REPORT LEADS — people who download the demo report from the website.
-- Run once in Supabase → SQL Editor (safe to run again).
-- Visitors (logged in or not) can only ADD a row; only admins can read them.
-- =====================================================================
create table if not exists public.free_report_leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 100),
  email       text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text not null check (phone ~ '^[0-9]{11,15}$'),   -- digits with country code, e.g. 919876543210
  source      text not null default 'landing' check (char_length(source) <= 40),
  created_at  timestamptz not null default now()
);
create index if not exists free_report_leads_created_idx on public.free_report_leads (created_at desc);

alter table public.free_report_leads enable row level security;

drop policy if exists "free leads: anyone can add" on public.free_report_leads;
create policy "free leads: anyone can add" on public.free_report_leads
  for insert to anon, authenticated with check (true);

drop policy if exists "admin: read all" on public.free_report_leads;
create policy "admin: read all" on public.free_report_leads
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "admin: delete free leads" on public.free_report_leads;
create policy "admin: delete free leads" on public.free_report_leads
  for delete to authenticated using ((select public.is_admin()));

revoke all on public.free_report_leads from anon, authenticated;
grant insert (name, email, phone, source) on public.free_report_leads to anon, authenticated;
grant select, delete on public.free_report_leads to authenticated;
