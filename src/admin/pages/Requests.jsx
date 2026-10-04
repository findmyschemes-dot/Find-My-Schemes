import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminApi } from '../adminApi'
import { useAdmin } from '../AdminAuth'
import { useAsync } from '../../lib/useAsync'
import { fmtINR } from '../../lib/format'
import { downloadExcel, COLUMNS } from '../excel'
import { PageHeader, DownloadButton, SearchBox, Tabs, matches, Th } from '../components/Toolbar'
import { PaymentBadge, WorkBadge } from '../../components/StatusBadge'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'

export const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export const ageText = (h) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`)

const isOpen = (r) => ['submitted', 'processing'].includes(r.status)
const isPaidOk = (r) => ['paid', 'waived'].includes(r.payment_status)

// tab → filter
const TABS = [
  ['todo', 'To work on', (r) => isOpen(r) && isPaidOk(r)],
  ['awaiting', 'Awaiting payment', (r) => r.payment_status === 'awaiting' && r.status !== 'cancelled'],
  ['ready', 'Delivered', (r) => r.status === 'ready'],
  ['cancelled', 'Cancelled', (r) => r.status === 'cancelled'],
  ['all', 'All', () => true],
]

export default function Requests() {
  const { sla } = useAdmin()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t[0] === params.get('status')) ? params.get('status') : 'todo'
  const [q, setQ] = useState('')
  const { data, loading, error } = useAsync(adminApi.reports)
  const rows = data || []
  const test = TABS.find((t) => t[0] === tab)[2]

  const filtered = useMemo(() => {
    const list = rows.filter((r) => test(r) && matches(q, r.report_code, r.business_name, r.customer_name, r.customer_email, r.customer_mobile, r.industry, r.state, r.payment_reference))
    return tab === 'todo' || tab === 'awaiting' ? [...list].reverse() : list // open work: oldest first
  }, [rows, tab, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const overdue = (r) => isOpen(r) && isPaidOk(r) && r.age_hours > sla

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Report Requests" subtitle={`Work starts after payment · promise: delivered within ${sla} hours of payment`}>
        <SearchBox value={q} onChange={setQ} placeholder="Request ID, business, customer, UTR…" />
        <DownloadButton count={filtered.length} onClick={() => downloadExcel(`requests-${tab}`, [{ name: 'Requests', columns: COLUMNS.reports, rows: filtered }])} />
      </PageHeader>

      <Tabs tabs={TABS.map(([value, label, fn]) => ({ value, label, count: rows.filter(fn).length }))} value={tab} onChange={(v) => setParams({ status: v })} />

      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Spinner />
      ) : !filtered.length ? (
        <div className="card p-10 text-center text-gray-500">
          {tab === 'todo' ? <><i className="fa-solid fa-mug-hot text-2xl mb-2 block text-gray-300" />No paid requests waiting. All caught up.</> : 'Nothing here.'}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr><Th>Request</Th><Th>Business</Th><Th>Customer</Th><Th>Submitted</Th><Th>Payment</Th><Th>Work</Th><Th right>Amount</Th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className={`hover:bg-gray-50 ${overdue(r) ? 'bg-red-50/50' : ''}`}>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <Link to={`/admin/requests/${r.id}`} className="font-semibold text-darkGreen hover:text-rust">{r.report_code}</Link>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-900">{r.business_name}</div>
                    <div className="text-xs text-gray-500">{[r.industry, r.state].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-gray-900">{r.customer_name || '—'}</div>
                    <div className="text-xs text-gray-500">{r.customer_mobile ? `+${r.customer_mobile}` : r.customer_email}</div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="text-gray-700">{fmtDateTime(r.created_at)}</div>
                    {isOpen(r) && isPaidOk(r) && (
                      <div className={`text-xs ${overdue(r) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        {overdue(r) && <i className="fa-solid fa-triangle-exclamation mr-1" />}
                        {ageText(r.age_hours)} since payment
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4"><PaymentBadge status={r.payment_status} /></td>
                  <td className="py-3 px-4"><WorkBadge status={r.status} /></td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">{fmtINR(r.amount_paid ?? r.amount_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
