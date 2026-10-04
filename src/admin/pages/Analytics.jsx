import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi, adminErr } from '../adminApi'
import { useAsync } from '../../lib/useAsync'
import { fmtINR } from '../../lib/format'
import { downloadExcel, COLUMNS } from '../excel'
import { ColumnChart, BarList, Kpi, compactINR } from '../components/Charts'
import { PageHeader, DownloadButton } from '../components/Toolbar'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'

const RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
  { label: 'All time', value: 0 },
]
const WORK = [
  ['submitted', 'Submitted'],
  ['processing', 'In review'],
  ['ready', 'Delivered'],
  ['cancelled', 'Cancelled'],
]
const PAY = [
  ['awaiting', 'Awaiting payment'],
  ['paid', 'Paid'],
  ['waived', 'Waived'],
  ['refunded', 'Refunded'],
]
const num = (v) => Number(v || 0).toLocaleString('en-IN')
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '—')

export default function Analytics() {
  const [days, setDays] = useState(30)
  const navigate = useNavigate()
  const { data, loading, error } = useAsync(() => adminApi.analytics(days), [days])
  const rangeLabel = RANGES.find((r) => r.value === days)?.label

  const exportAll = async () => {
    const [customers, reports, queries, applications] = await Promise.all([
      adminApi.customers(), adminApi.reports(), adminApi.queries(), adminApi.applications(),
    ])
    const k = data.kpis
    await downloadExcel('findmyschemes-analytics', [
      {
        name: 'Summary',
        columns: [{ header: 'Metric', key: 'm', width: 38 }, { header: `Value (${rangeLabel})`, key: 'v', width: 20 }],
        rows: [
          { m: 'Period', v: `${data.range.from} to ${data.range.to}` },
          { m: 'Revenue received', v: Number(k.revenue) },
          { m: 'Revenue received — all time', v: Number(k.revenue_total) },
          { m: 'Payments confirmed', v: k.payments },
          { m: 'Paying customers', v: k.paying_customers },
          { m: 'New customers', v: k.customers_new },
          { m: 'Total customers', v: k.customers_total },
          { m: 'Requests submitted', v: k.reports },
          { m: 'Awaiting payment now (count)', v: k.awaiting_count },
          { m: 'Awaiting payment now (amount)', v: Number(k.awaiting_amount) },
          { m: 'Paid requests waiting for work now', v: k.open_queue },
          { m: `Overdue now (> ${k.sla_hours} h after payment)`, v: k.overdue },
          { m: 'Average turnaround after payment (hours)', v: k.avg_turnaround_hours },
          { m: 'Delivered on time (%)', v: k.on_time_pct },
          { m: 'Refunded', v: Number(k.refunded) },
          { m: 'Cancelled requests', v: k.cancelled },
          { m: 'Open queries', v: k.open_queries },
        ],
      },
      {
        name: 'Daily',
        columns: [
          { header: 'Date', key: 'date', type: 'date' },
          { header: 'Revenue received', key: 'revenue', type: 'money' },
          { header: 'New customers', key: 'signups', type: 'number' },
          { header: 'Requests submitted', key: 'reports', type: 'number' },
        ],
        rows: data.daily,
      },
      { name: 'Customers', columns: COLUMNS.customers, rows: customers },
      { name: 'Requests', columns: COLUMNS.reports, rows: reports },
      { name: 'Payments', columns: COLUMNS.payments, rows: reports.filter((r) => r.payment_status !== 'awaiting' || r.status !== 'cancelled') },
      { name: 'Queries', columns: COLUMNS.queries, rows: queries },
      { name: 'Applications', columns: COLUMNS.applications, rows: applications },
    ])
  }

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Analytics" subtitle={data ? `${data.range.from} → ${data.range.to} (IST)` : ' '}>
        <div className="flex bg-white border border-gray-200 rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDays(r.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${days === r.value ? 'bg-darkGreen text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <DownloadButton onClick={exportAll} label="Export everything" count={data ? undefined : 0} />
      </PageHeader>

      {error && <Alert>{adminErr({ message: error })}</Alert>}
      {loading || !data ? (
        <Spinner />
      ) : (
        <Dashboard data={data} rangeLabel={rangeLabel} navigate={navigate} />
      )}
    </div>
  )
}

function Dashboard({ data, rangeLabel, navigate }) {
  const k = data.kpis
  const f = data.funnel
  const daily = data.daily || []
  const series = (key) => daily.map((d) => ({ date: d.date, value: Number(d[key] || 0) }))
  const statusItems = WORK.map(([key, label]) => ({ label, value: Number(data.reports_by_status?.[key] || 0) })).filter((i) => i.value > 0)
  const payItems = PAY.map(([key, label]) => ({ label, value: Number(data.reports_by_payment?.[key] || 0) })).filter((i) => i.value > 0)

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Kpi label={`Revenue · ${rangeLabel}`} value={fmtINR(k.revenue)} hint={`${num(k.payments)} payments · ${num(k.paying_customers)} paying customers`} icon="fa-indian-rupee-sign" onClick={() => navigate('/admin/payments?tab=paid')} />
        <Kpi
          label="Awaiting payment"
          value={fmtINR(k.awaiting_amount)}
          hint={`${num(k.awaiting_count)} request${Number(k.awaiting_count) === 1 ? '' : 's'} not paid yet`}
          icon="fa-clock"
          tone={Number(k.awaiting_count) ? 'warn' : 'default'}
          onClick={() => navigate('/admin/payments?tab=awaiting')}
        />
        <Kpi label={`New customers · ${rangeLabel}`} value={num(k.customers_new)} hint={`${num(k.customers_total)} customers in total`} icon="fa-user-plus" onClick={() => navigate('/admin/customers')} />
        <Kpi label={`Requests · ${rangeLabel}`} value={num(k.reports)} hint="Forms submitted" icon="fa-file-invoice" onClick={() => navigate('/admin/requests?status=all')} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi
          label="Paid, to be worked on"
          value={num(k.open_queue)}
          hint={k.overdue ? `${num(k.overdue)} overdue (> ${k.sla_hours} h after payment)` : `None overdue (> ${k.sla_hours} h)`}
          icon={k.overdue ? 'fa-triangle-exclamation' : 'fa-inbox'}
          tone={k.overdue ? 'bad' : k.open_queue ? 'warn' : 'default'}
          onClick={() => navigate('/admin/requests?status=todo')}
        />
        <Kpi label="Avg. turnaround" value={k.avg_turnaround_hours != null ? `${k.avg_turnaround_hours} h` : '—'} hint={k.on_time_pct != null ? `${k.on_time_pct}% delivered within ${k.sla_hours} h of payment` : 'No deliveries in this period'} icon="fa-stopwatch" />
        <Kpi label={`Refunds · ${rangeLabel}`} value={fmtINR(k.refunded)} hint={`${num(k.cancelled)} cancelled request${Number(k.cancelled) === 1 ? '' : 's'}`} icon="fa-rotate-left" tone={Number(k.refunded) ? 'warn' : 'default'} />
        <Kpi label="Open queries" value={num(k.open_queries)} icon="fa-headset" tone={k.open_queries ? 'warn' : 'default'} onClick={() => navigate('/admin/queries')} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <ColumnChart title="Revenue per day" subtitle="Payments confirmed (by payment date)" data={series('revenue')} format={fmtINR} axisFormat={compactINR} total={Number(k.revenue)} />
        <ColumnChart title="New customers per day" subtitle="Sign-ups" data={series('signups')} format={num} total={Number(k.customers_new)} integer />
        <ColumnChart title="Requests per day" subtitle="Forms submitted" data={series('reports')} format={num} total={Number(k.reports)} integer />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <BarList
          title="Customer funnel"
          subtitle={`Customers who signed up in this period (${num(f.signed_up)})`}
          items={[
            { label: 'Signed up', value: Number(f.signed_up) },
            { label: 'Submitted a request', value: Number(f.requested), sub: pct(f.requested, f.signed_up) },
            { label: 'Paid', value: Number(f.paid), sub: pct(f.paid, f.signed_up) },
            { label: 'Paid for 2+ reports', value: Number(f.repeat), sub: pct(f.repeat, f.signed_up) },
          ].filter((i, idx) => idx === 0 || f.signed_up)}
          format={num}
        />
        <BarList title="Payment status" subtitle="Requests submitted in this period" items={payItems} format={num} />
        <BarList title="Work status" subtitle="Requests submitted in this period" items={statusItems} format={num} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        <BarList
          title="Payment methods"
          subtitle="Payments confirmed in this period"
          items={(data.by_method || []).map((m) => ({ label: m.label, value: Number(m.value), sub: fmtINR(m.amount) }))}
          format={(v) => `${num(v)} paid`}
        />
        <BarList title="Top industries" subtitle="Requests" items={data.by_industry || []} format={num} />
        <BarList title="Top states" subtitle="Requests" items={data.by_state || []} format={num} />
        <BarList title="What customers need" subtitle="Purpose chosen in the form" items={data.by_purpose || []} format={num} />
      </div>
    </>
  )
}
