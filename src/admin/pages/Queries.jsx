import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, adminErr } from '../adminApi'
import { useAsync } from '../../lib/useAsync'
import { downloadExcel, COLUMNS } from '../excel'
import { PageHeader, DownloadButton, SearchBox, Tabs, matches } from '../components/Toolbar'
import StatusBadge from '../../components/StatusBadge'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import { fmtDateTime } from './Requests'

function Reply({ q, onDone }) {
  const [text, setText] = useState(q.admin_reply || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async (status) => {
    setBusy(true)
    setErr('')
    try {
      await adminApi.replyQuery(q.id, text || null, status)
      onDone()
    } catch (e) {
      setErr(adminErr(e))
    }
    setBusy(false)
  }
  return (
    <div className="mt-3">
      {err && <Alert>{err}</Alert>}
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply (the customer sees this under their query)" className="input text-sm" />
      <div className="flex gap-2 mt-2">
        <button disabled={busy || !text.trim()} onClick={() => save('Resolved')} className="btn-primary px-4 py-1.5 text-sm">Reply & resolve</button>
        <button disabled={busy} onClick={() => save('Open')} className="btn-outline px-4 py-1.5 text-sm">Save, keep open</button>
      </div>
    </div>
  )
}

export default function Queries() {
  const { data, loading, error, reload } = useAsync(adminApi.queries)
  const [tab, setTab] = useState('Open')
  const [q, setQ] = useState('')
  const rows = data || []
  const filtered = useMemo(() => rows.filter((r) => (tab === 'all' || r.status === tab) && matches(q, r.subject, r.message, r.customer_name, r.customer_email)), [rows, tab, q])

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Customer Queries">
        <SearchBox value={q} onChange={setQ} />
        <DownloadButton count={filtered.length} onClick={() => downloadExcel('queries', [{ name: 'Queries', columns: COLUMNS.queries, rows: filtered }])} />
      </PageHeader>
      <Tabs tabs={[['Open', 'Open'], ['Resolved', 'Resolved'], ['all', 'All']].map(([value, label]) => ({ value, label, count: rows.filter((r) => value === 'all' || r.status === value).length }))} value={tab} onChange={setTab} />
      {error && <Alert>{error}</Alert>}
      {loading ? <Spinner /> : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{r.subject}</h3>
                  <p className="text-xs text-gray-500">
                    <Link to={`/admin/customers/${r.user_id}`} className="text-darkGreen hover:text-rust font-medium">{r.customer_name || r.customer_email}</Link>
                    {r.customer_mobile && ` · ${r.customer_mobile}`} · {fmtDateTime(r.created_at)}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{r.message}</p>
              <Reply q={r} onDone={reload} />
            </div>
          ))}
          {!filtered.length && <div className="card p-10 text-center text-gray-500">No queries here.</div>}
        </div>
      )}
    </div>
  )
}
