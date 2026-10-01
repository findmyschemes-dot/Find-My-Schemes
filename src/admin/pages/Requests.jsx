import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminApi } from '../adminApi'
import { useAdmin } from '../AdminAuth'
import { useAsync } from '../../lib/useAsync'
import { fmtINR } from '../../lib/format'
import { downloadExcel, COLUMNS } from '../excel'
import { PageHeader, DownloadButton, SearchBox, Tabs, matches, Th } from '../components/Toolbar'
import { ReportStatusBadge } from '../../components/StatusBadge'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'

export const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export const ageText = (h) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`)

const TABS = [
  ['open', 'Open'],
  ['submitted', 'Submitted'],
  ['processing', 'In review'],
  ['ready', 'Ready'],
  ['failed', 'Failed'],
  ['refunded', 'Refunded'],
  ['all', 'All'],
]

export default function Requests() {
  const { sla } = useAdmin()
  const [params, setParams] = useSearchParams()
  const tab = params.get('status') || 'open'
  const [q, setQ] = useState('')
  const { data, loading, error } = useAsync(adminApi.reports)
  const rows = data || []

  const inTab = (r, t) => (t === 'all' ? true : t === 'open' ? ['submitted', 'processing'].includes(r.status) : r.status === t)
  const filtered = useMemo(() => {
    const list = rows.filter((r) => inTab(r, tab) && matches(q, r.report_code, r.business_name, r.customer_name, r.customer_email, r.customer_mobile, r.industry, r.state))
    // open work: oldest first; everything else: newest first
    return tab === 'open' || tab === 'submitted' || tab === 'processing' ? [...list].reverse() : list
  }, [rows, tab, q])

  const overdue = (r) => ['submitted', 'processing'].includes(r.status) && r.age_hours > sla

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Report Requests" subtitle={`Promise: delivered within ${sla} hours`}>
        <SearchBox value={q} onChange={setQ} placeholder="Request ID, business, customer…" />
        <DownloadButton count={filtered.length} onClick={() => downloadExcel(`report-requests-${tab}`, [{ name: 'Report requests', columns: COLUMNS.reports, rows: filtered }])} />
      </PageHeader>

      <Tabs
        tabs={TABS.map(([value, label]) => ({ value, label, count: rows.filter((r) => inTab(r, value)).length }))}
        value={tab}
        onChange={(v) => setParams({ status: v })}
      />

      {error && <Alert>{error}</Alert>}
      {loading ? (
        <Spinner />
      ) : !filtered.length ? (
        <div className="card p-10 text-center text-gray-500">
          {tab === 'open' ? <><i className="fa-solid fa-mug-hot text-2xl mb-2 block text-gray-300" />No open requests. All caught up.</> : 'Nothing here.'}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr><Th>Request</Th><Th>Business</Th><Th>Customer</Th><Th>Industry · State</Th><Th>Submitted</Th><Th>Status</Th><Th right>Paid</Th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className={`hover:bg-gray-50 ${overdue(r) ? 'bg-red-50/50' : ''}`}>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <Link to={`/admin/requests/${r.id}`} className="font-semibold text-darkGreen hover:text-rust">{r.report_code}</Link>
                  </td>
                  <td className="py-3 px-4 font-medium text-gray-900">{r.business_name}</td>
                  <td className="py-3 px-4">
                    <div className="text-gray-900">{r.customer_name || '—'}</div>
                    <div className="text-xs text-gray-500">{r.customer_email}</div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{[r.industry, r.state].filter(Boolean).join(' · ')}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="text-gray-700">{fmtDateTime(r.created_at)}</div>
                    {['submitted', 'processing'].includes(r.status) && (
                      <div className={`text-xs ${overdue(r) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        {overdue(r) && <i className="fa-solid fa-triangle-exclamation mr-1" />}
                        waiting {ageText(r.age_hours)}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4"><ReportStatusBadge status={r.status} /></td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">{fmtINR(r.price_charged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
