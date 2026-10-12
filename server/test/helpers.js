// Test harness: real database schema (PGlite = Postgres in WebAssembly) + a fake Razorpay API.
import { PGlite } from '@electric-sql/pglite'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const PRELUDE = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}', phone text, phone_confirmed_at timestamptz, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
`

export async function makeDb() {
  const pg = new PGlite()
  await pg.exec(PRELUDE)
  const schema = fs.readFileSync(path.join(here, '..', '..', 'supabase', 'schema.sql'), 'utf8').replace(/create extension if not exists pgcrypto;/, '')
  await pg.exec(schema)
  const q = async (sql, params) => (await pg.query(sql, params)).rows
  const one = async (sql, params) => (await q(sql, params))[0] || null
  const wrapErr = async (fn) => {
    try { return await fn() } catch (e) { const x = new Error(e.message); x.code = e.code; throw x }
  }
  const impl = {
    userFromToken: async (t) => (t?.startsWith('user:') || t?.startsWith('admin:') ? { id: t.split(':')[1] } : null),
    isAdmin: async (t) => t?.startsWith('admin:'),
    onlinePaymentsEnabled: async () => {
      const r = await one(`select value from app_settings where key='online_payments'`)
      return r ? r.value !== false : true
    },
    getReport: (id) => one('select * from reports where id=$1', [id]),
    getProfile: (id) => one('select full_name, email, mobile from profiles where id=$1', [id]),
    getOpenOrder: (rid) => one(`select * from payment_orders where report_id=$1 and status in ('created','attempted') order by created_at desc limit 1`, [rid]),
    getOrder: (oid) => one('select * from payment_orders where order_id=$1', [oid]),
    listOrders: (rid) => q('select * from payment_orders where report_id=$1 order by created_at desc limit 10', [rid]),
    insertOrder: (r) => wrapErr(() => one(
      `insert into payment_orders (report_id,user_id,mode,order_id,amount_paise,currency) values ($1,$2,$3,$4,$5,$6) returning *`,
      [r.report_id, r.user_id, r.mode, r.order_id, r.amount_paise, r.currency])),
    setOrderStatus: (id, s) => q('update payment_orders set status=$2 where id=$1', [id, s]),
    recordPayment: async (p) => (await one('select record_online_payment($1,$2,$3,$4,$5) as j', [p.orderId, p.paymentId, p.amount, p.method || null, p.source])).j,
    recordFailure: (p) => q('select record_payment_failure($1,$2,$3,$4,$5,$6)', [p.orderId, p.paymentId || null, p.code || null, p.description || null, p.reason || null, p.source]),
    recordRefund: async (p) => (await one('select record_online_refund($1,$2,$3) as j', [p.paymentId, p.amount, p.refundId])).j,
    logEvent: (r) => q(`insert into payment_events (source,event,mode,order_id,payment_id,report_id,amount_paise,outcome) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [r.source, r.event, r.mode || null, r.order_id || null, r.payment_id || null, r.report_id || null, r.amount_paise ?? null, r.outcome || null]),
    webhookBegin: async (r) => {
      try {
        await wrapErr(() => q(`insert into payment_events (event_id,source,event,mode,order_id,payment_id,amount_paise,payload,processed) values ($1,$2,$3,$4,$5,$6,$7,$8,false)`,
          [r.event_id, r.source, r.event, r.mode, r.order_id, r.payment_id, r.amount_paise, r.payload]))
        return { duplicate: false }
      } catch (e) {
        if (e.code !== '23505') throw e
        const prev = await one('select processed from payment_events where event_id=$1', [r.event_id])
        return { duplicate: true, processed: prev.processed }
      }
    },
    webhookFinish: (id, f) => q('update payment_events set processed=$2, outcome=coalesce($3, outcome), error=$4 where event_id=$1', [id, f.processed, f.outcome || null, f.error || null]),
  }
  const newCustomer = async (mobile = '9876543210') => {
    const u = await one(`insert into auth.users (raw_user_meta_data) values ($1) returning id`, [{ full_name: 'Test Customer', contact_email: 'c@example.com', mobile }])
    return u.id
  }
  const newRequest = async (userId, amount = 499) =>
    one(`insert into reports (user_id, inputs, business_name, delivery_email, amount_due) values ($1,'{}','Test Biz','c@example.com',$2) returning *`, [userId, amount])
  return { pg, q, one, impl, newCustomer, newRequest }
}

// ---- fake Razorpay ----
export function makeRazorpay(keySecret) {
  const orders = new Map()
  const payments = new Map()
  let n = 0
  const app = express()
  app.use(express.json())
  const auth = (req, res, next) => {
    const [id, secret] = Buffer.from((req.get('authorization') || '').replace('Basic ', ''), 'base64').toString().split(':')
    if (!id?.startsWith('rzp_') || !secret) return res.status(401).json({ error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } })
    next()
  }
  app.use(auth)
  app.post('/v1/orders', (req, res) => {
    const id = `order_T${++n}`
    const o = { id, entity: 'order', amount: req.body.amount, currency: req.body.currency, receipt: req.body.receipt, notes: req.body.notes, status: 'created' }
    orders.set(id, o)
    res.json(o)
  })
  app.get('/v1/orders/:id', (req, res) => (orders.has(req.params.id) ? res.json(orders.get(req.params.id)) : res.status(400).json({ error: { description: 'not found' } })))
  app.get('/v1/orders/:id/payments', (req, res) => res.json({ items: [...payments.values()].filter((p) => p.order_id === req.params.id) }))
  app.get('/v1/payments/:id', (req, res) => (payments.has(req.params.id) ? res.json(payments.get(req.params.id)) : res.status(400).json({ error: { description: 'not found' } })))
  app.post('/v1/payments/:id/capture', (req, res) => {
    const p = payments.get(req.params.id)
    if (!p) return res.status(400).json({ error: { description: 'not found' } })
    if (p.status === 'captured') return res.status(400).json({ error: { code: 'BAD_REQUEST_ERROR', description: 'This payment has already been captured' } })
    if (req.body.amount !== p.amount) return res.status(400).json({ error: { description: 'amount mismatch' } })
    p.status = 'captured'
    orders.get(p.order_id).status = 'paid'
    res.json(p)
  })
  // customer "pays" in Checkout
  const pay = (orderId, { status = 'captured', amount, method = 'upi', error } = {}) => {
    const o = orders.get(orderId)
    const id = `pay_T${++n}`
    const p = { id, entity: 'payment', order_id: orderId, amount: amount ?? o.amount, currency: 'INR', status, method, created_at: Date.now() / 1000 + n,
      error_code: error ? 'BAD_REQUEST_ERROR' : null, error_description: error || null, error_reason: error ? 'payment_failed' : null }
    payments.set(id, p)
    if (status === 'captured') o.status = 'paid'
    else o.status = o.status === 'paid' ? 'paid' : 'attempted'
    const signature = crypto.createHmac('sha256', keySecret).update(`${orderId}|${id}`).digest('hex')
    return { payment: p, signature }
  }
  return { app, orders, payments, pay }
}

export const listen = (app) => new Promise((r) => { const s = app.listen(0, () => r(s)) })
