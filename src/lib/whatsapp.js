// WhatsApp click-to-chat (no API needed): opens WhatsApp (app on phones, WhatsApp Web on computers)
// with a ready-made message. Change the business number here, or set VITE_WHATSAPP_NUMBER.
export const WHATSAPP_NUMBER = String(import.meta.env.VITE_WHATSAPP_NUMBER || '918142917619').replace(/\D/g, '')

export const SITE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://www.findmyschemes.info'

/** Link that opens a WhatsApp chat with `number` (digits with country code) and `text` typed in. */
export function waLink(number, text = '') {
  let d = String(number || '').replace(/\D/g, '')
  if (d.length === 10) d = '91' + d // Indian number without country code
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/** Customer → Find My Schemes */
export const supportLink = (text) => waLink(WHATSAPP_NUMBER, text)

export const prettyWhatsApp = () => `+${WHATSAPP_NUMBER.slice(0, 2)} ${WHATSAPP_NUMBER.slice(2, 7)} ${WHATSAPP_NUMBER.slice(7)}`

// Ready-made messages
export const MSG = {
  general: 'Hi Find My Schemes, I would like to know more about the Scheme Eligibility Report.',
  dashboard: 'Hi Find My Schemes, I need some help with my account.',
  request: (r) => `Hi Find My Schemes, I need help with my request ${r.report_code}${r.business_name ? ` (${r.business_name})` : ''}.`,
  payment: (r) => `Hi Find My Schemes, I need help with the payment for request ${r.report_code} (₹${Number(r.amount_due || 0)}).`,
  // Team → customer
  toCustomer: (name, r) => `Hi ${name || 'there'}, this is Find My Schemes${r ? ` regarding your request ${r.report_code}` : ''}.`,
  paymentReminder: (name, r) =>
    `Hi ${name || 'there'}, this is Find My Schemes. Your request ${r.report_code}${r.business_name ? ` (${r.business_name})` : ''} is saved and waiting for payment of ₹${Number(r.amount_due || 0)}. Complete it here: ${SITE_URL}/dashboard/reports/${r.id} — we start as soon as it is paid. Reply here if you need any help.`,
  toLead: (name) =>
    `Hi ${name || 'there'}, thanks for downloading the Find My Schemes demo report. Would you like a personalised Scheme Eligibility Report for your business? Happy to answer any questions.`,
}
