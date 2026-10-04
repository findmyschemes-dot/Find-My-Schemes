import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Alert from '../components/Alert'
import PhoneEmailButton from '../components/PhoneEmailButton'
import { useAuth } from '../context/AuthContext'
import { completePhoneLogin, saveIntent, savePending } from '../lib/phoneAuth'

export default function Login() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect')
  const target = redirect ? `/dashboard/${redirect}` : '/dashboard'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user && !busy) navigate(target, { replace: true })
  }, [user, busy, navigate, target])

  // In case Phone.Email finishes on the Redirect URL instead of calling back here
  useEffect(() => {
    saveIntent({ mode: 'login', next: target })
  }, [target])

  const onVerified = async (userJsonUrl) => {
    setError('')
    setBusy(true)
    const res = await completePhoneLogin({ userJsonUrl, mode: 'login' })
    if (res.ok) return navigate(target, { replace: true })
    setBusy(false)
    if (res.code === 'not_registered') {
      savePending({ url: userJsonUrl, phone: res.phone })
      return navigate(`/signup?verified=1${redirect ? `&redirect=${redirect}` : ''}`)
    }
    setError(res.error)
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in with the mobile number used to sign up. Verify it with a one-time code.">
      <Alert>{error}</Alert>
      {busy ? (
        <p className="text-center text-sm text-gray-600 py-4"><i className="fa-solid fa-circle-notch fa-spin mr-2" />Signing in…</p>
      ) : (
        <PhoneEmailButton onVerified={onVerified} />
      )}
      <p className="text-xs text-gray-500 text-center mt-4">
        A secure window opens to verify the mobile number by OTP.
      </p>
      <div className="mt-8 text-center text-sm text-gray-600">
        Don't have an account?{' '}
        <Link to={`/signup${redirect ? `?redirect=${redirect}` : ''}`} className="text-darkGreen font-semibold hover:underline">
          Create Account
        </Link>
      </div>
    </AuthLayout>
  )
}
