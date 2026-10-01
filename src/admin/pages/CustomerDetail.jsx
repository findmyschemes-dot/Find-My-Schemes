import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminApi, adminErr } from '../adminApi'
import { useAsync } from '../../lib/useAsync'
import { fmtINR, fmtDate } from '../../lib/format'
import { downloadExcel, COLUMNS } from '../excel'
import { DownloadButton, Th } from '../components/Toolbar'
import { ReportStatusBadge } from '../../components/StatusBadge'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'

export default function CustomerDetail() {
  const { id } = useParams()
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([adminApi.customer(id), adminApi.reportsFor(id), adminApi.ledgerFor(id)]),
    [id]
  )
  const [adj, setAdj] = useState({ amount: '', note: '', dir: 'credit' })
  const [msg, setMsg] = useState({})
  const [busy, setBusy] = useState(false)

  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  const [c, reports = [], ledger = []] = (data || []).map((x, i) => (i === 0 ? x : x || []))
  if (!c) return <div className="p-8 text-center text-red-600">Customer not found.</div>

  const adjust = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg({})
    try {
      const amt = Math.abs(Number(adj.amount)) * (adj.dir === 'debit' ? -1 : 1)
      await adminApi.adjustWallet(c.id, amt, adj.note)
      setAdj({ amount: '', note: '', dir: 'credit' })
      setMsg({ type: 'success', text: 'Wallet updated.' })
      reload()
    } catch (err) {
      setMsg({ type: 'error', text: adminErr(err) })
    }
    setBusy(false)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <Link to="/admin/customers" className="text-sm text-gray-500 hover:text-darkGreen"><i className="fa-solid fa-arrow-left mr-1" /> All customers</Link>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mt-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-darkGreen">{c.full_name || c.email}</h1>
          <p className="text-sm text-gray-500">{[c.business_name, c.email, c.mobile].filter(Boolean).join(' · ')} · joined {fmtDate(c.created_at)}</p>
        </div>
        <DownloadButton
          label="Download customer file"
          onClick={() => downloadExcel(`customer-${(c.full_name || 'customer').replace(/\W+/g, '-')}`, [
            { name: 'Profile', columns: COLUMNS.customers, rows: [c] },
            { name: 'Report requests', columns: COLUMNS.reports, rows: reports },
            { name: 'Wallet ledger', columns: COLUMNS.ledger, rows: ledger },
          ])}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        {[['Wallet balance', fmtINR(c.wallet_balance)], ['Total paid', fmtINR(c.total_paid)], ['Reports', c.reports_count]].map(([k, v]) => (
          <div key={k} className="card p-4"><p className="text-xs text-gray-500 uppercase tracking-wider">{k}</p><p className="text-xl font-bold text-darkGreen mt-1">{v}</p></div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-gray-800 px-5 pt-4 pb-2">Report requests</h3>
            <table className="w-full text-left text-sm">
              <thead><tr><Th>Request</Th><Th>Business</Th><Th>Date</Th><Th>Status</Th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 px-4"><Link to={`/admin/requests/${r.id}`} className="font-semibold text-darkGreen hover:text-rust">{r.report_code}</Link></td>
                    <td className="py-2.5 px-4">{r.business_name}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="py-2.5 px-4"><ReportStatusBadge status={r.status} /></td>
                  </tr>
                ))}
                {!reports.length && <tr><td colSpan={4} className="p-6 text-center text-gray-500">No requests yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-gray-800 px-5 pt-4 pb-2">Wallet history</h3>
            <table className="w-full text-left text-sm">
              <thead><tr><Th>Date</Th><Th>Details</Th><Th right>Amount</Th><Th right>Balance</Th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {ledger.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 px-4 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                    <td className="py-2.5 px-4">{t.note || t.reason}</td>
                    <td className={`py-2.5 px-4 text-right font-semibold whitespace-nowrap ${t.direction === 'credit' ? 'text-green-700' : 'text-rust'}`}>{t.direction === 'credit' ? '+' : '−'} {fmtINR(t.amount)}</td>
                    <td className="py-2.5 px-4 text-right">{fmtINR(t.balance_after)}</td>
                  </tr>
                ))}
                {!ledger.length && <tr><td colSpan={4} className="p-6 text-center text-gray-500">No wallet activity.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <form onSubmit={adjust} className="card p-5 h-fit space-y-3">
          <h3 className="font-semibold text-gray-800">Adjust wallet</h3>
          <p className="text-xs text-gray-500">For goodwill credits or corrections. Every change is recorded in the wallet history.</p>
          <Alert type={msg.type === 'success' ? 'success' : 'error'}>{msg.text}</Alert>
          <div className="flex gap-2">
            {['credit', 'debit'].map((d) => (
              <button type="button" key={d} onClick={() => setAdj({ ...adj, dir: d })} className={`flex-1 py-2 rounded text-sm font-medium border ${adj.dir === d ? 'bg-darkGreen text-white border-darkGreen' : 'border-gray-300 text-gray-600'}`}>
                {d === 'credit' ? '+ Add' : '− Deduct'}
              </button>
            ))}
          </div>
          <input type="number" min="1" step="1" required value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} placeholder="Amount (₹)" className="input" />
          <input required value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder="Reason (required)" className="input" />
          <button disabled={busy} className="btn-primary w-full py-2 text-sm">{busy ? 'Saving…' : 'Apply'}</button>
        </form>
      </div>
    </div>
  )
}
