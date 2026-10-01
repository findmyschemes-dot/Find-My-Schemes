import { REPORT_STATUS } from '../lib/api'

const map = {
  'Report Ready': 'bg-green-100 text-green-800',
  'In Progress': 'bg-blue-100 text-blue-800',
  Submitted: 'bg-blue-100 text-blue-800',
  'In Review': 'bg-blue-100 text-blue-800',
  Failed: 'bg-red-100 text-red-800',
  'Needs Attention': 'bg-red-100 text-red-800',
  Refunded: 'bg-gray-100 text-gray-700',
  Open: 'bg-blue-100 text-blue-800',
  Resolved: 'bg-green-100 text-green-800',
  'Documents Required': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
}

export default function StatusBadge({ status, className = 'px-2.5 py-1 rounded-full text-xs' }) {
  return (
    <span className={`${className} font-medium whitespace-nowrap ${map[status] || 'bg-gray-100 text-gray-700'}`}>
      {status === 'Documents Required' && <i className="fa-solid fa-triangle-exclamation mr-1" />}
      {status}
    </span>
  )
}

export function ReportStatusBadge({ status, ...rest }) {
  return <StatusBadge status={REPORT_STATUS[status]?.badge || status} {...rest} />
}
