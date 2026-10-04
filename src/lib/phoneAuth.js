// Turns a Phone.Email confirmation (user_json_url) into a Supabase session.
// The checking happens on the server in the Edge Function `phone-login`.
import { supabase } from './supabase'

// Name of the Supabase Edge Function (set VITE_PHONE_LOGIN_FUNCTION if it was deployed under another name)
const FUNCTION_NAME = import.meta.env.VITE_PHONE_LOGIN_FUNCTION || 'phone-login'

const INTENT_KEY = 'fms-phone-intent'    // survives the Redirect-URL round trip
const PENDING_KEY = 'fms-phone-pending'  // verified number waiting to finish sign-up

const store = {
  set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } },
  get: (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null') } catch { return null } },
  del: (k) => { try { sessionStorage.removeItem(k) } catch { /* ignore */ } },
}

/** Remember what the person was doing, in case Phone.Email returns via the Redirect URL. */
export const saveIntent = (intent) => store.set(INTENT_KEY, { ...intent, at: Date.now() })
export const readIntent = () => {
  const i = store.get(INTENT_KEY)
  return i && Date.now() - i.at < 30 * 60 * 1000 ? i : null
}
export const clearIntent = () => store.del(INTENT_KEY)

/** A number verified on the Login page that has no account yet → finish on Sign-up without verifying again. */
export const savePending = (p) => store.set(PENDING_KEY, { ...p, at: Date.now() })
export const readPending = () => {
  const p = store.get(PENDING_KEY)
  return p && Date.now() - p.at < 10 * 60 * 1000 ? p : null
}
export const clearPending = () => store.del(PENDING_KEY)

const MESSAGES = {
  bad_url: 'That verification did not come from Phone.Email. Please verify the number again.',
  not_verified: 'The mobile verification could not be confirmed (it may have expired). Please verify again.',
  already_used: 'This verification was already used. Please verify the number again.',
  not_registered: 'No account found with this mobile number.',
  not_admin: 'This number is not authorised for admin access.',
  create_failed: 'Could not create the account. Please try again.',
  account_missing: 'Account problem — please contact support.',
  token_failed: 'Could not start the session. Please try again.',
  server_error: 'Something went wrong on the server. Please try again.',
}

// Say exactly why the Edge Function call failed (shown on screen + in the console)
async function explainFunctionError(error) {
  const status = error?.context?.status
  let detail = ''
  try {
    detail = (await error?.context?.text?.()) || ''
  } catch { /* ignore */ }
  console.error('[phone-login]', error?.name, status, detail || error?.message)

  if (!import.meta.env.VITE_SUPABASE_URL || /YOUR-PROJECT-REF|placeholder/.test(import.meta.env.VITE_SUPABASE_URL))
    return 'Supabase is not configured for this site (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — on Vercel add them under Settings → Environment Variables and redeploy).'
  if (status === 404)
    return `Login service not found (404): no Edge Function named "${FUNCTION_NAME}" in Supabase. Set VITE_PHONE_LOGIN_FUNCTION in .env to the function's name.`
  if (status === 401 || status === 403)
    return `Login service refused the request (${status}): open Supabase → Edge Functions → phone-login and turn OFF "Verify JWT", then save.`
  if (status >= 500)
    return `Login service crashed (${status}). Check Supabase → Edge Functions → phone-login → Logs. ${detail.slice(0, 160)}`
  if (status) return `Login service error (${status}). ${detail.slice(0, 160)}`
  // no HTTP status: request never reached the function (not deployed, blocked, offline)
  return `Could not reach the login service. Check that the Edge Function "${FUNCTION_NAME}" exists in Supabase and that "Verify JWT" is OFF for it.`
}

/**
 * @param {{ userJsonUrl: string, mode: 'login'|'signup'|'admin', profile?: object }} p
 * @returns {Promise<{ok:boolean, code?:string, error?:string, phone?:string, isNew?:boolean, existingAccount?:boolean}>}
 */
export async function completePhoneLogin({ userJsonUrl, mode, profile }) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { user_json_url: userJsonUrl, mode, profile },
  })
  if (error || !data) return { ok: false, code: 'unreachable', error: await explainFunctionError(error) }
  if (!data.ok) return { ok: false, code: data.code, phone: data.phone, error: MESSAGES[data.code] || data.message || 'Login failed.' }

  // exchange the one-time token for a session
  let res = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' })
  if (res.error) res = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
  if (res.error) return { ok: false, code: 'session_failed', error: 'Could not sign in: ' + res.error.message }

  clearPending()
  return { ok: true, phone: data.phone, isNew: data.is_new, existingAccount: data.existing_account }
}
