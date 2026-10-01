// One place for OTP login/sign-up. Swap the provider with VITE_OTP_MODE in .env —
// the screens don't change.
import { supabase } from './supabase'
import { OTP_MODE, DUMMY_OTP } from '../config/app'

// Dummy mode only: a fixed password derived from the email, so a real
// Supabase session exists (needed for the database security rules).
// NEVER deploy publicly in dummy mode — anyone could log in with 123456.
const dummyPassword = (email) =>
  `fms-dummy::${email.trim().toLowerCase()}::${import.meta.env.VITE_DUMMY_AUTH_SALT || 'local-dev'}`

const friendly = (error) => {
  const m = error?.message || ''
  if (/already registered|already exists/i.test(m)) return 'An account with this email already exists. Please log in.'
  if (/email not confirmed/i.test(m)) return 'This account is not confirmed yet. In Supabase → Authentication → Users, delete it (or confirm it) and sign up again.'
  if (/signups.*disabled/i.test(m)) return 'New sign-ups are switched off in Supabase (Authentication → Sign In / Providers → Allow new users to sign up).'
  if (/invalid login|signups not allowed|user not found/i.test(m)) return 'No account found with this email. Please sign up first.'
  if (/expired|invalid.*(otp|token)/i.test(m)) return 'The code is wrong or has expired. Please try again.'
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a minute and try again.'
  return m || 'Something went wrong. Please try again.'
}

/**
 * Step 1 — send the code.
 * @param {{email:string, mode:'login'|'signup', profile?:{full_name,mobile,business_name}}} p
 */
export async function sendOtp({ email, mode, profile }) {
  if (OTP_MODE === 'dummy') return { ok: true }

  if (OTP_MODE === 'supabase_email') {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: mode === 'signup', data: mode === 'signup' ? profile : undefined },
    })
    return error ? { ok: false, error: friendly(error) } : { ok: true }
  }

  if (OTP_MODE === 'supabase_sms') {
    const { error } = await supabase.auth.signInWithOtp({
      phone: profile?.mobile,
      options: { shouldCreateUser: mode === 'signup', data: mode === 'signup' ? { ...profile, email } : undefined },
    })
    return error ? { ok: false, error: friendly(error) } : { ok: true }
  }

  return { ok: false, error: `Unknown OTP mode: ${OTP_MODE}` }
}

/** Step 2 — check the code and sign in. */
export async function verifyOtp({ email, code, mode, profile }) {
  if (OTP_MODE === 'dummy') {
    if (code !== DUMMY_OTP) return { ok: false, error: 'The code is wrong or has expired. Please try again.' }
    const password = dummyPassword(email)
    const res =
      mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { data: profile } })
        : await supabase.auth.signInWithPassword({ email, password })
    if (res.error) return { ok: false, error: friendly(res.error) }
    if (mode === 'signup' && !res.data.session)
      return { ok: false, error: 'Turn OFF "Confirm email" in Supabase → Authentication → Providers → Email while in dummy OTP mode.' }
    return { ok: true }
  }

  const params =
    OTP_MODE === 'supabase_sms'
      ? { phone: profile?.mobile, token: code, type: 'sms' }
      : { email, token: code, type: 'email' }
  const { error } = await supabase.auth.verifyOtp(params)
  return error ? { ok: false, error: friendly(error) } : { ok: true }
}
