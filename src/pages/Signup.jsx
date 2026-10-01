import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Alert from '../components/Alert'
import OtpStep from '../components/OtpStep'
import { useAuth } from '../context/AuthContext'
import { sendOtp, verifyOtp } from '../lib/otp'
import { OTP_MODE } from '../config/app'

export default function Signup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('details')
  const [form, setForm] = useState({ name: '', mobile: '', business: '', email: '', agree: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [justSignedUp, setJustSignedUp] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const profile = { full_name: form.name.trim(), mobile: form.mobile.trim(), business_name: form.business.trim() }

  // Already logged in (and not mid-signup) → dashboard
  useEffect(() => {
    if (user && !justSignedUp) navigate('/dashboard', { replace: true })
  }, [user, justSignedUp, navigate])

  const request = async (e) => {
    e?.preventDefault()
    setError('')
    if (!/^\+?\d[\d\s-]{8,14}$/.test(form.mobile.trim())) return setError('Please enter a valid mobile number')
    setBusy(true)
    const res = await sendOtp({ email: form.email.trim(), mode: 'signup', profile })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setStep('otp')
  }

  const verify = async (code) => {
    setError('')
    setBusy(true)
    setJustSignedUp(true)
    const res = await verifyOtp({ email: form.email.trim(), code, mode: 'signup', profile })
    setBusy(false)
    if (!res.ok) {
      setJustSignedUp(false)
      return setError(res.error)
    }
    // New accounts start at ₹0 → go straight to recharge
    navigate('/dashboard/wallet?welcome=1', { replace: true })
  }

  return (
    <AuthLayout
      wide
      title="Create your FindMySchemes account"
      subtitle="Keep your scheme reports, wallet and business information in one place."
    >
      {step === 'details' ? (
        <>
          <Alert>{error}</Alert>
          <form onSubmit={request} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" required value={form.name} onChange={set('name')} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                <input type="tel" required placeholder="+91XXXXXXXXXX" value={form.mobile} onChange={set('mobile')} className="input" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business / Company Name</label>
              <input type="text" required value={form.business} onChange={set('business')} className="input" />
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
              {busy ? 'Sending code…' : `Send OTP to ${OTP_MODE === 'supabase_sms' ? 'mobile' : 'email'}`}
            </button>
          </form>
        </>
      ) : (
        <OtpStep
          sentTo={OTP_MODE === 'supabase_sms' ? form.mobile : form.email}
          onVerify={verify}
          onResend={request}
          onBack={() => { setStep('details'); setError('') }}
          error={error}
          busy={busy}
        />
      )}
      <div className="mt-6 text-center text-sm text-gray-600 border-t pt-6 border-gray-100">
        Already have an account? <Link to="/login" className="text-darkGreen font-semibold hover:underline">Login</Link>
      </div>
    </AuthLayout>
  )
}
