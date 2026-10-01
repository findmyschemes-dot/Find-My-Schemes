// Customer login / sign-up by MOBILE NUMBER + OTP.
// Switch the provider with VITE_OTP_MODE in .env — the screens don't change.
//   'dummy' → code 123456, no SMS sent (local testing only)
//   'sms'   → real SMS OTP via Supabase phone auth (needs an SMS provider in Supabase)
import { supabase } from './supabase'
import { OTP_MODE, DUMMY_OTP } from '../config/app'
import { normalizePhone, isValidPhone } from './phone'

const isSms = OTP_MODE === 'sms' || OTP_MODE === 'supabase_sms'

// Test mode only: Supabase needs a real session for its security rules, so each mobile
// number gets a hidden login (email + password made from the number). The customer never sees it.
// NEVER deploy publicly in test mode — anyone could log in to any number with 123456.
const dummyIdentity = (digits) => {
  const base = import.meta.env.VITE_DUMMY_EMAIL_BASE || import.meta.env.VITE_ADMIN_DUMMY_EMAIL_BASE || 'login.findmyschemes@gmail.com'
  const [local, domain] = base.split('@')
  return {
    email: `${local}+fms${digits}@${domain}`,
    password: `fms-mobile::${digits}::${import.meta.env.VITE_DUMMY_AUTH_SALT || 'local-dev'}`,
  }
}

const friendly = (error, mode) => {
  const m = error?.message || ''
  if (/already registered|already exists|database error saving new user/i.test(m)) return 'An account with this mobile number already exists. Please log in.'
  if (/signups.*disabled/i.test(m)) return 'New sign-ups are switched off in Supabase (Authentication → Sign In / Providers → Allow new users to sign up).'
  if (/email not confirmed/i.test(m)) return 'Turn OFF "Confirm email" in Supabase (Authentication → Sign In / Providers → Email), then delete this test user and sign up again.'
  if (/invalid login|user not found|signups not allowed/i.test(m))
    return mode === 'signup' ? 'Could not create the account. Please try again.' : 'No account found with this mobile number. Please sign up first.'
  if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(m)) return 'The code is wrong or has expired. Please try again.'
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a minute and try again.'
  if (/phone.*provider|sms.*provider|unsupported phone/i.test(m)) return 'SMS is not set up in Supabase yet. Use test mode (VITE_OTP_MODE=dummy) for now.'
  return m || 'Something went wrong. Please try again.'
}

/** Check whether a number already has an account (used to guide login vs sign-up). */
async function numberRegistered(digits) {
  const { data, error } = await supabase.rpc('mobile_registered', { p_mobile: digits })
  return error ? null : !!data // null = unknown (older database) → don't block
}

/**
 * Step 1 — send the code to the mobile number.
 * @param {{mobile:string, mode:'login'|'signup', profile?:{full_name, business_name, email}}} p
 */
export async function sendOtp({ mobile, mode, profile }) {
  if (!isValidPhone(mobile)) return { ok: false, error: 'Please enter a valid 10-digit mobile number.' }
  const digits = normalizePhone(mobile)

  const exists = await numberRegistered(digits)
  if (mode === 'login' && exists === false) return { ok: false, error: 'No account found with this mobile number. Please sign up first.' }
  if (mode === 'signup' && exists === true) return { ok: false, error: 'An account with this mobile number already exists. Please log in.' }

  if (!isSms) return { ok: true, digits }

  const { error } = await supabase.auth.signInWithOtp({
    phone: '+' + digits,
    options: {
      shouldCreateUser: mode === 'signup',
      data: mode === 'signup' ? { ...metaFrom(profile, digits) } : undefined,
    },
  })
  return error ? { ok: false, error: friendly(error, mode) } : { ok: true, digits }
}

const metaFrom = (profile, digits) => ({
  full_name: profile?.full_name,
  business_name: profile?.business_name,
  contact_email: profile?.email,
  mobile: digits,
})

/** Step 2 — check the code and sign in (creates the account on sign-up). */
export async function verifyOtp({ digits, code, mode, profile }) {
  if (isSms) {
    const { error } = await supabase.auth.verifyOtp({ phone: '+' + digits, token: code, type: 'sms' })
    return error ? { ok: false, error: friendly(error, mode) } : { ok: true }
  }

  // test mode
  if (code !== DUMMY_OTP) return { ok: false, error: 'The code is wrong or has expired. Please try again.' }
  const { email, password } = dummyIdentity(digits)
  const res =
    mode === 'signup'
      ? await supabase.auth.signUp({ email, password, options: { data: metaFrom(profile, digits) } })
      : await supabase.auth.signInWithPassword({ email, password })
  if (res.error) return { ok: false, error: friendly(res.error, mode) }
  if (mode === 'signup' && !res.data.session)
    return { ok: false, error: 'Turn OFF "Confirm email" in Supabase (Authentication → Sign In / Providers → Email) while in test mode.' }
  return { ok: true }
}

export const OTP_IS_TEST = !isSms
