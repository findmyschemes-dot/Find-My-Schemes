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
  if (m.includes('NOT_SIGNED_IN')) return 'Please log in again.'
  if (m.includes('DELIVERY_EMAIL_REQUIRED')) return 'Please add the email address the report should be sent to.'
  if (m.includes('BUSINESS_NAME_REQUIRED')) return 'Please add the business name.'
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

  // Saves the form. Payment is made outside the platform afterwards.
  submitReportRequest: (inputs) => supabase.rpc('submit_report_request', { p_inputs: inputs }).then(unwrap),

  // Signed link to the PDF in the private 'reports' bucket (valid 1 hour)
  reportFileUrl: async (path) => {
    if (!path) return null
    if (/^https?:\/\//.test(path)) return path
    const { data, error } = await supabase.storage.from('reports').createSignedUrl(path, 3600)
    if (error) throw error
    return data.signedUrl
  },

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

  createQuery: ({ userId, subject, message, reportId }) =>
    supabase.from('queries').insert({ user_id: userId, subject, message, report_id: reportId || null }).select().single().then(unwrap),

  // Profile
  updateProfile: (userId, fields) =>
    supabase.from('profiles').update(fields).eq('id', userId).select().single().then(unwrap),
}

// What the customer sees for a request: payment first, then progress
export const customerStatus = (r) => {
  if (r.status === 'cancelled') return 'Cancelled'
  if (r.status === 'ready') return 'Report Ready'
  if (r.payment_status === 'awaiting') return 'Awaiting Payment'
  if (r.payment_status === 'refunded') return 'Refunded'
  return r.status === 'processing' ? 'In Review' : 'In Progress'
}

export const PAYMENT_LABEL = { awaiting: 'Awaiting payment', paid: 'Paid', waived: 'Waived', refunded: 'Refunded' }
export const STATUS_LABEL = { submitted: 'Submitted', processing: 'In review', ready: 'Delivered', cancelled: 'Cancelled' }
