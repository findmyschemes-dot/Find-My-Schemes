import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminApi, adminErr } from '../adminApi'
import { useAsync } from '../../lib/useAsync'
import { fmtINR } from '../../lib/format'
import { downloadExcel, COLUMNS } from '../excel'
import { PageHeader, DownloadButton, SearchBox, Tabs, matches, Th } from '../components/Toolbar'
import { PaymentBadge } from '../../components/StatusBadge'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import { fmtDateTime } from './Requests'

const METHODS = ['UPI', 'Bank transfer', 'Cash', 'Card', 'Cheque', 'Other']
const TABS = [
  ['awaiting', 'Awaiting payment', (r) => r.payment_status === 'awaiting' && r.status !== 'cancelled'],
  ['paid', 'Paid', (r) => r.payment_status === 'paid'],
  ['waived', 'Waived', (r) => r.payment_status === 'waived'],
  ['refunded', 'Refunded', (r) => r.payment_status === 'refunded'],
  ['all', 'All', () => true],
]

// Inline "mark paid" for the awaiting list — the most common daily task
function QuickPay({ r, onDone }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ method: 'UPI', reference: '', amount: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!open) return <button onClick={() => setOpen(true)} className="btn-primary px-3 py-1.5 text-xs whitespace-nowrap">Mark paid</button>
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await adminApi.setPayment(r.id, {
        payment_status: 'paid',
        payment_method: f.method,
        payment_reference: f.reference.trim() || null,
        amount_paid: f.amount === '' ? r.amount_due : Number(f.amount),
      })
      onDone()
    } catch (e2) {
      setErr(adminErr(e2))
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-1.5 justify-end">
      {err && <span className="text-xs text-red-600 w-full text-right">{err}</span>}
      <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className="input py-1 text-xs w-auto">{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
      <input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="UTR / ref" className="input py-1 text-xs w-28" />
      <input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder={String(r.amount_due)} className="input py-1 text-xs w-20" />
      <button disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{busy ? '…' : 'Save'}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 px-1">✕</button>
    </form>
  )
}

export default function Payments() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t[0] === params.get('tab')) ? params.get('tab') : 'awaiting'
  const [q, setQ] = useState('')
  const { data, loading, error, reload } = useAsync(adminApi.reports)
  const rows = data || []
  const test = TABS.find((t) => t[0] === tab)[2]
  const filtered = useMemo(
    () => rows.filter((r) => test(r) && matches(q, r.report_code, r.customer_name, r.customer_email, r.customer_mobile, r.business_name, r.payment_reference)),
    [rows, tab, q] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const paid = rows.filter((r) => r.payment_status === 'paid')
  const awaiting = rows.filter(TABS[0][2])
  const sum = (list, k) => list.reduce((s, r) => s + Number(r[k] || 0), 0)

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Payments"
        subtitle={`Collected outside the platform · ${fmtINR(sum(paid, 'amount_paid'))} received · ${fmtINR(sum(awaiting, 'amount_due'))} awaiting`}
      >
        <SearchBox value={q} onChange={setQ} placeholder="Request ID, customer, UTR…" />
        <DownloadButton count={filtered.length} onClick={() => downloadExcel(`payments-${tab}`, [{ name: 'Payments', columns: COLUMNS.payments, rows: filtered }])} />
      </PageHeader>
      <Tabs tabs={TABS.map(([value, label, fn]) => ({ value, label, count: rows.filter(fn).length }))} value={tab} onChange={(v) => setParams({ tab: v })} />
      {error && <Alert>{error}</Alert>}
      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr><Th>Request</Th><Th>Customer</Th><Th>Submitted</Th><Th>Status</Th><Th>Method · Reference</Th><Th right>Amount</Th><Th right>{tab === 'awaiting' ? 'Action' : 'Paid on'}</Th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 align-top">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <Link to={`/admin/requests/${r.id}`} className="font-semibold text-darkGreen hover:text-rust">{r.report_code}</Link>
                    <div className="text-xs text-gray-500">{r.business_name}</div>
                  </td>
                  <td className="py-3 px-4">
                    <Link to={`/admin/customers/${r.user_id}`} className="text-gray-900 hover:text-rust">{r.customer_name || '—'}</Link>
                    <div className="text-xs text-gray-500">{r.customer_mobile ? `+${r.customer_mobile}` : r.customer_email}</div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-gray-600">{fmtDateTime(r.created_at)}</td>
                  <td className="py-3 px-4"><PaymentBadge status={r.payment_status} /></td>
                  <td className="py-3 px-4 text-gray-600">{[r.payment_method, r.payment_reference].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="py-3 px-4 text-right font-semibold whitespace-nowrap">{fmtINR(r.amount_paid ?? r.amount_due)}</td>
                  <td className="py-3 px-4 text-right">
                    {r.payment_status === 'awaiting' && r.status !== 'cancelled' ? <QuickPay r={r} onDone={reload} /> : <span className="text-gray-600 whitespace-nowrap">{fmtDateTime(r.paid_at)}</span>}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="p-8 text-center text-gray-500">{tab === 'awaiting' ? 'No payments pending.' : 'Nothing here.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
