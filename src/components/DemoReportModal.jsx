import { useEffect, useRef, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { normalizePhone, isValidPhone } from '../lib/phone'

const PDF = '/assets/Demo.pdf'
const SAVED_KEY = 'fms_demo_lead' // remembers this browser already filled the form

const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())

export function startDemoDownload() {
  const a = document.createElement('a')
  a.href = PDF
  a.download = 'Find-My-Schemes-Demo-Report.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function alreadyRegistered() {
  try {
    return Boolean(localStorage.getItem(SAVED_KEY))
  } catch {
    return false
  }
}

export default function DemoReportModal({ open, onClose, source = 'landing' }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')
  const [done, setDone] = useState(false)
  const first = useRef(null)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setFailed('')
    setDone(false)
    setTimeout(() => first.current?.focus(), 50)
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const set = (k) => (e) => {
    const v = k === 'phone' ? e.target.value.replace(/[^\d+\s-]/g, '') : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) setErrors((x) => ({ ...x, [k]: '' }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (form.name.trim().length < 2) errs.name = 'Please enter the full name.'
    if (!isEmail(form.email)) errs.email = 'Please enter a valid email address.'
    if (!isValidPhone(form.phone)) errs.phone = 'Please enter a valid 10-digit mobile number.'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setBusy(true)
    setFailed('')
    try {
      if (!isSupabaseConfigured) throw new Error('not configured')
      const { error } = await supabase.from('free_report_leads').insert({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: normalizePhone(form.phone),
        source,
      })
      if (error) throw error
      try {
        localStorage.setItem(SAVED_KEY, '1')
      } catch { /* private mode — fine */ }
      setDone(true)
      startDemoDownload()
    } catch {
      setFailed('Could not save the details just now. Please try again in a moment.')
    }
    setBusy(false)
  }

  const field = (k, label, props) => (
    <div>
      <label htmlFor={`demo-${k}`} className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <input
        id={`demo-${k}`}
        value={form[k]}
        onChange={set(k)}
        className={`input ${errors[k] ? 'border-red-400' : ''}`}
        aria-invalid={Boolean(errors[k])}
        {...props}
      />
      {errors[k] && <p className="text-xs text-red-600 mt-1">{errors[k]}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="demo-title">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 sm:p-8 text-left text-gray-800">
        <button onClick={onClose} className="absolute top-3 right-4 text-gray-400 hover:text-gray-700 text-xl" aria-label="Close">
          <i className="fa-solid fa-xmark" />
        </button>

        {done ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto mb-4 text-2xl">
              <i className="fa-solid fa-check" />
            </div>
            <h3 className="font-serif text-2xl font-bold text-darkGreen mb-2">Thank you!</h3>
            <p className="text-gray-600 mb-6">The demo report download has started.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href={PDF} download className="btn-outline px-4 py-2 text-sm"><i className="fa-solid fa-download mr-2" />Download again</a>
              <button onClick={onClose} className="btn-primary px-4 py-2 text-sm">Close</button>
            </div>
          </div>
        ) : (
          <>
            <h3 id="demo-title" className="font-serif text-2xl font-bold text-darkGreen mb-1">Get the free demo report</h3>
            <p className="text-sm text-gray-600 mb-5">Share a few details and the sample report downloads right away.</p>
            {failed && <div className="mb-4 p-3 rounded text-sm bg-red-50 text-red-600">{failed}</div>}
            <form onSubmit={submit} noValidate className="space-y-4">
              {field('name', 'Full name', { ref: first, autoComplete: 'name', maxLength: 100, placeholder: 'e.g. Priya Sharma' })}
              {field('email', 'Email', { type: 'email', autoComplete: 'email', maxLength: 200, placeholder: 'name@company.com' })}
              {field('phone', 'Mobile number', { type: 'tel', inputMode: 'tel', autoComplete: 'tel', maxLength: 16, placeholder: '10-digit mobile number' })}
              <button type="submit" disabled={busy} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                <i className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-download'}`} />
                {busy ? 'Saving…' : 'Download demo report'}
              </button>
              <p className="text-xs text-gray-500 text-center">We may contact you about Find My Schemes. No spam.</p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
