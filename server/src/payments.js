// Payment logic shared by the routes and the webhook.
import { config, credsFor } from './config.js'
import { db } from './db.js'
import { razorpay, toPaise, RazorpayError } from './razorpay.js'

export class AppError extends Error {
  constructor(status, code, message, extra) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

const log = (...a) => console.log('[payments]', ...a)

// Is this request something that can be paid online right now?
export function assertPayable(report) {
  if (!report) throw new AppError(404, 'NOT_FOUND', 'Request not found.')
  if (report.status === 'cancelled') throw new AppError(409, 'CANCELLED', 'This request was cancelled, so it cannot be paid. Please raise a query.')
  if (report.payment_status === 'paid' || report.payment_status === 'waived')
    throw new AppError(409, 'ALREADY_PAID', 'This request is already paid.', { paymentStatus: report.payment_status })
  if (report.payment_status !== 'awaiting') throw new AppError(409, 'NOT_PAYABLE', 'This request cannot be paid online. Please raise a query.')
  if (toPaise(report.amount_due) < 100) throw new AppError(409, 'NOTHING_TO_PAY', 'There is nothing to pay for this request.')
}

/**
 * Settle one of our orders by asking Razorpay what actually happened to it.
 * - captured payment          → record it (marks request paid)
 * - authorized, not captured  → capture it, then record
 * - only failed payments      → remember the latest failure
 * Returns 'paid' | 'needs_review' | 'already_recorded' | 'failed' | 'pending' | 'unpaid' | 'skipped'
 */
export async function settleOrder(order, source = 'sync') {
  const creds = credsFor(order.mode)
  if (!creds) return 'skipped' // e.g. keys for that mode were removed
  if (order.status === 'paid') return 'already_recorded'

  const list = await razorpay.fetchOrderPayments(creds, order.order_id)
  const payments = (list?.items || []).sort((a, b) => (b.created_at || 0) - (a.created_at || 0))

  const captured = payments.find((p) => p.status === 'captured')
  if (captured) {
    const r = await db.recordPayment({ orderId: order.order_id, paymentId: captured.id, amount: captured.amount, method: captured.method, source })
    return r?.result || 'paid'
  }

  const authorized = payments.find((p) => p.status === 'authorized')
  if (authorized) {
    if (authorized.amount !== order.amount_paise) {
      // never capture a wrong amount — let the database flag it for review
      const r = await db.recordPayment({ orderId: order.order_id, paymentId: authorized.id, amount: authorized.amount, method: authorized.method, source })
      return r?.result || 'needs_review'
    }
    try {
      await razorpay.capture(creds, authorized.id, authorized.amount, authorized.currency || 'INR')
    } catch (e) {
      // "already captured" is fine (auto-capture or a parallel call got there first)
      if (!(e instanceof RazorpayError) || !/captured/i.test(e.message)) throw e
    }
    const r = await db.recordPayment({ orderId: order.order_id, paymentId: authorized.id, amount: authorized.amount, method: authorized.method, source })
    return r?.result || 'paid'
  }

  if (payments.some((p) => p.status === 'created' || p.status === 'pending')) return 'pending'

  const failed = payments.find((p) => p.status === 'failed')
  if (failed) {
    await db.recordFailure({
      orderId: order.order_id, paymentId: failed.id, code: failed.error_code,
      description: failed.error_description, reason: failed.error_reason, source,
    })
    return 'failed'
  }
  return 'unpaid'
}

/** Create (or reuse) the Razorpay order for a request and return what Checkout needs. */
export async function createCheckout(report, userId) {
  assertPayable(report)
  if (!(await db.onlinePaymentsEnabled())) throw new AppError(503, 'ONLINE_PAYMENTS_OFF', 'Online payment is switched off right now. Please use the payment instructions on the request page.')
  if (!config.ready) throw new AppError(503, 'NOT_CONFIGURED', 'Online payment is not set up yet. Please try again later or raise a query.')

  const mode = config.mode
  const creds = config.active
  const amount = toPaise(report.amount_due)

  let order = await db.getOpenOrder(report.id)
  if (order && (order.mode !== mode || order.amount_paise !== amount)) {
    // price changed or switched test↔live → the old order must not be used any more
    await db.setOrderStatus(order.id, 'superseded')
    order = null
  }

  if (order) {
    // Maybe it was already paid (other tab / closed browser) — check before showing Checkout again
    const rp = await razorpay.fetchOrder(creds, order.order_id)
    if (rp?.status === 'paid') {
      const result = await settleOrder(order, 'sync')
      if (result === 'paid' || result === 'already_recorded') throw new AppError(409, 'ALREADY_PAID', 'This request is already paid.', { paymentStatus: 'paid' })
    }
  } else {
    const rp = await razorpay.createOrder(creds, {
      amount,
      currency: 'INR',
      receipt: String(report.report_code).slice(0, 40),
      notes: { report_id: report.id, report_code: report.report_code, user_id: userId },
    })
    try {
      order = await db.insertOrder({
        report_id: report.id, user_id: userId, mode, order_id: rp.id, amount_paise: amount, currency: rp.currency || 'INR',
      })
      await db.logEvent({ source: 'server', event: 'order.created', mode, order_id: rp.id, report_id: report.id, amount_paise: amount, outcome: 'created' })
      log('order created', rp.id, report.report_code, mode)
    } catch (e) {
      if (e.code !== '23505') throw e
      // another tab created one at the same moment — use that one (this Razorpay order is simply never used)
      order = await db.getOpenOrder(report.id)
      if (!order) throw e
    }
  }

  const profile = (await db.getProfile(report.user_id)) || {}
  const mobile = String(profile.mobile || report.inputs?.contact_mobile || '').replace(/\D/g, '')
  return {
    mode,
    keyId: creds.keyId,
    orderId: order.order_id,
    amount: order.amount_paise,
    currency: order.currency || 'INR',
    name: config.brand.name,
    description: `Scheme Eligibility Report · ${report.report_code}`,
    image: config.brand.logo || undefined,
    color: config.brand.color,
    reportCode: report.report_code,
    prefill: {
      name: profile.full_name || '',
      email: report.delivery_email || profile.email || '',
      contact: mobile ? (mobile.length === 10 ? `+91${mobile}` : `+${mobile}`) : '',
    },
  }
}
