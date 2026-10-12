// Everything the payment server reads/writes in Supabase, in one place.
// Uses the service role key, so it bypasses Row Level Security — every route checks ownership itself.
import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'

let client = null
const sb = () => {
  if (!client) {
    client = createClient(config.supabaseUrl || 'http://localhost', config.supabaseServiceKey || 'missing', {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

const unwrap = ({ data, error }) => {
  if (error) {
    const e = new Error(error.message)
    e.code = error.code
    throw e
  }
  return data
}

const supabaseDb = {
  // Who is calling? (the website sends the customer's Supabase session token)
  async userFromToken(token) {
    if (!token) return null
    const { data, error } = await sb().auth.getUser(token)
    if (error || !data?.user) return null
    return { id: data.user.id }
  },

  // Admin check runs the database's own is_admin() as that user
  async isAdmin(token) {
    const userClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data, error } = await userClient.rpc('is_admin')
    return !error && data === true
  },

  async onlinePaymentsEnabled() {
    const { data } = await sb().from('app_settings').select('value').eq('key', 'online_payments').maybeSingle()
    return data ? data.value !== false && data.value !== 'false' : true
  },

  getReport: (id) => sb().from('reports').select('*').eq('id', id).maybeSingle().then(unwrap),
  getProfile: (userId) => sb().from('profiles').select('full_name, email, mobile').eq('id', userId).maybeSingle().then(unwrap),

  getOpenOrder: (reportId) =>
    sb().from('payment_orders').select('*').eq('report_id', reportId).in('status', ['created', 'attempted'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle().then(unwrap),
  getOrder: (orderId) => sb().from('payment_orders').select('*').eq('order_id', orderId).maybeSingle().then(unwrap),
  listOrders: (reportId) =>
    sb().from('payment_orders').select('*').eq('report_id', reportId).order('created_at', { ascending: false }).limit(10).then(unwrap),
  insertOrder: (row) => sb().from('payment_orders').insert(row).select().single().then(unwrap),
  setOrderStatus: (id, status) => sb().from('payment_orders').update({ status }).eq('id', id).then(unwrap),

  recordPayment: (p) =>
    sb().rpc('record_online_payment', {
      p_order_id: p.orderId, p_payment_id: p.paymentId, p_amount_paise: p.amount, p_method: p.method || null, p_source: p.source,
    }).then(unwrap),
  recordFailure: (p) =>
    sb().rpc('record_payment_failure', {
      p_order_id: p.orderId, p_payment_id: p.paymentId || null, p_code: p.code || null,
      p_description: p.description || null, p_reason: p.reason || null, p_source: p.source,
    }).then(unwrap),
  recordRefund: (p) =>
    sb().rpc('record_online_refund', { p_payment_id: p.paymentId, p_refunded_paise: p.amount, p_refund_id: p.refundId }).then(unwrap),

  logEvent: (row) => sb().from('payment_events').insert(row).then(unwrap),

  // Webhook de-duplication: Razorpay may send the same event more than once
  async webhookBegin(row) {
    const { error } = await sb().from('payment_events').insert({ ...row, processed: false })
    if (!error) return { duplicate: false }
    if (error.code !== '23505') throw new Error(error.message)
    const prev = await sb().from('payment_events').select('processed').eq('event_id', row.event_id).maybeSingle().then(unwrap)
    return { duplicate: true, processed: Boolean(prev?.processed) }
  },
  webhookFinish: (eventId, fields) => sb().from('payment_events').update(fields).eq('event_id', eventId).then(unwrap),
}

// Tests swap in a different implementation
let impl = supabaseDb
export const db = new Proxy({}, { get: (_, k) => impl[k] })
export const setDbForTests = (x) => { impl = x }
