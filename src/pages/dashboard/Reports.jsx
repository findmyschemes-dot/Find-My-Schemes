import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { fmtDate, fmtINR } from '../../lib/format'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import EmptyState from '../../components/EmptyState'
import { ReportStatusBadge } from '../../components/StatusBadge'

function PdfButton({ path }) {
  const open = async () => {
    try {
      window.open(await api.reportFileUrl(path), '_blank', 'noopener')
    } catch (e) {
      alert(e.message)
    }
  }
  return (
    <button onClick={open} className="flex-1 bg-darkGreen text-white text-center py-2 rounded text-sm font-medium hover:bg-darkerGreen transition-colors">
      <i className="fa-solid fa-download mr-1" /> PDF
    </button>
  )
}

export default function Reports() {
  const { data: reports, loading, error } = useAsync(api.listReports)
  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  if (!reports?.length)
    return (
      <EmptyState
        title="No scheme reports yet"
        desc="Your personalized scheme opportunities will appear here once you create your first report."
        icon="fa-file-invoice"
        ctaText="Get My Scheme Eligibility Report"
        ctaLink="/dashboard/request-report"
      />
    )

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-bold text-darkGreen">My Scheme Reports</h2>
          <p className="text-gray-600 mt-1">Access all your generated eligibility reports here.</p>
        </div>
        <Link to="/dashboard/request-report" className="btn-primary px-4 py-2 text-sm hidden sm:block">+ New Report</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((r) => {
          const ready = r.status === 'ready'
          return (
            <div key={r.id} className="card overflow-hidden flex flex-col transition-transform hover:-translate-y-1 hover:shadow-md">
              <div className="p-5 border-b border-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase">#{r.report_code}</span>
                  <ReportStatusBadge report={r} className="px-2 py-0.5 rounded text-[10px] uppercase" />
                </div>
                <h3 className="font-bold text-lg text-gray-900 leading-tight mb-1">{r.business_name}</h3>
                <p className="text-xs text-gray-500">{fmtDate(r.created_at)} • {r.industry}</p>
              </div>
              <div className="p-5 bg-gray-50 flex-grow">
                {ready ? (
                  <>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-600">Schemes Found</span>
                      <span className="font-bold text-darkGreen">{r.schemes_found ?? 0} Opportunities</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Potential Benefits</span>
                      <span className="font-bold text-darkGreen">{r.potential_benefit || '—'}</span>
                    </div>
                  </>
                ) : r.status === 'cancelled' || r.payment_status === 'refunded' ? (
                  <div className="text-center py-4">
                    <i className="fa-solid fa-ban text-gray-300 text-3xl mb-2" />
                    <p className="text-sm text-gray-500">{r.status_note || (r.payment_status === 'refunded' ? 'Payment refunded.' : 'This request was cancelled.')}</p>
                  </div>
                ) : r.payment_status === 'awaiting' ? (
                  <div className="text-center py-4">
                    <i className="fa-solid fa-indian-rupee-sign text-yellow-500 text-3xl mb-2" />
                    <p className="text-sm text-gray-700 font-medium">Payment of {fmtINR(r.amount_due)} pending</p>
                    <p className="text-xs text-gray-500 mt-1">Open the request for payment details. Work starts once payment is confirmed.</p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <i className="fa-solid fa-gears text-gray-300 text-3xl mb-2" />
                    <p className="text-sm text-gray-500">Our experts are analysing this profile against 400+ active schemes. The report will be emailed to {r.delivery_email}.</p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-100 flex gap-2">
                <Link to={`/dashboard/reports/${r.id}`} className="flex-1 btn-outline text-center py-2 text-sm font-medium">
                  {r.payment_status === 'awaiting' && r.status !== 'cancelled' ? 'How to Pay' : 'View Details'}
                </Link>
                {ready && r.report_file_path && <PdfButton path={r.report_file_path} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
