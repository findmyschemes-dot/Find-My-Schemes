// Front-end switches. Prices are NOT here on purpose — they live in the
// database (app_settings / wallet_packs) so the browser can't change them.

// OTP: 'dummy' (any account, code below) | 'supabase_email' (real 6-digit email code)
//      | 'supabase_sms' (real SMS code — needs an SMS provider set up in Supabase)
export const OTP_MODE = import.meta.env.VITE_OTP_MODE || 'dummy'
export const DUMMY_OTP = '123456'

// Payments: 'dummy' (test checkout) | 'razorpay'
export const PAYMENT_MODE = import.meta.env.VITE_PAYMENT_MODE || 'dummy'

export const OTP_LENGTH = 6
export const OTP_RESEND_SECONDS = 30
