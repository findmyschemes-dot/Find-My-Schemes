import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { adminSupabase } from '../admin/supabaseAdmin'
import { normalizePhone } from '../admin/loginFlow'

// Decides whether to show the "Admin Panel" button in the customer menu.
// Shown when: an admin session is already open in this browser, OR the
// customer's own mobile number is on the admin list.
// (Only a shortcut — the admin panel still asks for its own OTP login,
// and the database checks admin rights on every request.)
export function useAdminAccess(mobile) {
  const [state, setState] = useState({ show: false, loggedIn: false, phone: '' })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: s } = await adminSupabase.auth.getSession()
      if (s.session) {
        const { data: isAdmin } = await adminSupabase.rpc('is_admin')
        if (isAdmin) return alive && setState({ show: true, loggedIn: true, phone: '' })
      }
      const digits = normalizePhone(mobile)
      if (digits.length >= 11) {
        const { data: allowed } = await supabase.rpc('admin_phone_allowed', { p_phone: digits })
        if (allowed) return alive && setState({ show: true, loggedIn: false, phone: digits })
      }
      if (alive) setState({ show: false, loggedIn: false, phone: '' })
    })().catch(() => alive && setState({ show: false, loggedIn: false, phone: '' }))
    return () => {
      alive = false
    }
  }, [mobile])

  return state
}
