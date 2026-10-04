import { Link, useParams } from 'react-router-dom'
import { adminApi } from '../adminApi'
import { useAsync } from '../../lib/useAsync'
import { fmtINR, fmtDate } from '../../lib/format'
import { prettyPhone } from '../../lib/phone'
import { downloadExcel, COLUMNS } from '../excel'
import { DownloadButton, Th } from '../components/Toolbar'
import { PaymentBadge, WorkBadge } from '../../components/StatusBadge'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'

export default function CustomerDetail() {
  const { id } = useParams()
  const { data, loading, error } = useAsync(() => Promise.all([adminApi.customer(id), adminApi.reportsFor(id)]), [id])

  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  const [c, reports = []] = (data || []).map((x, i) => (i === 0 ? x : x || []))
  if (!c) return <div className="p-8 text-center text-red-600">Customer not found.</div>

  return (
    <div className="max-w-6xl mx-auto">
      <Link to="/admin/customers" className="text-sm text-gray-500 hover:text-darkGreen"><i className="fa-solid fa-arrow-left mr-1" /> All customers</Link>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mt-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-darkGreen">{c.full_name || (c.mobile ? prettyPhone(c.mobile) : 'Customer')}</h1>
          <p className="text-sm text-gray-500">
            {[c.business_name, c.mobile && prettyPhone(c.mobile), c.email].filter(Boolean).join(' · ')} · joined {fmtDate(c.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          {c.mobile && (
            <a href={`https://wa.me/${c.mobile}`} target="_blank" rel="noreferrer" className="btn-outline px-3 py-2 text-sm">
              <i className="fa-brands fa-whatsapp text-green-600 mr-1" /> WhatsApp
            </a>
          )}
          <DownloadButton
            label="Download customer file"
            onClick={() => downloadExcel(`customer-${(c.full_name || 'customer').replace(/\W+/g, '-')}`, [
              { name: 'Profile', columns: COLUMNS.customers, rows: [c] },
              { name: 'Requests', columns: COLUMNS.reports, rows: reports },
            ])}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        {[['Requests', c.reports_count], ['Total paid', fmtINR(c.total_paid)], ['Payment pending', fmtINR(c.outstanding)]].map(([k, v]) => (
          <div key={k} className="card p-4"><p className="text-xs text-gray-500 uppercase tracking-wider">{k}</p><p className="text-xl font-bold text-darkGreen mt-1">{v}</p></div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-semibold text-gray-800 px-5 pt-4 pb-2">Requests</h3>
        <table className="w-full text-left text-sm">
          <thead><tr><Th>Request</Th><Th>Business</Th><Th>Date</Th><Th>Payment</Th><Th>Work</Th><Th right>Amount</Th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {reports.map((r) => (
              <tr key={r.id}>
                <td className="py-2.5 px-4"><Link to={`/admin/requests/${r.id}`} className="font-semibold text-darkGreen hover:text-rust">{r.report_code}</Link></td>
                <td className="py-2.5 px-4">{r.business_name}</td>
                <td className="py-2.5 px-4 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="py-2.5 px-4"><PaymentBadge status={r.payment_status} /></td>
                <td className="py-2.5 px-4"><WorkBadge status={r.status} /></td>
                <td className="py-2.5 px-4 text-right">{fmtINR(r.amount_paid ?? r.amount_due)}</td>
              </tr>
            ))}
            {!reports.length && <tr><td colSpan={6} className="p-6 text-center text-gray-500">No requests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
