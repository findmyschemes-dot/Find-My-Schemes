import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Alert from '../components/Alert'
import OtpStep from '../components/OtpStep'
import PhoneInput from '../components/PhoneInput'
import { useAuth } from '../context/AuthContext'
import { sendOtp, verifyOtp, OTP_IS_TEST } from '../lib/otp'
import { prettyPhone } from '../lib/phone'

export default function Login() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect')
  const target = redirect ? `/dashboard/${redirect}` : '/dashboard'

  const [step, setStep] = useState('mobile') // mobile | otp
  const [mobile, setMobile] = useState(params.get('mobile') || '')
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) navigate(target, { replace: true })
  }, [user, navigate, target])

  const request = async (e) => {
    e?.preventDefault()
    setError('')
    setBusy(true)
    const res = await sendOtp({ mobile, mode: 'login' })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setDigits(res.digits)
    setStep('otp')
  }

  const verify = async (code) => {
    setError('')
    setBusy(true)
    const res = await verifyOtp({ digits, code, mode: 'login' })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    navigate(target, { replace: true })
  }

  const notFound = /sign up first/i.test(error)

  return (
    <AuthLayout title="Welcome back" subtitle="Log in with the mobile number used to sign up. We'll send a one-time code.">
      {step === 'mobile' ? (
        <>
          <Alert>{error}</Alert>
          {notFound && (
            <p className="-mt-2 mb-4 text-center text-sm">
              <Link to={`/signup?mobile=${encodeURIComponent(mobile)}${redirect ? `&redirect=${redirect}` : ''}`} className="text-rust font-semibold hover:underline">
                Create an account with this number →
              </Link>
            </p>
          )}
          <form onSubmit={request} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
              <PhoneInput value={mobile} onChange={setMobile} autoFocus />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? 'Sending code…' : 'Send OTP'}
            </button>
          </form>
        </>
      ) : (
        <OtpStep
          sentTo={prettyPhone(digits)}
          onVerify={verify}
          onResend={request}
          onBack={() => { setStep('mobile'); setError('') }}
          error={error}
          busy={busy}
          testMode={OTP_IS_TEST}
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
