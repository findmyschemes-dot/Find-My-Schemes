// Razorpay → our server. Catches payments where the customer's browser closed before confirming,
// late UPI confirmations, failures and refunds. Set up in Razorpay Dashboard → Webhooks (see README).
import { config, credsFor } from './config.js'
import { db } from './db.js'
import { verifyWebhookSignature } from './razorpay.js'
import { settleOrder } from './payments.js'

const HANDLED = new Set(['payment.authorized', 'payment.captured', 'payment.failed', 'order.paid', 'refund.processed'])

const rawOf = (req) => {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)
  if (req.rawBody) return Buffer.from(req.rawBody)
  return null
}

export async function razorpayWebhook(req, res) {
  const raw = rawOf(req)
  const signature = req.get('x-razorpay-signature') || ''
  if (!raw) {
    console.error('[webhook] raw body not available — signature cannot be checked')
    return res.status(400).json({ error: 'raw body missing' })
  }

  // Which account mode sent this? (test and live webhooks have different secrets)
  const mode = ['live', 'test'].find((m) => verifyWebhookSignature(raw, signature, config.razorpay[m].webhookSecret))
  if (!mode) {
    console.warn('[webhook] bad signature — ignored')
    return res.status(400).json({ error: 'invalid signature' })
  }

  let body
  try { body = JSON.parse(raw.toString('utf8')) } catch { return res.status(400).json({ error: 'invalid json' }) }

  const event = String(body.event || '')
  const payment = body.payload?.payment?.entity
  const refund = body.payload?.refund?.entity
  const rpOrder = body.payload?.order?.entity
  const orderId = payment?.order_id || rpOrder?.id || null
  const eventId = req.get('x-razorpay-event-id') || `${event}:${payment?.id || refund?.id || orderId}:${body.created_at || ''}`

  const begin = await db.webhookBegin({
    event_id: eventId, source: 'webhook', event, mode, order_id: orderId,
    payment_id: payment?.id || refund?.payment_id || null, amount_paise: payment?.amount ?? refund?.amount ?? null,
    payload: body,
  })
  if (begin.duplicate && begin.processed) return res.json({ ok: true, duplicate: true })

  try {
    let outcome = 'ignored'
    if (HANDLED.has(event)) {
      if (event === 'refund.processed') {
        if (refund?.payment_id) {
          const total = payment?.amount_refunded ?? refund.amount
          const r = await db.recordRefund({ paymentId: refund.payment_id, amount: total, refundId: refund.id })
          outcome = r?.result || 'recorded'
        }
      } else {
        const order = orderId ? await db.getOrder(orderId) : null
        if (!order) outcome = 'not_our_order'
        else if (order.mode !== mode) outcome = 'mode_mismatch'
        else if (event === 'payment.failed') {
          await db.recordFailure({
            orderId, paymentId: payment?.id, code: payment?.error_code, description: payment?.error_description,
            reason: payment?.error_reason, source: 'webhook',
          })
          outcome = 'failed'
        } else if ((event === 'payment.captured' || event === 'order.paid') && payment?.id) {
          const r = await db.recordPayment({ orderId, paymentId: payment.id, amount: payment.amount, method: payment.method, source: 'webhook' })
          outcome = r?.result || 'paid'
        } else if (event === 'payment.authorized') {
          // capture it if auto-capture is off (settleOrder checks the amount first)
          outcome = credsFor(order.mode) ? await settleOrder(order, 'webhook') : 'skipped'
        }
      }
    }
    await db.webhookFinish(eventId, { processed: true, outcome, error: null })
    console.log('[webhook]', mode, event, orderId || '', '→', outcome)
    res.json({ ok: true, outcome })
  } catch (e) {
    console.error('[webhook] failed', event, e.message)
    await db.webhookFinish(eventId, { processed: false, error: String(e.message).slice(0, 600) }).catch(() => {})
    res.status(500).json({ error: 'processing failed' }) // Razorpay retries later
  }
}
