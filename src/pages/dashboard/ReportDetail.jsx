import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api, friendlyError, PAYMENT_LABEL } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { fmtDate, fmtINR } from '../../lib/format'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import { ReportStatusBadge } from '../../components/StatusBadge'
import PaymentInstructions from '../../components/PaymentInstructions'

const levelStyle = (level) => (level === 'State Govt' ? 'text-purple-600 bg-purple-50' : 'text-blue-600 bg-blue-50')

// Submitted → Payment confirmed → In review → Report emailed
function Timeline({ report, events }) {
  const paidOk = ['paid', 'waived'].includes(report.payment_status)
  const steps = [
    { label: 'Submitted', done: true, at: report.created_at },
    { label: 'Payment Confirmed', done: paidOk, at: report.paid_at || events?.find((e) => e.kind === 'payment' && e.status === 'waived')?.created_at },
    { label: 'In Review', done: ['processing', 'ready'].includes(report.status), at: events?.find((e) => e.kind !== 'payment' && e.status === 'processing')?.created_at },
    { label: 'Report Emailed', done: report.status === 'ready', at: report.delivered_at },
  ]
  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center">
        {steps.map((s, i) => (
          <div key={s.label} className="flex-1 flex items-center">
            <div className="flex flex-col items-center text-center min-w-[72px]">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm ${s.done ? 'bg-darkGreen text-white' : 'bg-gray-100 text-gray-400'}`}>
                {s.done ? <i className="fa-solid fa-check" /> : i + 1}
              </div>
              <span className={`text-xs mt-2 font-medium ${s.done ? 'text-darkGreen' : 'text-gray-400'}`}>{s.label}</span>
              {s.done && s.at && <span className="text-[10px] text-gray-400">{fmtDate(s.at)}</span>}
            </div>
            {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${steps[i + 1].done ? 'bg-darkGreen' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>
    </div>
  )
}

const LABELS = {
  entity_type: 'Type of business', industry: 'Industry', sub_sector: 'Products / services', state: 'State', city: 'City / District',
  year_established: 'Year started', business_stage: 'Stage', annual_turnover: 'Turnover', employees: 'Employees',
  udyam_registered: 'Udyam registered', gst_registered: 'GST registered', dpiit_startup: 'DPIIT startup', exporter: 'Exporting',
  owner_category: 'Promoter profile', purpose: 'Purpose', planned_investment: 'Planned investment', support_type: 'Support preferred',
  description: 'Description', delivery_email: 'Delivery email', contact_mobile: 'Contact mobile',
}

function Submission({ inputs }) {
  const [open, setOpen] = useState(false)
  const rows = Object.entries(LABELS)
    .map(([k, label]) => [label, Array.isArray(inputs?.[k]) ? inputs[k].join(', ') : inputs?.[k]])
    .filter(([, v]) => v)
  return (
    <div className="card mb-6">
      <button onClick={() => setOpen(!open)} className="w-full px-6 py-4 flex justify-between items-center text-left">
        <span className="font-bold text-gray-800">Submitted details</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-gray-400`} />
      </button>
      {open && (
        <dl className="px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className={k === 'Description' ? 'sm:col-span-2' : ''}>
              <dt className="text-xs text-gray-500 uppercase tracking-wider">{k}</dt>
              <dd className="text-gray-900 whitespace-pre-line">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export default function ReportDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: report, loading, error } = useAsync(() => api.getReport(id), [id])
  const [applying, setApplying] = useState(null)
  const [actionError, setActionError] = useState('')

  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  if (!report) return <div className="p-8 text-center text-red-500">Report not found.</div>

  const ready = report.status === 'ready'
  const schemes = [...(report.report_schemes || [])].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (b.match_score || 0) - (a.match_score || 0)
  )
  const events = [...(report.report_events || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const download = async () => {
    try {
      window.open(await api.reportFileUrl(report.report_file_path), '_blank', 'noopener')
    } catch (e) {
      setActionError(friendlyError(e))
    }
  }

  const apply = async (schemeName) => {
    setApplying(schemeName)
    setActionError('')
    try {
      await api.createApplication({ userId: user.id, reportId: report.id, schemeName })
      navigate('/dashboard/applications')
    } catch (e) {
      setActionError(friendlyError(e))
      setApplying(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-4 text-sm">
        <Link to="/dashboard/reports" className="text-gray-500 hover:text-darkGreen">
          <i className="fa-solid fa-arrow-left mr-1" /> Back to Reports
        </Link>
      </div>

      <div className="card p-6 sm:p-8 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h2 className="font-serif text-2xl font-bold text-darkGreen">{report.business_name}</h2>
            <ReportStatusBadge report={report} />
          </div>
          <p className="text-gray-500 text-sm">
            Request ID: #{report.report_code} • Submitted: {fmtDate(report.created_at)}{report.state ? ` • ${report.state}` : ''} • {fmtINR(report.amount_due)} ({PAYMENT_LABEL[report.payment_status]})
          </p>
        </div>
        {ready && report.report_file_path && (
          <button onClick={download} className="btn-outline px-4 py-2 text-sm flex items-center gap-2">
            <i className="fa-solid fa-download" /> Download PDF
          </button>
        )}
      </div>

      <Alert>{actionError}</Alert>

      {report.status === 'cancelled' ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-6 text-gray-700">
          <h3 className="font-bold mb-1">Request cancelled</h3>
          <p className="text-sm">{report.status_note || 'Please contact support from My Queries.'}</p>
          {report.payment_status === 'refunded' && <p className="text-sm mt-1">The payment has been refunded.</p>}
        </div>
      ) : (
        <Timeline report={report} events={events} />
      )}

      {report.status !== 'cancelled' && report.payment_status === 'awaiting' && (
        <div className="mb-6"><PaymentInstructions report={report} /></div>
      )}

      {!ready && report.status !== 'cancelled' && report.payment_status !== 'awaiting' && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-8 text-center text-blue-800 mb-6">
          <i className="fa-solid fa-clock-rotate-left text-4xl mb-3 opacity-80" />
          <h3 className="text-lg font-bold mb-1">Report Analysis In Progress</h3>
          <p className="max-w-md mx-auto text-sm opacity-90">
            {report.status_note ||
              `Payment confirmed. Our research team is analysing this business profile against government schemes. The report will be emailed to ${report.delivery_email}.`}
          </p>
        </div>
      )}

      {ready && (
        <>
          {report.summary && <div className="card p-6 mb-6 text-gray-700 whitespace-pre-line">{report.summary}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[
              ['Eligible Schemes Found', report.schemes_found ?? schemes.length, 'text-darkGreen'],
              ['Potential Financial Benefit', report.potential_benefit || '—', 'text-darkGreen'],
              ['High Probability Matches', report.high_matches ?? schemes.filter((s) => s.match_score >= 80).length, 'text-green-600'],
            ].map(([label, value, color]) => (
              <div key={label} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm text-center">
                <div className="text-sm text-gray-500 mb-1">{label}</div>
                <div className={`text-3xl font-bold ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {schemes.length > 0 ? (
            <>
              <h3 className="font-bold text-xl text-gray-800 mb-4">Matched Opportunities</h3>
              <div className="space-y-4 mb-6">
                {schemes.map((s) => (
                  <div key={s.id} className="card p-5 sm:p-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex-grow">
                      <div className="flex items-center gap-2 mb-1">
                        {s.govt_level && <span className={`text-xs font-bold px-2 py-0.5 rounded ${levelStyle(s.govt_level)}`}>{s.govt_level}</span>}
                        {s.sector && <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{s.sector}</span>}
                      </div>
                      <h4 className="font-bold text-lg text-gray-900">{s.name}</h4>
                      {s.description && <p className="text-sm text-gray-600 mt-1">{s.description}</p>}
                      {s.why_eligible && <p className="text-sm text-gray-600 mt-1"><b>Why it fits:</b> {s.why_eligible}</p>}
                      <div className="mt-3 flex gap-4 text-sm flex-wrap">
                        {s.benefit && <div><span className="text-gray-500">Benefit:</span> <span className="font-semibold">{s.benefit}</span></div>}
                        {s.match_score != null && (
                          <div>
                            <span className="text-gray-500">Match:</span>{' '}
                            <span className="font-semibold text-green-600">{s.match_score >= 80 ? 'High' : 'Medium'} ({s.match_score}%)</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="w-full md:w-auto min-w-[140px]">
                      <button onClick={() => apply(s.name)} disabled={!!applying} className="btn-primary py-2 px-4 text-sm w-full">
                        {applying === s.name ? 'Starting…' : 'Start Application'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="card p-6 mb-6 text-sm text-gray-600 text-center">
              The full report has been emailed to <b>{report.delivery_email}</b>
              {report.report_file_path ? ' and can be downloaded above.' : '.'}
            </div>
          )}
        </>
      )}

      <Submission inputs={report.inputs} />
    </div>
  )
}
