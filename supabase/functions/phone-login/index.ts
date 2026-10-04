// @ts-nocheck — this file runs on Supabase (Deno), not in the website. VS Code can't type-check Deno code without the Deno extension.
// Supabase Edge Function: phone-login
// ------------------------------------------------------------------
// Turns a Phone.Email confirmation into a Supabase login.
//
// The browser sends the `user_json_url` it got from the Phone.Email button.
// This function (on the server, so it can't be faked):
//   1. checks the URL really is on user.phone.email and reads the verified number from it (server-side)
//   2. finds the account for that number — or creates it (sign-up / first admin login)
//   3. returns a one-time login token; the browser exchanges it for a session
//
// Deploy: Supabase → Edge Functions → Deploy a new function → name "phone-login" →
//         paste this file → Deploy → then turn OFF "Verify JWT" for this function.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
// ------------------------------------------------------------------
import { createClient } from 'npm:@supabase/supabase-js@2'

const PHONE_EMAIL_HOST = 'user.phone.email'
// Super admins — always allowed into the admin panel (keep in sync with super_admin_phones() in schema.sql)
const SUPER_ADMINS = ['919121422554', '918500676890']
// hidden login address per number (never emailed). Any domain you control is fine.
const LOGIN_EMAIL_DOMAIN = Deno.env.get('LOGIN_EMAIL_DOMAIN') || 'users.findmyschemes.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

const sha256 = async (text: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const clean = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function handle(req: Request, deps?: { admin?: any; fetcher?: typeof fetch }) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ ok: false, code: 'method_not_allowed' })

  try {
    const body = await req.json().catch(() => ({}))
    const mode = ['login', 'signup', 'admin'].includes(body.mode) ? body.mode : 'login'
    const profile = body.profile || {}

    // 1. Only trust confirmations hosted by Phone.Email
    let url: URL
    try {
      url = new URL(String(body.user_json_url || ''))
    } catch {
      return reply({ ok: false, code: 'bad_url' })
    }
    if (url.protocol !== 'https:' || url.hostname !== PHONE_EMAIL_HOST || !url.pathname.endsWith('.json'))
      return reply({ ok: false, code: 'bad_url' })

    const fetcher = deps?.fetcher || fetch
    const res = await fetcher(url.toString(), { redirect: 'error' })
    if (!res.ok) return reply({ ok: false, code: 'not_verified' })
    const pe = await res.json().catch(() => null)
    const cc = String(pe?.user_country_code ?? '').replace(/\D/g, '')
    let num = String(pe?.user_phone_number ?? '').replace(/\D/g, '')
    if (!num) return reply({ ok: false, code: 'not_verified' })
    if (num.length === 11 && num.startsWith('0')) num = num.slice(1)
    let digits = cc && !(num.length > 10 && num.startsWith(cc)) ? cc + num : num
    if (digits.length === 10) digits = '91' + digits
    if (!/^[0-9]{11,15}$/.test(digits)) return reply({ ok: false, code: 'not_verified' })

    const admin =
      deps?.admin ||
      createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
        auth: { persistSession: false, autoRefreshToken: false },
      })

    // Phone.Email may hand back the same confirmation again when it remembers the device
    // ("SessionIDFound"), so a link is allowed more than once; each use is logged.
    const urlHash = await sha256(url.toString())

    // 2a. Admin panel: number must be on the admin list
    if (mode === 'admin' && !SUPER_ADMINS.includes(digits)) {
      const { data: a } = await admin.from('admin_phones').select('phone').eq('phone', digits).eq('active', true).maybeSingle()
      if (!a) return reply({ ok: false, code: 'not_admin', phone: digits })
    }

    // 2b. Existing account for this number?
    const { data: prof } = await admin.from('profiles').select('id').eq('mobile', digits).maybeSingle()
    let userId: string | undefined = prof?.id
    let loginEmail = `${digits}@${LOGIN_EMAIL_DOMAIN}`
    let isNew = false

    if (!userId) {
      // Login with an unknown number → send them to sign-up (this confirmation stays usable)
      if (mode === 'login') return reply({ ok: false, code: 'not_registered', phone: digits })

      const peName = [clean(pe?.user_first_name), clean(pe?.user_last_name)].filter(Boolean).join(' ')
      const { data: created, error } = await admin.auth.admin.createUser({
        email: loginEmail,
        email_confirm: true,
        user_metadata: {
          full_name: clean(profile.full_name) || peName || null,
          business_name: clean(profile.business_name) || null,
          contact_email: clean(profile.email, 200).toLowerCase() || null,
          mobile: digits,
        },
        app_metadata: { verified_phone: digits, verified_by: 'phone.email' },
      })
      if (error) return reply({ ok: false, code: 'create_failed', message: error.message })
      userId = created.user.id
      isNew = true
    } else {
      // keep the server-verified number on the account and make sure it has its login address
      const { data: got, error } = await admin.auth.admin.getUserById(userId)
      if (error || !got?.user) return reply({ ok: false, code: 'account_missing' })
      const appMeta = got.user.app_metadata || {}
      const patch: Record<string, unknown> = {}
      if (appMeta.verified_phone !== digits) patch.app_metadata = { ...appMeta, verified_phone: digits, verified_by: 'phone.email' }
      if (!got.user.email) Object.assign(patch, { email: loginEmail, email_confirm: true })
      else loginEmail = got.user.email
      if (Object.keys(patch).length) await admin.auth.admin.updateUserById(userId, patch)
    }

    // audit log of logins (last use per confirmation)
    await admin.from('phone_login_used').upsert({ url_hash: urlHash, user_id: userId, used_at: new Date().toISOString() })

    // 3. One-time token the browser exchanges for a session (nothing is emailed)
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: loginEmail })
    if (linkErr || !link?.properties?.hashed_token) return reply({ ok: false, code: 'token_failed', message: linkErr?.message })

    return reply({
      ok: true,
      token_hash: link.properties.hashed_token,
      phone: digits,
      is_new: isNew,
      existing_account: mode === 'signup' && !isNew,
    })
  } catch (e) {
    return reply({ ok: false, code: 'server_error', message: String((e as Error)?.message || e) })
  }
}

Deno.serve((req) => handle(req))
