import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAdmin } from '../AdminAuth'
import PhoneEmailButton from '../../components/PhoneEmailButton'
import Alert from '../../components/Alert'
import { completePhoneLogin, saveIntent } from '../../lib/phoneAuth'
import { isSupabaseConfigured } from '../../lib/supabase'

export default function AdminLogin() {
  const { session, isAdmin, loading, refresh, signOut } = useAdmin()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/admin'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && session && isAdmin) navigate(next, { replace: true })
  }, [loading, session, isAdmin, navigate, next])

  useEffect(() => {
    saveIntent({ mode: 'admin', next })
  }, [next])

  const onVerified = async (userJsonUrl) => {
    setError('')
    setBusy(true)
    const res = await completePhoneLogin({ userJsonUrl, mode: 'admin' })
    if (!res.ok) {
      setBusy(false)
      return setError(res.error)
    }
    await refresh()
    navigate(next, { replace: true })
  }

  const loggedInNotAdmin = !loading && session && !isAdmin

  return (
    <div className="min-h-screen bg-darkerGreen flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <img src="/assets/Logo_icon.png" alt="" className="h-9 w-9" />
          <div>
            <p className="font-serif font-bold text-darkGreen leading-tight">Find My Schemes</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-rust">Admin Panel</p>
          </div>
        </div>
        {!isSupabaseConfigured && <Alert>Supabase is not connected (.env).</Alert>}
        <h1 className="text-lg font-bold text-gray-900 text-center">Admin login</h1>
        <p className="text-sm text-gray-500 text-center mb-4">Only authorised mobile numbers can sign in.</p>
        <Alert>{error}</Alert>
        {loggedInNotAdmin ? (
          <div className="text-center text-sm space-y-3">
            <p className="text-gray-700">The account signed in on this browser is not an admin.</p>
            <button onClick={signOut} className="btn-outline px-4 py-2">Log out and use an admin number</button>
            <div><Link to="/dashboard" className="text-darkGreen hover:underline">Back to my dashboard</Link></div>
          </div>
        ) : busy ? (
          <p className="text-center text-sm text-gray-600 py-4"><i className="fa-solid fa-circle-notch fa-spin mr-2" />Checking…</p>
        ) : (
          <PhoneEmailButton onVerified={onVerified} />
        )}
      </div>
    </div>
  )
}
