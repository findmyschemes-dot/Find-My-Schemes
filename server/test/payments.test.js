// End-to-end tests of the payment server: real SQL (PGlite) + fake Razorpay.  Run:  npm test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { makeDb, makeRazorpay, listen } from './helpers.js'

const KEY_SECRET = 'test_secret_123'
const WH_SECRET = 'wh_test_secret'
const rp = makeRazorpay(KEY_SECRET)
let rpServer, apiServer, base, d

before(async () => {
  rpServer = await listen(rp.app)
  Object.assign(process.env, {
    RAZORPAY_MODE: 'test',
    RAZORPAY_TEST_KEY_ID: 'rzp_test_abc123',
    RAZORPAY_TEST_KEY_SECRET: KEY_SECRET,
    RAZORPAY_TEST_WEBHOOK_SECRET: WH_SECRET,
    RAZORPAY_LIVE_KEY_ID: 'rzp_live_abc123',
    RAZORPAY_LIVE_KEY_SECRET: 'live_secret',
    RAZORPAY_LIVE_WEBHOOK_SECRET: 'wh_live_secret',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    RAZORPAY_API_BASE: `http://127.0.0.1:${rpServer.address().port}/v1`,
    ALLOWED_ORIGINS: 'http://localhost:5173',
  })
  d = await makeDb()
  const { setDbForTests } = await import('../src/db.js')
  setDbForTests(d.impl)
  const { default: app } = await import('../src/app.js')
  apiServer = await listen(app)
  base = `http://127.0.0.1:${apiServer.address().port}`
})
after(() => { rpServer.close(); apiServer.close() })

const call = async (path, body, token) => {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}
const webhook = async (payload, { secret = WH_SECRET, eventId = crypto.randomUUID() } = {}) => {
  const raw = JSON.stringify(payload)
  const res = await fetch(base + '/api/webhooks/razorpay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': crypto.createHmac('sha256', secret).update(raw).digest('hex'), 'x-razorpay-event-id': eventId },
    body: raw,
  })
  return { status: res.status, body: await res.json() }
}
const report = (id) => d.one('select * from reports where id=$1', [id])

test('health and public config', async () => {
  const h = await call('/health')
  assert.equal(h.body.ready, true)
  assert.equal(h.body.mode, 'test')
  const c = await call('/api/payments/config')
  assert.deepEqual(c.body, { enabled: true, mode: 'test', keyId: 'rzp_test_abc123' })
})

test('happy path: order → failed try → retry → success → paid', async () => {
  const uid = await d.newCustomer()
  const req = await d.newRequest(uid)
  const tok = `user:${uid}`

  assert.equal((await call('/api/payments/order', { reportId: req.id })).status, 401, 'needs login')
  const other = await d.newCustomer('9876500000')
  assert.equal((await call('/api/payments/order', { reportId: req.id }, `user:${other}`)).status, 404, 'cannot pay someone else’s request')

  const o1 = await call('/api/payments/order', { reportId: req.id }, tok)
  assert.equal(o1.status, 200)
  assert.equal(o1.body.amount, 49900)
  assert.equal(o1.body.keyId, 'rzp_test_abc123')
  assert.equal(o1.body.prefill.contact, '+919876543210')
  assert.equal(rp.orders.get(o1.body.orderId).notes.report_id, req.id)

  const o2 = await call('/api/payments/order', { reportId: req.id }, tok)
  assert.equal(o2.body.orderId, o1.body.orderId, 'same order reused (no double payment possible)')

  // card declined in Checkout
  const fail = rp.pay(o1.body.orderId, { status: 'failed', error: 'Card declined by bank' })
  await call('/api/payments/failed', { reportId: req.id, orderId: o1.body.orderId, error: { code: 'BAD_REQUEST_ERROR', description: 'Card declined by bank', reason: 'payment_failed', metadata: { payment_id: fail.payment.id } } }, tok)
  assert.equal((await report(req.id)).payment_status, 'awaiting', 'failure keeps request awaiting')
  const ord = await d.one('select * from payment_orders where order_id=$1', [o1.body.orderId])
  assert.equal(ord.status, 'attempted')
  assert.equal(ord.last_error_description, 'Card declined by bank')

  // forged success is rejected
  const bad = await call('/api/payments/verify', { reportId: req.id, razorpay_order_id: o1.body.orderId, razorpay_payment_id: fail.payment.id, razorpay_signature: 'f'.repeat(64) }, tok)
  assert.equal(bad.status, 400)
  assert.equal(bad.body.code, 'BAD_SIGNATURE')
  assert.equal((await report(req.id)).payment_status, 'awaiting')

  // retry on the same order succeeds
  const o3 = await call('/api/payments/order', { reportId: req.id }, tok)
  assert.equal(o3.body.orderId, o1.body.orderId)
  const ok = rp.pay(o1.body.orderId, { method: 'upi' })
  const v = await call('/api/payments/verify', { reportId: req.id, razorpay_order_id: o1.body.orderId, razorpay_payment_id: ok.payment.id, razorpay_signature: ok.signature }, tok)
  assert.equal(v.status, 200)
  assert.equal(v.body.status, 'paid')
  const r = await report(req.id)
  assert.equal(r.payment_status, 'paid')
  assert.equal(r.payment_reference, ok.payment.id)
  assert.equal(r.payment_method, 'Razorpay · UPI')

  // verify again (double click / refresh) is harmless
  const v2 = await call('/api/payments/verify', { reportId: req.id, razorpay_order_id: o1.body.orderId, razorpay_payment_id: ok.payment.id, razorpay_signature: ok.signature }, tok)
  assert.equal(v2.body.status, 'paid')

  // webhook for the same payment arrives later → no double entry
  const w = await webhook({ event: 'payment.captured', payload: { payment: { entity: ok.payment } } })
  assert.equal(w.body.outcome, 'already_recorded')

  // can't start paying again
  const again = await call('/api/payments/order', { reportId: req.id }, tok)
  assert.equal(again.status, 409)
  assert.equal(again.body.code, 'ALREADY_PAID')
})

test('browser closed after paying → webhook marks paid; duplicate & forged webhooks ignored', async () => {
  const uid = await d.newCustomer('9000000001')
  const req = await d.newRequest(uid)
  const o = await call('/api/payments/order', { reportId: req.id }, `user:${uid}`)
  const { payment } = rp.pay(o.body.orderId, { method: 'card' })

  const forged = await webhook({ event: 'payment.captured', payload: { payment: { entity: payment } } }, { secret: 'wrong' })
  assert.equal(forged.status, 400)
  assert.equal((await report(req.id)).payment_status, 'awaiting')

  const id = 'evt_same_1'
  const w1 = await webhook({ event: 'payment.captured', payload: { payment: { entity: payment } } }, { eventId: id })
  assert.equal(w1.body.outcome, 'paid')
  assert.equal((await report(req.id)).payment_status, 'paid')
  const w2 = await webhook({ event: 'payment.captured', payload: { payment: { entity: payment } } }, { eventId: id })
  assert.equal(w2.body.duplicate, true)
})

test('live-mode webhook for a test order is ignored', async () => {
  const uid = await d.newCustomer('9000000002')
  const req = await d.newRequest(uid)
  const o = await call('/api/payments/order', { reportId: req.id }, `user:${uid}`)
  const { payment } = rp.pay(o.body.orderId)
  const w = await webhook({ event: 'payment.captured', payload: { payment: { entity: payment } } }, { secret: 'wh_live_secret' })
  assert.equal(w.body.outcome, 'mode_mismatch')
  assert.equal((await report(req.id)).payment_status, 'awaiting')
})

test('"Check payment status": authorized-but-not-captured payment gets captured and recorded', async () => {
  const uid = await d.newCustomer('9000000003')
  const req = await d.newRequest(uid)
  const o = await call('/api/payments/order', { reportId: req.id }, `user:${uid}`)
  const { payment } = rp.pay(o.body.orderId, { status: 'authorized', method: 'netbanking' })
  const s = await call('/api/payments/sync', { reportId: req.id }, `user:${uid}`)
  assert.equal(s.body.paymentStatus, 'paid')
  assert.equal(rp.payments.get(payment.id).status, 'captured')
  // another customer can't sync it, an admin can
  const other = await d.newCustomer('9000000004')
  assert.equal((await call('/api/payments/sync', { reportId: req.id }, `user:${other}`)).status, 404)
  assert.equal((await call('/api/payments/sync', { reportId: req.id }, `admin:${other}`)).status, 200)
})

test('order reused when already paid elsewhere (other tab)', async () => {
  const uid = await d.newCustomer('9000000005')
  const req = await d.newRequest(uid)
  const o = await call('/api/payments/order', { reportId: req.id }, `user:${uid}`)
  rp.pay(o.body.orderId) // paid in another tab, webhook not arrived yet
  const again = await call('/api/payments/order', { reportId: req.id }, `user:${uid}`)
  assert.equal(again.body.code, 'ALREADY_PAID')
  assert.equal((await report(req.id)).payment_status, 'paid')
})

test('price changed by admin / test↔live switch → old order superseded, new order made', async () => {
  const uid = await d.newCustomer('9000000006')
  const req = await d.newRequest(uid)
  const o1 = await call('/api/payments/order', { reportId: req.id }, `user:${uid}`)
  await d.q('update reports set amount_due=299 where id=$1', [req.id])
  const o2 = await call('/api/payments/order', { reportId: req.id }, `user:${uid}`)
  assert.notEqual(o2.body.orderId, o1.body.orderId)
  assert.equal(o2.body.amount, 29900)
  assert.equal((await d.one('select status from payment_orders where order_id=$1', [o1.body.orderId])).status, 'superseded')
  await d.q(`update payment_orders set mode='live' where order_id=$1`, [o2.body.orderId])
  const o3 = await call('/api/payments/order', { reportId: req.id }, `user:${uid}`)
  assert.notEqual(o3.body.orderId, o2.body.orderId)
})

test('wrong amount is never accepted as paid', async () => {
  const uid = await d.newCustomer('9000000007')
  const req = await d.newRequest(uid)
  const o = await call('/api/payments/order', { reportId: req.id }, `user:${uid}`)
  const { payment } = rp.pay(o.body.orderId, { amount: 100 })
  const w = await webhook({ event: 'payment.captured', payload: { payment: { entity: payment } } })
  assert.equal(w.body.outcome, 'amount_mismatch')
  assert.equal((await report(req.id)).payment_status, 'awaiting')
  assert.equal((await d.one('select needs_review from payment_orders where order_id=$1', [o.body.orderId])).needs_review, true)
})

test('cancelled request, switch off, unknown order, refunds', async () => {
  const uid = await d.newCustomer('9000000008')
  const req = await d.newRequest(uid)
  await d.q(`update reports set status='cancelled' where id=$1`, [req.id])
  const c = await call('/api/payments/order', { reportId: req.id }, `user:${uid}`)
  assert.equal(c.body.code, 'CANCELLED')

  const req2 = await d.newRequest(uid)
  await d.q(`update app_settings set value='false' where key='online_payments'`)
  assert.equal((await call('/api/payments/order', { reportId: req2.id }, `user:${uid}`)).body.code, 'ONLINE_PAYMENTS_OFF')
  assert.equal((await call('/api/payments/config')).body.enabled, false)
  await d.q(`update app_settings set value='true' where key='online_payments'`)

  const w = await webhook({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_zzz', order_id: 'order_not_ours', amount: 100 } } } })
  assert.equal(w.body.outcome, 'not_our_order')

  const o = await call('/api/payments/order', { reportId: req2.id }, `user:${uid}`)
  const { payment } = rp.pay(o.body.orderId)
  await webhook({ event: 'payment.captured', payload: { payment: { entity: payment } } })
  const ref = await webhook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: payment.id, amount: 49900 } }, payment: { entity: { ...payment, amount_refunded: 49900 } } } })
  assert.equal(ref.body.outcome, 'refunded')
  assert.equal((await report(req2.id)).payment_status, 'refunded')
})

test('request history shows payment by "system"', async () => {
  const rows = await d.q(`select e.actor from report_events e join reports r on r.id=e.report_id where e.kind='payment' and e.status='paid' limit 1`)
  assert.equal(rows[0].actor, 'system')
})
