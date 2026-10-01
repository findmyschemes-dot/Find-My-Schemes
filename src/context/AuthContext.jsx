import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [pricing, setPricing] = useState({ reportPrice: 499, slaHours: 24, packs: [] })
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

  const loadWallet = useCallback(async (user) => {
    if (!user) return setWallet(null)
    const { data } = await supabase.from('wallets').select('balance, updated_at').eq('user_id', user.id).maybeSingle()
    setWallet({ balance: Number(data?.balance || 0), updated_at: data?.updated_at })
  }, [])

  // Prices come from the database so they can't be changed in the browser
  const loadPricing = useCallback(async () => {
    const [{ data: settings }, { data: packs }] = await Promise.all([
      supabase.from('app_settings').select('key, value'),
      supabase.from('wallet_packs').select('*').order('sort_order'),
    ])
    const get = (k, d) => settings?.find((s) => s.key === k)?.value ?? d
    setPricing({
      reportPrice: Number(get('report_price', 499)),
      slaHours: Number(get('delivery_sla_hours', 24)),
      packs: (packs || []).map((p) => ({ ...p, amount: Number(p.amount), bonus: Number(p.bonus) })),
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
      await Promise.all([loadProfile(data.session?.user), loadWallet(data.session?.user)])
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setTimeout(() => {
        loadProfile(newSession?.user)
        loadWallet(newSession?.user)
      }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile, loadWallet, loadPricing])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    wallet,
    pricing,
    loading,
    refreshProfile: () => loadProfile(session?.user),
    refreshWallet: () => loadWallet(session?.user),
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
