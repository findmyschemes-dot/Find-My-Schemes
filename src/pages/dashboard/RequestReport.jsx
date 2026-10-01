import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api, friendlyError } from '../../lib/api'
import { fmtINR } from '../../lib/format'
import { FORM_VERSION, OPTIONS, emptyForm } from '../../config/reportForm'
import Alert from '../../components/Alert'

function Section({ n, title, hint, children }) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold border-b pb-2 mb-1">
        {n}. {title}
      </h3>
      {hint && <p className="text-xs text-gray-500 mb-3">{hint}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">{children}</div>
    </div>
  )
}

function Field({ label, required, full, children }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-rust">*</span>}
      </label>
      {children}
    </div>
  )
}

function Select({ value, onChange, options, required }) {
  return (
    <select required={required} value={value} onChange={onChange} className="input">
      <option value="">Select</option>
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  )
}

function Chips({ options, value, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button
            type="button"
            key={o}
            onClick={() => onToggle(o)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
              on ? 'bg-darkGreen text-white border-darkGreen' : 'bg-white text-gray-700 border-gray-300 hover:border-darkGreen'
            }`}
          >
            {on && <i className="fa-solid fa-check mr-1 text-xs" />}
            {o}
          </button>
        )
      })}
    </div>
  )
}

export default function RequestReport() {
  const { profile, user, wallet, pricing, refreshWallet } = useAuth()
  const navigate = useNavigate()
  // Keep a draft so nothing is lost while the person goes to recharge
  const DRAFT_KEY = 'fms-report-draft'
  const [form, setForm] = useState(() => {
    const base = emptyForm({ ...profile, email: profile?.email || '' })
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
      return saved ? { ...base, ...saved } : base
    } catch {
      return base
    }
  })
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch { /* ignore */ }
  }, [form])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const balance = wallet?.balance ?? 0
  const price = pricing.reportPrice
  const enough = balance >= price

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const toggle = (k) => (v) => {
    let list = form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v]
    if (k === 'owner_category') list = v === 'None of these' ? (list.includes(v) ? [v] : []) : list.filter((x) => x !== 'None of these')
    setForm({ ...form, [k]: list })
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.purpose.length) return setError('Please choose at least one purpose in section 4.')
    if (form.description.trim().length < 30) return setError('Please describe the business and plans in at least 30 characters.')
    if (!enough) return setError(`Not enough balance. A report costs ${fmtINR(price)}; the wallet has ${fmtINR(balance)}.`)
    setBusy(true)
    try {
      const report = await api.submitReportRequest({ ...form, form_version: FORM_VERSION })
      try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      await refreshWallet()
      navigate('/dashboard/report-success', { state: { report } })
    } catch (err) {
      setError(friendlyError(err))
      refreshWallet()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto card overflow-hidden">
      <div className="bg-darkGreen p-6 text-white text-center">
        <h2 className="font-serif text-2xl font-bold mb-1">Get Your Scheme Eligibility Report</h2>
        <p className="text-gray-300 text-sm">
          Tell us about the business. Our team prepares the report and emails it within {pricing.slaHours} hours.
        </p>
      </div>

      {!enough && (
        <div className="m-6 mb-0 p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold">Wallet balance is {fmtINR(balance)}</p>
            <p>A report costs {fmtINR(price)}. Recharge to submit this form.</p>
          </div>
          <Link to="/dashboard/wallet" className="btn-primary px-5 py-2 text-sm text-center">Recharge Wallet</Link>
        </div>
      )}

      <form onSubmit={onSubmit} className="p-6 sm:p-8">
        <Section n={1} title="Business Details">
          <Field label="Business name" required full>
            <input required value={form.business_name} onChange={set('business_name')} className="input" />
          </Field>
          <Field label="Type of business" required>
            <Select required value={form.entity_type} onChange={set('entity_type')} options={OPTIONS.entity_type} />
          </Field>
          <Field label="Industry" required>
            <Select required value={form.industry} onChange={set('industry')} options={OPTIONS.industry} />
          </Field>
          <Field label="Products / services (sub-sector)" full>
            <input value={form.sub_sector} onChange={set('sub_sector')} placeholder="e.g. Ready-to-eat snacks, CNC machining" className="input" />
          </Field>
          <Field label="State" required>
            <Select required value={form.state} onChange={set('state')} options={OPTIONS.state} />
          </Field>
          <Field label="City / District" required>
            <input required value={form.city} onChange={set('city')} className="input" />
          </Field>
          <Field label="Year started">
            <input type="number" min="1900" max="2100" value={form.year_established} onChange={set('year_established')} className="input" />
          </Field>
          <Field label="Business stage" required>
            <Select required value={form.business_stage} onChange={set('business_stage')} options={OPTIONS.business_stage} />
          </Field>
        </Section>

        <Section n={2} title="Size & Registrations">
          <Field label="Annual turnover" required>
            <Select required value={form.annual_turnover} onChange={set('annual_turnover')} options={OPTIONS.annual_turnover} />
          </Field>
          <Field label="Number of employees" required>
            <Select required value={form.employees} onChange={set('employees')} options={OPTIONS.employees} />
          </Field>
          <Field label="Udyam (MSME) registered?" required>
            <Select required value={form.udyam_registered} onChange={set('udyam_registered')} options={OPTIONS.yes_no} />
          </Field>
          <Field label="GST registered?">
            <Select value={form.gst_registered} onChange={set('gst_registered')} options={OPTIONS.yes_no} />
          </Field>
          <Field label="DPIIT-recognised startup?">
            <Select value={form.dpiit_startup} onChange={set('dpiit_startup')} options={OPTIONS.yes_no} />
          </Field>
          <Field label="Exporting currently?">
            <Select value={form.exporter} onChange={set('exporter')} options={['Yes', 'No', 'Planning to']} />
          </Field>
        </Section>

        <Section n={3} title="Promoter Profile (optional)" hint="Some schemes give extra benefits to these groups. Select any that apply.">
          <div className="sm:col-span-2">
            <Chips options={OPTIONS.owner_category} value={form.owner_category} onToggle={toggle('owner_category')} />
          </div>
        </Section>

        <Section n={4} title="What Support Is Needed">
          <Field label="Purpose (choose all that apply)" required full>
            <Chips options={OPTIONS.purpose} value={form.purpose} onToggle={toggle('purpose')} />
          </Field>
          <Field label="Planned investment" required>
            <Select required value={form.planned_investment} onChange={set('planned_investment')} options={OPTIONS.investment} />
          </Field>
          <Field label="Type of support preferred" full>
            <Chips options={OPTIONS.support_type} value={form.support_type} onToggle={toggle('support_type')} />
          </Field>
          <Field label="Describe the business and plans" required full>
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={set('description')}
              placeholder="What the business does today, what is planned next, and anything else the team should know."
              className="input"
            />
            <p className="text-xs text-gray-400 mt-1">{form.description.trim().length} / 30 characters minimum</p>
          </Field>
        </Section>

        <Section n={5} title="Report Delivery">
          <Field label="Send the report to (email)" required>
            <input type="email" required value={form.delivery_email} onChange={set('delivery_email')} className="input" />
          </Field>
          <Field label="WhatsApp / mobile (optional)">
            <input type="tel" value={form.contact_mobile} onChange={set('contact_mobile')} className="input" />
          </Field>
        </Section>

        <div className="mb-8">
          <h3 className="text-lg font-semibold border-b pb-2 mb-4">6. Payment from Wallet</h3>
          <div className="bg-gray-50 rounded p-4 border border-gray-200 text-sm space-y-2">
            <div className="flex justify-between text-gray-700"><span>Wallet balance</span><span>{fmtINR(balance)}</span></div>
            <div className="flex justify-between text-gray-700"><span>Scheme Eligibility Report</span><span>− {fmtINR(price)}</span></div>
            <hr className="border-gray-200" />
            <div className={`flex justify-between font-bold ${enough ? 'text-gray-900' : 'text-red-600'}`}>
              <span>Balance after submitting</span>
              <span>{enough ? fmtINR(balance - price) : 'Not enough balance'}</span>
            </div>
          </div>
        </div>

        <Alert>{error}</Alert>

        <div className="flex justify-end gap-3">
          <Link to="/dashboard" className="px-6 py-2.5 text-gray-600 font-medium hover:text-gray-900 transition-colors">Cancel</Link>
          {enough ? (
            <button type="submit" disabled={busy} className="btn-primary px-8 py-2.5">
              {busy ? 'Submitting…' : `Submit & Pay ${fmtINR(price)} from Wallet`}
            </button>
          ) : (
            <Link to="/dashboard/wallet" className="btn-primary px-8 py-2.5">Recharge Wallet to Continue</Link>
          )}
        </div>
      </form>
    </div>
  )
}
