# Integration Guide — switching dummy parts to real ones

Everything below is a switch, not a rewrite. Screens and database stay the same.

| Part | Today | Switch | Where |
|---|---|---|---|
| OTP | dummy (`123456`) | `VITE_OTP_MODE` | `src/lib/otp.js` |
| Payments | test checkout | `VITE_PAYMENT_MODE` + `app_settings.payment_mode` | `src/lib/payments.js` |
| Reports | team emails PDF | `app_settings.generation_mode` | Edge Function (below) |

---

## A. Real OTP

### Email OTP (free, built into Supabase)
1. Supabase → Authentication → **Email Templates → Magic Link**: put the code in the email, e.g.
   `Your Find My Schemes code is {{ .Token }}`.
2. Authentication → Providers → Email: turn **Confirm email ON** again.
3. Recommended: Authentication → SMTP Settings → connect a sender (Resend, Zoho, SES). Supabase's
   built-in sender only allows a few emails per hour.
4. `.env`: `VITE_OTP_MODE=supabase_email`

### Mobile SMS OTP
1. Supabase → Authentication → Providers → **Phone**: enable and connect Twilio / MessageBird / Vonage / Textlocal.
   (India: the SMS template must be DLT-registered with the provider.)
2. `.env`: `VITE_OTP_MODE=supabase_sms` — login then asks for mobile number (format `+91XXXXXXXXXX`).

Accounts created in dummy mode keep working only in dummy mode; delete test users before going live.

### Admin panel → real SMS OTP
Once the Phone provider above is working:
```sql
update app_settings set value = '"sms"' where key = 'admin_otp_mode';
```
From then on admins get a real SMS code, and the test-mode admin accounts stop having access
(the database only trusts phone numbers verified by Supabase). No code change needed.

---

## B. Razorpay

Money must be confirmed on the **server**, never in the browser. The database already has
`create_payment_order()` and `credit_payment()` (idempotent; only callable with the service key).

1. Supabase → Edge Functions → Secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
2. Edge Function **`razorpay-create-order`**: input `payment_id` → read the `payments` row (service key) →
   call Razorpay Orders API with `amount * 100` paise and `receipt = payment_code` → save `gateway_order_id` →
   return `{ razorpay_order_id, amount_paise }`.
3. Edge Function **`razorpay-webhook`**: verify the `X-Razorpay-Signature` header (HMAC-SHA256 of raw body with
   the webhook secret) → on `payment.captured`, find the payment by `gateway_order_id` →
   `rpc('credit_payment', { p_payment_id, p_gateway_payment_id, p_gateway_response })`.
4. Razorpay Dashboard → Webhooks → point to the function URL, event `payment.captured`.
5. Fill in the marked TODO in `src/lib/payments.js` (outline already written there).
6. `.env`: `VITE_PAYMENT_MODE=razorpay`, `VITE_RAZORPAY_KEY_ID=rzp_live_...`
7. SQL: `update app_settings set value='"razorpay"' where key='payment_mode';` — this also
   **disables the test checkout in the database**.

---

## C. AI report generation (planned in ~2 weeks)

The database is already shaped for it:
- `reports.inputs` + `form_version` — exact answers the AI reads
- `schemes` — master catalog the AI matches against (fill this first; it keeps answers factual)
- `report_schemes` — one row per matched scheme (`why_eligible`, `next_steps`, `match_score`)
- `reports.ai_*` columns — model, prompt version, token counts, raw output, error
- `report_events` — automatic status history; `attempts` for retries

Suggested pipeline:
1. SQL: `update app_settings set value='"ai"' where key='generation_mode';`
   New requests are then saved with `generation_mode = 'ai'`.
2. Supabase → Database → **Webhooks**: on `INSERT` into `reports` → call Edge Function `generate-report`.
3. `generate-report` (service key):
   - set `status = 'processing'`, `attempts = attempts + 1`
   - load `inputs` + candidate rows from `schemes` (filter by state / sector)
   - call the AI API with a versioned prompt; ask for JSON
   - insert `report_schemes`, fill `summary`, `schemes_found`, `potential_benefit`, `high_matches`, `ai_*`
   - build the PDF, upload to `reports/<user_id>/<report_code>.pdf`, set `report_file_path`
   - set `status = 'ready'` and email the customer
   - on error: save `ai_error`; after 3 attempts set `status = 'failed'` (team reviews, or `refund_report()`)
4. Keep manual mode as fallback — the team can still pick up any `failed` request by hand.
