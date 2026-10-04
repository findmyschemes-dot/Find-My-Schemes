# Integration notes

| Part | How it works now | Where |
|---|---|---|
| Login / sign-up | Phone.Email button verifies the mobile → Edge Function `phone-login` checks it on the server → Supabase session | `src/components/PhoneEmailButton.jsx`, `src/lib/phoneAuth.js`, `supabase/functions/phone-login/index.ts` |
| Payments | Outside the platform; admins mark each request Paid / Waived / Refunded | Admin → Payments, request page |
| Reports | Team prepares and uploads the PDF | Admin → Report Requests |

## Phone.Email login — what happens
1. The button opens Phone.Email's window; the person enters the mobile number and OTP there.
2. Phone.Email gives the page a `user_json_url` (a file on `user.phone.email`).
3. The page sends that URL to the Edge Function. The function:
   - accepts only `https://user.phone.email/…json`,
   - reads the verified country code + number from it,
   - refuses a URL that was already used (table `phone_login_used`),
   - admin login: refuses numbers not in `admin_phones`,
   - finds the account for the number, or creates it on sign-up,
   - stores the number in the account's `app_metadata.verified_phone` (browser can't change this),
   - returns a one-time token → the page exchanges it for a session.
4. If Phone.Email returns via the Redirect URL instead (`/auth/phone?user_json_url=…`), the app
   finishes the same login / sign-up / admin login it remembered before the button was clicked.

Behind the scenes each number gets a hidden login address `<number>@users.findmyschemes.com`
(never emailed). To change the domain, set the Edge Function secret `LOGIN_EMAIL_DOMAIN`.

## Online payments later (optional)
The request already has `amount_due`, `payment_status`, `payment_method`, `payment_reference`, `paid_at`.
A Razorpay webhook (Edge Function) could set `payment_status = 'paid'` with the service key —
no screen changes needed.

## AI report generation (planned)
`reports.inputs` + `form_version`, `schemes` catalog, `report_schemes`, `reports.ai_*` columns and
`report_events` are ready. Trigger on `payment_status` becoming `paid` (Database Webhook → Edge
Function `generate-report`), set `status = 'processing'`, write results, upload the PDF, set `ready`.
Set `app_settings.generation_mode = "ai"` when live; failures can stay with the team (manual).
