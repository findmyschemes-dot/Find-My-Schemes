import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../adminApi'
import { useAsync } from '../../lib/useAsync'
import { prettyPhone } from '../../lib/phone'
import { downloadExcel } from '../excel'
import { PageHeader, DownloadButton, SearchBox, Tabs, matches, Th } from '../components/Toolbar'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import { fmtDateTime } from './Requests'

const WHERE = { login: 'Website login', signup: 'Sign-up', admin: 'Admin panel' }
const RESULT = {
  success: ['Logged in', 'bg-green-100 text-green-800'],
  not_registered: ['No account', 'bg-yellow-100 text-yellow-800'],
  not_admin: ['Refused — not an admin', 'bg-red-100 text-red-700'],
  failed: ['Failed', 'bg-red-100 text-red-700'],
}

// "Chrome on Windows" from the browser's user-agent text
export function deviceLabel(ua) {
  if (!ua) return '—'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

const TABS = [
  ['all', 'All', () => true],
  ['admin', 'Admin panel', (r) => r.mode === 'admin'],
  ['refused', 'Refused / failed', (r) => r.outcome !== 'success'],
  ['remembered', 'No OTP (remembered device)', (r) => r.outcome === 'success' && r.verification === 'remembered'],
]

const COLUMNS = [
  { header: 'When', key: 'created_at', type: 'datetime', width: 18 },
  { header: 'Name', key: 'full_name', width: 24 },
  { header: 'Mobile', key: 'phone', width: 16 },
  { header: 'Where', key: 'mode', value: (r) => WHERE[r.mode] || r.mode, width: 14 },
  { header: 'Result', key: 'outcome', value: (r) => RESULT[r.outcome]?.[0] || r.outcome, width: 20 },
  { header: 'Verification', key: 'verification', value: (r) => (r.verification === 'remembered' ? 'Remembered device (no OTP)' : 'Fresh OTP'), width: 24 },
  { header: 'New account', key: 'is_new_account', value: (r) => (r.is_new_account ? 'Yes' : null), width: 11 },
  { header: 'Device', key: 'user_agent', value: (r) => deviceLabel(r.user_agent), width: 22 },
  { header: 'IP address', key: 'ip', width: 16 },
  { header: 'Browser details', key: 'user_agent', width: 50 },
]

export default function LoginActivity() {
  const { data, loading, error } = useAsync(adminApi.loginEvents)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const rows = data || []
  const test = TABS.find((t) => t[0] === tab)[2]
  const filtered = useMemo(
    () => rows.filter((r) => test(r) && matches(q, r.full_name, r.phone, r.ip, deviceLabel(r.user_agent))),
    [rows, tab, q] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Login Activity" subtitle="Every login to the website and the admin panel — newest first">
        <SearchBox value={q} onChange={setQ} placeholder="Name, mobile, IP, device…" />
        <DownloadButton count={filtered.length} onClick={() => downloadExcel(`login-activity-${tab}`, [{ name: 'Login Activity', columns: COLUMNS, rows: filtered }])} />
      </PageHeader>
      <Tabs tabs={TABS.map(([value, label, fn]) => ({ value, label, count: rows.filter(fn).length }))} value={tab} onChange={setTab} />
      {error && (
        <Alert>
          {/login_events|admin_login_events_v|does not exist|schema cache/i.test(error)
            ? 'Login history is not set up yet: run supabase/login_history.sql in Supabase → SQL Editor, and redeploy the phone-login Edge Function.'
            : error}
        </Alert>
      )}
      {loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><Th>When</Th><Th>Who</Th><Th>Where</Th><Th>Result</Th><Th>Verification</Th><Th>Device</Th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => {
                const [label, cls] = RESULT[r.outcome] || [r.outcome, 'bg-gray-100 text-gray-700']
                return (
                  <tr key={r.id} className="hover:bg-gray-50 align-top">
                    <td className="py-3 px-4 whitespace-nowrap text-gray-700">{fmtDateTime(r.created_at)}</td>
                    <td className="py-3 px-4">
                      {r.user_id ? (
                        <Link to={`/admin/customers/${r.user_id}`} className="font-medium text-darkGreen hover:text-rust">{r.full_name || 'Customer'}</Link>
                      ) : <span className="text-gray-500">Unknown</span>}
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {r.phone ? prettyPhone(r.phone) : '—'}
                        {r.is_admin_number && <span className="ml-1 text-[10px] font-bold uppercase bg-rust text-white px-1 py-0.5 rounded">Admin</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{WHERE[r.mode] || r.mode}{r.is_new_account && <div className="text-xs text-green-700">New account</div>}</td>
                    <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${cls}`}>{label}</span></td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs">
                      {r.verification === 'remembered'
                        ? <span className="text-yellow-800"><i className="fa-solid fa-clock-rotate-left mr-1" />Remembered device (no OTP)</span>
                        : <span className="text-green-700"><i className="fa-solid fa-shield-halved mr-1" />Fresh OTP</span>}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">
                      {deviceLabel(r.user_agent)}
                      {r.ip && <div className="text-gray-400">IP {r.ip}</div>}
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No logins recorded here yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-500 mt-3">
        “Remembered device” means Phone.Email recognised a browser where this number was verified before and did not ask for an OTP again.
        On shared computers, log out and close the browser after use.
      </p>
    </div>
  )
}
