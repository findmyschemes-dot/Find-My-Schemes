// Reads server/.env (or Vercel environment variables) and checks the setup.
// Secrets never leave this server: only the PUBLIC key id is ever sent to the browser.
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(here, '..', '.env') })

const env = (k, d = '') => String(process.env[k] ?? d).trim()

const mode = env('RAZORPAY_MODE', 'test').toLowerCase() === 'live' ? 'live' : 'test'

const keysFor = (m) => {
  const M = m.toUpperCase()
  return {
    mode: m,
    keyId: env(`RAZORPAY_${M}_KEY_ID`),
    keySecret: env(`RAZORPAY_${M}_KEY_SECRET`),
    webhookSecret: env(`RAZORPAY_${M}_WEBHOOK_SECRET`),
  }
}

const razorpay = { test: keysFor('test'), live: keysFor('live') }

const problems = []
const placeholder = (v) => !v || /x{6,}|YOUR-/i.test(v)
for (const m of ['test', 'live']) {
  const k = razorpay[m]
  const used = m === mode
  if (placeholder(k.keyId) || placeholder(k.keySecret)) {
    if (used) problems.push(`Razorpay ${m} keys missing (RAZORPAY_${m.toUpperCase()}_KEY_ID / _KEY_SECRET)`)
    k.keyId = placeholder(k.keyId) ? '' : k.keyId
    k.keySecret = placeholder(k.keySecret) ? '' : k.keySecret
    continue
  }
  // Safety: a live key in the test slot (or the other way round) would charge or not charge by mistake
  if (!k.keyId.startsWith(`rzp_${m}_`)) {
    problems.push(`RAZORPAY_${m.toUpperCase()}_KEY_ID should start with rzp_${m}_ — check that test and live keys are not swapped`)
    if (used) k.keyId = ''
  }
  if (used && !k.webhookSecret) problems.push(`RAZORPAY_${m.toUpperCase()}_WEBHOOK_SECRET not set — payments still work, but closed-browser payments are only picked up when the customer returns`)
}

const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '')
const supabaseServiceKey = env('SUPABASE_SERVICE_ROLE_KEY')
if (placeholder(supabaseUrl) || placeholder(supabaseServiceKey)) problems.push('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')

// The server needs the MASTER key. With the public (anon / publishable) key it can still check logins,
// but the database hides every request from it → every payment fails with "Request not found".
function supabaseKeyInfo(k) {
  if (!k) return { kind: 'missing' }
  if (k.startsWith('sb_secret_')) return { kind: 'service' }
  if (k.startsWith('sb_publishable_')) return { kind: 'public' }
  const parts = k.split('.')
  if (parts.length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      return { kind: claims.role === 'service_role' ? 'service' : claims.role === 'anon' ? 'public' : 'unknown', ref: claims.ref }
    } catch { /* not a JWT */ }
  }
  return { kind: 'unknown' }
}
const keyInfo = supabaseKeyInfo(supabaseServiceKey)
let wrongSupabaseKey = false
if (keyInfo.kind === 'public') {
  wrongSupabaseKey = true
  problems.push('SUPABASE_SERVICE_ROLE_KEY is the PUBLIC (anon / publishable) key — use the service_role / secret key from Supabase → Project Settings → API Keys, then redeploy')
}
const urlRef = (supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/) || [])[1]
if (keyInfo.ref && urlRef && keyInfo.ref !== urlRef) {
  wrongSupabaseKey = true
  problems.push(`SUPABASE_SERVICE_ROLE_KEY belongs to another Supabase project (${keyInfo.ref}) than SUPABASE_URL (${urlRef})`)
}

export const config = {
  mode,
  razorpay,
  active: razorpay[mode],
  // true when the active mode can take payments
  ready: Boolean(razorpay[mode].keyId && razorpay[mode].keySecret && !placeholder(supabaseUrl) && !placeholder(supabaseServiceKey) && !wrongSupabaseKey),
  supabaseUrl,
  supabaseServiceKey,
  allowedOrigins: env('ALLOWED_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  brand: {
    name: env('BRAND_NAME', 'Find My Schemes'),
    logo: env('BRAND_LOGO_URL'),
    color: env('BRAND_COLOR', '#16332c'),
  },
  razorpayApiBase: env('RAZORPAY_API_BASE', 'https://api.razorpay.com/v1').replace(/\/+$/, ''), // overridable for tests
  port: Number(env('PORT', '4000')) || 4000,
  problems,
}

export const credsFor = (m) => {
  const k = config.razorpay[m]
  return k && k.keyId && k.keySecret ? k : null
}
