import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fmtINR } from '../lib/format'

// "How to pay" box shown while a request is awaiting payment.
// The text is edited by admins in Admin → Settings → Payment instructions.
export default function PaymentInstructions({ report, compact = false }) {
  const { pricing } = useAuth()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report.report_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }
  return (
    <div className={`rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-900 ${compact ? 'p-4' : 'p-6'}`}>
      <div className="flex items-start gap-3">
        <i className="fa-solid fa-indian-rupee-sign mt-1" />
        <div className="flex-1">
          <p className="font-semibold">Payment pending: {fmtINR(report.amount_due)}</p>
          <p className="text-sm mt-1 whitespace-pre-line">
            {pricing.paymentInstructions || 'Our team will contact you with payment details.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span>Payment note / reference:</span>
            <code className="bg-white border border-yellow-200 rounded px-2 py-0.5 font-semibold">{report.report_code}</code>
            <button onClick={copy} className="text-xs underline">{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p className="text-xs mt-2 opacity-80">
            Work starts once payment is confirmed. The report is emailed within {pricing.slaHours} hours of confirmation.
          </p>
        </div>
      </div>
    </div>
  )
}
