import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api, friendlyError } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { createOrder, startCheckout, confirmDummy } from '../../lib/payments'
import { fmtDate, fmtINR } from '../../lib/format'
import { PAYMENT_MODE } from '../../config/app'
import Alert from '../../components/Alert'
import Spinner from '../../components/Spinner'

function DummyCheckout({ order, onPay, onCancel, busy }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-darkGreen text-white p-5">
          <p className="text-xs uppercase tracking-widest text-yellow-400 font-bold">Test checkout</p>
          <h3 className="font-serif text-xl font-bold mt-1">Pay {fmtINR(order.amount)}</h3>
          <p className="text-xs text-gray-300 mt-1">Order {order.payment_code}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="p-3 rounded text-xs bg-yellow-50 text-yellow-800 border border-yellow-200">
            No real money is taken. This screen will be replaced by Razorpay.
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Wallet credit</span>
            <span className="font-semibold">{fmtINR(order.credit_amount)}</span>
          </div>
          <button onClick={onPay} disabled={busy} className="btn-primary w-full py-3">
            {busy ? 'Processing…' : `Simulate successful payment`}
          </button>
          <button onClick={onCancel} disabled={busy} className="w-full text-sm text-gray-500 hover:text-gray-800">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Wallet() {
  const { wallet, pricing, profile, refreshWallet } = useAuth()
  const [params] = useSearchParams()
  const welcome = params.get('welcome')
  const { data: txns, loading, reload } = useAsync(api.listWalletTransactions)
  const [order, setOrder] = useState(null)
  const [busyPack, setBusyPack] = useState(null)
  const [paying, setPaying] = useState(false)
  const [msg, setMsg] = useState({})

  const balance = wallet?.balance ?? 0
  const reportsLeft = Math.floor(balance / (pricing.reportPrice || 1))

  const buy = async (pack) => {
    setMsg({})
    setBusyPack(pack.id)
    try {
      const o = await createOrder(pack.id)
      const res = await startCheckout(o, { profile })
      if (res?.needsDummyCheckout) setOrder(o)
    } catch (e) {
      setMsg({ type: 'error', text: friendlyError(e) })
    }
    setBusyPack(null)
  }

  const payDummy = async () => {
    setPaying(true)
    try {
      await confirmDummy(order.id)
      await refreshWallet()
      reload()
      setMsg({ type: 'success', text: `${fmtINR(order.credit_amount)} added to the wallet.` })
      setOrder(null)
    } catch (e) {
      setMsg({ type: 'error', text: friendlyError(e) })
    }
    setPaying(false)
  }

  return (
    <div className="max-w-5xl mx-auto">
      {welcome && (
        <div className="mb-6 p-4 rounded-xl bg-softGreen border border-[#d1d9cf] text-darkGreen">
          <p className="font-semibold">Welcome to Find My Schemes!</p>
          <p className="text-sm mt-1">
            Recharge the wallet to get started. Each scheme report costs {fmtINR(pricing.reportPrice)} and is delivered by email within {pricing.slaHours} hours.
          </p>
        </div>
      )}

      <Alert type={msg.type === 'success' ? 'success' : 'error'}>{msg.text}</Alert>

      <div className="bg-darkGreen rounded-2xl p-8 mb-8 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <p className="text-sm text-gray-300 uppercase tracking-widest">Wallet Balance</p>
          <p className="font-serif text-5xl font-bold mt-2">{fmtINR(balance)}</p>
          <p className="text-sm text-gray-300 mt-2">
            Enough for <b className="text-white">{reportsLeft}</b> report{reportsLeft === 1 ? '' : 's'} · {fmtINR(pricing.reportPrice)} per report
          </p>
        </div>
        {reportsLeft > 0 && (
          <Link to="/dashboard/request-report" className="bg-rust hover:bg-rustHover text-white px-6 py-3 rounded text-sm font-semibold shadow-md flex items-center gap-2 w-fit">
            Request a Report <i className="fa-solid fa-arrow-right" />
          </Link>
        )}
      </div>

      <h3 className="font-bold text-xl text-gray-800 mb-1">Recharge Wallet</h3>
      <p className="text-sm text-gray-500 mb-4">
        One-time payment. No subscription.{PAYMENT_MODE === 'dummy' && ' (Test mode — no real payment.)'}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {pricing.packs.map((p, i) => {
          const reports = Math.floor((p.amount + p.bonus) / (pricing.reportPrice || 1))
          const popular = i === 1
          return (
            <div key={p.id} className={`card p-6 flex flex-col relative ${popular ? 'ring-2 ring-rust' : ''}`}>
              {popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rust text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                  Most popular
                </span>
              )}
              <p className="text-sm font-bold uppercase tracking-widest text-darkGreen">{p.name}</p>
              <p className="font-serif text-4xl font-bold text-darkGreen mt-3">{fmtINR(p.amount)}</p>
              <p className="text-sm text-gray-600 mt-1">{p.description || `${reports} report${reports === 1 ? '' : 's'}`}</p>
              {p.bonus > 0 && <p className="text-xs text-green-700 font-semibold mt-1">+ {fmtINR(p.bonus)} bonus credit</p>}
              <button onClick={() => buy(p)} disabled={!!busyPack} className="btn-primary w-full py-2.5 mt-6">
                {busyPack === p.id ? 'Please wait…' : `Add ${fmtINR(p.amount + p.bonus)}`}
              </button>
            </div>
          )
        })}
        {pricing.packs.length === 0 && <p className="text-sm text-gray-500">Recharge packs are loading…</p>}
      </div>

      <h3 className="font-bold text-xl text-gray-800 mb-4">Wallet History</h3>
      {loading ? (
        <Spinner />
      ) : !txns?.length ? (
        <div className="card p-8 text-center text-gray-500 text-sm">No wallet activity yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>{['Date', 'Details', 'Transaction ID', 'Amount', 'Balance'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {txns.map((t) => (
                <tr key={t.id}>
                  <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                  <td className="py-4 px-4 text-sm text-gray-800">{t.note || t.reason}</td>
                  <td className="py-4 px-4 text-xs text-gray-500">{t.txn_code}</td>
                  <td className={`py-4 px-4 text-sm font-semibold whitespace-nowrap ${t.direction === 'credit' ? 'text-green-700' : 'text-rust'}`}>
                    {t.direction === 'credit' ? '+' : '−'} {fmtINR(t.amount)}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-600">{fmtINR(t.balance_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {order && <DummyCheckout order={order} busy={paying} onPay={payDummy} onCancel={() => setOrder(null)} />}
    </div>
  )
}
