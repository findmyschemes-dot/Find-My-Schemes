import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAdmin } from '../AdminAuth'
import { sendAdminOtp, verifyAdminOtp, prettyPhone } from '../loginFlow'
import OtpStep from '../../components/OtpStep'
import Alert from '../../components/Alert'
import { isSupabaseConfigured } from '../../lib/supabase'

export default function AdminLogin() {
  const { session, isAdmin, refresh } = useAdmin()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/admin'
  // Pre-filled when coming from the "Admin Panel" button in the customer menu
  const [phone, setPhone] = useState(() => {
    const d = (params.get('phone') || '').replace(/\D/g, '')
    return d.length === 12 && d.startsWith('91') ? d.slice(2) : d
  })
  const [step, setStep] = useState('phone')
  const [otp, setOtp] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (session && isAdmin) navigate(next, { replace: true })
  }, [session, isAdmin, navigate, next])

  const send = async (e) => {
    e?.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await sendAdminOtp(phone)
      if (!res.ok) return setError(res.error)
      setOtp(res)
      setStep('otp')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const verify = async (code) => {
    setError('')
    setBusy(true)
    const res = await verifyAdminOtp(otp.digits, code, otp.mode)
    if (!res.ok) {
      setBusy(false)
      return setError(res.error)
    }
    await refresh()
    setBusy(false)
    navigate(next, { replace: true })
  }

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
        {step === 'phone' ? (
          <form onSubmit={send} className="space-y-4">
            <h1 className="text-lg font-bold text-gray-900 text-center">Admin login</h1>
            <p className="text-sm text-gray-500 text-center">Only authorised mobile numbers can sign in.</p>
            <Alert>{error}</Alert>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mobile number</label>
              <div className="flex">
                <span className="px-3 flex items-center bg-gray-50 border border-r-0 border-gray-300 rounded-l text-sm text-gray-600">+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="98765 43210"
                  className="input rounded-l-none"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">For another country, type the full number with its code.</p>
            </div>
            <button disabled={busy} className="btn-primary w-full py-3">{busy ? 'Checking…' : 'Send OTP'}</button>
          </form>
        ) : (
          <OtpStep
            sentTo={prettyPhone(otp.digits)}
            onVerify={verify}
            onResend={send}
            onBack={() => { setStep('phone'); setError('') }}
            error={error}
            busy={busy}
            testMode={otp.mode !== 'sms'}
          />
        )}
      </div>
    </div>
  )
}
