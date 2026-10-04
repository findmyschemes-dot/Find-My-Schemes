import { customerStatus, PAYMENT_LABEL, STATUS_LABEL } from '../lib/api'

const map = {
  'Report Ready': 'bg-green-100 text-green-800',
  Delivered: 'bg-green-100 text-green-800',
  'In Progress': 'bg-blue-100 text-blue-800',
  Submitted: 'bg-blue-100 text-blue-800',
  'In Review': 'bg-blue-100 text-blue-800',
  'In review': 'bg-blue-100 text-blue-800',
  'Awaiting Payment': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  'Awaiting payment': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  Paid: 'bg-green-100 text-green-800',
  Waived: 'bg-gray-100 text-gray-700',
  Refunded: 'bg-gray-100 text-gray-700',
  Cancelled: 'bg-gray-100 text-gray-500',
  Open: 'bg-blue-100 text-blue-800',
  Resolved: 'bg-green-100 text-green-800',
  'Documents Required': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
}

export default function StatusBadge({ status, className = 'px-2.5 py-1 rounded-full text-xs' }) {
  return (
    <span className={`${className} font-medium whitespace-nowrap ${map[status] || 'bg-gray-100 text-gray-700'}`}>
      {(status === 'Documents Required' || /awaiting/i.test(status)) && <i className="fa-solid fa-clock mr-1" />}
      {status}
    </span>
  )
}

/** Customer-facing status of a request (combines payment + progress). Pass the whole report row. */
export function ReportStatusBadge({ report, ...rest }) {
  return <StatusBadge status={customerStatus(report)} {...rest} />
}

/** Admin badges */
export const PaymentBadge = ({ status, ...rest }) => <StatusBadge status={PAYMENT_LABEL[status] || status} {...rest} />
export const WorkBadge = ({ status, ...rest }) => <StatusBadge status={STATUS_LABEL[status] || status} {...rest} />
