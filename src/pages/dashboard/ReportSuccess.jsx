import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fmtINR } from '../../lib/format'

export default function ReportSuccess() {
  const { state } = useLocation()
  const { wallet, pricing } = useAuth()
  const report = state?.report
  if (!report) return <Navigate to="/dashboard/reports" replace />

  return (
    <div className="max-w-2xl mx-auto card text-center p-10">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600 text-4xl">
        <i className="fa-solid fa-check" />
      </div>
      <h2 className="font-serif text-3xl font-bold text-darkGreen mb-3">Request Received Successfully!</h2>
      <p className="text-gray-600 mb-6 text-lg">
        The Scheme Eligibility Report will be emailed to <b>{report.delivery_email}</b>.
      </p>
      <div className="bg-gray-50 rounded-lg p-4 max-w-md mx-auto mb-8 text-left border border-gray-200">
        {[
          ['Request ID', report.report_code],
          ['Status', <span key="s" className="font-medium text-blue-600 bg-blue-50 px-2 rounded">Submitted</span>],
          ['Expected delivery', `Within ${pricing.slaHours} hours`],
          ['Deducted from wallet', fmtINR(report.price_charged)],
          ['Wallet balance now', fmtINR(wallet?.balance)],
        ].map(([k, v], i, arr) => (
          <div key={k} className={`flex justify-between py-2 ${i < arr.length - 1 ? 'border-b border-gray-200' : ''}`}>
            <span className="text-gray-500 text-sm">{k}</span>
            <span className="font-medium text-gray-800 text-sm">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to={`/dashboard/reports/${report.id}`} className="bg-darkGreen hover:bg-darkerGreen text-white px-8 py-3 rounded font-semibold transition-colors shadow-sm">
          Track This Request
        </Link>
        <Link to="/dashboard" className="btn-outline px-8 py-3">Back to Dashboard</Link>
      </div>
    </div>
  )
}
