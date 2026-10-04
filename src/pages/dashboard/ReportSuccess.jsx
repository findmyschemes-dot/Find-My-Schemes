import { Link, Navigate, useLocation } from 'react-router-dom'
import PaymentInstructions from '../../components/PaymentInstructions'

export default function ReportSuccess() {
  const { state } = useLocation()
  const report = state?.report
  if (!report) return <Navigate to="/dashboard/reports" replace />

  return (
    <div className="max-w-2xl mx-auto card p-8 sm:p-10">
      <div className="text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600 text-4xl">
          <i className="fa-solid fa-check" />
        </div>
        <h2 className="font-serif text-3xl font-bold text-darkGreen mb-3">Request Received!</h2>
        <p className="text-gray-600 mb-6">
          Request ID <b className="text-gray-900">{report.report_code}</b>. The report will be emailed to <b>{report.delivery_email}</b>.
        </p>
      </div>
      <PaymentInstructions report={report} />
      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
        <Link to={`/dashboard/reports/${report.id}`} className="bg-darkGreen hover:bg-darkerGreen text-white px-8 py-3 rounded font-semibold transition-colors shadow-sm text-center">
          Track This Request
        </Link>
        <Link to="/dashboard" className="btn-outline px-8 py-3 text-center">Back to Dashboard</Link>
      </div>
    </div>
  )
}
