# Find My Schemes — React + Supabase

## Customer flow
1. **Sign up / log in with mobile number + OTP** (no password). Test mode: no SMS is sent, the code is always `123456`.
   The email typed at sign-up is only used to deliver reports.
2. New accounts land on **My Wallet** → pick a pack (₹499 / ₹1,499 / ₹2,499) → pay (test checkout for now).
3. **Request Report** → detailed business form → ₹499 is deducted from the wallet.
   If the balance is below ₹499 the form can't be submitted (checked in the database, not just the page).
4. Team emails the report within 24 hours and marks it delivered → customer sees it in **My Scheme Reports**.

## 1. Run locally
```
npm install
npm run dev
```
Opens http://localhost:5173

## 2. Connect Supabase (one-time, new project)
1. Create a project at https://supabase.com/dashboard (region: Mumbai `ap-south-1`).
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Project Settings → API** → copy Project URL + anon/publishable key into `.env`.
4. **Authentication → Providers → Email**: turn **Confirm email OFF** (needed while OTP is in test mode).
5. Restart `npm run dev`.

## 3. Team: handling a report request (manual mode, today)
In Supabase **Table Editor → reports**, filter `status = submitted` (oldest first).
1. Read the `inputs` column (all form answers). Optionally set `status = processing`.
2. Prepare the report and **email it** to `delivery_email`.
3. Upload the PDF: **Storage → reports →** folder named with the customer's `user_id` → `RPT-XXXX.pdf`.
4. On the report row set: `status = ready`, `report_file_path = <user_id>/RPT-XXXX.pdf`,
   and optionally `schemes_found`, `potential_benefit`, `high_matches`, `summary`.
   (`delivered_at` and the status history fill in automatically.)
5. Can't deliver? SQL Editor: `select refund_report('<report id>', 'Reason shown to customer');` → ₹499 goes back to the wallet.

Other tables: `queries` (write `admin_reply`, set `Resolved`), `applications` (update `status`).

## 3b. Admin panel  →  http://localhost:5173/admin
1. Supabase **SQL Editor** → run `supabase/admin.sql` (once, after `schema.sql`).
2. Put the real admin number(s) in — digits only, with 91, no `+` or spaces:
   ```sql
   update admin_phones set phone = '919876543210', name = 'Revanth' where phone = '919999999999';
   insert into admin_phones (phone, name) values ('919812345678', 'Second admin');
   ```
   (After the first admin logs in, more can be added from **Admin → Settings**.)
3. Open `/admin`, enter the number, code `123456` (test mode).

What it has: Analytics (revenue, customers, requests, turnaround, funnel, industries, states, packs),
Report Requests (queue with overdue flags, mark In Review / Delivered, upload PDF, add matched schemes, refund),
Customers (wallet, history, manual wallet adjustment), Payments & wallet ledger, Queries (reply),
Applications (status), Settings (price, packs, admin numbers).
Every list has **Download Excel**; Analytics has **Export everything** (one workbook, all sheets).

Security: every admin action is checked in the database (`is_admin()`), not just the screen.
In test mode anyone who knows an admin number can log in with 123456 — keep it local until
SMS OTP is switched on (INTEGRATION.md → A).
If `schema.sql` is ever re-run, run `admin.sql` again after it.

## 4. Changing prices
Easiest: **Admin → Settings**. Prices live in the database so nobody can change them from the browser:
- Report price → `app_settings` row `report_price`
- Packs → `wallet_packs` (amount, bonus, description, active)
The website picks up changes on next page load.

## 5. Going live
See **INTEGRATION.md** for real OTP, Razorpay and the AI report engine.
**Do not put the site on a public URL while OTP or payments are in dummy mode.**
