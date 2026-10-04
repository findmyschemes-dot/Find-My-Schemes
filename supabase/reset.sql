-- =====================================================================
-- ONE-TIME RESET of the TEST database before installing schema.sql v3.
-- Deletes all test customers, requests, wallets and payments.
-- KEEPS: admin_phones (admin numbers) and app_settings.
--
-- Run ONLY while the project holds test data.
-- Order: 1) this file   2) schema.sql
-- =====================================================================

-- wallet-era objects
drop view  if exists public.admin_payments_v, public.admin_ledger_v, public.admin_customers_v,
                     public.admin_reports_v, public.admin_queries_v, public.admin_applications_v cascade;
drop table if exists public.wallet_transactions, public.payments, public.wallets, public.wallet_packs cascade;

-- tables that change shape in v3 (recreated by schema.sql)
drop table if exists public.report_events, public.report_schemes, public.applications,
                     public.queries, public.reports, public.profiles cascade;

-- test accounts (their old hidden email/password logins don't work with Phone.Email)
delete from auth.users;

-- Old test PDFs (if any): Storage → reports bucket → select files → Delete.
