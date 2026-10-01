import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// True once real keys are placed in .env (placeholders are ignored)
export const isSupabaseConfigured =
  Boolean(url && key) && !url.includes('YOUR-PROJECT-REF') && !key.startsWith('YOUR-')

export const supabase = createClient(
  isSupabaseConfigured ? url : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? key : 'placeholder-key'
)
