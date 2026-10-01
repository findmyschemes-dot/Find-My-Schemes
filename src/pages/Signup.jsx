import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Alert from '../components/Alert'
import OtpStep from '../components/OtpStep'
import PhoneInput from '../components/PhoneInput'
import { useAuth } from '../context/AuthContext'
import { sendOtp, verifyOtp, OTP_IS_TEST } from '../lib/otp'
import { prettyPhone } from '../lib/phone'

export default function Signup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState('details')
  const [form, setForm] = useState({ name: '', mobile: params.get('mobile') || '', business: '', email: '', agree: false })
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [justSignedUp, setJustSignedUp] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const profile = { full_name: form.name.trim(), business_name: form.business.trim(), email: form.email.trim().toLowerCase() }

  useEffect(() => {
    if (user && !justSignedUp) navigate('/dashboard', { replace: true })
  }, [user, justSignedUp, navigate])

  const request = async (e) => {
    e?.preventDefault()
    setError('')
    setBusy(true)
    const res = await sendOtp({ mobile: form.mobile, mode: 'signup', profile })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setDigits(res.digits)
    setStep('otp')
  }

  const verify = async (code) => {
    setError('')
    setBusy(true)
    setJustSignedUp(true)
    const res = await verifyOtp({ digits, code, mode: 'signup', profile })
    setBusy(false)
    if (!res.ok) {
      setJustSignedUp(false)
      return setError(res.error)
    }
    // New accounts start at ₹0 → go straight to recharge
    navigate('/dashboard/wallet?welcome=1', { replace: true })
  }

  const exists = /already exists/i.test(error)

  return (
    <AuthLayout
      wide
      title="Create your FindMySchemes account"
      subtitle="Sign up with a mobile number. We'll send a one-time code to verify it."
    >
      {step === 'details' ? (
        <>
          <Alert>{error}</Alert>
          {exists && (
            <p className="-mt-2 mb-4 text-center text-sm">
              <Link to={`/login?mobile=${encodeURIComponent(form.mobile)}`} className="text-rust font-semibold hover:underline">Log in with this number →</Link>
            </p>
          )}
          <form onSubmit={request} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
              <PhoneInput value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} autoFocus />
              <p className="text-xs text-gray-500 mt-1">This number is used to log in.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" required value={form.name} onChange={set('name')} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business / Company Name</label>
                <input type="text" required value={form.business} onChange={set('business')} className="input" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input type="email" required value={form.email} onChange={set('email')} className="input" />
              <p className="text-xs text-gray-500 mt-1">Reports are delivered to this email.</p>
            </div>
            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" required checked={form.agree} onChange={set('agree')} className="mt-0.5" />
              <span>
                I agree to the <a href="#" className="text-darkGreen hover:underline">Terms &amp; Conditions</a> and{' '}
                <a href="#" className="text-darkGreen hover:underline">Privacy Policy</a>.
              </span>
            </label>
            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? 'Sending code…' : 'Send OTP to Mobile'}
            </button>
          </form>
        </>
      ) : (
        <OtpStep
          sentTo={prettyPhone(digits)}
          onVerify={verify}
          onResend={request}
          onBack={() => { setStep('details'); setError('') }}
          error={error}
          busy={busy}
          testMode={OTP_IS_TEST}
        />
      )}
      <div className="mt-6 text-center text-sm text-gray-600 border-t pt-6 border-gray-100">
        Already have an account? <Link to="/login" className="text-darkGreen font-semibold hover:underline">Login</Link>
      </div>
    </AuthLayout>
  )
}
