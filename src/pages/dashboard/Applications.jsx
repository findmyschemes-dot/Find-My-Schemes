import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { fmtDate } from '../../lib/format'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import StatusBadge from '../../components/StatusBadge'

export default function Applications() {
  const { data: apps, loading, error } = useAsync(api.listApplications)
  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  if (!apps?.length)
    return (
      <EmptyState
        title="No applications yet"
        desc="Once you decide to pursue a scheme, you can track its progress here."
        icon="fa-clipboard-list"
        ctaText="Explore My Reports"
        ctaLink="/dashboard/reports"
      />
    )

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-darkGreen mb-6">My Applications</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>{['Application ID', 'Scheme', 'Date', 'Status', 'Action'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {apps.map((a) => (
              <tr key={a.id}>
                <td className="py-4 px-4 text-sm text-gray-500">{a.app_code}</td>
                <td className="py-4 px-4 font-medium text-gray-900">{a.scheme_name}</td>
                <td className="py-4 px-4 text-sm text-gray-600">{fmtDate(a.created_at)}</td>
                <td className="py-4 px-4"><StatusBadge status={a.status} className="px-2.5 py-1 rounded text-xs" /></td>
                <td className="py-4 px-4">
                  {a.status === 'Documents Required' && (
                    <button className="text-sm text-rust font-medium hover:underline" title="Document upload coming soon">Upload Docs</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
