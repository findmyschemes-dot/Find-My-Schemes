import { useMemo, useState } from 'react'
import { adminApi, adminErr } from '../adminApi'
import { useAsync } from '../../lib/useAsync'
import { prettyPhone } from '../../lib/phone'
import { downloadExcel, COLUMNS } from '../excel'
import { PageHeader, DownloadButton, SearchBox, Tabs, matches, Th } from '../components/Toolbar'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import { fmtDateTime } from './Requests'
import WaIcon from '../components/WaIcon'
import { MSG } from '../../lib/whatsapp'

const DAY = 24 * 3600 * 1000
const RANGES = [
  { value: 'all', label: 'All', days: null },
  { value: '1', label: 'Today', days: 1 },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
]
const since = (days) => {
  if (!days) return 0
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime() - (days - 1) * DAY
}

export default function FreeReportLeads() {
  const { data, loading, error, reload } = useAsync(adminApi.freeReportLeads)
  const [range, setRange] = useState('all')
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const rows = data || []

  const inRange = (r, days) => new Date(r.created_at).getTime() >= since(days)
  const filtered = useMemo(() => {
    const days = RANGES.find((x) => x.value === range)?.days
    return rows.filter((r) => inRange(r, days) && matches(q, r.name, r.email, r.phone))
  }, [rows, range, q])

  const remove = async (r) => {
    if (!window.confirm(`Delete the lead "${r.name}"? This cannot be undone.`)) return
    setErr('')
    try {
      await adminApi.deleteFreeReportLead(r.id)
      reload()
    } catch (e) {
      setErr(adminErr(e))
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Free Report Leads" subtitle="Visitors who downloaded the demo report from the website">
        <SearchBox value={q} onChange={setQ} placeholder="Search name, email, mobile…" />
        <DownloadButton count={filtered.length} onClick={() => downloadExcel('free-report-leads', [{ name: 'Free Report Leads', columns: COLUMNS.freeReportLeads, rows: filtered }])} />
      </PageHeader>
      <Tabs tabs={RANGES.map((x) => ({ value: x.value, label: x.label, count: rows.filter((r) => inRange(r, x.days)).length }))} value={range} onChange={setRange} />
      {(error || err) && <Alert>{error || err}</Alert>}
      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Mobile</Th><Th>Downloaded on</Th><Th right>&nbsp;</Th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">{r.name}</td>
                  <td className="py-3 px-4"><a href={`mailto:${r.email}`} className="text-darkGreen hover:text-rust">{r.email}</a></td>
                  <td className="py-3 px-4 whitespace-nowrap"><a href={`tel:+${r.phone}`} className="text-darkGreen hover:text-rust">{prettyPhone(r.phone)}</a> <WaIcon number={r.phone} text={MSG.toLead(r.name)} className="ml-1" /></td>
                  <td className="py-3 px-4 whitespace-nowrap text-gray-700">{fmtDateTime(r.created_at)}</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => remove(r)} className="text-gray-400 hover:text-red-600" title="Delete lead" aria-label="Delete lead"><i className="fa-regular fa-trash-can" /></button>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={5} className="p-8 text-center text-gray-500">No leads yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
