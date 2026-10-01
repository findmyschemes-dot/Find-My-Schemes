import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { fmtDate, fmtINR, firstName } from '../../lib/format'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import { ReportStatusBadge } from '../../components/StatusBadge'

function Stat({ label, value, icon, tint }) {
  return (
    <div className="card p-6 flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-3xl font-bold text-darkGreen mt-1">{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${tint}`}>
        <i className={`fa-solid ${icon}`} />
      </div>
    </div>
  )
}

export default function Overview() {
  const { profile, user, wallet, pricing } = useAuth()
  const { data, loading, error } = useAsync(
    () => Promise.all([api.listReports()]),
    [user?.id]
  )
  if (loading) return <Spinner />
  const [reports = []] = data || []
  const ready = reports.filter((r) => r.status === 'ready').length
  const inProgress = reports.filter((r) => ['submitted', 'processing'].includes(r.status)).length
  const balance = wallet?.balance ?? 0

  return (
    <div className="max-w-6xl mx-auto">
      <Alert>{error}</Alert>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-darkGreen">Welcome back, {firstName(profile?.full_name)}</h2>
        <p className="text-gray-600 mt-1">Here's an overview of your scheme opportunities and reports.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link to="/dashboard/wallet"><Stat label="Wallet Balance" value={fmtINR(balance)} icon="fa-wallet" tint="bg-yellow-50 text-gold" /></Link>
        <Stat label="Scheme Reports" value={reports.length} icon="fa-file-invoice" tint="bg-softGreen text-darkGreen" />
        <Stat label="In Progress" value={inProgress} icon="fa-spinner" tint="bg-blue-50 text-blue-600" />
        <Stat label="Reports Ready" value={ready} icon="fa-check-circle" tint="bg-green-50 text-green-600" />
      </div>

      <div className="bg-darkGreen rounded-2xl p-8 mb-8 text-white relative overflow-hidden shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="absolute -right-20 -top-20 opacity-10">
          <i className="fa-solid fa-file-contract text-9xl" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <h3 className="font-serif text-2xl font-bold mb-2">Discover what your business may be eligible for.</h3>
          <p className="text-gray-300">Get a personalized assessment of schemes, subsidies, grants and incentives relevant to your business.</p>
        </div>
        <Link
          to={balance >= pricing.reportPrice ? '/dashboard/request-report' : '/dashboard/wallet'}
          className="relative z-10 whitespace-nowrap bg-rust hover:bg-rustHover text-white px-6 py-3 rounded text-sm font-semibold transition-colors shadow-md flex items-center gap-2"
        >
          {balance >= pricing.reportPrice ? 'Get My Scheme Eligibility Report' : `Recharge Wallet (${fmtINR(pricing.reportPrice)} per report)`}{' '}
          <i className="fa-solid fa-arrow-right" />
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Recent Scheme Reports</h3>
          <Link to="/dashboard/reports" className="text-sm text-rust font-medium hover:underline">View All</Link>
        </div>
        <div className="p-6">
          {reports.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400 text-2xl">
                <i className="fa-solid fa-file-circle-question" />
              </div>
              <h4 className="text-gray-800 font-medium mb-1">No scheme reports yet</h4>
              <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">Your personalized scheme opportunities will appear here once you create your first report.</p>
              <Link to="/dashboard/request-report" className="text-rust font-semibold text-sm hover:underline">Get My Scheme Eligibility Report &rarr;</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    {['Report ID', 'Business Name', 'Date', 'Status', 'Action'].map((h) => (
                      <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reports.slice(0, 3).map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">#{r.report_code}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{r.business_name}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{fmtDate(r.created_at)}</td>
                      <td className="py-3 px-4 text-sm"><ReportStatusBadge status={r.status} /></td>
                      <td className="py-3 px-4 text-sm">
                        <Link to={`/dashboard/reports/${r.id}`} className="text-darkGreen hover:text-rust font-medium transition-colors">View Details</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
