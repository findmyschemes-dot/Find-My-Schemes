import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { router } from './routes.js'
import { razorpayWebhook } from './webhook.js'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', true)

app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' })
  next()
})

// Webhook first, with the RAW body (needed to check Razorpay's signature)
app.post('/api/webhooks/razorpay', express.raw({ type: '*/*', limit: '1mb' }), razorpayWebhook)

// Website calls: only from our own sites
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || config.allowedOrigins.includes(origin.replace(/\/+$/, ''))),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })
)
app.use(express.json({ limit: '20kb' }))

app.get(['/', '/health'], (_req, res) =>
  res.json({ ok: true, service: 'find-my-schemes-payments', mode: config.mode, ready: config.ready, problems: config.problems })
)

app.use(router)

app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }))

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON', code: 'BAD_REQUEST' })
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500
  const fromRazorpay = err.name === 'RazorpayError' || err.constructor?.name === 'RazorpayError'
  if (status >= 500) console.error('[error]', err.code || '', err.message)
  res.status(fromRazorpay && status < 500 ? 502 : status).json({
    error: status >= 500 && !err.code ? 'Something went wrong. Please try again.' : err.message,
    code: err.code || 'SERVER_ERROR',
    ...(err.extra || {}),
  })
})

export default app
