// Minimal Razorpay REST client (no SDK needed) + signature checks.
// Docs: https://razorpay.com/docs/api/orders/  ·  https://razorpay.com/docs/payments/server-integration/nodejs/
import crypto from 'node:crypto'
import { config } from './config.js'

export class RazorpayError extends Error {
  constructor(status, body) {
    const e = body?.error || {}
    super(e.description || `Razorpay request failed (${status})`)
    this.status = status
    this.code = e.code || 'RAZORPAY_ERROR'
    this.reason = e.reason
  }
}

async function call(creds, method, path, body) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(`${config.razorpayApiBase}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64'),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    if (!res.ok) throw new RazorpayError(res.status, json)
    return json
  } catch (e) {
    if (e instanceof RazorpayError) throw e
    const err = new RazorpayError(503, { error: { description: e.name === 'AbortError' ? 'Razorpay did not respond in time' : 'Could not reach Razorpay' } })
    err.code = 'RAZORPAY_UNREACHABLE'
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export const razorpay = {
  createOrder: (creds, { amount, currency = 'INR', receipt, notes }) =>
    call(creds, 'POST', '/orders', { amount, currency, receipt, notes, partial_payment: false }),
  fetchOrder: (creds, orderId) => call(creds, 'GET', `/orders/${encodeURIComponent(orderId)}`),
  fetchOrderPayments: (creds, orderId) => call(creds, 'GET', `/orders/${encodeURIComponent(orderId)}/payments`),
  fetchPayment: (creds, paymentId) => call(creds, 'GET', `/payments/${encodeURIComponent(paymentId)}`),
  capture: (creds, paymentId, amount, currency = 'INR') =>
    call(creds, 'POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount, currency }),
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8')
  const y = Buffer.from(String(b || ''), 'utf8')
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex')

// Checkout success handler gives order_id, payment_id, signature → must match HMAC(order_id|payment_id, key_secret)
export const verifyPaymentSignature = ({ orderId, paymentId, signature, keySecret }) =>
  safeEqual(hmac(keySecret, `${orderId}|${paymentId}`), signature)

// Webhooks: HMAC(raw request body, webhook secret) in header x-razorpay-signature
export const verifyWebhookSignature = (rawBody, signature, secret) =>
  Boolean(secret) && safeEqual(hmac(secret, rawBody), signature)

export const toPaise = (rupees) => Math.round(Number(rupees) * 100)
