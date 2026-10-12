import { useCallback, useEffect, useRef } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { fmtINR } from '../../lib/format'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import PayNowPanel, { queryLink } from '../../components/PayNowPanel'
import { useWhatsAppMessage } from '../../components/WhatsAppButton'
import { MSG } from '../../lib/whatsapp'

// Shown right after the form is submitted: pay now → success.
// Works after a refresh too (the request id is in the address: ?id=…).
export default function ReportSuccess() {
  const { pricing } = useAuth()
  const { state } = useLocation()
  const [params, setParams] = useSearchParams()
  const id = params.get('id') || state?.report?.id
  const autoPay = useRef(params.get('pay') === '1')
  const { data: report, loading, error, reload } = useAsync(() => (id ? api.getReport(id) : Promise.resolve(null)), [id])

  // Don't re-open the payment window if the page is refreshed
  useEffect(() => {
    if (params.get('pay')) {
      const next = new URLSearchParams(params)
      next.delete('pay')
      setParams(next, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onPaid = useCallback(() => reload(), [reload])
  useWhatsAppMessage(report ? (report.payment_status === 'awaiting' ? MSG.payment(report) : MSG.request(report)) : null)

  if (!id) return <Navigate to="/dashboard/reports" replace />
  if (loading && !report) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  if (!report) return <Navigate to="/dashboard/reports" replace />

  const paid = ['paid', 'waived'].includes(report.payment_status)
  const awaiting = report.payment_status === 'awaiting' && report.status !== 'cancelled'

  return (
    <div className="max-w-2xl mx-auto card p-8 sm:p-10">
      <div className="text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl ${paid ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
          <i className={`fa-solid ${paid ? 'fa-check' : 'fa-indian-rupee-sign'}`} />
        </div>
        {paid ? (
          <>
            <h2 className="font-serif text-3xl font-bold text-darkGreen mb-3">Payment Successful!</h2>
            <p className="text-gray-600 mb-2">
              Request ID <b className="text-gray-900">{report.report_code}</b>
              {report.payment_status === 'paid' && report.amount_paid ? <> · {fmtINR(report.amount_paid)} paid</> : null}
              {report.payment_reference ? <> · Payment ID <span className="font-mono text-xs">{report.payment_reference}</span></> : null}
            </p>
            <p className="text-gray-600 mb-6">
              Our team has started. The report will be emailed to <b>{report.delivery_email}</b> within {pricing.slaHours} hours.
            </p>
          </>
        ) : awaiting ? (
          <>
            <h2 className="font-serif text-3xl font-bold text-darkGreen mb-3">Request Saved — One Step Left</h2>
            <p className="text-gray-600 mb-6">
              Request ID <b className="text-gray-900">{report.report_code}</b>. Complete the payment to start the report. Nothing is lost if the
              payment does not go through — it stays here as <b>Awaiting payment</b>.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-3xl font-bold text-darkGreen mb-3">Request {report.report_code}</h2>
            <p className="text-gray-600 mb-6">Open the request to see its current status.</p>
          </>
        )}
      </div>

      {awaiting && <PayNowPanel report={report} onPaid={onPaid} autoStart={autoPay.current} />}

      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
        <Link to={`/dashboard/reports/${report.id}`} className="bg-darkGreen hover:bg-darkerGreen text-white px-8 py-3 rounded font-semibold transition-colors shadow-sm text-center">
          Track This Request
        </Link>
        {awaiting ? (
          <Link to={queryLink(report)} className="btn-outline px-8 py-3 text-center">Raise a Query</Link>
        ) : (
          <Link to="/dashboard" className="btn-outline px-8 py-3 text-center">Back to Dashboard</Link>
        )}
      </div>
    </div>
  )
}
