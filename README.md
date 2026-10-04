# Find My Schemes — React + Supabase

## How it works
1. **Sign up / log in with mobile number.** The Phone.Email button verifies the number by OTP.
   The server (Supabase Edge Function `phone-login`) confirms it and logs the person in. No passwords.
2. **Request a report** → detailed business form → submitted with status *Awaiting payment*.
3. **Payment happens outside the platform** (UPI / bank transfer / cash). The customer sees the
   payment instructions and their Request ID to quote.
4. **Admin marks it Paid** (Admin → Payments or the request page) → it moves to *To work on*.
5. Team prepares the report, uploads the PDF, marks **Delivered** → customer sees it.

## 1. Run locally
```
npm install
npm run dev
```
Opens http://localhost:5173

## 2. Supabase setup (once)
1. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
   - Upgrading the old wallet/test-OTP version? Run `supabase/reset.sql` first (deletes test data, keeps admin numbers).
2. **Super admins** 9121422554 and 8500676890 are built in (`super_admin_phones()` in `schema.sql` and
   `SUPER_ADMINS` in the Edge Function) — always admin, can't be removed. Add other admins in Admin → Settings.
3. **Edge Functions → Deploy a new function → Via editor** → name it exactly `phone-login` →
   paste `supabase/functions/phone-login/index.ts` → **Deploy**.
   Then open the function → **Details / Settings** → turn **OFF "Verify JWT"** → Save.
4. **Authentication → Sign In / Providers → Email**: must be **enabled** (used behind the scenes for the session).
5. **Project Settings → API** → copy Project URL + anon key into `.env` (see `.env.example`).

## 3. Phone.Email setup
In the Phone.Email dashboard, for this button (Client ID in `.env`):
- **Redirect URLs** (add all that apply):
  - `http://localhost:5173/auth/phone`
  - `https://find-my-schemes.vercel.app/auth/phone`
  - `https://findmyschemes.com/auth/phone` (and `https://www.findmyschemes.com/auth/phone`) once the domain is connected
- If it asks for website / allowed domains, add the same sites without `/auth/phone`.

## 4. Vercel
Project → Settings → **Environment Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_PHONE_EMAIL_CLIENT_ID` → redeploy. (`vercel.json` already sends every page to the app.)

## 5. Admin panel → `/admin`
Log in with the Phone.Email button using an admin number. Admins also see an **Admin Panel** button
in the website menu.
- **Analytics** — revenue received, awaiting payment, customers, requests, turnaround, funnel, methods, industries, states.
- **Report Requests** — tabs: *To work on* (paid), *Awaiting payment*, *Delivered*, *Cancelled*. On a request:
  mark paid / waive / refunded, start review, upload PDF, add schemes, mark delivered, cancel.
- **Payments** — the payment register; *Mark paid* right in the list (method + UTR).
- **Customers, Queries, Applications, Settings** (price, delivery promise, **payment instructions**, admin numbers).
- Every list has **Download Excel**; Analytics has **Export everything**.

Security: admin rights are checked in the database on every request, and only for mobile numbers
the server has verified. Customers can't mark their own requests paid.
