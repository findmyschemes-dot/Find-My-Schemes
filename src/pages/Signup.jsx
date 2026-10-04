import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Alert from '../components/Alert'
import PhoneEmailButton from '../components/PhoneEmailButton'
import { useAuth } from '../context/AuthContext'
import { completePhoneLogin, saveIntent, readPending, clearPending } from '../lib/phoneAuth'
import { prettyPhone } from '../lib/phone'

export default function Signup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirect = params.get('redirect')
  const [pending, setPending] = useState(() => readPending()) // number already verified on the Login page
  const [step, setStep] = useState('details') // details | verify
  const [form, setForm] = useState({ name: '', business: '', email: '', agree: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const profile = { full_name: form.name.trim(), business_name: form.business.trim(), email: form.email.trim().toLowerCase() }
  const done = (res) =>
    navigate(res.existingAccount ? '/dashboard?existing=1' : redirect ? `/dashboard/${redirect}` : '/dashboard?welcome=1', { replace: true })

  useEffect(() => {
    if (user && !busy) navigate('/dashboard', { replace: true })
  }, [user, busy, navigate])

  const finish = async (userJsonUrl) => {
    setError('')
    setBusy(true)
    const res = await completePhoneLogin({ userJsonUrl, mode: 'signup', profile })
    if (res.ok) return done(res)
    setBusy(false)
    if (pending) { clearPending(); setPending(null); setStep('verify') }
    setError(res.error)
  }

  const onDetails = (e) => {
    e.preventDefault()
    setError('')
    if (pending) return finish(pending.url)
    saveIntent({ mode: 'signup', profile, next: redirect ? `/dashboard/${redirect}` : '/dashboard?welcome=1' })
    setStep('verify')
  }

  return (
    <AuthLayout wide title="Create your FindMySchemes account" subtitle="Your mobile number is your login. It is verified with a one-time code.">
      <Alert>{error}</Alert>

      {step === 'details' ? (
        <form onSubmit={onDetails} className="space-y-4">
          {pending && (
            <div className="p-3 rounded bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-check" /> Mobile <b>{prettyPhone(pending.phone)}</b> verified. Add a few details to finish.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" required value={form.name} onChange={set('name')} className="input" autoFocus />
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
            {busy ? 'Creating account…' : pending ? 'Create Account' : 'Continue — verify mobile'}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="p-3 rounded bg-gray-50 border border-gray-200 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{profile.full_name}</div>
            <div>{profile.business_name} · {profile.email}</div>
            <button onClick={() => setStep('details')} className="text-xs text-rust hover:underline mt-1">Edit details</button>
          </div>
          <p className="text-sm text-gray-700 text-center font-medium">Last step: verify the mobile number</p>
          {busy ? (
            <p className="text-center text-sm text-gray-600 py-4"><i className="fa-solid fa-circle-notch fa-spin mr-2" />Creating account…</p>
          ) : (
            <PhoneEmailButton onVerified={finish} />
          )}
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-600 border-t pt-6 border-gray-100">
        Already have an account? <Link to="/login" className="text-darkGreen font-semibold hover:underline">Login</Link>
      </div>
    </AuthLayout>
  )
}
