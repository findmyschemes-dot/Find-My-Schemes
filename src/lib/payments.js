// Online payment (Razorpay) — talks to the payment server in /server.
// The browser never sees a secret: the server creates the order, checks the result and marks the request paid.
import { supabase } from './supabase'

export const PAYMENTS_API = (import.meta.env.VITE_PAYMENTS_API_URL || '').replace(/\/+$/, '')
export const paymentsServerConfigured = Boolean(PAYMENTS_API)

const CHECKOUT_JS = 'https://checkout.razorpay.com/v1/checkout.js'

export class PaymentError extends Error {
  constructor(message, code, extra) {
    super(message)
    this.code = code
    Object.assign(this, extra)
  }
}

async function call(path, body) {
  if (!PAYMENTS_API) throw new PaymentError('Online payment is not set up yet.', 'NOT_CONFIGURED')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  let res
  try {
    res = await fetch(`${PAYMENTS_API}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new PaymentError('Could not reach the payment service. Check the internet connection and try again.', 'NETWORK')
  }
  let json = {}
  try { json = await res.json() } catch { /* empty */ }
  if (!res.ok && res.status !== 202) throw new PaymentError(json.error || 'Payment service error. Please try again.', json.code || `HTTP_${res.status}`, json)
  return { ...json, httpStatus: res.status }
}

export const paymentsApi = {
  config: () => call('/api/payments/config'),
  createOrder: (reportId) => call('/api/payments/order', { reportId }),
  verify: (reportId, resp) => call('/api/payments/verify', { reportId, ...resp }),
  reportFailure: (reportId, orderId, error) => call('/api/payments/failed', { reportId, orderId, error }).catch(() => {}),
  sync: (reportId) => call('/api/payments/sync', { reportId }),
}

// Cached: is online payment switched on and set up?
let configPromise = null
export function getPaymentConfig(force = false) {
  if (!paymentsServerConfigured) return Promise.resolve({ enabled: false, mode: null })
  if (!configPromise || force) {
    configPromise = paymentsApi.config().catch(() => ({ enabled: false, mode: null, unreachable: true }))
  }
  return configPromise
}

let scriptPromise = null
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = CHECKOUT_JS
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        scriptPromise = null
        s.remove()
        reject(new PaymentError('The payment window could not load. Check the internet connection (or ad-blocker) and try again.', 'CHECKOUT_LOAD'))
      }
      document.body.appendChild(s)
    })
  }
  return scriptPromise
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// After Razorpay says "paid" but our confirmation is slow: ask a few times
async function confirmBySync(reportId, tries = 4) {
  for (let i = 0; i < tries; i++) {
    await wait(2500)
    try {
      const s = await paymentsApi.sync(reportId)
      if (s.paymentStatus === 'paid') return true
    } catch { /* keep trying */ }
  }
  return false
}

/**
 * Open Razorpay Checkout for a request.
 * Resolves with { status } — never rejects for normal outcomes:
 *   'paid'          money received and request marked paid
 *   'pending'       Razorpay took the payment but confirmation is still on its way (webhook will finish it)
 *   'failed'        payment tried and failed (error = reason) — request stays "Awaiting payment"
 *   'dismissed'     window closed without paying
 *   'needs_review'  money received but something needs the team (e.g. request was cancelled)
 * Rejects (PaymentError) only when checkout could not start (server down, already paid, etc.).
 */
export async function startPayment(report, { onStage } = {}) {
  onStage?.('starting')
  const [order] = await Promise.all([paymentsApi.createOrder(report.id), loadCheckout()])

  return new Promise((resolve) => {
    let lastError = null
    let settled = false
    const done = (r) => {
      if (!settled) {
        settled = true
        resolve(r)
      }
    }

    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      image: order.image,
      prefill: order.prefill,
      notes: { report_code: order.reportCode },
      theme: { color: order.color || '#16332c' },
      retry: { enabled: true, max_count: 4 },
      modal: {
        confirm_close: true,
        escape: false,
        ondismiss: () => done(lastError ? { status: 'failed', error: lastError } : { status: 'dismissed' }),
      },
      handler: async (resp) => {
        onStage?.('verifying')
        try {
          const v = await paymentsApi.verify(report.id, resp)
          if (v.status === 'paid') return done({ status: 'paid' })
          if (v.status === 'needs_review') return done({ status: 'needs_review' })
          if (v.status === 'failed') return done({ status: 'failed', error: v.error })
        } catch (e) {
          if (e.code === 'BAD_SIGNATURE') return done({ status: 'pending', error: e.message })
        }
        done((await confirmBySync(report.id)) ? { status: 'paid' } : { status: 'pending' })
      },
    })

    rzp.on('payment.failed', (resp) => {
      // Checkout stays open so the customer can retry with another method
      lastError = resp?.error?.description || 'Payment failed.'
      paymentsApi.reportFailure(report.id, order.orderId, resp?.error)
    })

    onStage?.('checkout')
    rzp.open()
  })
}

export const paymentErrorText = (e) => {
  switch (e?.code) {
    case 'ALREADY_PAID': return 'This request is already paid.'
    case 'NOT_SIGNED_IN': return 'Session expired. Please log in again and retry.'
    default: return e?.message || 'Payment could not be started. Please try again.'
  }
}
