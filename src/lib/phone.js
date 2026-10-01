// Mobile numbers are stored as digits with country code, e.g. 919876543210.
export const normalizePhone = (raw) => {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1) // 09876543210
  if (d.length === 10) d = '91' + d // assume India when no country code
  return d
}

export const isValidPhone = (raw) => {
  const d = normalizePhone(raw)
  if (d.startsWith('91')) return d.length === 12 && /^91[6-9]/.test(d) // Indian mobiles start 6–9
  return d.length >= 11 && d.length <= 15
}

export const prettyPhone = (digits) => {
  const d = normalizePhone(digits)
  return d.startsWith('91') && d.length === 12 ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : `+${d}`
}

// For the input box: show the 10 local digits when it's an Indian number
export const localPart = (digits) => {
  const d = String(digits || '').replace(/\D/g, '')
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d
}
