import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { fmtDate } from '../../lib/format'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import StatusBadge from '../../components/StatusBadge'

function QueryForm({ onDone, onCancel }) {
  const { user } = useAuth()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.createQuery({ userId: user.id, subject, message })
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card p-6 mb-6 space-y-4">
      <h3 className="font-bold text-gray-800">New Query</h3>
      <Alert>{error}</Alert>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
        <input required value={subject} onChange={(e) => setSubject(e.target.value)} className="input" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <textarea required rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className="input" />
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-6 py-2.5 text-gray-600 font-medium hover:text-gray-900">Cancel</button>
        <button type="submit" disabled={busy} className="btn-primary px-6 py-2.5">{busy ? 'Sending…' : 'Submit Query'}</button>
      </div>
    </form>
  )
}

export default function Queries() {
  const { data: queries, loading, error, reload } = useAsync(api.listQueries)
  const [showForm, setShowForm] = useState(false)
  if (loading) return <Spinner />

  const done = () => {
    setShowForm(false)
    reload()
  }

  if (!queries?.length && !showForm)
    return (
      <>
        <Alert>{error}</Alert>
        <EmptyState
          title="No queries yet"
          desc="Need help understanding a scheme or your report? Create a query and our team can assist."
          icon="fa-headset"
          ctaText="Create New Query"
          onCta={() => setShowForm(true)}
        />
      </>
    )

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-end mb-6">
        <h2 className="text-2xl font-bold text-darkGreen">My Queries</h2>
        {!showForm && <button onClick={() => setShowForm(true)} className="btn-primary px-4 py-2 text-sm">+ New Query</button>}
      </div>
      <Alert>{error}</Alert>
      {showForm && <QueryForm onDone={done} onCancel={() => setShowForm(false)} />}
      <div className="space-y-4">
        {(queries || []).map((q) => (
          <div key={q.id} className="card p-5">
            <div className="flex justify-between items-start gap-4 mb-2">
              <h4 className="font-bold text-gray-900">{q.subject}</h4>
              <StatusBadge status={q.status} />
            </div>
            <p className="text-sm text-gray-600 whitespace-pre-line">{q.message}</p>
            {q.admin_reply && (
              <div className="mt-3 p-3 bg-softGreen rounded text-sm text-darkGreen">
                <span className="font-semibold">Reply from our team: </span>
                {q.admin_reply}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3">{fmtDate(q.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
