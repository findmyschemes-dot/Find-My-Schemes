import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Alert from '../components/Alert'
import OtpStep from '../components/OtpStep'
import { useAuth } from '../context/AuthContext'
import { sendOtp, verifyOtp } from '../lib/otp'
import { OTP_MODE } from '../config/app'

const usesPhone = OTP_MODE === 'supabase_sms'

export default function Login() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect')
  const target = redirect ? `/dashboard/${redirect}` : '/dashboard'

  const [step, setStep] = useState('details') // details | otp
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) navigate(target, { replace: true })
  }, [user, navigate, target])

  const request = async (e) => {
    e?.preventDefault()
    setError('')
    setBusy(true)
    const res = await sendOtp({ email, mode: 'login', profile: { mobile } })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setStep('otp')
  }

  const verify = async (code) => {
    setError('')
    setBusy(true)
    const res = await verifyOtp({ email, code, mode: 'login', profile: { mobile } })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    navigate(target, { replace: true })
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in with a one-time code — no password needed.">
      {step === 'details' ? (
        <>
          <Alert>{error}</Alert>
          <form onSubmit={request} className="space-y-5">
            {usesPhone ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                <input type="tel" required placeholder="+91XXXXXXXXXX" value={mobile} onChange={(e) => setMobile(e.target.value)} className="input" />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
              </div>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? 'Sending code…' : 'Send OTP'}
            </button>
          </form>
        </>
      ) : (
        <OtpStep
          sentTo={usesPhone ? mobile : email}
          onVerify={verify}
          onResend={request}
          onBack={() => { setStep('details'); setError('') }}
          error={error}
          busy={busy}
        />
      )}
      <div className="mt-8 text-center text-sm text-gray-600">
        Don't have an account?{' '}
        <Link to={`/signup${redirect ? `?redirect=${redirect}` : ''}`} className="text-darkGreen font-semibold hover:underline">
          Create Account
        </Link>
      </div>
    </AuthLayout>
  )
}
