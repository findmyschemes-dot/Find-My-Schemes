import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../adminApi'
import { useAsync } from '../../lib/useAsync'
import { fmtINR, fmtDate } from '../../lib/format'
import { downloadExcel, COLUMNS } from '../excel'
import { PageHeader, DownloadButton, SearchBox, Tabs, matches, Th } from '../components/Toolbar'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'

const SEGMENTS = [
  ['all', 'All', () => true],
  ['paying', 'Paid at least once', (c) => Number(c.total_paid) > 0],
  ['balance', 'Has wallet balance', (c) => Number(c.wallet_balance) > 0],
  ['norecharge', 'Never recharged', (c) => Number(c.total_paid) === 0],
  ['noreport', 'Paid, no report yet', (c) => Number(c.total_paid) > 0 && Number(c.reports_count) === 0],
]

export default function Customers() {
  const { data, loading, error } = useAsync(adminApi.customers)
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState('all')
  const rows = data || []
  const test = SEGMENTS.find((s) => s[0] === seg)[2]
  const filtered = useMemo(() => rows.filter((c) => test(c) && matches(q, c.full_name, c.email, c.mobile, c.business_name)), [rows, q, seg]) // eslint-disable-line

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Customers" subtitle={`${rows.length} registered`}>
        <SearchBox value={q} onChange={setQ} placeholder="Name, email, mobile, business…" />
        <DownloadButton count={filtered.length} onClick={() => downloadExcel('customers', [{ name: 'Customers', columns: COLUMNS.customers, rows: filtered }])} />
      </PageHeader>
      <Tabs tabs={SEGMENTS.map(([value, label, fn]) => ({ value, label, count: rows.filter(fn).length }))} value={seg} onChange={setSeg} />
      {error && <Alert>{error}</Alert>}
      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><Th>Customer</Th><Th>Mobile</Th><Th>Business</Th><Th>Signed up</Th><Th right>Wallet</Th><Th right>Total paid</Th><Th right>Reports</Th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <Link to={`/admin/customers/${c.id}`} className="font-semibold text-darkGreen hover:text-rust">{c.full_name || '—'}</Link>
                    <div className="text-xs text-gray-500">{c.email}</div>
                  </td>
                  <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{c.mobile || '—'}</td>
                  <td className="py-3 px-4 text-gray-700">{c.business_name || '—'}</td>
                  <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{fmtDate(c.created_at)}</td>
                  <td className="py-3 px-4 text-right">{fmtINR(c.wallet_balance)}</td>
                  <td className="py-3 px-4 text-right">{fmtINR(c.total_paid)}</td>
                  <td className="py-3 px-4 text-right">{c.reports_count}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="p-8 text-center text-gray-500">No customers match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
