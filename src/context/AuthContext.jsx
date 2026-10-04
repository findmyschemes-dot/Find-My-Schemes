import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [pricing, setPricing] = useState({ reportPrice: 499, slaHours: 24, paymentInstructions: '' })
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (user) => {
    if (!user) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    const meta = user.user_metadata || {}
    setProfile(
      data || {
        id: user.id,
        email: meta.contact_email || '',
        full_name: meta.full_name || 'Customer',
        mobile: meta.mobile || user.phone || '',
        business_name: meta.business_name || '',
      }
    )
  }, [])

  // Prices come from the database so they can't be changed in the browser
  const loadPricing = useCallback(async () => {
    const { data: settings } = await supabase.from('app_settings').select('key, value')
    const get = (k, d) => settings?.find((s) => s.key === k)?.value ?? d
    setPricing({
      reportPrice: Number(get('report_price', 499)),
      slaHours: Number(get('delivery_sla_hours', 24)),
      paymentInstructions: String(get('payment_instructions', '')),
    })
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    loadPricing()
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session?.user)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setTimeout(() => {
        loadProfile(newSession?.user)
      }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile, loadPricing])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    pricing,
    loading,
    refreshProfile: () => loadProfile(session?.user),
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
