# Find My Schemes — Payment Server (Razorpay)

A small Node.js (Express) server that sits between the website and Razorpay.
It holds the secret keys, creates payment orders, verifies every payment and marks requests **Paid** in Supabase.
The website never sees a secret and can never mark anything paid by itself.

## How a payment works

```
Customer fills the form ──► request saved as "Awaiting payment"
        │
        ▼
Website ──POST /api/payments/order──► Server ──► Razorpay: create order (amount taken from the database)
        │                                            (one order per request → can't be paid twice)
        ▼
Razorpay Checkout opens (UPI / cards / net banking / wallets)
        │
        ├─ success ──POST /api/payments/verify──► Server checks signature + asks Razorpay ──► request "Paid"
        ├─ failed  ──POST /api/payments/failed──► reason saved; request stays "Awaiting payment"
        │                                          customer sees "Try again" + "Raise a query"
        └─ closed  ──► request stays "Awaiting payment"; "Pay now" on the request page any time

Safety nets
  • Razorpay webhook ──POST /api/webhooks/razorpay──► catches payments whose browser closed before confirming,
    late UPI confirmations, failures and refunds
  • "Check status" (customer) / "Check with Razorpay" (admin) ──POST /api/payments/sync──► asks Razorpay directly
```

## Endpoints

| Method | Path | Who | What |
|---|---|---|---|
| GET  | `/health` | anyone | Server up? Which mode? Any setup problems? |
| GET  | `/api/payments/config` | anyone | Is online payment on (setting + keys)? test/live, public key id |
| POST | `/api/payments/order` | signed-in customer | Create / reuse the Razorpay order for their request |
| POST | `/api/payments/verify` | signed-in customer | Confirm a Checkout success (signature + Razorpay check) |
| POST | `/api/payments/failed` | signed-in customer | Record why a try failed |
| POST | `/api/payments/sync` | customer (own) / admin (any) | Ask Razorpay what happened, settle it |
| POST | `/api/webhooks/razorpay` | Razorpay | Signed webhook events |

## Setup

### 1. Database (once)
Supabase → **SQL Editor** → paste `supabase/online_payments.sql` → **Run**.
(Fresh projects: running the full `supabase/schema.sql` already includes it.)

### 2. Keys → `server/.env`
Copy `server/.env.example` to `server/.env` and fill in:

| Variable | Where to find it |
|---|---|
| `RAZORPAY_MODE` | `test` while testing, `live` to take real money |
| `RAZORPAY_TEST_KEY_ID` / `_SECRET` | Razorpay Dashboard (Test mode) → Account & Settings → API Keys |
| `RAZORPAY_LIVE_KEY_ID` / `_SECRET` | Same, with Test mode switched off |
| `RAZORPAY_TEST_WEBHOOK_SECRET` / `RAZORPAY_LIVE_WEBHOOK_SECRET` | The secret typed when creating each webhook (step 4) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (**service_role / secret** key) |
| `ALLOWED_ORIGINS` | Website addresses allowed to call the server |

The server refuses to use a key in the wrong slot (a `rzp_live_` key in the test slot, or the reverse),
and refuses the Supabase **public** (anon / publishable) key — `/health` names the problem. With the public key
every payment would fail with "Request not found", because the database hides all requests from it.

When the server refuses a payment it writes the real reason to the log (Vercel → payment server → **Logs**),
e.g. `refused: request belongs to another account`.

### 3. Run locally
```
cd server
npm install
npm start          # http://localhost:4000  — open /health to check the setup
```
In the website's `.env` (project root) set `VITE_PAYMENTS_API_URL=http://localhost:4000`, then `npm run dev` as usual.

### 4. Deploy on Vercel (same way as the Zolo backend)
1. Vercel → **Add New → Project** → pick the same GitHub repo.
2. **Root Directory: `server`** · Framework preset: **Other** · leave build settings empty.
3. **Environment Variables**: add every variable from `server/.env` (not `PORT`).
4. Deploy → open `https://<payment-server>.vercel.app/health` → should show `"ready": true`.
5. Website project on Vercel → Environment Variables → `VITE_PAYMENTS_API_URL=https://<payment-server>.vercel.app` → **Redeploy**.

### 5. Webhooks (Razorpay Dashboard → Account & Settings → Webhooks → Add New Webhook)
Do it **twice** — once with Test mode on, once with Test mode off (live):
- **URL**: `https://<payment-server>.vercel.app/api/webhooks/razorpay`
- **Secret**: any long random text → put the same text in `RAZORPAY_TEST_WEBHOOK_SECRET` / `RAZORPAY_LIVE_WEBHOOK_SECRET`
- **Events**: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`

Also recommended: Razorpay → Account & Settings → **Payment capture → Automatic** (the server captures anyway if it isn't).

### 6. Test, then go live
1. `RAZORPAY_MODE=test` → place a request → pay with Razorpay test details (e.g. UPI `success@razorpay`, or a test card from
   Razorpay's docs) → the request turns **Paid**, marked **TEST** in Admin → Payments.
2. Try a failure (UPI `failure@razorpay`) → stays **Awaiting payment** with the reason; "Try again" works.
3. Close the window mid-payment → **Awaiting payment**; "Pay now" works from the request page.
4. Go live: set `RAZORPAY_MODE=live` on Vercel → **Redeploy** the payment server. Delete or cancel test requests so they
   don't count as revenue.

## What is handled
- Amount always comes from the database (Admin → Settings price at the time of the request) — never from the browser.
- Signature check on every success and every webhook; Razorpay is asked again before marking paid.
- One open order per request; a second tab reuses it; an order already paid in another tab is detected.
- Price changed or test↔live switched → the old order is retired and a new one created.
- Browser closed after paying → webhook marks it paid; if the webhook is missing, the next visit checks Razorpay.
- Authorized-but-not-captured payments are captured automatically (correct amount only).
- Duplicate webhooks ignored (event id); failed webhook processing returns 500 so Razorpay retries.
- Money received for a cancelled / already-paid request, a wrong amount, or a partial refund → **Needs review** in
  Admin → Payments (red count in the menu). Nothing is silently accepted.
- Full refund in Razorpay → request marked **Refunded** automatically.
- Admin switch (Admin → Settings → Online payments) falls back to manual payment instructions instantly.
- Rate limits per user on all customer endpoints.

## Tests
```
cd server
npm install
npm test     # real database schema (in-memory Postgres) + a fake Razorpay
```
