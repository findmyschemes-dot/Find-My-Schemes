import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Shows the "Admin Panel" button in the customer menu when the signed-in
// account is an admin. The database decides (is_admin()), not the browser.
export function useAdminAccess(userId) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let alive = true
    if (!userId) return setShow(false)
    supabase.rpc('is_admin').then(({ data }) => alive && setShow(!!data), () => alive && setShow(false))
    return () => {
      alive = false
    }
  }, [userId])
  return { show, loggedIn: show, phone: '' }
}
