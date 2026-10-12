import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { fmtINR } from '../lib/format'
import { getPaymentConfig, paymentErrorText, paymentsApi, startPayment } from '../lib/payments'
import PaymentInstructions from './PaymentInstructions'

const STAGE_TEXT = {
  starting: 'Opening secure payment…',
  checkout: 'Complete the payment in the Razorpay window.',
  verifying: 'Confirming the payment… please keep this page open.',
}

export const queryLink = (report, why = 'Payment issue') =>
  `/dashboard/queries?new=1&report=${report.id}&subject=${encodeURIComponent(`${why} — ${report.report_code}`)}`

/**
 * "Pay now" box for a request that is awaiting payment.
 * Online (Razorpay) when switched on and set up; otherwise the manual payment instructions.
 * onPaid() is called whenever the request may have changed (paid / needs review) so the page can reload.
 */
export default function PayNowPanel({ report, onPaid, autoStart = false }) {
  const { pricing } = useAuth()
  const [cfg, setCfg] = useState(null)
  const [stage, setStage] = useState(null)
  const [outcome, setOutcome] = useState(null) // {status, error}
  const [startError, setStartError] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkMsg, setCheckMsg] = useState('')
  const started = useRef(false)
  const busy = Boolean(stage)

  useEffect(() => {
    let live = true
    getPaymentConfig().then((c) => live && setCfg(c))
    return () => { live = false }
  }, [])

  const refreshFromServer = useCallback(async ({ quiet } = {}) => {
    if (!quiet) { setChecking(true); setCheckMsg('') }
    try {
      const s = await paymentsApi.sync(report.id)
      if (s.paymentStatus && s.paymentStatus !== 'awaiting') {
        onPaid?.()
        return true
      }
      if (!quiet) {
        const failed = s.results?.some((r) => r.result === 'failed')
        const pending = s.results?.some((r) => r.result === 'pending')
        setCheckMsg(
          pending ? 'Razorpay is still processing a payment. This usually finishes within a few minutes.'
            : failed ? 'No successful payment found — the last attempt failed. Please try again.'
            : 'No successful payment found for this request yet.'
        )
      }
    } catch (e) {
      if (!quiet) setCheckMsg(paymentErrorText(e))
    } finally {
      if (!quiet) setChecking(false)
    }
    return false
  }, [report.id, onPaid])

  // Came back after closing the browser mid-payment? Quietly ask Razorpay once.
  useEffect(() => {
    if (!cfg?.enabled || autoStart) return
    supabase.from('payment_orders').select('id').eq('report_id', report.id).limit(1)
      .then(({ data }) => { if (data?.length) refreshFromServer({ quiet: true }) })
  }, [cfg, autoStart, report.id, refreshFromServer])

  const pay = useCallback(async () => {
    if (busy) return
    setStartError('')
    setOutcome(null)
    setCheckMsg('')
    try {
      const r = await startPayment(report, { onStage: setStage })
      setOutcome(r)
      if (r.status === 'paid' || r.status === 'needs_review') onPaid?.()
    } catch (e) {
      if (e.code === 'ALREADY_PAID') onPaid?.()
      else setStartError(paymentErrorText(e))
    } finally {
      setStage(null)
    }
  }, [busy, report, onPaid])

  // Straight after submitting the form: open Checkout once
  useEffect(() => {
    if (autoStart && cfg?.enabled && !started.current) {
      started.current = true
      pay()
    }
  }, [autoStart, cfg, pay])

  // Payment taken but confirmation still on the way: keep checking for a minute
  useEffect(() => {
    if (outcome?.status !== 'pending') return
    let n = 0
    const t = setInterval(async () => {
      n += 1
      if ((await refreshFromServer({ quiet: true })) || n >= 6) clearInterval(t)
    }, 10000)
    return () => clearInterval(t)
  }, [outcome, refreshFromServer])

  if (!cfg) return <div className="card p-6 text-sm text-gray-500"><i className="fa-solid fa-circle-notch fa-spin mr-2" />Loading payment options…</div>
  if (!cfg.enabled) return <PaymentInstructions report={report} />

  const status = outcome?.status
  return (
    <div className="rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-900 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-lg flex items-center gap-2 flex-wrap">
            Payment pending: {fmtINR(report.amount_due)}
            {cfg.mode === 'test' && <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-600 text-white px-2 py-0.5 rounded">Test mode</span>}
          </p>
          <p className="text-sm mt-1">Work starts as soon as the payment is confirmed. The report is emailed within {pricing.slaHours} hours.</p>
        </div>
        {status !== 'pending' && <button onClick={pay} disabled={busy} className="btn-primary px-6 py-3 flex items-center justify-center gap-2 whitespace-nowrap">
          <i className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-lock'}`} />
          {busy ? 'Please wait…' : status === 'failed' || status === 'dismissed' ? `Try again · ${fmtINR(report.amount_due)}` : `Pay ${fmtINR(report.amount_due)} securely`}
        </button>}
      </div>

      {stage && <p className="mt-4 text-sm font-medium"><i className="fa-solid fa-circle-notch fa-spin mr-2" />{STAGE_TEXT[stage]}</p>}

      {startError && (
        <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
          <i className="fa-solid fa-triangle-exclamation mr-2" />{startError} The request is saved — try again in a few minutes or{' '}
          <Link to={queryLink(report)} className="underline font-semibold">raise a query</Link>.
        </div>
      )}
      {status === 'dismissed' && (
        <div className="mt-4 p-3 rounded bg-white border border-yellow-200 text-sm">
          Payment not completed. The request is saved as <b>Awaiting payment</b> — pay any time from this page.
        </div>
      )}
      {status === 'failed' && (
        <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
          <p className="font-semibold"><i className="fa-solid fa-circle-xmark mr-2" />Payment failed{outcome.error ? `: ${outcome.error}` : '.'}</p>
          <p className="mt-1">No money is kept for a failed payment. If anything was deducted, the bank returns it automatically (usually within 5–7 working days). Try again with another method, or{' '}
            <Link to={queryLink(report, 'Payment failed')} className="underline font-semibold">raise a query</Link>.</p>
        </div>
      )}
      {status === 'pending' && (
        <div className="mt-4 p-3 rounded bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          <p className="font-semibold"><i className="fa-solid fa-hourglass-half mr-2" />Payment received by Razorpay — confirming.</p>
          <p className="mt-1">This page updates automatically. The money is safe: if it is not confirmed, it is refunded automatically. If nothing changes within 30 minutes,{' '}
            <Link to={queryLink(report, 'Payment not confirmed')} className="underline font-semibold">raise a query</Link>.</p>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-yellow-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <span className="opacity-80"><i className="fa-solid fa-shield-halved mr-1" />Secured by Razorpay · UPI, cards, net banking, wallets</span>
        <span className="flex gap-4">
          <button onClick={() => refreshFromServer()} disabled={checking || busy} className="underline disabled:opacity-50">
            {checking ? 'Checking…' : 'Paid but still pending? Check status'}
          </button>
          <Link to={queryLink(report)} className="underline">Raise a query</Link>
        </span>
      </div>
      {checkMsg && <p className="mt-2 text-xs">{checkMsg}</p>}
    </div>
  )
}
