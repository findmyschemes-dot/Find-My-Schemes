import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, adminErr } from '../adminApi'
import { useAsync } from '../../lib/useAsync'
import { fmtDate } from '../../lib/format'
import { downloadExcel, COLUMNS } from '../excel'
import { PageHeader, DownloadButton, SearchBox, Tabs, matches, Th } from '../components/Toolbar'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'

const STATUSES = ['Documents Required', 'Submitted', 'Approved', 'Rejected']

export default function Applications() {
  const { data, loading, error, reload } = useAsync(adminApi.applications)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const rows = data || []
  const filtered = useMemo(() => rows.filter((a) => (tab === 'all' || a.status === tab) && matches(q, a.app_code, a.scheme_name, a.customer_name, a.customer_email, a.report_code)), [rows, tab, q])

  const change = async (id, status) => {
    setErr('')
    try {
      await adminApi.setApplicationStatus(id, status)
      reload()
    } catch (e) {
      setErr(adminErr(e))
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Scheme Applications" subtitle="Customers who clicked “Start Application” on a matched scheme">
        <SearchBox value={q} onChange={setQ} />
        <DownloadButton count={filtered.length} onClick={() => downloadExcel('applications', [{ name: 'Applications', columns: COLUMNS.applications, rows: filtered }])} />
      </PageHeader>
      <Tabs tabs={['all', ...STATUSES].map((s) => ({ value: s, label: s === 'all' ? 'All' : s, count: rows.filter((a) => s === 'all' || a.status === s).length }))} value={tab} onChange={setTab} />
      {(error || err) && <Alert>{error || err}</Alert>}
      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><Th>Application</Th><Th>Scheme</Th><Th>Customer</Th><Th>Report</Th><Th>Date</Th><Th>Status</Th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-500 whitespace-nowrap">{a.app_code}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{a.scheme_name}</td>
                  <td className="py-3 px-4"><Link to={`/admin/customers/${a.user_id}`} className="text-darkGreen hover:text-rust font-medium">{a.customer_name || a.customer_email}</Link><div className="text-xs text-gray-500">{a.customer_mobile}</div></td>
                  <td className="py-3 px-4">{a.report_id ? <Link to={`/admin/requests/${a.report_id}`} className="text-darkGreen hover:text-rust">{a.report_code}</Link> : '—'}</td>
                  <td className="py-3 px-4 whitespace-nowrap">{fmtDate(a.created_at)}</td>
                  <td className="py-3 px-4">
                    <select value={a.status} onChange={(e) => change(a.id, e.target.value)} className="input py-1 text-sm w-auto">
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No applications.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
