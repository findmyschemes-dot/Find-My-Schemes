import { createClient } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '../lib/supabase'

// Separate login storage, so an admin session and a customer session
// can be open in the same browser without logging each other out.
export const adminSupabase = createClient(
  isSupabaseConfigured ? import.meta.env.VITE_SUPABASE_URL : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? import.meta.env.VITE_SUPABASE_ANON_KEY : 'placeholder-key',
  { auth: { storageKey: 'fms-admin-auth', persistSession: true, autoRefreshToken: true } }
)
