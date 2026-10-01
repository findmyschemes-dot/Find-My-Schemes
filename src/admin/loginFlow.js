// Admin login by mobile number. Only numbers in the `admin_phones` table can get in —
// the database checks this on every request (is_admin()), not just this screen.
//
// Mode comes from the database setting `admin_otp_mode`:
//   'dummy' → code 123456 (local testing only)
//   'sms'   → real SMS OTP via Supabase phone auth
import { adminSupabase as sb } from './supabaseAdmin'
import { DUMMY_OTP } from '../config/app'

export { normalizePhone, prettyPhone } from '../lib/phone'
import { normalizePhone } from '../lib/phone'

// Test-mode admin accounts use a hidden email + password made from the number.
const dummyIdentity = (digits) => {
  const base = import.meta.env.VITE_ADMIN_DUMMY_EMAIL_BASE || 'admin.findmyschemes@gmail.com'
  const [local, domain] = base.split('@')
  return {
    email: `${local}+fmsadmin${digits}@${domain}`,
    password: `fms-admin::${digits}::${import.meta.env.VITE_DUMMY_AUTH_SALT || 'local-dev'}`,
  }
}

export async function getLoginMode() {
  const { data, error } = await sb.rpc('admin_login_mode')
  if (error) throw new Error('Admin setup missing — run supabase/admin.sql in Supabase.')
  return data || 'dummy'
}

export async function sendAdminOtp(rawPhone) {
  const digits = normalizePhone(rawPhone)
  if (digits.length < 11) return { ok: false, error: 'Please enter a valid mobile number.' }

  const { data: allowed, error } = await sb.rpc('admin_phone_allowed', { p_phone: digits })
  if (error) return { ok: false, error: 'Admin setup missing — run supabase/admin.sql in Supabase.' }
  if (!allowed) return { ok: false, error: 'This number is not authorised for admin access.' }

  const mode = await getLoginMode()
  if (mode === 'sms') {
    const { error: e } = await sb.auth.signInWithOtp({ phone: '+' + digits })
    if (e) return { ok: false, error: e.message }
  }
  return { ok: true, digits, mode }
}

export async function verifyAdminOtp(digits, code, mode) {
  if (mode === 'sms') {
    const { error } = await sb.auth.verifyOtp({ phone: '+' + digits, token: code, type: 'sms' })
    if (error) return { ok: false, error: 'The code is wrong or has expired.' }
  } else {
    if (code !== DUMMY_OTP) return { ok: false, error: 'The code is wrong or has expired.' }
    const { email, password } = dummyIdentity(digits)
    let res = await sb.auth.signInWithPassword({ email, password })
    if (res.error) {
      // first time this admin logs in → create the test account
      res = await sb.auth.signUp({
        email,
        password,
        options: { data: { is_admin_account: 'true', admin_phone: digits, full_name: 'Admin ' + digits.slice(-4) } },
      })
      if (res.error) return { ok: false, error: res.error.message }
      if (!res.data.session)
        return { ok: false, error: 'Turn OFF "Confirm email" in Supabase (Authentication → Sign In / Providers → Email).' }
    }
  }

  const { data: isAdmin } = await sb.rpc('is_admin')
  if (!isAdmin) {
    await sb.auth.signOut()
    return { ok: false, error: 'This number is not authorised for admin access.' }
  }
  return { ok: true }
}
