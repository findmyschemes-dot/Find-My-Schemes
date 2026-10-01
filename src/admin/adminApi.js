import { adminSupabase as sb } from './supabaseAdmin'

const unwrap = ({ data, error }) => {
  if (error) throw error
  return data
}
const all = (view, order = 'created_at', asc = false) =>
  sb.from(view).select('*').order(order, { ascending: asc }).range(0, 4999).then(unwrap)

export const adminErr = (e) => {
  const m = e?.message || String(e)
  if (m.includes('NOT_ADMIN')) return 'Admin access only. Please log in again.'
  if (m.includes('ALREADY_REFUNDED')) return 'This request was already refunded.'
  if (m.includes('INSUFFICIENT_BALANCE')) return 'That would take the wallet below ₹0.'
  if (m.includes('NOTE_REQUIRED')) return 'Please add a note.'
  if (m.includes('row-level security')) return 'Not allowed.'
  return m
}

export const adminApi = {
  analytics: (days) => sb.rpc('admin_analytics', { p_days: days }).then(unwrap),

  customers: () => all('admin_customers_v'),
  customer: (id) => sb.from('admin_customers_v').select('*').eq('id', id).maybeSingle().then(unwrap),

  reports: () => all('admin_reports_v'),
  report: (id) => sb.from('admin_reports_v').select('*').eq('id', id).maybeSingle().then(unwrap),
  reportsFor: (userId) => sb.from('admin_reports_v').select('*').eq('user_id', userId).order('created_at', { ascending: false }).then(unwrap),
  reportEvents: (id) => sb.from('report_events').select('*').eq('report_id', id).order('created_at').then(unwrap),
  reportSchemes: (id) => sb.from('report_schemes').select('*').eq('report_id', id).order('sort_order').then(unwrap),
  updateReport: (id, fields) => sb.from('reports').update(fields).eq('id', id).select('id').single().then(unwrap),
  addScheme: (row) => sb.from('report_schemes').insert(row).select().single().then(unwrap),
  deleteScheme: (id) => sb.from('report_schemes').delete().eq('id', id).then(unwrap),
  refund: (id, note) => sb.rpc('admin_refund_report', { p_report_id: id, p_note: note }).then(unwrap),

  uploadReportPdf: async (report, file) => {
    const path = `${report.user_id}/${report.report_code}.pdf`
    const { error } = await sb.storage.from('reports').upload(path, file, { upsert: true, contentType: 'application/pdf' })
    if (error) throw error
    return path
  },
  fileUrl: async (path) => {
    if (!path) return null
    if (/^https?:\/\//.test(path)) return path
    const { data, error } = await sb.storage.from('reports').createSignedUrl(path, 3600)
    if (error) throw error
    return data.signedUrl
  },

  payments: () => all('admin_payments_v'),
  ledger: () => all('admin_ledger_v'),
  ledgerFor: (userId) => sb.from('admin_ledger_v').select('*').eq('user_id', userId).order('created_at', { ascending: false }).then(unwrap),
  adjustWallet: (userId, amount, note) =>
    sb.rpc('admin_adjust_wallet', { p_user_id: userId, p_amount: amount, p_note: note }).then(unwrap),

  queries: () => all('admin_queries_v'),
  replyQuery: (id, reply, status) => sb.from('queries').update({ admin_reply: reply, status }).eq('id', id).then(unwrap),

  applications: () => all('admin_applications_v'),
  setApplicationStatus: (id, status) => sb.from('applications').update({ status }).eq('id', id).then(unwrap),

  settings: () => sb.from('app_settings').select('*').order('key').then(unwrap),
  setSetting: (key, value) =>
    sb.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key).then(unwrap),
  packs: () => sb.from('wallet_packs').select('*').order('sort_order').then(unwrap),
  updatePack: (id, fields) => sb.from('wallet_packs').update(fields).eq('id', id).then(unwrap),
  admins: () => sb.from('admin_phones').select('*').order('created_at').then(unwrap),
  addAdmin: (phone, name) => sb.from('admin_phones').insert({ phone, name }).then(unwrap),
  setAdminActive: (phone, active) => sb.from('admin_phones').update({ active }).eq('phone', phone).then(unwrap),
}
