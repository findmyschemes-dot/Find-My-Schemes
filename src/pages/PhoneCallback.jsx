import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Alert from '../components/Alert'
import { completePhoneLogin, readIntent, clearIntent, savePending } from '../lib/phoneAuth'

/**
 * Redirect URL for the Phone.Email button:  <site>/auth/phone
 * Phone.Email can send the person here with ?user_json_url=... after verifying.
 * We finish whatever they started (login, sign-up or admin login).
 */
export default function PhoneCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const userJsonUrl = params.get('user_json_url')
    const intent = readIntent() || { mode: 'login' }
    if (!userJsonUrl) return setError('No verification was received. Please try again.')
    ;(async () => {
      const res = await completePhoneLogin({ userJsonUrl, mode: intent.mode, profile: intent.profile })
      if (res.ok) {
        clearIntent()
        const fallback = intent.mode === 'admin' ? '/admin' : '/dashboard'
        return navigate(res.existingAccount ? '/dashboard?existing=1' : intent.next || fallback, { replace: true })
      }
      if (res.code === 'not_registered') {
        savePending({ url: userJsonUrl, phone: res.phone })
        return navigate('/signup?verified=1', { replace: true })
      }
      setError(res.error)
    })()
  }, [params, navigate])

  return (
    <AuthLayout title="Verifying mobile" subtitle="One moment…">
      {error ? (
        <>
          <Alert>{error}</Alert>
          <div className="text-center text-sm space-x-4">
            <Link to="/login" className="text-darkGreen font-semibold hover:underline">Back to Login</Link>
            <Link to="/signup" className="text-darkGreen font-semibold hover:underline">Sign Up</Link>
          </div>
        </>
      ) : (
        <p className="text-center text-gray-600 py-6"><i className="fa-solid fa-circle-notch fa-spin mr-2" />Signing in…</p>
      )}
    </AuthLayout>
  )
}
