import { useEffect, useState } from 'react'
import { adminApi, adminErr } from '../adminApi'
import { paymentsApi, paymentErrorText, paymentsServerConfigured } from '../../lib/payments'
import { fmtINR } from '../../lib/format'
import { fmtDateTime } from '../pages/Requests'

const STATUS = {
  created: ['Not paid yet', 'bg-gray-100 text-gray-700'],
  attempted: ['Tried — failed', 'bg-red-50 text-red-700'],
  paid: ['Paid', 'bg-green-100 text-green-800'],
  superseded: ['Replaced', 'bg-gray-100 text-gray-500'],
}

export const ModeTag = ({ mode }) =>
  mode === 'test' ? <span className="text-[10px] font-bold uppercase bg-purple-600 text-white px-1.5 py-0.5 rounded">Test</span> : null

/** Razorpay orders for one request + "Check with Razorpay" (admin). */
export default function OnlinePayments({ report, onChanged }) {
  const [orders, setOrders] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const load = () => adminApi.paymentOrders(report.id).then(setOrders).catch((e) => setMsg(adminErr(e)))
  useEffect(() => { load() }, [report.id, report.payment_status]) // eslint-disable-line react-hooks/exhaustive-deps

  const check = async () => {
    setBusy('check')
    setMsg('')
    try {
      const s = await paymentsApi.sync(report.id)
      const res = s.results?.map((x) => x.result) || []
      setMsg(
        s.paymentStatus !== report.payment_status ? `Updated: payment is now “${s.paymentStatus}”.`
          : res.includes('pending') ? 'Razorpay is still processing a payment.'
          : res.length ? `Checked ${res.length} order(s) — no new successful payment.` : 'Nothing to check.'
      )
      await load()
      onChanged?.()
    } catch (e) {
      setMsg(paymentErrorText(e))
    }
    setBusy('')
  }

  const reviewed = async (o) => {
    setBusy(o.id)
    try {
      await adminApi.resolveReview(o.id)
      await load()
    } catch (e) {
      setMsg(adminErr(e))
    }
    setBusy('')
  }

  if (!orders) return null
  if (!orders.length && report.payment_status !== 'awaiting') return null

  return (
    <div className="card p-5 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-800">Online payment (Razorpay)</h3>
        {paymentsServerConfigured && orders.length > 0 && (
          <button onClick={check} disabled={!!busy} className="text-xs text-darkGreen font-semibold hover:text-rust disabled:opacity-50">
            <i className={`fa-solid fa-rotate mr-1 ${busy === 'check' ? 'fa-spin' : ''}`} />Check with Razorpay
          </button>
        )}
      </div>
      {!orders.length && <p className="text-sm text-gray-500">The customer has not opened the payment window yet.</p>}
      <div className="space-y-3">
        {orders.map((o) => {
          const [label, cls] = STATUS[o.status] || [o.status, 'bg-gray-100']
          return (
            <div key={o.id} className={`text-xs rounded-lg border p-3 ${o.needs_review ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}>
              <div className="flex justify-between items-center gap-2">
                <span className="font-mono text-gray-700 break-all">{o.order_id}</span>
                <span className="flex items-center gap-1 whitespace-nowrap"><ModeTag mode={o.mode} /><span className={`px-2 py-0.5 rounded font-medium ${cls}`}>{label}</span></span>
              </div>
              <div className="text-gray-500 mt-1">{fmtINR(o.amount_paise / 100)} · opened {fmtDateTime(o.created_at)}</div>
              {o.payment_id && <div className="mt-1">Payment <span className="font-mono">{o.payment_id}</span>{o.method ? ` · ${o.method.toUpperCase()}` : ''}{o.paid_at ? ` · ${fmtDateTime(o.paid_at)}` : ''}</div>}
              {o.failed_attempts > 0 && (
                <div className="mt-1 text-red-700">
                  {o.failed_attempts} failed tr{o.failed_attempts > 1 ? 'ies' : 'y'}{o.last_error_description ? ` — last: ${o.last_error_description}` : ''}
                  {o.last_error_at ? ` (${fmtDateTime(o.last_error_at)})` : ''}
                </div>
              )}
              {o.needs_review && (
                <div className="mt-2 text-red-800">
                  <b><i className="fa-solid fa-triangle-exclamation mr-1" />Needs review:</b> {o.review_note}
                  <div className="mt-1 flex gap-3">
                    <a href={`https://dashboard.razorpay.com/app/payments/${o.payment_id || ''}`} target="_blank" rel="noreferrer" className="underline">Open in Razorpay</a>
                    <button onClick={() => reviewed(o)} disabled={!!busy} className="underline">Mark reviewed</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {msg && <p className="text-xs text-gray-600 mt-3">{msg}</p>}
    </div>
  )
}
