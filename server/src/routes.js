import express from 'express'
import { config, credsFor } from './config.js'
import { db } from './db.js'
import { razorpay, verifyPaymentSignature, RazorpayError } from './razorpay.js'
import { AppError, assertPayable, createCheckout, settleOrder } from './payments.js'

export const router = express.Router()

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(String(v || ''))

// ---- signed-in customer (Supabase session token from the website) ----
const requireUser = wrap(async (req, _res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const user = await db.userFromToken(token)
  if (!user) throw new AppError(401, 'NOT_SIGNED_IN', 'Session expired. Please log in again.')
  req.user = user
  req.token = token
  next()
})

// Light per-user limit so a stuck button / script can't hammer Razorpay
const hits = new Map()
const limit = (max, windowMs) => (req, _res, next) => {
  const key = `${req.path}:${req.user?.id}`
  const now = Date.now()
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs)
  list.push(now)
  hits.set(key, list)
  if (list.length > max) return next(new AppError(429, 'TOO_MANY', 'Too many attempts. Please wait a minute and try again.'))
  next()
}

async function loadOwnReport(req, { allowAdmin = false } = {}) {
  const reportId = req.body?.reportId
  if (!isUuid(reportId)) throw new AppError(400, 'BAD_REQUEST', 'reportId is required.')
  const report = await db.getReport(reportId)
  // The customer only ever sees "Request not found"; the real reason goes to the server log (Vercel → Logs)
  if (!report) {
    console.warn('[payments] refused: request not in database (or server cannot read it — check SUPABASE_SERVICE_ROLE_KEY)', { path: req.path, reportId, userId: req.user.id })
    throw new AppError(404, 'NOT_FOUND', 'Request not found.')
  }
  if (report.user_id !== req.user.id) {
    if (!(allowAdmin && (await db.isAdmin(req.token)))) {
      console.warn('[payments] refused: request belongs to another account', { path: req.path, reportId, userId: req.user.id })
      throw new AppError(404, 'NOT_FOUND', 'Request not found.')
    }
    req.isAdmin = true
  }
  return report
}

// ---------------------------------------------------------------------
// Public: is online payment available? (the website decides which payment box to show)
// ---------------------------------------------------------------------
router.get('/api/payments/config', wrap(async (_req, res) => {
  const enabled = config.ready && (await db.onlinePaymentsEnabled().catch(() => false))
  res.json({ enabled, mode: config.mode, keyId: enabled ? config.active.keyId : null })
}))

// ---------------------------------------------------------------------
// 1) Start paying: create / reuse the Razorpay order for this request
// ---------------------------------------------------------------------
router.post('/api/payments/order', requireUser, limit(10, 60_000), wrap(async (req, res) => {
  const report = await loadOwnReport(req)
  const checkout = await createCheckout(report, req.user.id)
  res.json(checkout)
}))

// ---------------------------------------------------------------------
// 2) Checkout said "success": check the signature AND ask Razorpay, then mark paid
// ---------------------------------------------------------------------
router.post('/api/payments/verify', requireUser, limit(20, 60_000), wrap(async (req, res) => {
  const report = await loadOwnReport(req)
  const orderId = str(req.body.razorpay_order_id, 64)
  const paymentId = str(req.body.razorpay_payment_id, 64)
  const signature = str(req.body.razorpay_signature, 256)
  if (!orderId || !paymentId || !signature) throw new AppError(400, 'BAD_REQUEST', 'Payment details missing.')

  const order = await db.getOrder(orderId)
  if (!order || order.report_id !== report.id) throw new AppError(400, 'ORDER_MISMATCH', 'This payment does not belong to this request.')
  const creds = credsFor(order.mode)
  if (!creds) throw new AppError(503, 'NOT_CONFIGURED', 'Payment keys are missing on the server.')

  if (!verifyPaymentSignature({ orderId, paymentId, signature, keySecret: creds.keySecret })) {
    await db.logEvent({ source: 'verify', event: 'signature.invalid', mode: order.mode, order_id: orderId, payment_id: paymentId, report_id: report.id, outcome: 'rejected' })
    throw new AppError(400, 'BAD_SIGNATURE', 'Payment could not be verified. If money was deducted, it is safe — it will be confirmed automatically or refunded. Please raise a query if it does not update.')
  }

  let payment
  try {
    payment = await razorpay.fetchPayment(creds, paymentId)
  } catch (e) {
    // Signature is genuine but Razorpay is slow to answer: the webhook / next check will finish it
    if (e instanceof RazorpayError && e.code === 'RAZORPAY_UNREACHABLE') return res.status(202).json({ status: 'pending' })
    throw e
  }
  if (payment.order_id !== orderId) throw new AppError(400, 'ORDER_MISMATCH', 'This payment does not belong to this request.')

  if (payment.status === 'authorized') {
    try {
      await razorpay.capture(creds, payment.id, payment.amount, payment.currency || 'INR')
      payment.status = 'captured'
    } catch (e) {
      if (/captured/i.test(e.message)) payment.status = 'captured'
      else throw e
    }
  }

  if (payment.status === 'captured') {
    const r = await db.recordPayment({ orderId, paymentId, amount: payment.amount, method: payment.method, source: 'verify' })
    const status = r?.result === 'already_recorded' ? 'paid' : r?.result
    return res.json({ status, reportId: report.id })
  }
  if (payment.status === 'failed') {
    await db.recordFailure({ orderId, paymentId, code: payment.error_code, description: payment.error_description, reason: payment.error_reason, source: 'verify' })
    return res.json({ status: 'failed', error: payment.error_description || 'Payment failed.' })
  }
  res.status(202).json({ status: 'pending' })
}))

// ---------------------------------------------------------------------
// 3) Checkout reported a failed try (card declined, UPI timeout …) — remember why
// ---------------------------------------------------------------------
router.post('/api/payments/failed', requireUser, limit(30, 60_000), wrap(async (req, res) => {
  const report = await loadOwnReport(req)
  const orderId = str(req.body.orderId, 64)
  const order = orderId ? await db.getOrder(orderId) : null
  if (!order || order.report_id !== report.id) return res.json({ ok: true }) // nothing to record
  const err = req.body.error || {}
  await db.recordFailure({
    orderId, paymentId: str(err.metadata?.payment_id || req.body.paymentId, 64) || null,
    code: str(err.code, 80), description: str(err.description, 500), reason: str(err.reason, 120), source: 'checkout',
  })
  res.json({ ok: true })
}))

// ---------------------------------------------------------------------
// 4) "Money deducted but still awaiting?" — ask Razorpay about every order of this request.
//    Customers (own request) and admins (any request).
// ---------------------------------------------------------------------
router.post('/api/payments/sync', requireUser, limit(12, 60_000), wrap(async (req, res) => {
  const report = await loadOwnReport(req, { allowAdmin: true })
  const orders = (await db.listOrders(report.id)).filter((o) => o.status !== 'paid').slice(0, 5)
  const results = []
  for (const o of orders) {
    try {
      results.push({ orderId: o.order_id, mode: o.mode, result: await settleOrder(o, 'sync') })
    } catch (e) {
      results.push({ orderId: o.order_id, mode: o.mode, result: 'error', error: e.message })
    }
  }
  const fresh = await db.getReport(report.id)
  res.json({ paymentStatus: fresh.payment_status, checked: results.length, results })
}))

// small helper for the website: can this request be paid now?
router.post('/api/payments/check', requireUser, wrap(async (req, res) => {
  const report = await loadOwnReport(req)
  try {
    assertPayable(report)
    res.json({ payable: true })
  } catch (e) {
    res.json({ payable: false, code: e.code, message: e.message })
  }
}))
