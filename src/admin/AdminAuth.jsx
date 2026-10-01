import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { adminSupabase as sb } from './supabaseAdmin'
import { isSupabaseConfigured } from '../lib/supabase'
import Spinner from '../components/Spinner'

const Ctx = createContext(null)

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)

  const check = useCallback(async (s) => {
    if (!s) {
      setIsAdmin(false)
      return
    }
    const { data } = await sb.rpc('is_admin')
    setIsAdmin(!!data)
    if (data) {
      const { data: rows } = await sb.from('app_settings').select('key, value')
      setSettings(Object.fromEntries((rows || []).map((r) => [r.key, r.value])))
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return setLoading(false)
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await check(data.session)
      setLoading(false)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setTimeout(() => check(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [check])

  const value = {
    session,
    isAdmin,
    loading,
    settings,
    sla: Number(settings.delivery_sla_hours ?? 24),
    phone: session?.user?.user_metadata?.admin_phone || session?.user?.phone || '',
    refresh: async () => {
      const { data } = await sb.auth.getSession()
      setSession(data.session)
      await check(data.session)
    },
    signOut: () => sb.auth.signOut(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAdmin = () => useContext(Ctx)

export function AdminGuard({ children }) {
  const { session, isAdmin, loading } = useAdmin()
  const loc = useLocation()
  if (loading) return <Spinner full />
  if (!session || !isAdmin) return <Navigate to={`/admin/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  return children
}
