export const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

export const fmtINR = (amount) =>
  '₹' + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const firstName = (name) => (name || 'User').split(' ')[0]
export const initial = (name) => (name || 'U').charAt(0).toUpperCase()
