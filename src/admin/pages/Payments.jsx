import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../adminApi'
import { useAsync } from '../../lib/useAsync'
import { fmtINR } from '../../lib/format'
import { downloadExcel, COLUMNS } from '../excel'
import { PageHeader, DownloadButton, SearchBox, Tabs, matches, Th } from '../components/Toolbar'
import Spinner from '../../components/Spinner'
import Alert from '../../components/Alert'
import StatusBadge from '../../components/StatusBadge'
import { fmtDateTime } from './Requests'

export default function Payments() {
  const [tab, setTab] = useState('payments')
  const [q, setQ] = useState('')
  const pays = useAsync(adminApi.payments)
  const led = useAsync(adminApi.ledger)

  const payments = useMemo(() => (pays.data || []).filter((p) => matches(q, p.payment_code, p.customer_name, p.customer_email, p.customer_mobile, p.gateway_payment_id)), [pays.data, q])
  const ledger = useMemo(() => (led.data || []).filter((t) => matches(q, t.txn_code, t.customer_name, t.customer_email, t.note, t.reason)), [led.data, q])
  const paid = (pays.data || []).filter((p) => p.status === 'paid')

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Payments & Wallet" subtitle={`${paid.length} paid recharges · ${fmtINR(paid.reduce((s, p) => s + Number(p.amount), 0))} collected`}>
        <SearchBox value={q} onChange={setQ} placeholder="ID, customer, email…" />
        {tab === 'payments' ? (
          <DownloadButton count={payments.length} onClick={() => downloadExcel('payments', [{ name: 'Payments', columns: COLUMNS.payments, rows: payments }])} />
        ) : (
          <DownloadButton count={ledger.length} onClick={() => downloadExcel('wallet-ledger', [{ name: 'Wallet ledger', columns: COLUMNS.ledger, rows: ledger }])} />
        )}
      </PageHeader>
      <Tabs tabs={[{ value: 'payments', label: 'Recharges', count: payments.length }, { value: 'ledger', label: 'Wallet ledger', count: ledger.length }]} value={tab} onChange={setTab} />
      {(pays.error || led.error) && <Alert>{pays.error || led.error}</Alert>}

      {tab === 'payments' ? (
        pays.loading ? <Spinner /> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><Th>Payment</Th><Th>Customer</Th><Th>Pack</Th><Th>Date</Th><Th>Gateway</Th><Th>Status</Th><Th right>Amount</Th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium whitespace-nowrap">{p.payment_code}</td>
                    <td className="py-3 px-4"><Link to={`/admin/customers/${p.user_id}`} className="text-darkGreen hover:text-rust font-medium">{p.customer_name || '—'}</Link><div className="text-xs text-gray-500">{p.customer_email}</div></td>
                    <td className="py-3 px-4 capitalize">{p.pack_id}</td>
                    <td className="py-3 px-4 whitespace-nowrap">{fmtDateTime(p.paid_at || p.created_at)}</td>
                    <td className="py-3 px-4">{p.gateway}</td>
                    <td className="py-3 px-4"><StatusBadge status={{ paid: 'Paid', created: 'Pending', failed: 'Failed', refunded: 'Refunded' }[p.status]} /></td>
                    <td className="py-3 px-4 text-right font-semibold">{fmtINR(p.amount)}</td>
                  </tr>
                ))}
                {!payments.length && <tr><td colSpan={7} className="p-8 text-center text-gray-500">No payments.</td></tr>}
              </tbody>
            </table>
          </div>
        )
      ) : led.loading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><Th>Transaction</Th><Th>Customer</Th><Th>Date</Th><Th>Details</Th><Th right>Amount</Th><Th right>Balance after</Th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {ledger.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">{t.txn_code}</td>
                  <td className="py-3 px-4"><Link to={`/admin/customers/${t.user_id}`} className="text-darkGreen hover:text-rust font-medium">{t.customer_name || t.customer_email}</Link></td>
                  <td className="py-3 px-4 whitespace-nowrap">{fmtDateTime(t.created_at)}</td>
                  <td className="py-3 px-4">{t.note || t.reason}</td>
                  <td className={`py-3 px-4 text-right font-semibold whitespace-nowrap ${t.direction === 'credit' ? 'text-green-700' : 'text-rust'}`}>{t.direction === 'credit' ? '+' : '−'} {fmtINR(t.amount)}</td>
                  <td className="py-3 px-4 text-right">{fmtINR(t.balance_after)}</td>
                </tr>
              ))}
              {!ledger.length && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No wallet activity.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
