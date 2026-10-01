// All database reads/writes in one place. Row Level Security in Supabase makes sure
// each signed-in person only ever sees their own rows.
import { supabase } from './supabase'

const unwrap = ({ data, error }) => {
  if (error) throw error
  return data
}

// Turn database error codes into plain messages
export const friendlyError = (e) => {
  const m = e?.message || String(e)
  if (m.includes('INSUFFICIENT_BALANCE')) return 'Not enough balance in the wallet. Please recharge to continue.'
  if (m.includes('INVALID_PACK')) return 'That recharge pack is not available.'
  if (m.includes('DUMMY_PAYMENTS_DISABLED')) return 'Test payments are switched off.'
  if (m.includes('NOT_SIGNED_IN')) return 'Please log in again.'
  return m
}

export const api = {
  // Reports
  listReports: () =>
    supabase.from('reports').select('*').order('created_at', { ascending: false }).then(unwrap),

  getReport: (id) =>
    supabase
      .from('reports')
      .select('*, report_schemes(*), report_events(*)')
      .eq('id', id)
      .maybeSingle()
      .then(unwrap),

  // Checks balance, deducts the report price and saves the form — all in the database
  submitReportRequest: (inputs) => supabase.rpc('submit_report_request', { p_inputs: inputs }).then(unwrap),

  // Signed link to the PDF in the private 'reports' bucket (valid 1 hour)
  reportFileUrl: async (path) => {
    if (!path) return null
    if (/^https?:\/\//.test(path)) return path
    const { data, error } = await supabase.storage.from('reports').createSignedUrl(path, 3600)
    if (error) throw error
    return data.signedUrl
  },

  // Wallet
  listWalletTransactions: () =>
    supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).then(unwrap),

  // Applications
  listApplications: () =>
    supabase.from('applications').select('*').order('created_at', { ascending: false }).then(unwrap),

  createApplication: ({ userId, reportId, schemeName }) =>
    supabase
      .from('applications')
      .insert({ user_id: userId, report_id: reportId, scheme_name: schemeName })
      .select()
      .single()
      .then(unwrap),

  // Queries
  listQueries: () =>
    supabase.from('queries').select('*').order('created_at', { ascending: false }).then(unwrap),

  createQuery: ({ userId, subject, message }) =>
    supabase.from('queries').insert({ user_id: userId, subject, message }).select().single().then(unwrap),

  // Profile
  updateProfile: (userId, fields) =>
    supabase.from('profiles').update(fields).eq('id', userId).select().single().then(unwrap),
}

// Database status → what the customer sees
export const REPORT_STATUS = {
  submitted: { label: 'Submitted', badge: 'In Progress' },
  processing: { label: 'In Review', badge: 'In Progress' },
  ready: { label: 'Report Ready', badge: 'Report Ready' },
  failed: { label: 'Needs Attention', badge: 'Failed' },
  refunded: { label: 'Refunded', badge: 'Refunded' },
}
