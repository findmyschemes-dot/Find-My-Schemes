// Front-end settings. Prices and payment instructions are NOT here — they live in the
// database (app_settings) and are edited in Admin → Settings.

// Phone.Email "Sign in with Phone" button (client ID from the Phone.Email dashboard)
export const PHONE_EMAIL_CLIENT_ID = import.meta.env.VITE_PHONE_EMAIL_CLIENT_ID || '11408694035205611879'
export const PHONE_EMAIL_SCRIPT = 'https://www.phone.email/sign_in_button_v1.js'

// Super admins (display only — the real check is in the database: super_admin_phones()).
export const SUPER_ADMIN_PHONES = ['919121422554', '918500676890']
