import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminApi, adminErr } from '../adminApi'
import { useAdmin } from '../AdminAuth'
import { fmtINR } from '../../lib/format'
import { prettyPhone } from '../../lib/phone'
import { PaymentBadge, WorkBadge } from '../../components/StatusBadge'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import { fmtDateTime, ageText } from './Requests'

const LABELS = {
  entity_type: 'Type of business', industry: 'Industry', sub_sector: 'Products / services', state: 'State', city: 'City / District',
  year_established: 'Year started', business_stage: 'Stage', annual_turnover: 'Turnover', employees: 'Employees',
  udyam_registered: 'Udyam registered', gst_registered: 'GST registered', dpiit_startup: 'DPIIT startup', exporter: 'Exporting',
  owner_category: 'Promoter profile', purpose: 'Purpose', planned_investment: 'Planned investment', support_type: 'Support preferred',
  contact_mobile: 'Contact mobile', description: 'Description',
}

const Card = ({ title, children, right }) => (
  <div className="card p-5 mb-4">
    <div className="flex justify-between items-center mb-3">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {right}
    </div>
    {children}
  </div>
)

const Label = ({ children }) => <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>

export default function RequestDetail() {
  const { id } = useParams()
  const { sla } = useAdmin()
  const [r, setR] = useState(null)
  const [events, setEvents] = useState([])
  const [schemes, setSchemes] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState({})
  const [busy, setBusy] = useState('')
  const [form, setForm] = useState({})
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelNote, setCancelNote] = useState('')
  const [pay, setPay] = useState({ amount: '', method: 'UPI', reference: '', note: '' })
  const [scheme, setScheme] = useState({ name: '', govt_level: 'Central Govt', sector: '', benefit: '', match_score: '', description: '', why_eligible: '' })
  const fileRef = useRef(null)

  const load = async () => {
    const [rep, ev, sc] = await Promise.all([adminApi.report(id), adminApi.reportEvents(id), adminApi.reportSchemes(id)])
    setR(rep)
    setEvents(ev || [])
    setSchemes(sc || [])
    if (rep)
      setForm({
        status_note: rep.status_note || '',
        summary: rep.summary || '',
        schemes_found: rep.schemes_found ?? '',
        potential_benefit: rep.potential_benefit || '',
        high_matches: rep.high_matches ?? '',
      })
    setLoading(false)
  }
  useEffect(() => {
    load().catch((e) => { setMsg({ type: 'error', text: adminErr(e) }); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const run = async (key, fn, ok) => {
    setBusy(key)
    setMsg({})
    try {
      await fn()
      await load()
      if (ok) setMsg({ type: 'success', text: ok })
    } catch (e) {
      setMsg({ type: 'error', text: adminErr(e) })
    }
    setBusy('')
  }

  if (loading) return <Spinner />
  if (!r) return <div className="p-8 text-center text-red-600">Request not found.</div>

  const open = ['submitted', 'processing'].includes(r.status)
  const locked = r.status === 'cancelled'
  const paidOk = ['paid', 'waived'].includes(r.payment_status)
  const intOrNull = (v) => (v === '' || v == null ? null : parseInt(v, 10))

  const setStatus = (status, ok) =>
    run(status, () => adminApi.updateReport(r.id, { status, status_note: form.status_note || null }), ok)

  const saveResults = () =>
    run('save', () =>
      adminApi.updateReport(r.id, {
        status_note: form.status_note || null,
        summary: form.summary || null,
        schemes_found: intOrNull(form.schemes_found),
        potential_benefit: form.potential_benefit || null,
        high_matches: intOrNull(form.high_matches),
      }), 'Saved.')

  const upload = (file) => {
    if (!file) return
    if (file.type !== 'application/pdf') return setMsg({ type: 'error', text: 'Please choose a PDF file.' })
    run('upload', async () => {
      const path = await adminApi.uploadReportPdf(r, file)
      await adminApi.updateReport(r.id, { report_file_path: path })
    }, 'PDF uploaded.')
  }

  const openPdf = async () => {
    try { window.open(await adminApi.fileUrl(r.report_file_path), '_blank', 'noopener') } catch (e) { setMsg({ type: 'error', text: adminErr(e) }) }
  }

  const addScheme = (e) => {
    e.preventDefault()
    run('scheme', async () => {
      await adminApi.addScheme({ ...scheme, report_id: r.id, match_score: intOrNull(scheme.match_score), sort_order: schemes.length })
      setScheme({ name: '', govt_level: 'Central Govt', sector: '', benefit: '', match_score: '', description: '', why_eligible: '' })
    })
  }

  const inputs = r.inputs || {}

  return (
    <div className="max-w-6xl mx-auto">
      <Link to="/admin/requests" className="text-sm text-gray-500 hover:text-darkGreen"><i className="fa-solid fa-arrow-left mr-1" /> All requests</Link>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mt-3 mb-5">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-darkGreen">{r.business_name}</h1>
            <WorkBadge status={r.status} />
            <PaymentBadge status={r.payment_status} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {r.report_code} · submitted {fmtDateTime(r.created_at)}
            {open && paidOk && (
              <span className={r.age_hours > sla ? 'text-red-600 font-semibold' : ''}> · {ageText(r.age_hours)} since payment{r.age_hours > sla && ' (overdue)'}</span>
            )}
            {r.delivered_at && <> · delivered {fmtDateTime(r.delivered_at)}</>}
          </p>
        </div>
        {!locked && (
          <div className="flex flex-wrap gap-2">
            {r.status === 'submitted' && (
              <button onClick={() => setStatus('processing', 'Marked In Review.')} disabled={!!busy} className="btn-outline px-4 py-2 text-sm">
                <i className="fa-solid fa-magnifying-glass mr-1" /> Start review
              </button>
            )}
            {r.status !== 'ready' && (
              <button onClick={() => setStatus('ready', 'Marked Ready — the customer can now see it.')} disabled={!!busy} className="btn-primary px-4 py-2 text-sm">
                <i className="fa-solid fa-check mr-1" /> Mark as delivered
              </button>
            )}
            {r.status === 'ready' && (
              <button onClick={() => setStatus('processing', 'Moved back to In Review.')} disabled={!!busy} className="btn-outline px-4 py-2 text-sm">Reopen</button>
            )}
            <button onClick={() => setCancelOpen(true)} disabled={!!busy} className="px-4 py-2 text-sm rounded border border-red-200 text-red-700 hover:bg-red-50 font-semibold">
              <i className="fa-solid fa-ban mr-1" /> Cancel request
            </button>
          </div>
        )}
      </div>

      <Alert type={msg.type === 'success' ? 'success' : 'error'}>{msg.text}</Alert>

      {!locked && r.payment_status === 'awaiting' && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm">
          <i className="fa-solid fa-clock mr-2" />Payment of {fmtINR(r.amount_due)} not confirmed yet. Mark it paid (right) once the money is received.
        </div>
      )}

      {cancelOpen && (
        <div className="card p-5 mb-4 border-red-200 bg-red-50/40">
          <p className="font-semibold text-red-800 mb-2">Cancel request {r.report_code}?</p>
          <p className="text-sm text-red-800/80 mb-3">
            The customer sees it as cancelled with the reason below.{r.payment_status === 'paid' && ' If money is returned, also mark the payment as Refunded.'}
          </p>
          <input value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} placeholder="Reason shown to the customer" className="input mb-3" />
          <div className="flex gap-2">
            <button
              disabled={!!busy}
              onClick={() => run('cancel', () => adminApi.updateReport(r.id, { status: 'cancelled', status_note: cancelNote || 'Cancelled by the team' }), 'Request cancelled.').then(() => setCancelOpen(false))}
              className="px-4 py-2 text-sm rounded bg-red-600 text-white font-semibold hover:bg-red-700"
            >
              {busy === 'cancel' ? 'Cancelling…' : 'Confirm cancel'}
            </button>
            <button onClick={() => setCancelOpen(false)} className="px-4 py-2 text-sm text-gray-600">Keep request</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card title="Submitted details">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {Object.entries(LABELS).map(([k, label]) => {
                const v = Array.isArray(inputs[k]) ? inputs[k].join(', ') : inputs[k]
                if (!v) return null
                return (
                  <div key={k} className={k === 'description' ? 'sm:col-span-2' : ''}>
                    <dt className="text-xs text-gray-500 uppercase tracking-wider">{label}</dt>
                    <dd className="text-gray-900 whitespace-pre-line">{v}</dd>
                  </div>
                )
              })}
            </dl>
          </Card>

          <Card
            title="Report PDF"
            right={r.report_file_path && <button onClick={openPdf} className="text-sm text-darkGreen font-medium hover:text-rust"><i className="fa-solid fa-eye mr-1" />Open</button>}
          >
            <p className="text-sm text-gray-600 mb-3">
              {r.report_file_path ? <>Uploaded: <code className="text-xs bg-gray-100 px-1 rounded">{r.report_file_path}</code></> : 'No PDF uploaded yet. Customers can download it from their dashboard once uploaded.'}
            </p>
            {!locked && (
              <>
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
                <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="btn-outline px-4 py-2 text-sm">
                  <i className={`fa-solid ${busy === 'upload' ? 'fa-circle-notch fa-spin' : 'fa-upload'} mr-1`} /> {r.report_file_path ? 'Replace PDF' : 'Upload PDF'}
                </button>
              </>
            )}
          </Card>

          <Card title="Results shown to the customer">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div><Label>Schemes found</Label><input type="number" min="0" disabled={locked} value={form.schemes_found} onChange={(e) => setForm({ ...form, schemes_found: e.target.value })} className="input" /></div>
              <div><Label>Potential benefit</Label><input disabled={locked} value={form.potential_benefit} placeholder="Up to ₹1.5 Cr" onChange={(e) => setForm({ ...form, potential_benefit: e.target.value })} className="input" /></div>
              <div><Label>High-probability matches</Label><input type="number" min="0" disabled={locked} value={form.high_matches} onChange={(e) => setForm({ ...form, high_matches: e.target.value })} className="input" /></div>
            </div>
            <Label>Summary</Label>
            <textarea rows={3} disabled={locked} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} className="input mb-3" />
            <Label>Status note (shown to the customer)</Label>
            <input disabled={locked} value={form.status_note} placeholder="e.g. Waiting for GST certificate" onChange={(e) => setForm({ ...form, status_note: e.target.value })} className="input mb-3" />
            {!locked && <button onClick={saveResults} disabled={!!busy} className="btn-primary px-5 py-2 text-sm">{busy === 'save' ? 'Saving…' : 'Save'}</button>}
          </Card>

          <Card title={`Matched schemes (${schemes.length})`}>
            {schemes.length > 0 && (
              <ul className="divide-y divide-gray-100 mb-4">
                {schemes.map((s) => (
                  <li key={s.id} className="py-2 flex justify-between gap-3 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-500">{[s.govt_level, s.sector, s.benefit, s.match_score != null && `${s.match_score}% match`].filter(Boolean).join(' · ')}</div>
                    </div>
                    {!locked && <button onClick={() => run('del' + s.id, () => adminApi.deleteScheme(s.id))} className="text-gray-400 hover:text-red-600" aria-label="Remove"><i className="fa-solid fa-trash-can" /></button>}
                  </li>
                ))}
              </ul>
            )}
            {!locked && (
              <form onSubmit={addScheme} className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-3 rounded">
                <div className="sm:col-span-2"><Label>Scheme name *</Label><input required value={scheme.name} onChange={(e) => setScheme({ ...scheme, name: e.target.value })} className="input" /></div>
                <div><Label>Level</Label>
                  <select value={scheme.govt_level} onChange={(e) => setScheme({ ...scheme, govt_level: e.target.value })} className="input"><option>Central Govt</option><option>State Govt</option></select>
                </div>
                <div><Label>Sector</Label><input value={scheme.sector} onChange={(e) => setScheme({ ...scheme, sector: e.target.value })} className="input" /></div>
                <div><Label>Benefit</Label><input value={scheme.benefit} placeholder="Up to 35% subsidy" onChange={(e) => setScheme({ ...scheme, benefit: e.target.value })} className="input" /></div>
                <div><Label>Match score (0–100)</Label><input type="number" min="0" max="100" value={scheme.match_score} onChange={(e) => setScheme({ ...scheme, match_score: e.target.value })} className="input" /></div>
                <div className="sm:col-span-2"><Label>Description</Label><input value={scheme.description} onChange={(e) => setScheme({ ...scheme, description: e.target.value })} className="input" /></div>
                <div className="sm:col-span-2"><Label>Why it fits</Label><input value={scheme.why_eligible} onChange={(e) => setScheme({ ...scheme, why_eligible: e.target.value })} className="input" /></div>
                <div className="sm:col-span-2"><button disabled={!!busy} className="btn-outline px-4 py-2 text-sm"><i className="fa-solid fa-plus mr-1" />Add scheme</button></div>
              </form>
            )}
          </Card>
        </div>

        <div>
          <Card title="Customer">
            <div className="text-sm space-y-1">
              <div className="font-semibold text-gray-900">{r.customer_name || '—'}</div>
              <div className="text-gray-600"><i className="fa-regular fa-envelope w-4 mr-1" />{r.customer_email}</div>
              {r.customer_mobile && <div className="text-gray-600"><i className="fa-solid fa-phone w-4 mr-1" />{prettyPhone(r.customer_mobile)}</div>}
              <div className="pt-2 text-gray-600">Send report to: <b className="text-gray-900">{r.delivery_email}</b></div>
              <div className="flex gap-3 pt-3">
                <a href={`mailto:${r.delivery_email}?subject=${encodeURIComponent(`Your Scheme Eligibility Report — ${r.report_code}`)}`} className="text-darkGreen font-medium hover:text-rust"><i className="fa-solid fa-paper-plane mr-1" />Email</a>
                <Link to={`/admin/customers/${r.user_id}`} className="text-darkGreen font-medium hover:text-rust">Profile →</Link>
              </div>
            </div>
          </Card>
          <Card title="Payment" right={<PaymentBadge status={r.payment_status} />}>
            <div className="text-sm space-y-1 mb-3">
              <div className="flex justify-between"><span className="text-gray-500">Amount due</span><b>{fmtINR(r.amount_due)}</b></div>
              {r.payment_status === 'paid' && (
                <>
                  <div className="flex justify-between"><span className="text-gray-500">Received</span><b>{fmtINR(r.amount_paid)}</b></div>
                  <div className="flex justify-between"><span className="text-gray-500">On</span><span>{fmtDateTime(r.paid_at)}</span></div>
                </>
              )}
              {r.payment_method && <div className="flex justify-between"><span className="text-gray-500">Method</span><span>{r.payment_method}</span></div>}
              {r.payment_reference && <div className="flex justify-between gap-2"><span className="text-gray-500">Reference</span><span className="text-right break-all">{r.payment_reference}</span></div>}
              {r.payment_note && <div className="text-gray-600 text-xs pt-1">{r.payment_note}</div>}
            </div>

            {r.payment_status === 'awaiting' && !locked && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  run('pay', () => adminApi.setPayment(r.id, {
                    payment_status: 'paid',
                    amount_paid: pay.amount === '' ? r.amount_due : Number(pay.amount),
                    payment_method: pay.method,
                    payment_reference: pay.reference.trim() || null,
                    payment_note: pay.note.trim() || null,
                  }), 'Marked as paid — the request is now in the work queue.')
                }}
                className="space-y-2 border-t border-gray-100 pt-3"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Amount (₹)</Label><input type="number" min="0" step="1" placeholder={String(r.amount_due)} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="input py-1.5 text-sm" /></div>
                  <div><Label>Method</Label>
                    <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} className="input py-1.5 text-sm">
                      {['UPI', 'Bank transfer', 'Cash', 'Card', 'Cheque', 'Other'].map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div><Label>Reference / UTR</Label><input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="e.g. 4321XXXXXXXX" className="input py-1.5 text-sm" /></div>
                <div><Label>Note (internal)</Label><input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} className="input py-1.5 text-sm" /></div>
                <button disabled={!!busy} className="btn-primary w-full py-2 text-sm">{busy === 'pay' ? 'Saving…' : 'Mark as paid'}</button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => run('waive', () => adminApi.setPayment(r.id, { payment_status: 'waived', payment_note: pay.note.trim() || 'Waived' }), 'Payment waived.')}
                  className="w-full text-xs text-gray-500 hover:text-gray-800 py-1"
                >
                  Waive payment (free report)
                </button>
              </form>
            )}

            {r.payment_status === 'paid' && (
              <div className="flex gap-3 border-t border-gray-100 pt-3 text-xs">
                <button disabled={!!busy} onClick={() => run('refund', () => adminApi.setPayment(r.id, { payment_status: 'refunded' }), 'Marked as refunded.')} className="text-red-600 hover:underline">Mark refunded</button>
                <button disabled={!!busy} onClick={() => run('undo', () => adminApi.setPayment(r.id, { payment_status: 'awaiting', payment_method: null, payment_reference: null }), 'Payment moved back to awaiting.')} className="text-gray-500 hover:underline">Undo — not paid</button>
              </div>
            )}
            {['waived', 'refunded'].includes(r.payment_status) && (
              <div className="border-t border-gray-100 pt-3 text-xs">
                <button disabled={!!busy} onClick={() => run('undo', () => adminApi.setPayment(r.id, { payment_status: 'awaiting' }), 'Payment moved back to awaiting.')} className="text-gray-500 hover:underline">Back to awaiting payment</button>
              </div>
            )}
          </Card>
          <Card title="History">
            <ol className="relative border-l border-gray-200 ml-2 space-y-3">
              {events.map((e) => (
                <li key={e.id} className="ml-4">
                  <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-darkGreen mt-1" />
                  {e.kind === 'payment' ? (
                    <PaymentBadge status={e.status} className="px-2 py-0.5 rounded text-[11px]" />
                  ) : (
                    <WorkBadge status={e.status} className="px-2 py-0.5 rounded text-[11px]" />
                  )}
                  <div className="text-xs text-gray-500 mt-0.5">{fmtDateTime(e.created_at)} · by {e.actor}</div>
                  {e.note && <div className="text-xs text-gray-700">{e.note}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}
